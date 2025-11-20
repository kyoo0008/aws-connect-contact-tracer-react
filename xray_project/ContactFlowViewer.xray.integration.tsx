/**
 * ContactFlowViewer X-Ray Integration Guide
 * 
 * ContactFlowViewer에 X-Ray 트레이스 기능을 통합하는 방법을 설명합니다.
 * Python connect-contact-tracer의 build_xray_dot 로직을 참고합니다.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAWSConnectService } from '@/services/awsConnectService';

/**
 * STEP 1: X-Ray 트레이스 데이터 가져오기
 * 
 * ContactFlowViewer의 기존 useQuery에 X-Ray 트레이스 데이터 로딩 추가
 */

// 기존 코드에 추가할 부분:
const { data: queryData, isLoading, error, refetch } = useQuery({
  queryKey: ['contact-flow', contactId, config.credentials?.accessKeyId],
  queryFn: async () => {
    if (!contactId) throw new Error('Contact ID is required');

    const service = getAWSConnectService(config);

    // Get contact details
    const details = await service.getContactDetails(contactId);

    // Calculate time range
    const startTime = new Date(details.initiationTimestamp);
    startTime.setHours(startTime.getHours() - 1);
    const endTime = details.disconnectTimestamp
      ? new Date(details.disconnectTimestamp)
      : new Date();
    endTime.setHours(endTime.getHours() + 1);

    // Fetch logs and transcript
    const [contactLogs, transcript] = await Promise.all([
      service.getContactLogs(contactId, startTime, endTime),
      service.getTranscript(contactId, startTime),
    ]);

    // 🆕 NEW: Get Lambda logs (if available)
    const lambdaLogs = await service.getLambdaLogs?.(contactId, startTime, endTime) || {};

    // 🆕 NEW: Get X-Ray traces for this contact
    const xrayTraces = await service.getContactXRayTraces(
      contactId,
      contactLogs,
      lambdaLogs
    );

    // Build flow
    const flowBuilder = new FlowBuilderService(contactLogs, { filterModules: true });
    const flowData = flowBuilder.buildFlow();

    if (transcript.length > 0) {
      flowBuilder.addTranscript(transcript);
      flowData.transcript = transcript;
    }

    return { 
      flowData, 
      originalLogs: contactLogs,
      lambdaLogs,
      xrayTraces, // 🆕 NEW: X-Ray trace data
    };
  },
  enabled: !!contactId,
  retry: 2,
});

/**
 * STEP 2: X-Ray 노드를 Contact Flow에 통합
 * 
 * X-Ray 트레이스 ID가 있는 로그에 X-Ray 노드 추가
 */

// FlowBuilderService.ts에 추가할 메서드:
class FlowBuilderService {
  // ... 기존 코드 ...

