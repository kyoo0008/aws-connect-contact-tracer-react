import {
  ConnectClient,
  DescribeContactCommand,
  SearchContactsCommand,
  GetContactAttributesCommand,
  ListInstancesCommand,
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
  ApiResponse
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
      clientConfig.credentials = {
        accessKeyId: config.credentials.accessKeyId,
        secretAccessKey: config.credentials.secretAccessKey,
        sessionToken: config.credentials.sessionToken,
        expiration: config.credentials.expiration
          ? new Date(config.credentials.expiration)
          : undefined,
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
    } catch (error) {
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
              } else if (log.logGroup?.includes('/aws/lambda/')) {
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
    const logGroupName = `/aws/lambda/${functionName}`;
    const query = `
      fields @timestamp, @message
      | filter @message like /${contactId}/
      | sort @timestamp asc
    `;

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
    return {
      timestamp: log.timestamp || log['@timestamp'],
      ContactId: log.ContactId,
      service: log.service || this.extractFunctionName(log.logGroup),
      message: log.message,
      level: log.level || 'INFO',
      duration: log.duration,
      xrayTraceId: log.xrayTraceId || log['xray_trace_id'],
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
