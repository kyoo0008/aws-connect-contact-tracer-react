/**
 * Enhanced XRayTraceViewer
 *
 * Python connect-contact-tracer의 build_xray_nodes 로직을 참고하여
 * X-Ray 트레이스를 Graphviz 스타일로 React Flow에서 시각화합니다.
 *
 * 레이아웃: rankdir="LR"
 *  - 상단: 서비스 맵 (Lambda → AWS Services)
 *  - 하단: Lambda 로그 카드 (Raw Json → INFO cards, 번호 edge로 연결)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Container,
  Paper,
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Toolbar,
  IconButton,
  Tooltip,
  Chip,
  Stack,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Fullscreen as FullscreenIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
} from 'react-flow-renderer';
import { useQuery } from '@tanstack/react-query';
import { getAWSConnectService } from '@/services/awsConnectService';
import XRayNode from '@/components/FlowNodes/XRayNode';
import LogDetailsDrawer from '@/components/LogDetailsDrawer/LogDetailsDrawer';
import { useConfig } from '@/contexts/ConfigContext';

const nodeTypes = {
  xraySegment: XRayNode,
  lambdaLog: XRayNode,
  rawJson: XRayNode,
};

// ─── Helpers ────────────────────────────────────────────────

const SKIP_NAMES = new Set(['Overhead', 'Dwell Time', 'Lambda', 'QueueTime', 'Initialization']);

/**
 * Helper: Subsegment에서 서비스 타입 추출
 */
const getServiceType = (subsegment: any): string => {
  if (subsegment.namespace === 'aws') {
    const name = subsegment.name || '';
    if (name.includes('DynamoDB')) return 'DynamoDB';
    if (name.includes('S3')) return 'S3';
    if (name.includes('SNS')) return 'SNS';
    if (name.includes('SQS')) return 'SQS';
    if (name.includes('SSM')) return 'SSM';
    if (name.includes('Connect')) return 'Connect';
    if (name.includes('SecretsManager')) return 'SecretsManager';
    return name || 'AWS';
  }
  if (subsegment.namespace === 'remote' || subsegment.http) return 'HTTP';
  return subsegment.name || 'Unknown';
};

/**
 * Helper: Edge 레이블 생성 (Python get_xray_edge_label 참고)
 */
const getEdgeLabel = (subsegment: any): { label: string; xlabel?: string } => {
  let label = '';
  let xlabel: string | undefined;
  const name = subsegment.name || '';

  // SSM, Connect, SecretsManager, SQS, S3
  if (['SSM', 'Connect', 'SecretsManager', 'SQS', 'S3'].some(s => name.includes(s))) {
    if (subsegment.aws?.resource_names?.length) {
      label = `${subsegment.aws.operation}\n${subsegment.aws.resource_names[0].split('/').pop()}`;
    } else if (subsegment.aws?.operation) {
      label = subsegment.aws.operation;
    }
  }
  // DynamoDB
  else if (name.includes('DynamoDB')) {
    if (subsegment.aws?.table_name) {
      label = `${subsegment.aws.operation}\n${subsegment.aws.table_name}`;
    } else if (subsegment.aws?.operation) {
      label = subsegment.aws.operation;
    }
  }
  // URL / HTTP
  else if (name.includes('.') || subsegment.http?.request?.url) {
    const method = subsegment.http?.request?.method || '';
    const url = subsegment.http?.request?.url || '';
    const path = url.split('/').slice(3).join('/');
    label = `${method}\n${path}`;

    if (subsegment.http?.response) {
      const status = subsegment.http.response.status;
      if (status && !String(status).startsWith('2')) {
        xlabel = String(status);
      }
    } else if (subsegment.cause?.exceptions?.length) {
      xlabel = subsegment.cause.exceptions[0]?.message;
    }
  }
  // AWS operation fallback
  else if (subsegment.aws?.operation) {
    label = subsegment.aws.operation;
    if (subsegment.aws.resource_names?.length) {
      label += `\n${subsegment.aws.resource_names[0]}`;
    }
  }

  return { label, xlabel };
};

/**
 * Helper: Lambda 로그 메시지 포맷팅 (Python 로직 참고)
 */
const wrapText = (text: string, maxLength: number = 25) => {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
};

