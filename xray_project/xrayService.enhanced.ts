/**
 * AWS X-Ray 서비스 개선 버전
 * 
 * Python connect-contact-tracer의 X-Ray 로직을 참고하여 개선:
 * 1. batch-get-traces를 사용하여 상세한 트레이스 정보 가져오기
 * 2. Document 파싱을 통한 subsegment 정보 추출
 * 3. Lambda 로그와 X-Ray 트레이스 연결
 */

import { 
  XRayClient, 
  BatchGetTracesCommand,
  BatchGetTracesCommandInput,
  BatchGetTracesCommandOutput,
  Trace,
  Segment
} from '@aws-sdk/client-xray';
import { AWSConfig } from '@/types/contact.types';

export interface XRaySegmentData {
  id: string;
  name: string;
  start_time: number;
  end_time: number;
  duration: number;
  parent_id?: string;
  origin?: string;
  namespace?: string;
  error?: boolean;
  fault?: boolean;
  throttle?: boolean;
  http?: {
    request?: {
      method?: string;
      url?: string;
      user_agent?: string;
      client_ip?: string;
    };
    response?: {
      status?: number;
      content_length?: number;
    };
  };
  aws?: {
    operation?: string;
    region?: string;
    request_id?: string;
    retries?: number;
    resource_names?: string[];
    account_id?: string;
  };
  annotations?: Record<string, any>;
  metadata?: Record<string, any>;
  subsegments?: XRaySubsegment[];
}

export interface XRaySubsegment {
  id: string;
  name: string;
  start_time: number;
  end_time: number;
  duration: number;
  namespace?: string;
  error?: boolean;
  fault?: boolean;
  throttle?: boolean;
  http?: XRaySegmentData['http'];
  aws?: XRaySegmentData['aws'];
  sql?: {
    url?: string;
    preparation?: string;
    database_type?: string;
    database_version?: string;
    driver_version?: string;
    user?: string;
    sanitized_query?: string;
  };
  subsegments?: XRaySubsegment[];
}

export interface XRayTraceData {
  traceId: string;
  segments: XRaySegmentData[];
  lambdaLogs: any[];
  duration: number;
  hasError: boolean;
  hasFault: boolean;
}

export interface LambdaLogWithXRay {
  timestamp: string;
  xray_trace_id?: string;
  xrayTraceId?: string;
  level?: string;
  message?: string;
  service?: string;
  [key: string]: any;
}

export class XRayService {
  private xrayClient: XRayClient;

  constructor(config: AWSConfig) {
    const clientConfig: any = {
      region: config.region,
    };

    if (config.credentials) {
      clientConfig.credentials = {
        accessKeyId: config.credentials.accessKeyId,
        secretAccessKey: config.credentials.secretAccessKey,
        sessionToken: config.credentials.sessionToken,
      };
    }

    this.xrayClient = new XRayClient(clientConfig);
  }

