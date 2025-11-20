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
   * X-Ray 트레이스 조회
   */
  async getXRayTrace(traceId: string): Promise<any> {
    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const summariesCommand = new GetTraceSummariesCommand({
        StartTime: yesterday,
        EndTime: now,
        FilterExpression: `id("${traceId}")`,
      });

      const summariesResponse = await this.xrayClient.send(summariesCommand);

      if (!summariesResponse.TraceSummaries || summariesResponse.TraceSummaries.length === 0) {
        return null;
      }

      const graphCommand = new GetTraceGraphCommand({
        TraceIds: [traceId],
      });

      const graphResponse = await this.xrayClient.send(graphCommand);

      return {
        summary: summariesResponse.TraceSummaries[0],
        services: graphResponse.Services || [],
      };
    } catch (error) {
      console.error('Error fetching X-Ray trace:', error);
      return null;
    }
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