  /**
   * X-Ray 트레이스 노드를 플로우에 추가
   * Python의 build_xray_dot 로직 참고
   */
  addXRayNodes(xrayTraces: Map<string, any>): void {
    if (!xrayTraces || xrayTraces.size === 0) {
      return;
    }

    const xrayNodes: ContactFlowNode[] = [];
    const xrayEdges: ContactFlowEdge[] = [];

    // Find logs with X-Ray trace IDs
    const logsWithXRay = this.logs.filter(log => 
      log.xray_trace_id || log.xrayTraceId
    );

    logsWithXRay.forEach((log, index) => {
      const traceId = log.xray_trace_id || log.xrayTraceId;
      if (!traceId) return;

      const traceData = xrayTraces.get(traceId);
      if (!traceData) return;

      // Create X-Ray node
      const nodeId = `xray_${log.Timestamp?.replace(/:/g, '').replace(/\./g, '')}_${traceId}`;
      
      // Get Lambda log statistics
      const lambdaLogStats = this.getXRayLambdaLogStats(traceData.lambdaLogs || []);
      
      // Get trace summary (operations)
      const traceSummary = this.getXRayTraceSummary(traceData);

      const xrayNode: ContactFlowNode = {
        id: nodeId,
        type: 'custom',
        data: {
          label: 'X-Ray Trace',
          moduleType: 'xray',
          parameters: {
            traceId: traceId,
            duration: traceData.duration,
            hasError: traceData.hasError,
            hasFault: traceData.hasFault,
            operationsSummary: traceSummary,
            lambdaLogStats: lambdaLogStats,
          },
          error: lambdaLogStats.hasIssues || traceData.hasError || traceData.hasFault,
          timestamp: log.Timestamp,
          // Store trace data for detailed view
          xrayTraceData: traceData,
        },
        position: {
          x: 0,
          y: 0, // Will be calculated by layout algorithm
        },
      };

      xrayNodes.push(xrayNode);

      // Find the corresponding Lambda invocation node to connect to
      const lambdaNodeId = this.findLambdaNodeForLog(log);
      if (lambdaNodeId) {
        xrayEdges.push({
          id: `${lambdaNodeId}-${nodeId}`,
          source: lambdaNodeId,
          target: nodeId,
          label: 'X-Ray',
          type: 'smoothstep',
          animated: xrayNode.data.error,
          style: {
            stroke: xrayNode.data.error ? '#f44336' : '#4caf50',
          },
        });
      }
    });

    // Add X-Ray nodes to flow
    this.nodes.push(...xrayNodes);
    this.edges.push(...xrayEdges);
  }

  /**
   * Find Lambda invocation node for given log
   */
  private findLambdaNodeForLog(log: any): string | undefined {
    // Find the node that corresponds to this Lambda invocation
    const lambdaNode = this.nodes.find(node => 
      (node.data.moduleType === 'InvokeExternalResource' || 
       node.data.moduleType === 'InvokeLambdaFunction') &&
      node.data.timestamp === log.Timestamp
    );
    return lambdaNode?.id;
  }