  /**
   * X-Ray Trace ID로 상세 트레이스 정보 가져오기
   * Python의 get_xray_trace 함수 로직 참고
   */
  async getXRayTrace(traceId: string): Promise<XRayTraceData> {
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
      const segments = await this.parseTraceSegments(trace);

      // Calculate total duration
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

      const duration = maxTime - minTime;

      return {
        traceId,
        segments,
        lambdaLogs: [], // Will be populated by correlating with CloudWatch logs
        duration,
        hasError,
        hasFault,
      };
    } catch (error) {
      console.error('Error fetching X-Ray trace:', error);
      throw error;
    }
  }

  /**
   * Trace의 Segment들을 파싱하여 구조화된 데이터로 변환
   * Python의 process_subsegments 및 get_segment_node 로직 참고
   */
  private async parseTraceSegments(trace: Trace): Promise<XRaySegmentData[]> {
    const segments: XRaySegmentData[] = [];

    if (!trace.Segments) {
      return segments;
    }

    for (const segment of trace.Segments) {
      try {
        const segmentData = await this.parseSegmentDocument(segment);
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
  private async parseSegmentDocument(segment: Segment): Promise<XRaySegmentData | null> {
    if (!segment.Document) {
      return null;
    }

    try {
      const doc = JSON.parse(segment.Document);

      const segmentData: XRaySegmentData = {
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
        segmentData.subsegments = this.parseSubsegments(doc.subsegments);
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
  private parseSubsegments(subsegments: any[]): XRaySubsegment[] {
    const parsed: XRaySubsegment[] = [];

    for (const sub of subsegments) {
      // Skip specific subsegment types (Python 로직 참고)
      const skipTypes = ['Overhead', 'Dwell Time', 'Invocation', 'Attempt'];
      if (skipTypes.includes(sub.name)) {
        continue;
      }

      const subsegment: XRaySubsegment = {
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
      };

      // Recursively parse nested subsegments
      if (sub.subsegments && Array.isArray(sub.subsegments)) {
        subsegment.subsegments = this.parseSubsegments(sub.subsegments);
      }

      parsed.push(subsegment);
    }

    return parsed;
  }

  /**
   * Lambda 로그에서 X-Ray Trace ID 추출
   * Python의 filter_lambda_logs 로직 참고
   */
  filterLambdaLogsByTraceId(logs: LambdaLogWithXRay[], traceId: string): LambdaLogWithXRay[] {
    return logs.filter(log => {
      const logTraceId = log.xray_trace_id || log.xrayTraceId;
      return logTraceId === traceId;
    });
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
    contactLogs: any[], 
    lambdaLogs?: Record<string, LambdaLogWithXRay[]>
  ): Promise<Map<string, XRayTraceData>> {
    const traceIds = this.extractXRayTraceIds(contactLogs);
    const traces = new Map<string, XRayTraceData>();

    for (const traceId of traceIds) {
      try {
        const traceData = await this.getXRayTrace(traceId);
        
        // Associate Lambda logs with this trace
        if (lambdaLogs) {
          const allLambdaLogs: LambdaLogWithXRay[] = Object.values(lambdaLogs).flat();
          traceData.lambdaLogs = this.filterLambdaLogsByTraceId(allLambdaLogs, traceId);
        }

        traces.set(traceId, traceData);
      } catch (error) {
        console.error(`Error fetching trace ${traceId}:`, error);
      }
    }

    return traces;
  }

  /**
   * X-Ray 트레이스를 ReactFlow 노드/엣지로 변환
   * Python의 build_xray_nodes 로직을 React Flow 형식으로 변환
   */
  buildXRayFlowNodes(traceData: XRayTraceData): {
    nodes: any[];
    edges: any[];
  } {
    const nodes: any[] = [];
    const edges: any[] = [];
    let yOffset = 0;
    const xSpacing = 350;
    const ySpacing = 120;

    // Process main segments
    traceData.segments.forEach((segment, segmentIndex) => {
      const segmentNodeId = segment.id;
      const segmentX = segmentIndex * xSpacing;

      // Main segment node
      nodes.push({
        id: segmentNodeId,
        type: 'xraySegment',
        position: { x: segmentX, y: yOffset },
        data: {
          label: segment.name,
          segmentData: segment,
          error: segment.error,
          fault: segment.fault,
          duration: segment.duration,
          service: segment.origin || segment.namespace || 'AWS',
        },
      });

      // Process subsegments
      if (segment.subsegments) {
        this.processSubsegmentsForFlow(
          segment.subsegments,
          segmentNodeId,
          segmentX + 300,
          yOffset,
          ySpacing,
          nodes,
          edges
        );
      }

      // Connect to parent segment if exists
      if (segment.parent_id) {
        edges.push({
          id: `${segment.parent_id}-${segmentNodeId}`,
          source: segment.parent_id,
          target: segmentNodeId,
          type: 'smoothstep',
          animated: segment.error || segment.fault,
          style: { 
            stroke: segment.error || segment.fault ? '#f44336' : '#4caf50' 
          },
        });
      }
    });

    // Add Lambda CloudWatch Logs
    if (traceData.lambdaLogs && traceData.lambdaLogs.length > 0) {
      yOffset += 400;
      
      traceData.lambdaLogs.forEach((log, logIndex) => {
        const logNodeId = `log_${log.timestamp}_${logIndex}`;
        const isError = log.level === 'ERROR' || log.level === 'WARN';

        nodes.push({
          id: logNodeId,
          type: 'lambdaLog',
          position: { x: 0, y: yOffset + (logIndex * 100) },
          data: {
            label: log.level || 'INFO',
            logData: log,
            error: isError,
            message: log.message,
            timestamp: log.timestamp,
          },
        });

        // Connect logs sequentially
        if (logIndex > 0) {
          const prevLogId = `log_${traceData.lambdaLogs[logIndex - 1].timestamp}_${logIndex - 1}`;
          edges.push({
            id: `${prevLogId}-${logNodeId}`,
            source: prevLogId,
            target: logNodeId,
            type: 'smoothstep',
            style: { stroke: isError ? '#ff9800' : '#9e9e9e' },
          });
        }
      });
    }

    return { nodes, edges };
  }

  /**
   * Subsegment를 ReactFlow 노드로 변환 (재귀적)
   */
  private processSubsegmentsForFlow(
    subsegments: XRaySubsegment[],
    parentId: string,
    baseX: number,
    baseY: number,
    ySpacing: number,
    nodes: any[],
    edges: any[]
  ): void {
    subsegments.forEach((subsegment, index) => {
      const subNodeId = subsegment.id;
      const isError = subsegment.error || subsegment.fault;

      nodes.push({
        id: subNodeId,
        type: 'xraySegment',
        position: { x: baseX, y: baseY + (index * ySpacing) },
        data: {
          label: subsegment.name,
          segmentData: subsegment,
          error: isError,
          fault: subsegment.fault,
          duration: subsegment.duration,
          service: subsegment.namespace || 'aws',
          operation: subsegment.aws?.operation,
          resource: subsegment.aws?.resource_names?.[0],
          httpMethod: subsegment.http?.request?.method,
          httpUrl: subsegment.http?.request?.url,
          httpStatus: subsegment.http?.response?.status,
        },
      });

      // Edge from parent to subsegment
      const edgeLabel = subsegment.aws?.operation || 
                        subsegment.http?.request?.method || 
                        subsegment.name;

      edges.push({
        id: `${parentId}-${subNodeId}`,
        source: parentId,
        target: subNodeId,
        label: edgeLabel,
        type: 'smoothstep',
        animated: isError,
        style: { stroke: isError ? '#f44336' : '#4caf50' },
      });

      // Process nested subsegments recursively
      if (subsegment.subsegments && subsegment.subsegments.length > 0) {
        this.processSubsegmentsForFlow(
          subsegment.subsegments,
          subNodeId,
          baseX + 300,
          baseY + (index * ySpacing),
          ySpacing,
          nodes,
          edges
        );
      }
    });
  }

  /**
   * X-Ray 트레이스 요약 정보 생성
   * Python의 get_xray_edge_label 로직 참고
   */
  getTraceSummary(traceData: XRayTraceData): string {
    const operations: string[] = [];
    let operationIndex = 1;

    const extractOperations = (segments: XRaySegmentData[]) => {
      segments.forEach(segment => {
        if (segment.aws?.operation) {
          const resourceName = segment.aws.resource_names?.[0] || segment.name;
          const op = `Operation ${operationIndex}: ${segment.aws.operation} ${resourceName}`;
          if (!operations.includes(op)) {
            operations.push(op);
            operationIndex++;
          }
        }

        if (segment.subsegments) {
          segment.subsegments.forEach(sub => {
            if (sub.aws?.operation) {
              const resourceName = sub.aws.resource_names?.[0] || sub.name;
              const op = `Operation ${operationIndex}: ${sub.aws.operation} ${resourceName}`;
              if (!operations.includes(op)) {
                operations.push(op);
                operationIndex++;
              }
            }
          });
        }
      });
    };

    extractOperations(traceData.segments);
    return operations.join('\n');
  }
}
