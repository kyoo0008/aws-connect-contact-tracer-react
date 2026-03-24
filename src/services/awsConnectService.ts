import {
  ConnectClient,
  DescribeContactCommand,
  SearchContactsCommand,
  GetContactAttributesCommand,
  ListInstancesCommand,
  ListAssociatedContactsCommand,
} from '@aws-sdk/client-connect';
import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  QueryStatus,
} from '@aws-sdk/client-cloudwatch-logs';
import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import {
  XRayClient,
  GetTraceGraphCommand,
  GetTraceSummariesCommand,
  BatchGetTracesCommand,
  BatchGetTracesCommandInput,
  BatchGetTracesCommandOutput,
} from '@aws-sdk/client-xray';
import pako from 'pako';
import {
  ContactLog,
  LambdaLog,
  ContactDetails,
  TranscriptEntry,
  AWSConfig,
  SearchCriteria,
  ApiResponse,
  AssociatedContact,
} from '@/types/contact.types';
import { createAutoRenewingCredentialProvider } from './credentialService';

export class AWSConnectService {
  private connectClient: ConnectClient;
  private logsClient: CloudWatchLogsClient;
  private s3Client: S3Client;
  private xrayClient: XRayClient;
  private config: AWSConfig;

  constructor(config: AWSConfig) {
    this.config = config;

    // Browser environment - only use explicitly provided credentials
    // For SSO, credentials should be obtained from backend API and passed here
    const clientConfig: any = {
      region: config.region,
    };

    // Only add credentials if they are explicitly provided
    if (config.profile) {
      // Use auto-renewing provider if profile is set
      clientConfig.credentials = createAutoRenewingCredentialProvider(config.profile);
    } else if (config.credentials) {
      const expiration = config.credentials.expiration
        ? new Date(config.credentials.expiration as any)
        : undefined;

      clientConfig.credentials = {
        accessKeyId: config.credentials.accessKeyId,
        secretAccessKey: config.credentials.secretAccessKey,
        sessionToken: config.credentials.sessionToken,
        expiration: expiration,
      };
    }

    this.connectClient = new ConnectClient(clientConfig);
    this.logsClient = new CloudWatchLogsClient(clientConfig);
    this.s3Client = new S3Client(clientConfig);
    this.xrayClient = new XRayClient(clientConfig);
  }

  /**
   * Connect 인스턴스 목록 조회
   */
  async listInstances(): Promise<Array<{ id: string; alias: string; arn: string }>> {
    try {
      const command = new ListInstancesCommand({});
      const response = await this.connectClient.send(command);

      return (response.InstanceSummaryList || []).map(instance => ({
        id: instance.Id!,
        alias: instance.InstanceAlias || instance.Id!,
        arn: instance.Arn!,
      }));
    } catch (error) {
      console.error('Error listing Connect instances:', error);
      throw error;
    }
  }

  /**
   * Contact 상세 정보 조회
   */
  async getContactDetails(contactId: string): Promise<ContactDetails> {
    try {
      const command = new DescribeContactCommand({
        InstanceId: this.config.instanceId,
        ContactId: contactId,
      });

      const response = await this.connectClient.send(command);
      const contact = response.Contact!;

      return {
        contactId: contact.Id!,
        instanceId: this.config.instanceId,
        initiationTimestamp: contact.InitiationTimestamp!.toISOString(),
        disconnectTimestamp: contact.DisconnectTimestamp?.toISOString(),
        channel: contact.Channel || 'VOICE',
        queueName: contact.QueueInfo ? 'Queue' : undefined,
        agentName: contact.AgentInfo ? 'Agent' : undefined,
        duration: this.calculateDuration(
          contact.InitiationTimestamp!,
          contact.DisconnectTimestamp
        ),
      };
    } catch (error) {
      console.error('Error fetching contact details:', error);
      throw error;
    }
  }