const formatLogContent = (log: any): { subtitle: string; bodyText: string } => {
  const message = log.message || '';
  let subtitle = '';
  let bodyText = '';

  if (message.includes('parameter')) {
    subtitle = 'parameter';
    const params = log.parameters || {};
    Object.keys(params).forEach(key => {
      bodyText += `${wrapText(`${key} : ${params[key]}`)}\n`;
    });
    if (message.includes('lex')) {
      bodyText += `intent : ${log.intent || ''}`;
    }
  } else if (message.includes('attribute')) {
    subtitle = 'attributes';
    const attrs = log.attributes || {};
    Object.keys(attrs).forEach(key => {
      bodyText += `${wrapText(`${key} : ${attrs[key]}`)}\n`;
    });
  } else if (message.includes('lex')) {
    bodyText = message.replace(']', ']\n');
    if (log.event?.inputTranscript) {
      bodyText += `\n${log.event.inputTranscript}`;
    }
  } else {
    bodyText = message.replace(']', ']\n');
  }

  return { subtitle, bodyText: bodyText.trim() };
};

/**
 * Subsegment를 전처리 - Invocation/Attempt 내부의 실제 서비스 호출만 추출
 */
const extractSubsegments = (subsegments: any[], parentId: string): Array<{ sub: any; parentId: string }> => {
  const result: Array<{ sub: any; parentId: string }> = [];

  for (const sub of subsegments) {
    const name = sub.name || '';
    if (SKIP_NAMES.has(name)) continue;

    if (name === 'Invocation' || name.includes('Attempt')) {
      if (sub.subsegments?.length) {
        result.push(...extractSubsegments(sub.subsegments, parentId));
      }
    } else {
      result.push({ sub, parentId });
    }
  }

  return result;
};

// ─── Build Flow Data ────────────────────────────────────────

/**
 * X-Ray 트레이스를 React Flow 노드/엣지로 변환
 * Graphviz rankdir="LR" 스타일 레이아웃
 *
 * 상단: 서비스 맵 (Lambda → external services)
 * 하단: Lambda 로그 카드 체인 (Raw Json → log0 → log1 → ...)
 */