  /**
   * Get X-Ray Lambda log statistics
   * Python의 lambda_node_footer 로직 참고
   */
  private getXRayLambdaLogStats(lambdaLogs: any[]): any {
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
      summary: hasIssues 
        ? `${errorCount > 0 ? `Error: ${errorCount}` : ''} ${warnCount > 0 ? `Warn: ${warnCount}` : ''}`.trim()
        : undefined,
    };
  }

  /**
   * Get X-Ray trace summary
   * Python의 xray_text 생성 로직 참고
   */
  private getXRayTraceSummary(traceData: any): string {
    const operations: string[] = [];
    let operationIndex = 1;
    const seenOperations = new Set<string>();

    const extractOperations = (segments: any[]) => {
      segments.forEach((segment: any) => {
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

    extractOperations(traceData.segments || []);
    return operations.length > 0 ? operations.join('\n') : 'No operations found';
  }
}

/**
 * STEP 3: X-Ray 노드 클릭 시 상세 페이지로 이동
 * 
 * ContactFlowViewer에 추가할 핸들러
 */

const handleNodeClick = useCallback(
  (_event: React.MouseEvent, node: Node) => {
    // Check if it's an X-Ray node
    if (node.data.moduleType === 'xray' && node.data.parameters?.traceId) {
      // Navigate to X-Ray trace viewer
      navigate(
        `/xray-trace?traceId=${node.data.parameters.traceId}&contactId=${contactId}`
      );
      return;
    }

    // Handle other node types
    setSelectedLog(node.data);
    setDrawerOpen(true);
  },
  [navigate, contactId]
);

/**
 * STEP 4: CustomNode 컴포넌트에 X-Ray 노드 스타일 추가
 * 
 * CustomNode.tsx에 추가할 코드
 */

// CustomNode.tsx
const CustomNode: React.FC<{ data: any }> = ({ data }) => {
  // ... 기존 코드 ...

  // X-Ray 노드인 경우 특별한 스타일 적용
  if (data.moduleType === 'xray') {
    return (
      <Box
        sx={{
          p: 2,
          border: data.error ? '2px solid #f44336' : '2px solid #4caf50',
          borderRadius: 2,
          background: data.error ? '#ffebee' : '#e8f5e9',
          minWidth: 200,
          cursor: 'pointer',
          '&:hover': {
            boxShadow: 3,
          },
        }}
      >
        <Stack spacing={1}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BugReportIcon color={data.error ? 'error' : 'success'} />
            <Typography variant="subtitle2" fontWeight="bold">
              {data.label}
            </Typography>
            <IconButton size="small" sx={{ ml: 'auto' }}>
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Box>
          
          {data.parameters?.lambdaLogStats?.summary && (
            <Typography variant="caption" color="error">
              {data.parameters.lambdaLogStats.summary}
            </Typography>
          )}
          
          {data.parameters?.operationsSummary && (
            <Typography
              variant="caption"
              sx={{
                whiteSpace: 'pre-line',
                maxHeight: 100,
                overflow: 'auto',
                fontSize: '0.7rem',
              }}
            >
              {data.parameters.operationsSummary}
            </Typography>
          )}
          
          {data.parameters?.duration && (
            <Typography variant="caption" color="text.secondary">
              Duration: {(data.parameters.duration * 1000).toFixed(2)}ms
            </Typography>
          )}
        </Stack>
      </Box>
    );
  }

  // ... 기존 노드 렌더링 코드 ...
};

/**
 * STEP 5: 적용 방법 요약
 * 
 * 1. awsConnectService.ts에 awsConnectService.xray.patch.ts의 메서드들을 추가
 * 2. ContactFlowViewer.tsx의 useQuery를 업데이트하여 X-Ray 데이터 로드
 * 3. FlowBuilderService.ts에 addXRayNodes 메서드 추가
 * 4. ContactFlowViewer에서 flowBuilder.addXRayNodes(xrayTraces) 호출
 * 5. CustomNode.tsx에 X-Ray 노드 렌더링 로직 추가
 * 6. XRayTraceViewer를 XRayTraceViewer.enhanced.tsx로 교체
 */

// ContactFlowViewer.tsx 최종 통합 예시:
const ContactFlowViewerWithXRay: React.FC = () => {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const { config } = useConfig();

  const { data: queryData, isLoading, error } = useQuery({
    queryKey: ['contact-flow', contactId],
    queryFn: async () => {
      if (!contactId) throw new Error('Contact ID is required');

      const service = getAWSConnectService(config);
      const details = await service.getContactDetails(contactId);
      
      const startTime = new Date(details.initiationTimestamp);
      startTime.setHours(startTime.getHours() - 1);
      const endTime = details.disconnectTimestamp
        ? new Date(details.disconnectTimestamp)
        : new Date();
      endTime.setHours(endTime.getHours() + 1);

      // Load all data
      const [contactLogs, transcript, lambdaLogs] = await Promise.all([
        service.getContactLogs(contactId, startTime, endTime),
        service.getTranscript(contactId, startTime),
        service.getLambdaLogs?.(contactId, startTime, endTime) || Promise.resolve({}),
      ]);

      // Get X-Ray traces
      const xrayTraces = await service.getContactXRayTraces(
        contactId,
        contactLogs,
        lambdaLogs
      );

      // Build flow with X-Ray nodes
      const flowBuilder = new FlowBuilderService(contactLogs, { filterModules: true });
      const flowData = flowBuilder.buildFlow();
      
      if (transcript.length > 0) {
        flowBuilder.addTranscript(transcript);
        flowData.transcript = transcript;
      }

      // 🆕 Add X-Ray nodes to the flow
      flowBuilder.addXRayNodes(xrayTraces);

      return { 
        flowData: flowBuilder.getFlowData(),
        originalLogs: contactLogs,
        lambdaLogs,
        xrayTraces,
      };
    },
    enabled: !!contactId,
  });

  // ... rest of component ...
};

export default ContactFlowViewerWithXRay;
