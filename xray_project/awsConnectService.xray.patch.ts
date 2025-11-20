/**
 * AWS Connect Service X-Ray Integration Patch
 * 
 * 기존 awsConnectService.ts의 getXRayTrace 메서드를 개선합니다.
 * Python connect-contact-tracer의 로직을 참고하여 batch-get-traces를 사용합니다.
 */

import { 
  XRayClient, 
  BatchGetTracesCommand,
  BatchGetTracesCommandInput,
  BatchGetTracesCommandOutput,
} from '@aws-sdk/client-xray';
import { AWSConfig } from '@/types/contact.types';

/**
 * AWSConnectService 클래스에 추가할 개선된 X-Ray 메서드들
 * 
 * 사용 방법:
 * 1. 기존 awsConnectService.ts 파일을 열기
 * 2. 아래 메서드들을 AWSConnectService 클래스에 추가 또는 교체
 */

// ============================================================================
// ENHANCED X-RAY METHODS (기존 getXRayTrace 메서드 교체)
// ============================================================================

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
    throw error;
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
        traceData.lambdaLogs.sort((a, b) => {
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
    subsegments.forEach(sub => {
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

  return {
    warnCount,
    errorCount,
    infoCount,
    hasIssues,
    color,
  };
}