const buildXRayFlowData = (xrayData: any): { nodes: Node[]; edges: Edge[] } => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  if (!xrayData?.segments || xrayData.segments.length === 0) {
    return { nodes, edges };
  }

  // ─── 서비스 맵 영역 ───
  const SERVICE_MAP_Y = 50;
  const LAMBDA_X = 100;
  const SERVICE_X_START = 500;
  const SERVICE_X_GAP = 350;

  let lambdaY = SERVICE_MAP_Y;

  // 중복 서비스 노드 방지를 위한 맵 (key: serviceName, value: nodeId)
  const serviceNodeMap = new Map<string, string>();

  xrayData.segments.forEach((segment: any, segIdx: number) => {
    const segId = segment.id;
    const isError = segment.error || segment.fault;
    const lambdaName = segment.name || 'Lambda Function';

    // Lambda 노드
    nodes.push({
      id: segId,
      type: 'xraySegment',
      position: { x: LAMBDA_X, y: lambdaY },
      data: {
        label: lambdaName,
        service: 'Lambda',
        error: isError,
        fault: segment.fault,
        segmentData: segment,
      },
    });

    // 이전 Lambda와 체인 연결
    if (segIdx > 0) {
      const prevId = xrayData.segments[segIdx - 1].id;
      edges.push({
        id: `chain-${prevId}-${segId}`,
        source: prevId,
        sourceHandle: 'bottom',
        target: segId,
        targetHandle: 'top',
        type: 'smoothstep',
        style: { stroke: '#FF9900', strokeWidth: 2, strokeDasharray: '5 5' },
        label: 'invokes',
        labelStyle: { fontSize: 10, fill: '#FF9900' },
      });
    }

    // Subsegments → 서비스 노드
    if (segment.subsegments?.length) {
      const items = extractSubsegments(segment.subsegments, segId);
      let serviceCol = 0;

      items.forEach(({ sub }) => {
        const serviceType = getServiceType(sub);
        const serviceName = sub.aws?.table_name
          || sub.aws?.resource_names?.[0]?.split('/').pop()
          || sub.name
          || serviceType;
        const serviceKey = `${serviceType}_${serviceName}`;

        let serviceNodeId: string;

        // 같은 서비스+리소스는 노드를 재사용
        if (serviceNodeMap.has(serviceKey)) {
          serviceNodeId = serviceNodeMap.get(serviceKey)!;
        } else {
          serviceNodeId = `svc_${sub.id}`;
          const serviceX = SERVICE_X_START + serviceCol * SERVICE_X_GAP;

          nodes.push({
            id: serviceNodeId,
            type: 'xraySegment',
            position: { x: serviceX, y: lambdaY },
            data: {
              label: serviceName,
              service: serviceType,
              error: sub.error || sub.fault,
              segmentData: sub,
            },
          });

          serviceNodeMap.set(serviceKey, serviceNodeId);
          serviceCol++;
        }

        // Edge: Lambda → Service
        const { label, xlabel } = getEdgeLabel(sub);
        const edgeColor = xlabel ? 'tomato' : '#757575';
        const edgeLabel = xlabel ? `${label}\n${xlabel}` : label;

        edges.push({
          id: `${segId}-${sub.id}`,
          source: segId,
          target: serviceNodeId,
          type: 'smoothstep',
          animated: !!(sub.error || sub.fault),
          label: edgeLabel,
          labelStyle: { fontSize: 10, fill: edgeColor, fontWeight: xlabel ? 700 : 400 },
          style: { stroke: edgeColor, strokeWidth: xlabel ? 2 : 1 },
        });
      });
    }

    lambdaY += 150;
  });

  // ─── Lambda 로그 카드 영역 ───
  const LOG_AREA_Y = lambdaY + 80;
  const LOG_X_START = 50;
  const LOG_X_GAP = 250;

  if (xrayData.lambdaLogs && xrayData.lambdaLogs.length > 0) {
    const rawJsonId = `${xrayData.traceId}_raw_json`;

    // Raw Json 노드
    nodes.push({
      id: rawJsonId,
      type: 'rawJson',
      position: { x: LOG_X_START, y: LOG_AREA_Y },
      data: {
        label: 'Raw Json',
        service: 'CloudWatch',
        logData: xrayData.lambdaLogs,
      },
    });

    let logX = LOG_X_START + 150;
    const logNodeIds: string[] = [];

    xrayData.lambdaLogs.forEach((log: any, index: number) => {
      const logId = `log_${index}`;
      const { subtitle, bodyText } = formatLogContent(log);

      nodes.push({
        id: logId,
        type: 'lambdaLog',
        position: { x: logX, y: LOG_AREA_Y - 20 },
        data: {
          label: log.level || 'INFO',
          level: log.level || 'INFO',
          subtitle,
          bodyText: wrapText(bodyText, 100),
          logData: log,
          blockId: subtitle || ' ',
        },
      });

      logNodeIds.push(logId);
      logX += LOG_X_GAP;
    });

    // Edges: Raw Json → log0, log0 → log1, ...  (numbered like Graphviz add_edges)
    if (logNodeIds.length > 0) {
      edges.push({
        id: `rawjson-to-log0`,
        source: rawJsonId,
        target: logNodeIds[0],
        type: 'smoothstep',
        style: { stroke: '#9e9e9e', strokeWidth: 1 },
      });

      for (let i = 0; i < logNodeIds.length - 1; i++) {
        edges.push({
          id: `log-${i}-to-${i + 1}`,
          source: logNodeIds[i],
          target: logNodeIds[i + 1],
          type: 'smoothstep',
          label: String(i),
          labelStyle: { fontSize: 11, fill: '#333', fontWeight: 600 },
          labelBgStyle: { fill: '#fff', fillOpacity: 0.8 },
          style: { stroke: '#9e9e9e', strokeWidth: 1 },
        });
      }
    }
  }

  return { nodes, edges };
};

// ─── Components ─────────────────────────────────────────────

const XRayCanvas: React.FC<{
  nodes: Node[];
  edges: Edge[];
  onNodesChange: any;
  onEdgesChange: any;
  onNodeClick: any;
  nodeTypes: any;
}> = ({ nodes, edges, onNodesChange, onEdgesChange, onNodeClick, nodeTypes }) => {
  return (
    <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Background gap={12} size={1} />
        <Controls />
      </ReactFlow>
    </ReactFlowProvider>
  );
};

/**
 * Trace Summary - 간결한 요약 칩
 */