  /**
   * Contact 로그 조회 (CloudWatch Logs)
   * CloudWatch 조회 실패 시 (MalformedQueryException 등) S3 백업 로그로 폴백
   */
  async getContactLogs(
    contactId: string,
    startTime: Date,
    endTime: Date
  ): Promise<ContactLog[]> {
    const query = `
      fields @timestamp, @message
      | filter ContactId = "${contactId}"
      | sort @timestamp asc
    `;

    try {
      const startQueryCommand = new StartQueryCommand({
        logGroupName: this.config.logGroupName,
        startTime: Math.floor(startTime.getTime() / 1000),
        endTime: Math.floor(endTime.getTime() / 1000),
        queryString: query,
      });

      const startQueryResponse = await this.logsClient.send(startQueryCommand);
      const queryId = startQueryResponse.queryId!;

      // Poll for results
      let status: QueryStatus | string = QueryStatus.Running;
      let results: any[] = [];

      while (status === QueryStatus.Running || status === QueryStatus.Scheduled) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const getQueryResultsCommand = new GetQueryResultsCommand({
          queryId,
        });

        const queryResults = await this.logsClient.send(getQueryResultsCommand);
        status = queryResults.status as QueryStatus;

        if (status === QueryStatus.Complete) {
          results = queryResults.results || [];
        }
      }

      return this.parseCloudWatchLogs(results);
    } catch (error: any) {
      // CloudWatch 조회 실패 시 S3 백업으로 폴백 (24시간 초과 로그 등)
      const errorStr = String(error?.name || error?.message || error);
      if (errorStr.includes('MalformedQuery') || errorStr.includes('ResourceNotFoundException')) {
        console.warn(
          `[getContactLogs] CloudWatch query failed (${errorStr}), falling back to S3 backup logs...`
        );
        try {
          const { contactLogs } = await this.getDatadogLogs(contactId, startTime, endTime);
          if (contactLogs.length > 0) {
            console.log(`[getContactLogs] S3 fallback returned ${contactLogs.length} logs`);
            return contactLogs;
          }
        } catch (s3Error) {
          console.error('[getContactLogs] S3 fallback also failed:', s3Error);
        }
      }
      console.error('Error fetching contact logs:', error);
      throw error;
    }
  }

  /**
   * S3에서 Transcript 조회
   */
  async getTranscript(
    contactId: string,
    timestamp: Date
  ): Promise<TranscriptEntry[]> {
    const bucket = `${this.config.s3BucketPrefix}-s3-acn-storage`;
    const dateStr = timestamp.toISOString().split('T')[0].replace(/-/g, '/');
    const prefix = `Analysis/Voice/${dateStr}/${contactId}`;

    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
      });

      const listResponse = await this.s3Client.send(listCommand);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        return [];
      }

      const key = listResponse.Contents[0].Key!;
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const getResponse = await this.s3Client.send(getCommand);
      const bodyString = await this.streamToString(getResponse.Body);
      const data = JSON.parse(bodyString);

      return data.Transcript || [];
    } catch (error) {
      console.error('Error fetching transcript:', error);
      return [];
    }
  }

  /**
   * S3에서 Datadog 백업 로그 조회 (압축 해제)
   */
  async getDatadogLogs(
    contactId: string,
    startTime: Date,
    endTime: Date
  ): Promise<{ contactLogs: ContactLog[], lambdaLogs: Record<string, LambdaLog[]> }> {
    const bucket = `${this.config.s3BucketPrefix}-s3-adf-datadog-backup`;
    const dateStr = startTime.toISOString().split('T')[0].replace(/-/g, '/');
    const prefix = dateStr;

    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
      });

      const listResponse = await this.s3Client.send(listCommand);

      if (!listResponse.Contents) {
        return { contactLogs: [], lambdaLogs: {} };
      }

      const contactLogs: ContactLog[] = [];
      const lambdaLogs: Record<string, LambdaLog[]> = {};

      for (const object of listResponse.Contents) {
        const key = object.Key!;

        // Check if file is within time range
        const fileTime = this.extractTimeFromKey(key);
        if (!fileTime || fileTime < startTime || fileTime > endTime) {
          continue;
        }

        const getCommand = new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        });

        const getResponse = await this.s3Client.send(getCommand);
        const bodyBuffer = await this.streamToBuffer(getResponse.Body);

        // Decompress gzip
        const decompressed = pako.ungzip(bodyBuffer, { to: 'string' });
        const lines = decompressed.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const log = JSON.parse(line);

            if (log.ContactId === contactId) {
              if (log.logGroup?.includes('/aws/connect/')) {
                contactLogs.push(this.transformToContactLog(log));
              } else if (log.logGroup?.includes('/aws/lmd/')) {
                const functionName = this.extractFunctionName(log.logGroup);
                if (!lambdaLogs[functionName]) {
                  lambdaLogs[functionName] = [];
                }
                lambdaLogs[functionName].push(this.transformToLambdaLog(log));
              }
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }

      return { contactLogs, lambdaLogs };
    } catch (error) {
      console.error('Error fetching Datadog logs:', error);
      return { contactLogs: [], lambdaLogs: {} };
    }
  }

  /**
   * Lambda 로그 조회 (특정 함수)
   */
  async getLambdaLogs(
    contactId: string,
    functionName: string,
    startTime: Date,
    endTime: Date
  ): Promise<LambdaLog[]> {
    const logGroupName = this.resolveLogGroupName(functionName);
    const query = this.buildLambdaLogQuery(contactId, logGroupName);

    try {
      const logs = await this.queryCloudWatchLogs(
        logGroupName,
        query,
        startTime,
        endTime
      );

      return logs.map(log => this.transformToLambdaLog(log));
    } catch (error) {
      console.error(`Error fetching Lambda logs for ${functionName}:`, error);
      return [];
    }
  }

  /**
   * Contact 로그를 분석하여 실제 호출된 Lambda/Lex 로그 그룹을 동적으로 감지
   * Python connect-contact-tracer의 fetch_logs 내 동적 감지 로직 참고
   */
  detectLambdaLogGroups(contactLogs: ContactLog[]): Set<string> {
    const logGroups = new Set<string>();

    for (const log of contactLogs) {
      // Lambda 호출 감지: InvokeExternalResource 모듈에서 FunctionArn 추출
      if (log.ContactFlowModuleType === 'InvokeExternalResource') {
        const functionArn = log.Parameters?.FunctionArn
          || log.Parameters?.Parameters?.FunctionArn;

        if (functionArn) {
          const logGroup = this.getLambdaLogGroupFromArn(functionArn);
          logGroups.add(logGroup);

          // idnv-common-if 예외처리: async-if도 함께 조회
          if (functionArn.includes('idnv-common-if')) {
            const asyncLogGroup = this.getLambdaLogGroupFromArn(
              functionArn.replace('common-if', 'async-if')
            );
            logGroups.add(asyncLogGroup);
          }

          // chat keyword 감지 시 chat app 로그 그룹 추가
          const params = log.Parameters?.Parameters;
          if (params?.keywords && params.keywords === 'chat') {
            logGroups.add('/aws/lmd/aicc-chat-app/alb-chat-if');
          }
        }
      }

      // Lex Bot 호출 감지: BotAliasArn이 포함된 로그
      const logStr = JSON.stringify(log);
      if (logStr.includes('BotAliasArn')) {
        const botAliasArn = log.Parameters?.BotAliasArn
          || log.Parameters?.Parameters?.BotAliasArn;

        if (botAliasArn && this.config.environment !== 'test') {
          const botName = this.extractBotNameFromAliasArn(botAliasArn);
          if (botName) {
            logGroups.add(`/aws/lex/aicc/${botName}`);
          }
          logGroups.add('/aws/lmd/aicc-voicebot-app/lex-hook-func');
        } else if (this.config.environment === 'test') {
          // test 환경에서는 고정 Lex 로그 그룹 사용
          logGroups.add('/aws/lex/TMSSWIWT4K');
        }
      }
    }

    return logGroups;
  }

  /**
   * Lambda Function ARN에서 CloudWatch Log 그룹 이름 도출
   * Python의 get_lambda_log_groups_from_arn 참고
   */
  private getLambdaLogGroupFromArn(arn: string): string {
    const funcName = this.getFuncNameFromArn(arn);
    if (this.config.environment === 'test') {
      return `/aws/lambda/${funcName}`;
    }
    return `/aws/lmd/aicc-connect-flow-base/${funcName}`;
  }

  /**
   * Lambda Function ARN에서 함수 이름 추출
   * Python의 get_func_name 참고
   */
  private getFuncNameFromArn(arn: string): string {
    if (this.config.environment === 'test') {
      return arn.split(':').pop() || arn;
    }
    // arn:aws:lambda:region:account:function:aicc-env-region-flow-xxx
    // → "flow-xxx" (앞 3개 세그먼트 제거)
    const funcFullName = arn.split(':')[6] || '';
    const parts = funcFullName.split('-');
    return parts.slice(3).join('-');
  }

  /**
   * BotAliasArn에서 봇 이름 추출
   */
  private extractBotNameFromAliasArn(aliasArn: string): string | null {
    try {
      // arn:aws:lex:region:account:bot-alias/BOT_ID/ALIAS_ID
      const parts = aliasArn.split('/');
      if (parts.length >= 2) {
        // 봇 이름은 ARN만으로는 알 수 없지만, 봇 ID에서 유추 가능한 경우 사용
        // 실제로는 DescribeBotAlias API 호출이 필요하지만, 여기서는 간단히 ID 반환
        return parts[1] || null;
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * 로그 그룹 이름 해석 (단순 함수명이면 전체 경로로 변환)
   */
  private resolveLogGroupName(nameOrPath: string): string {
    if (nameOrPath.startsWith('/')) return nameOrPath;
    if (this.config.environment === 'test') {
      return `/aws/lambda/${nameOrPath}`;
    }
    return `/aws/lmd/aicc-connect-flow-base/${nameOrPath}`;
  }

  /**
   * Lambda 로그 쿼리 생성
   * Lex 로그는 @message like 사용, 그 외는 ContactId 필터 사용 (Python 참고)
   */
  private buildLambdaLogQuery(searchKey: string, logGroupName: string): string {
    if (logGroupName.includes('/aws/lex/')) {
      // Lex 로그는 ContactId 필드가 없으므로 메시지 검색
      return `
        fields @timestamp, @message, @logStream, @xrayTraceId
        | filter @message like "${searchKey}"
        | sort @timestamp asc
      `;
    }
    // Lambda 로그는 ContactId 필드로 정확히 필터링 (더 효율적)
    return `
      fields @timestamp, @message, @logStream, @xrayTraceId
      | filter ContactId = "${searchKey}"
      | sort @timestamp asc
    `;
  }

  /**
   * Contact 관련 Lambda CloudWatch Log 그룹 목록 (폴백용)
   */
  private readonly FALLBACK_CONTACT_LAMBDA_LOG_GROUPS = [
    "/aws/lmd/aicc-connect-flow-base/flow-agent-workspace-handler",
    "/aws/lmd/aicc-connect-flow-base/flow-alms-if",
    "/aws/lmd/aicc-connect-flow-base/flow-chat-app",
    "/aws/lmd/aicc-connect-flow-base/flow-idnv-async-if",
    "/aws/lmd/aicc-connect-flow-base/flow-idnv-common-if",
    "/aws/lmd/aicc-connect-flow-base/flow-internal-handler",
    "/aws/lmd/aicc-connect-flow-base/flow-kalis-if",
    "/aws/lmd/aicc-connect-flow-base/flow-mdm-if",
    "/aws/lmd/aicc-connect-flow-base/flow-ods-if",
    "/aws/lmd/aicc-connect-flow-base/flow-oneid-if",
    "/aws/lmd/aicc-connect-flow-base/flow-sample-integration",
    "/aws/lmd/aicc-connect-flow-base/flow-tms-if",
    "/aws/lmd/aicc-connect-flow-base/flow-vars-controller",
    "/aws/lmd/aicc-chat-app/alb-chat-if",
    "/aws/lmd/aicc-chat-app/sns-chat-if",
  ];

  private readonly QM_LAMBDA_LOG_GROUPS = [
    "/aws/lmd/aicc-agent-app/alb-agent-qm-automation",
    "/aws/lmd/aicc-agent-app/gemini-handler"
  ];

  /**
   * Lambda 함수의 로그를 병렬로 조회
   * Contact 로그에서 감지된 로그 그룹만 쿼리하여 효율적으로 동작
   *
   * @param searchKey - contactId 또는 requestId
   * @param startTime - 시작 시간
   * @param endTime - 종료 시간
   * @param useQmLogGroups - true이면 QM_LAMBDA_LOG_GROUPS 사용
   * @param detectedLogGroups - contact 로그에서 동적으로 감지된 로그 그룹 (없으면 폴백 목록 사용)
   */
  async getAllLambdaLogs(
    searchKey: string,
    startTime: Date,
    endTime: Date,
    useQmLogGroups: boolean = false,
    detectedLogGroups?: Set<string>
  ): Promise<Record<string, LambdaLog[]>> {
    const startFetchTime = Date.now();
    const lambdaLogs: Record<string, LambdaLog[]> = {};

    let logGroups: string[];
    let logType: string;

    if (useQmLogGroups) {
      logGroups = this.QM_LAMBDA_LOG_GROUPS;
      logType = 'QM';
    } else if (detectedLogGroups && detectedLogGroups.size > 0) {
      logGroups = Array.from(detectedLogGroups);
      logType = 'Detected';
    } else {
      logGroups = this.FALLBACK_CONTACT_LAMBDA_LOG_GROUPS;
      logType = 'Fallback (all)';
    }

    console.log(`[getAllLambdaLogs] Starting ${logType} Lambda log fetch for key ${searchKey}`);
    console.log(`[getAllLambdaLogs] Time range: ${startTime.toISOString()} ~ ${endTime.toISOString()}`);
    console.log(`[getAllLambdaLogs] Querying ${logGroups.length} log groups in parallel...`);

    // 병렬로 Lambda 로그 조회
    const logPromises = logGroups.map(async (logGroupName, index) => {
      const query = this.buildLambdaLogQuery(searchKey, logGroupName);

      try {
        console.log(`[getAllLambdaLogs] [${index + 1}/${logGroups.length}] Querying ${logGroupName}...`);
        const rawResults = await this.queryCloudWatchLogs(
          logGroupName,
          query,
          startTime,
          endTime
        );

        // CloudWatch Logs 쿼리 결과를 파싱
        const logs = rawResults.map((result: any) => {
          // 결과는 [{field: '@timestamp', value: '...'}, {field: '@message', value: '...'}] 형태
          const logData: any = {};
          result.forEach((field: any) => {
            logData[field.field] = field.value;
          });

          // logGroup 정보 추가
          logData['@log'] = logGroupName;

          return this.transformToLambdaLog(logData);
        });

        // 함수 이름 추출 (log group name의 마지막 부분)
        const functionName = logGroupName.split('/').pop() || logGroupName;

        console.log(`[getAllLambdaLogs] [${index + 1}/${logGroups.length}] ${logGroupName} → ${logs.length} logs`);

        return {
          functionName,
          logs,
        };
      } catch (error) {
        console.error(`[getAllLambdaLogs] [${index + 1}/${logGroups.length}] Error fetching logs from ${logGroupName}:`, error);
        return {
          functionName: logGroupName.split('/').pop() || logGroupName,
          logs: [],
        };
      }
    });

    const results = await Promise.all(logPromises);

    // 결과를 Record로 변환
    let totalLogCount = 0;
    results.forEach(({ functionName, logs }) => {
      if (logs.length > 0) {
        lambdaLogs[functionName] = logs;
        totalLogCount += logs.length;
      }
    });

    // idnv-async-if 로그를 idnv-common-if에 합치기 (Python 참고)
    const asyncLogs = lambdaLogs['flow-idnv-async-if'];
    if (asyncLogs && asyncLogs.length > 0) {
      lambdaLogs['flow-idnv-common-if'] = [
        ...(lambdaLogs['flow-idnv-common-if'] || []),
        ...asyncLogs,
      ];
    }

    const fetchDuration = ((Date.now() - startFetchTime) / 1000).toFixed(2);
    console.log(`[getAllLambdaLogs] Completed in ${fetchDuration}s - ${totalLogCount} total logs from ${Object.keys(lambdaLogs).length} functions`);

    return lambdaLogs;
  }

  /**
   * Contact 로그 조회 후 Lambda 로그를 동적으로 감지하여 조회하는 통합 메서드
   * Python의 fetch_logs와 동일한 플로우: contact 로그 → 동적 감지 → Lambda 로그 병렬 조회
   */
  async fetchContactAndLambdaLogs(
    contactId: string,
    startTime: Date,
    endTime: Date
  ): Promise<{ contactLogs: ContactLog[]; lambdaLogs: Record<string, LambdaLog[]> }> {
    // 1. Contact 로그 먼저 조회
    const contactLogs = await this.getContactLogs(contactId, startTime, endTime);

    // 2. Contact 로그에서 Lambda/Lex 로그 그룹 동적 감지
    const detectedLogGroups = this.detectLambdaLogGroups(contactLogs);
    console.log(`[fetchContactAndLambdaLogs] Detected ${detectedLogGroups.size} log groups from contact logs:`,
      Array.from(detectedLogGroups));

    // 3. 감지된 로그 그룹만 병렬 조회
    const lambdaLogs = await this.getAllLambdaLogs(
      contactId,
      startTime,
      endTime,
      false,
      detectedLogGroups
    );

    return { contactLogs, lambdaLogs };
  }

  /**
   * X-Ray 트레이스 조회 (Enhanced - batch-get-traces 사용)
   * Python connect-contact-tracer의 get_xray_trace 로직 참고
   */
  async getXRayTrace(traceId: string): Promise<any> {
    return this.getXRayTraceEnhanced(traceId);
  }

  /**
   * X-Ray Trace ID로 상세 트레이스 정보 가져오기 (개선 버전)
   * Python의 get_xray_trace 함수 로직을 참고하여 batch-get-traces 사용
   */
  async getXRayTraceEnhanced(traceId: string): Promise<any> {
    try {
      const input: BatchGetTracesCommandInput = {
        TraceIds: [traceId],
      };

      const command = new BatchGetTracesCommand(input);
      const response: BatchGetTracesCommandOutput = await this.xrayClient.send(command);

      if (!response.Traces || response.Traces.length === 0) {
        console.warn(`No traces found for trace ID: ${traceId}`);
        return {
          traceId,
          segments: [],
          lambdaLogs: [],
          duration: 0,
          hasError: false,
          hasFault: false,
        };
      }

      const trace = response.Traces[0];
      const segments = this.parseXRayTraceSegments(trace);

      console.log(trace)

      // Calculate total duration and error states
      let minTime = Infinity;
      let maxTime = -Infinity;
      let hasError = false;
      let hasFault = false;

      segments.forEach(segment => {
        if (segment.start_time < minTime) minTime = segment.start_time;
        if (segment.end_time > maxTime) maxTime = segment.end_time;
        if (segment.error) hasError = true;
        if (segment.fault) hasFault = true;
      });

      const duration = maxTime !== -Infinity && minTime !== Infinity ? maxTime - minTime : 0;

      return {
        traceId,
        segments,
        lambdaLogs: [], // Will be populated separately
        duration,
        hasError,
        hasFault,
        rawTrace: trace, // Keep original trace for debugging
      };
    } catch (error) {
      console.error('Error fetching X-Ray trace:', error);
      return { segments: [], lambdaLogs: [] };
    }
  }

  /**
   * Trace의 Segment들을 파싱하여 구조화된 데이터로 변환
   * Python의 process_subsegments 및 get_segment_node 로직 참고
   */
  private parseXRayTraceSegments(trace: any): any[] {
    const segments: any[] = [];

    if (!trace.Segments) {
      return segments;
    }

    for (const segment of trace.Segments) {
      try {
        const segmentData = this.parseXRaySegmentDocument(segment);
        if (segmentData) {
          segments.push(segmentData);
        }
      } catch (error) {
        console.error('Error parsing segment:', error);
      }
    }

    return segments;
  }

  /**
   * Segment Document를 파싱하여 상세 정보 추출
   */
  private parseXRaySegmentDocument(segment: any): any | null {
    if (!segment.Document) {
      return null;
    }

    try {
      const doc = JSON.parse(segment.Document);

      const segmentData: any = {
        id: segment.Id || doc.id || '',
        name: doc.name || 'Unknown',
        start_time: doc.start_time || 0,
        end_time: doc.end_time || 0,
        duration: (doc.end_time || 0) - (doc.start_time || 0),
        parent_id: doc.parent_id,
        origin: doc.origin,
        namespace: doc.namespace,
        error: doc.error || false,
        fault: doc.fault || false,
        throttle: doc.throttle || false,
        http: doc.http,
        aws: doc.aws,
        annotations: doc.annotations,
        metadata: doc.metadata,
        subsegments: [],
      };

      // Parse subsegments recursively
      if (doc.subsegments && Array.isArray(doc.subsegments)) {
        segmentData.subsegments = this.parseXRaySubsegments(doc.subsegments);
      }

      return segmentData;
    } catch (error) {
      console.error('Error parsing segment document:', error);
      return null;
    }
  }

  /**
   * Subsegment를 재귀적으로 파싱
   * Python의 process_subsegments 로직 참고
   */
  private parseXRaySubsegments(subsegments: any[]): any[] {
    const parsed: any[] = [];

    // Skip these subsegment types (Python 로직 참고)
    const skipTypes = ['Overhead', 'Dwell Time', 'Invocation', 'Attempt', 'Lambda'];

    for (const sub of subsegments) {
      if (skipTypes.includes(sub.name)) {
        // Skip but still process nested subsegments
        if (sub.subsegments && Array.isArray(sub.subsegments)) {
          parsed.push(...this.parseXRaySubsegments(sub.subsegments));
        }
        continue;
      }

      const subsegment: any = {
        id: sub.id || '',
        name: sub.name || 'Unknown',
        start_time: sub.start_time || 0,
        end_time: sub.end_time || 0,
        duration: (sub.end_time || 0) - (sub.start_time || 0),
        namespace: sub.namespace,
        error: sub.error || false,
        fault: sub.fault || false,
        throttle: sub.throttle || false,
        http: sub.http,
        aws: sub.aws,
        sql: sub.sql,
        subsegments: [],
      };

      // Recursively parse nested subsegments
      if (sub.subsegments && Array.isArray(sub.subsegments)) {
        subsegment.subsegments = this.parseXRaySubsegments(sub.subsegments);
      }

      parsed.push(subsegment);
    }

    return parsed;
  }

  /**
   * Contact 로그에서 X-Ray Trace ID 목록 추출
   */
  extractXRayTraceIds(logs: any[]): string[] {
    const traceIds = new Set<string>();

    logs.forEach(log => {
      const traceId = log.xray_trace_id || log.xrayTraceId;
      if (traceId && typeof traceId === 'string') {
        traceIds.add(traceId);
      }
    });

    return Array.from(traceIds);
  }

  /**
   * Contact ID와 관련된 모든 X-Ray Trace 가져오기
   * Python의 build_xray_dot 로직 참고
   */
  async getContactXRayTraces(
    contactId: string,
    contactLogs: any[],
    lambdaLogs?: Record<string, any[]>
  ): Promise<Map<string, any>> {
    const traceIds = this.extractXRayTraceIds(contactLogs);
    const traces = new Map<string, any>();

    console.log(`Found ${traceIds.length} X-Ray trace IDs for contact ${contactId}`);

    for (const traceId of traceIds) {
      try {
        const traceData = await this.getXRayTraceEnhanced(traceId);

        // Associate Lambda logs with this trace
        if (lambdaLogs) {
          const allLambdaLogs: any[] = Object.values(lambdaLogs).flat();
          traceData.lambdaLogs = this.filterLambdaLogsByXRayTraceId(allLambdaLogs, traceId);

          // Sort Lambda logs by timestamp
          traceData.lambdaLogs.sort((a: any, b: any) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            return timeA - timeB;
          });
        }

        traces.set(traceId, traceData);
      } catch (error) {
        console.error(`Error fetching trace ${traceId}:`, error);
      }
    }

    return traces;
  }

  /**
   * Lambda 로그에서 특정 X-Ray Trace ID와 관련된 로그만 필터링
   * Python의 filter_lambda_logs 로직 참고
   */
  private filterLambdaLogsByXRayTraceId(logs: any[], traceId: string): any[] {
    return logs.filter(log => {
      const logTraceId = log.xray_trace_id || log.xrayTraceId;
      return logTraceId === traceId;
    });
  }

  /**
   * X-Ray 트레이스 요약 정보 생성
   * Python의 xray_text 생성 로직 참고
   */
  getXRayTraceSummary(traceData: any): string {
    const operations: string[] = [];
    let operationIndex = 1;
    const seenOperations = new Set<string>();

    const extractOperations = (segments: any[]) => {
      segments.forEach(segment => {
        if (segment.aws?.operation) {
          const resourceName = segment.aws.resource_names?.[0] || segment.name;
          const opKey = `${segment.aws.operation}_${resourceName}`;

          if (!seenOperations.has(opKey)) {
            operations.push(`Operation ${operationIndex}: ${segment.aws.operation} ${resourceName}`);
            seenOperations.add(opKey);
            operationIndex++;
          }
        }

        if (segment.subsegments) {
          extractOperationsFromSubsegments(segment.subsegments);
        }
      });
    };

    const extractOperationsFromSubsegments = (subsegments: any[]) => {
      subsegments.forEach((sub: any) => {
        if (sub.aws?.operation) {
          const resourceName = sub.aws.resource_names?.[0] || sub.name;
          const opKey = `${sub.aws.operation}_${resourceName}`;

          if (!seenOperations.has(opKey)) {
            operations.push(`Operation ${operationIndex}: ${sub.aws.operation} ${resourceName}`);
            seenOperations.add(opKey);
            operationIndex++;
          }
        }

        if (sub.subsegments) {
          extractOperationsFromSubsegments(sub.subsegments);
        }
      });
    };

    extractOperations(traceData.segments);
    return operations.length > 0 ? operations.join('\n') : 'No operations found';
  }

  /**
   * X-Ray 트레이스와 Lambda 로그 통계 생성
   * Python의 lambda_node_footer 로직 참고
   */
  getXRayLambdaLogStats(lambdaLogs: any[]): {
    warnCount: number;
    errorCount: number;
    infoCount: number;
    hasIssues: boolean;
    summary: string;
    color: string;
  } {
    let warnCount = 0;
    let errorCount = 0;
    let infoCount = 0;

    lambdaLogs.forEach(log => {
      const level = log.level?.toUpperCase() || 'INFO';
      if (level === 'ERROR') {
        errorCount++;
      } else if (level === 'WARN' || level === 'WARNING') {
        warnCount++;
      } else {
        infoCount++;
      }
    });

    const hasIssues = errorCount > 0 || warnCount > 0;
    const color = errorCount > 0 ? 'tomato' : (warnCount > 0 ? 'orange' : 'lightgray');
    const summary = hasIssues
      ? `${errorCount > 0 ? `Errors: ${errorCount}` : ''} ${warnCount > 0 ? `Warnings: ${warnCount}` : ''}`.trim()
      : '';

    return {
      warnCount,
      errorCount,
      infoCount,
      hasIssues,
      summary,
      color,
    };
  }

  /**
   * Lambda 호출 로그와 Lambda 함수 로그를 매칭하여 X-Ray Trace ID 추출
   * Python의 Lambda X-Ray 추적 로직 참고
   */
  findXRayTraceIdForLambdaInvocation(
    contactLog: any,
    lambdaLogs: any[]
  ): string | null {
    const contactId = contactLog.ContactId;
    const logParameters = contactLog.Parameters?.Parameters || contactLog.Parameters || {};

    console.log(`[findXRayTraceIdForLambdaInvocation] ContactId: ${contactId}`);
    console.log(`[findXRayTraceIdForLambdaInvocation] Total Lambda logs: ${lambdaLogs.length}`);

    // Contact ID로 필터링
    const contactLambdaLogs = lambdaLogs.filter(l => l.ContactId === contactId);

    console.log(`[findXRayTraceIdForLambdaInvocation] Lambda logs for ContactId: ${contactLambdaLogs.length}`);

    if (contactLambdaLogs.length === 0) {
      console.log(`[findXRayTraceIdForLambdaInvocation] No Lambda logs found for ContactId`);
      return null;
    }

    // Sample first 3 Lambda logs for debugging
    console.log(`[findXRayTraceIdForLambdaInvocation] Sample Lambda logs:`, contactLambdaLogs.slice(0, 3).map(l => ({
      ContactId: l.ContactId,
      xrayTraceId: l.xrayTraceId,
      message: l.message?.substring(0, 100),
      parameters: l.parameters,
      event: l.event
    })));

    const targetLogs = this.matchLambdaLogsByParameters(contactLambdaLogs, logParameters);

    console.log(`[findXRayTraceIdForLambdaInvocation] Matched logs by parameters: ${targetLogs.length}`);

    if (targetLogs.length === 0) {
      console.log(`[findXRayTraceIdForLambdaInvocation] No matching logs by parameters`);
      return null;
    }

    return this.selectClosestLogByTimestamp(targetLogs, contactLog.Timestamp);
  }

  /**
   * 파라미터로 Lambda 로그 매칭
   */
  private matchLambdaLogsByParameters(lambdaLogs: any[], logParameters: any): any[] {
    return lambdaLogs.filter(lambdaLog =>
      this.matchParameterLog(lambdaLog, logParameters) ||
      this.matchEventLog(lambdaLog, logParameters)
    );
  }

  /**
   * "parameter" 메시지를 포함하는 로그 매칭
   */
  private matchParameterLog(lambdaLog: any, logParameters: any): boolean {
    if (!lambdaLog.message?.includes('parameter')) {
      return false;
    }

    const funcParam = JSON.stringify(lambdaLog.parameters || {}, null, 0).replaceAll(/\s/g, '');
    const logParam = JSON.stringify(logParameters, null, 0).replaceAll(/\s/g, '');

    // id&v -> idnv 예외 처리
    const normalizedFuncParam = funcParam.replaceAll('id&v', 'idnv');
    const normalizedLogParam = logParam.replaceAll('id&v', 'idnv');

    return normalizedLogParam === normalizedFuncParam;
  }

  /**
   * "Event" 메시지를 포함하는 로그 매칭 (varsConfig 예외 처리)
   */
  private matchEventLog(lambdaLog: any, logParameters: any): boolean {
    if (!lambdaLog.message?.includes('Event')) {
      return false;
    }

    if (!lambdaLog.event?.Details?.Parameters) {
      return false;
    }

    const funcParam = { ...lambdaLog.event.Details.Parameters };
    const logParam = { ...logParameters };

    // varsConfig 제거
    if (funcParam.varsConfig !== undefined && logParam.varsConfig !== undefined) {
      delete funcParam.varsConfig;
      delete logParam.varsConfig;
    }

    const funcParamStr = JSON.stringify(funcParam, null, 0).replaceAll(/\s/g, '');
    const logParamStr = JSON.stringify(logParam, null, 0).replaceAll(/\s/g, '');

    return funcParamStr === logParamStr;
  }

  /**
   * 타임스탬프 차이가 가장 작은 로그 선택
   */
  private selectClosestLogByTimestamp(logs: any[], contactTimestamp: string): string | null {
    if (logs.length === 1) {
      return logs[0].xray_trace_id || logs[0].xrayTraceId || null;
    }

    const contactTime = new Date(contactTimestamp).getTime();
    let minGap = Infinity;
    let selectedTraceId: string | null = null;

    for (const log of logs) {
      const lambdaTime = new Date(log.timestamp).getTime();
      const gap = Math.abs(contactTime - lambdaTime);

      if (gap < minGap) {
        minGap = gap;
        selectedTraceId = log.xray_trace_id || log.xrayTraceId;
      }
    }

    return selectedTraceId;
  }

  /**
   * Contact 로그에 X-Ray Trace ID 추가
   * InvokeLambdaFunction 및 InvokeExternalResource 모듈에 대해 처리
   *
   * 주의: Lambda Function ARN과 CloudWatch Log Group 이름이 다를 수 있으므로
   * 모든 Lambda 로그를 검색하여 매칭합니다.
   */
  enrichContactLogsWithXRayTraceIds(
    contactLogs: any[],
    lambdaLogs: Record<string, any[]>
  ): any[] {
    // 모든 Lambda 로그를 하나의 배열로 합치기
    const allLambdaLogs = Object.values(lambdaLogs).flat();

    console.log(`[enrichContactLogsWithXRayTraceIds] Total Lambda logs: ${allLambdaLogs.length}`);
    console.log(`[enrichContactLogsWithXRayTraceIds] Lambda logs with X-Ray IDs: ${allLambdaLogs.filter(l => l.xrayTraceId || l.xray_trace_id).length}`);

    if (allLambdaLogs.length === 0) {
      console.warn('No Lambda logs available for X-Ray trace ID enrichment');
      return contactLogs;
    }

    const enrichedLogs = contactLogs.map(log => {
      const moduleType = log.ContactFlowModuleType;

      // Lambda 호출 모듈인 경우에만 처리
      if (moduleType === 'InvokeLambdaFunction' || moduleType === 'InvokeExternalResource') {
        console.log(`[enrichContactLogsWithXRayTraceIds] Processing ${moduleType} - Identifier: ${log.Identifier}`);
        console.log(`[enrichContactLogsWithXRayTraceIds] Parameters:`, JSON.stringify(log.Parameters?.Parameters || log.Parameters, null, 2));

        // X-Ray Trace ID 찾기 (모든 Lambda 로그에서 검색)
        const xrayTraceId = this.findXRayTraceIdForLambdaInvocation(log, allLambdaLogs);

        if (xrayTraceId) {
          console.log(`[enrichContactLogsWithXRayTraceIds] ✅ Found X-Ray Trace ID: ${xrayTraceId}`);
          return {
            ...log,
            xray_trace_id: xrayTraceId,
            xrayTraceId: xrayTraceId,
          };
        } else {
          console.log(`[enrichContactLogsWithXRayTraceIds] ❌ No X-Ray Trace ID found`);
        }
      }

      return log;
    });

    const enrichedCount = enrichedLogs.filter(l => l.xray_trace_id || l.xrayTraceId).length;
    console.log(`[enrichContactLogsWithXRayTraceIds] Enriched ${enrichedCount} contact logs with X-Ray trace IDs`);

    return enrichedLogs;
  }

  /**
   * Contact 검색
   */
  async searchContacts(criteria: SearchCriteria): Promise<ContactDetails[]> {
    try {
      const command = new SearchContactsCommand({
        InstanceId: this.config.instanceId,
        TimeRange: criteria.startTime && criteria.endTime ? {
          Type: 'INITIATION_TIMESTAMP',
          StartTime: criteria.startTime,
          EndTime: criteria.endTime,
        } : undefined,
        SearchCriteria: criteria.channel ? {
          Channels: criteria.channel as any,
          // Add more criteria as needed
        } : undefined,
        MaxResults: 100,
      });

      const response = await this.connectClient.send(command);

      return (response.Contacts || []).map(contact => ({
        contactId: contact.Id!,
        instanceId: this.config.instanceId,
        initiationTimestamp: contact.InitiationTimestamp!.toISOString(),
        disconnectTimestamp: contact.DisconnectTimestamp?.toISOString(),
        channel: contact.Channel || 'VOICE',
        agentName: contact.AgentInfo?.Id,
        queueName: contact.QueueInfo?.Id,
        contactFlowName: contact.Name,
      }));
    } catch (error) {
      console.error('Error searching contacts:', error);
      throw error;
    }
  }

  /**
   * Associated Contacts 조회
   * RelatedContactId, InitialContactId, PreviousContactId 체인을 순회하여
   * 연관된 모든 Contact를 검색합니다.
   */
  async getAssociatedContacts(contactId: string): Promise<AssociatedContact[]> {
    try {
      const resp = await this.connectClient.send(
        new ListAssociatedContactsCommand({
          InstanceId: this.config.instanceId,
          ContactId: contactId,
          MaxResults: 100,
        })
      );

      return (resp.ContactSummaryList || []).map(c => ({
        contactId: c.ContactId!,
        channel: c.Channel || 'VOICE',
        initiationMethod: c.InitiationMethod || '',
        initiationTimestamp: c.InitiationTimestamp!.toISOString(),
        disconnectTimestamp: c.DisconnectTimestamp?.toISOString(),
        previousContactId: c.PreviousContactId,
        relatedContactId: c.RelatedContactId,
        initialContactId: c.InitialContactId,
      })).sort((a, b) => new Date(a.initiationTimestamp).getTime() - new Date(b.initiationTimestamp).getTime());
    } catch (error) {
      console.error('Error fetching associated contacts:', error);
      return [];
    }
  }

  // Helper methods
  private async queryCloudWatchLogs(
    logGroupName: string,
    query: string,
    startTime: Date,
    endTime: Date
  ): Promise<any[]> {
    const startQueryCommand = new StartQueryCommand({
      logGroupName,
      startTime: Math.floor(startTime.getTime() / 1000),
      endTime: Math.floor(endTime.getTime() / 1000),
      queryString: query,
    });

    const startQueryResponse = await this.logsClient.send(startQueryCommand);
    const queryId = startQueryResponse.queryId!;

    let status: QueryStatus | string = QueryStatus.Running;
    let results: any[] = [];

    while (status === QueryStatus.Running || status === QueryStatus.Scheduled) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const getQueryResultsCommand = new GetQueryResultsCommand({
        queryId,
      });

      const queryResults = await this.logsClient.send(getQueryResultsCommand);
      status = queryResults.status as QueryStatus;

      if (status === QueryStatus.Complete) {
        results = queryResults.results || [];
      }
    }

    return results;
  }

  private parseCloudWatchLogs(results: any[]): ContactLog[] {
    return results.map(result => {
      const message = result.find((field: any) => field.field === '@message')?.value;
      const timestamp = result.find((field: any) => field.field === '@timestamp')?.value;

      try {
        const parsed = JSON.parse(message);
        return {
          ...parsed,
          Timestamp: timestamp || parsed.Timestamp,
        };
      } catch {
        return {
          ContactId: '',
          ContactFlowId: '',
          ContactFlowName: '',
          ContactFlowModuleType: '',
          Timestamp: timestamp,
          message,
        };
      }
    });
  }

  private transformToContactLog(log: any): ContactLog {
    return {
      ContactId: log.ContactId,
      ContactFlowId: log.ContactFlowId || '',
      ContactFlowName: log.ContactFlowName || '',
      ContactFlowModuleType: log.ContactFlowModuleType || '',
      Timestamp: log.Timestamp || log['@timestamp'],
      Parameters: log.Parameters,
      Results: log.Results,
      ExternalResults: log.ExternalResults,
      Identifier: log.Identifier,
    };
  }

  private transformToLambdaLog(log: any): LambdaLog {
    // CloudWatch Logs 쿼리 결과에서 필드 추출
    const timestamp = log.timestamp || log['@timestamp'] || log.Timestamp;
    const message = log.message || log['@message'];
    const logStream = log.logStream || log['@logStream'];
    const logGroup = log.logGroup || log['@log'];

    // 메시지에서 JSON 파싱 시도
    let parsedMessage: any = {};
    if (message && typeof message === 'string') {
      try {
        parsedMessage = JSON.parse(message);
      } catch {
        // JSON이 아니면 그냥 문자열로 처리
      }
    }

    // X-Ray Trace ID 추출 (우선순위: CloudWatch @xrayTraceId > 메시지 내부 > 환경 변수)
    const xrayTraceId = log['@xrayTraceId'] ||
      log.xrayTraceId ||
      log.xray_trace_id ||
      parsedMessage.xrayTraceId ||
      parsedMessage.xray_trace_id ||
      parsedMessage._X_AMZN_TRACE_ID ||
      log._X_AMZN_TRACE_ID;

    return {
      timestamp: timestamp || new Date().toISOString(),
      ContactId: parsedMessage.ContactId || log.ContactId || '',
      service: parsedMessage.service || log.service || (logGroup ? this.extractFunctionName(logGroup) : 'unknown'),
      message: typeof message === 'string' ? message : JSON.stringify(message),
      level: parsedMessage.level || log.level || 'INFO',
      duration: parsedMessage.duration || log.duration,
      xrayTraceId: xrayTraceId,
      xray_trace_id: xrayTraceId, // 호환성을 위해 두 필드 모두 설정
      logStream,
      logGroup,
      // Parameter matching을 위한 필드들 추가
      parameters: parsedMessage.parameters || parsedMessage.Parameters,
      event: parsedMessage.event || parsedMessage.Event,
    };
  }

  private async streamToString(stream: any): Promise<string> {
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
  }

  private async streamToBuffer(stream: any): Promise<Buffer> {
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  private extractTimeFromKey(key: string): Date | null {
    const match = key.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`);
    }
    return null;
  }

  private extractFunctionName(logGroup: string): string {
    const parts = logGroup.split('/');
    return parts[parts.length - 1];
  }

  private calculateDuration(start: Date, end?: Date): number {
    if (!end) return 0;
    return Math.floor((end.getTime() - start.getTime()) / 1000);
  }
}

// Export singleton instance
let serviceInstance: AWSConnectService | null = null;

export const getAWSConnectService = (config?: AWSConfig): AWSConnectService => {
  // If config is provided, always recreate the instance (for credential updates)
  if (config) {
    serviceInstance = new AWSConnectService(config);
  }
  if (!serviceInstance) {
    throw new Error('AWSConnectService not initialized. Please provide config.');
  }
  return serviceInstance;
};

export const resetAWSConnectService = () => {
  serviceInstance = null;
};

export default AWSConnectService;