const XRayTraceSummary: React.FC<{ xrayData: any }> = ({ xrayData }) => {
  let totalSegments = 0;
  let errorCount = 0;

  if (xrayData.segments) {
    totalSegments = xrayData.segments.length;
    xrayData.segments.forEach((seg: any) => {
      if (seg.error || seg.fault) errorCount++;
    });
  }
  if (xrayData.lambdaLogs) {
    xrayData.lambdaLogs.forEach((log: any) => {
      if (log.level === 'ERROR' || log.level === 'WARN') errorCount++;
    });
  }

  return (
    <Paper variant="outlined" sx={{ mx: 2, mt: 2, p: 1.5 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
        Trace Summary
      </Typography>
      <Stack direction="row" spacing={1.5}>
        <Chip icon={<InfoIcon />} label={`${totalSegments} Segments`} color="info" variant="outlined" size="small" />
        {xrayData.duration > 0 && (
          <Chip label={`Duration: ${(xrayData.duration * 1000).toFixed(2)}ms`} variant="outlined" size="small" />
        )}
        {errorCount > 0 && (
          <Chip label={`${errorCount} Errors`} color="error" size="small" />
        )}
      </Stack>
    </Paper>
  );
};

// ─── Main Page ──────────────────────────────────────────────

const XRayTraceViewerContent: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const xrayTraceId = searchParams.get('traceId');
  const contactId = searchParams.get('contactId');
  const requestId = searchParams.get('requestId');

  const { config, isConfigured } = useConfig();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: xrayData, isLoading, error, refetch } = useQuery({
    queryKey: ['xrayTrace', xrayTraceId],
    queryFn: async () => {
      if (!isConfigured || !xrayTraceId) return null;
      const service = getAWSConnectService(config);
      return await service.getXRayTraceEnhanced(xrayTraceId);
    },
    enabled: isConfigured && !!xrayTraceId,
  });

  useEffect(() => {
    if (!xrayData) return;
    const flowData = buildXRayFlowData(xrayData);
    setNodes(flowData.nodes);
    setEdges(flowData.edges);
  }, [xrayData, setNodes, setEdges]);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedLog(node.data.segmentData || node.data.logData);
    setDrawerOpen(true);
  }, []);

  const handleBack = () => {
    if (requestId) {
      navigate(`/qm-flow-xray?${new URLSearchParams({ requestId }).toString()}`);
    } else if (contactId) {
      navigate(`/contact-flow/${contactId}`);
    } else {
      navigate(-1);
    }
  };

  if (!isConfigured) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="warning">AWS configuration is required. Please configure your settings first.</Alert>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/settings')} sx={{ mt: 2 }}>Go to Settings</Button>
      </Container>
    );
  }

  if (!xrayTraceId) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="error">X-Ray Trace ID is required</Alert>
        <Button startIcon={<BackIcon />} onClick={handleBack} sx={{ mt: 2 }}>Go Back</Button>
      </Container>
    );
  }

  return (
    <Container maxWidth={false} disableGutters sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper elevation={2} sx={{ borderRadius: 0 }}>
        <Toolbar sx={{ gap: 2 }}>
          <IconButton edge="start" onClick={handleBack}>
            <BackIcon />
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
            <Typography variant="h6" component="h1" noWrap>
              AWS X-Ray Trace
            </Typography>
            <Chip label={xrayTraceId} size="small" color="primary" sx={{ fontFamily: 'monospace' }} />
            {contactId && <Chip label={`Contact: ${contactId}`} size="small" variant="outlined" />}
            {requestId && <Chip label={`Request: ${requestId}`} size="small" variant="outlined" />}
          </Box>
          <Stack direction="row" spacing={1}>
            <Tooltip title="Refresh">
              <IconButton onClick={() => refetch()}><RefreshIcon /></IconButton>
            </Tooltip>
            <Tooltip title="Fullscreen">
              <IconButton><FullscreenIcon /></IconButton>
            </Tooltip>
            <Tooltip title="Download">
              <IconButton><DownloadIcon /></IconButton>
            </Tooltip>
          </Stack>
        </Toolbar>
      </Paper>

      {/* Summary */}
      {!isLoading && !error && xrayData && <XRayTraceSummary xrayData={xrayData} />}

      {/* Flow Canvas */}
      <Box sx={{ flex: 1, position: 'relative', bgcolor: '#fafafa' }}>
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Box sx={{ p: 3 }}>
            <Alert severity="error">
              Failed to load X-Ray trace: {error instanceof Error ? error.message : 'Unknown error'}
            </Alert>
          </Box>
        )}

        {!isLoading && !error && nodes.length === 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Typography variant="h6" color="text.secondary">No trace data available</Typography>
          </Box>
        )}

        {!isLoading && !error && nodes.length > 0 && (
          <XRayCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            nodeTypes={nodeTypes}
          />
        )}
      </Box>

      {/* Details Drawer */}
      <LogDetailsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        log={selectedLog}
      />
    </Container>
  );
};

const XRayTraceViewer: React.FC = () => {
  return <XRayTraceViewerContent />;
};

export default XRayTraceViewer;
