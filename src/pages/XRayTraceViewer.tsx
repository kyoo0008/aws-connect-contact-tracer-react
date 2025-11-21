/**
 * Enhanced XRayTraceViewer
 *
 * Python connect-contact-tracer의 build_xray_nodes 로직을 참고하여
 * X-Ray 트레이스를 React Flow로 시각화합니다.
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
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Fullscreen as FullscreenIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
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
};

/**
 * Helper: Subsegment에서 서비스 타입 추출
 */
const getServiceType = (subsegment: any): string => {
  // AWS 서비스
  if (subsegment.namespace === 'aws') {
    if (subsegment.name?.includes('DynamoDB')) return 'DynamoDB';
    if (subsegment.name?.includes('S3')) return 'S3';
    if (subsegment.name?.includes('SNS')) return 'SNS';
    if (subsegment.name?.includes('SQS')) return 'SQS';
    if (subsegment.aws?.operation) {
      return subsegment.name || 'AWS';
    }
    return 'AWS';
  }

  // Remote (HTTP 호출)
  if (subsegment.namespace === 'remote' || subsegment.http) {
    if (subsegment.http?.request?.url) {
      const url = subsegment.http.request.url;
      if (url.includes('api.koreanair.com')) return 'API Gateway';
      if (url.includes('loyalty.amadeus.net')) return 'External API';
      if (url.includes('oneid')) return 'OneID';
      return 'HTTP';
    }
    return 'Remote';
  }

  return subsegment.name || 'Unknown';
};

/**
 * Helper: Subsegment에서 레이블 생성
 */
const getServiceLabel = (subsegment: any): string => {
  // AWS 작업
  if (subsegment.aws?.operation) {
    const operation = subsegment.aws.operation;
    const resource = subsegment.aws.resource_names?.[0] || subsegment.name;
    return `${operation}\n${resource}`;
  }

  // HTTP 요청
  if (subsegment.http?.request) {
    const method = subsegment.http.request.method || '';
    const url = subsegment.http.request.url || '';
    // URL을 짧게 표시
    const urlPath = url.split('?')[0].split('/').slice(-2).join('/');
    return `${method}\n${urlPath}`;
  }

  return subsegment.name || 'Service';
};

/**
 * Helper: Edge 레이블 생성 (Python의 get_xray_edge_label 로직)
 */
const getEdgeLabel = (subsegment: any): { label: string; xlabel?: string } => {
  let label = '';
  let xlabel = undefined;

  // AWS 서비스
  if (subsegment.aws?.operation) {
    const operation = subsegment.aws.operation;
    const tableName = subsegment.aws.table_name || subsegment.aws.resource_names?.[0] || '';

    if (tableName) {
      label = `${operation}\\n${tableName}`;
    } else {
      label = operation;
    }
  }
  // HTTP 요청
  else if (subsegment.http?.request) {
    const method = subsegment.http.request.method || 'GET';
    const url = subsegment.http.request.url || '';
    const status = subsegment.http.response?.status;

    // URL에서 경로 추출
    let path = url;
    try {
      const urlObj = new URL(url);
      path = urlObj.pathname || '/';
    } catch {
      // URL 파싱 실패 시 그대로 사용
      path = url.split('?')[0];
    }

    label = `${method}\\n${path}`;

    // 에러 상태 코드는 xlabel로 표시
    if (status && (status >= 400 || subsegment.error)) {
      xlabel = `Status: ${status}`;
    }
  }
  // 기타
  else {
    label = subsegment.name || '';
  }

  return { label, xlabel };
};

/**
 * Helper: Parent ID 결정 (Python의 get_xray_parent_id 로직)
 * Invocation/Attempt를 건너뛰고 실제 부모 세그먼트 ID를 찾습니다
 */
const getXRayParentId = (subsegment: any, segment: any): string => {
  // subsegment에 parent_id가 있으면 해당 parent를 찾아야 함
  if (!subsegment.parent_id) {
    return segment.id;
  }

  // parent_id로 parent subsegment 찾기
  const findParent = (subs: any[], targetId: string): any => {
    for (const sub of subs) {
      if (sub.id === targetId) {
        return sub;
      }
      if (sub.subsegments) {
        const found = findParent(sub.subsegments, targetId);
        if (found) return found;
      }
    }
    return null;
  };

  let parent = findParent(segment.subsegments || [], subsegment.parent_id);

  // parent가 Invocation 또는 Attempt인 경우, 그 parent를 찾아야 함
  while (parent && (parent.name === 'Invocation' || parent.name?.includes('Attempt'))) {
    if (parent.parent_id) {
      parent = findParent(segment.subsegments || [], parent.parent_id);
    } else {
      // parent의 parent가 없으면 segment 자체가 parent
      return segment.id;
    }
  }

  return parent?.id || segment.id;
};

/**
 * Helper: Subsegment를 전처리 (Python의 process_subsegments 로직)
 * "Overhead", "Dwell Time", "Lambda", "Invocation", "Attempt" 등은 skip
 * 재귀적으로 모든 중첩된 subsegments를 처리하고 parent_id를 함께 반환
 */
const preprocessSubsegments = (subsegments: any[], parentSegment: any): Array<{ subsegment: any; parentId: string }> => {
  const skipTypes = ['Overhead', 'Dwell Time', 'Lambda', 'QueueTime', 'Initialization'];
  const processed: Array<{ subsegment: any; parentId: string }> = [];

  const processRecursive = (subs: any[], segment: any) => {
    for (const subsegment of subs) {
      const name = subsegment.name || '';

      // Skip certain types
      if (skipTypes.includes(name)) {
        continue;
      }

      // Handle Invocation or Attempt - extract nested subsegments
      if (name === 'Invocation' || name.includes('Attempt')) {
        if (subsegment.subsegments && subsegment.subsegments.length > 0) {
          processRecursive(subsegment.subsegments, segment);
        }
      } else {
        // 실제 부모 ID 결정
        const parentId = getXRayParentId(subsegment, segment);
        processed.push({ subsegment, parentId });

        // 중첩된 subsegments도 처리
        if (subsegment.subsegments && subsegment.subsegments.length > 0) {
          processRecursive(subsegment.subsegments, segment);
        }
      }
    }
  };

  processRecursive(subsegments, parentSegment);
  return processed;
};

/**
 * X-Ray 트레이스를 React Flow 노드/엣지로 변환
 * Python의 build_xray_nodes 로직 참고
 */
const buildXRayFlowData = (xrayData: any): { nodes: Node[]; edges: Edge[] } => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const RAW_JSON_X = 50; // Raw Json 노드 X 위치 (가장 왼쪽)
  const LAMBDA_X = 400; // Lambda 함수들의 X 위치
  const SERVICE_BASE_X = 900; // 외부 서비스들의 X 시작 위치
  const Y_SPACING = 120; // 노드 간 수직 간격
  const SERVICE_X_SPACING = 350; // 서비스 컬럼 간 수평 간격

  if (!xrayData?.segments || xrayData.segments.length === 0) {
    return { nodes, edges };
  }

  let lambdaY = 50; // Lambda 노드들의 시작 Y 위치
  const rawJsonNodeId = `${xrayData.traceId}_raw_json`;

  // 1. Raw Json 노드 추가 (Lambda 로그가 있는 경우)
  if (xrayData.lambdaLogs && xrayData.lambdaLogs.length > 0) {
    const errorLogs = xrayData.lambdaLogs.filter((log: any) => log.level === 'ERROR' || log.level === 'WARN');
    const hasErrors = errorLogs.length > 0;

    nodes.push({
      id: rawJsonNodeId,
      type: 'xraySegment',
      position: { x: RAW_JSON_X, y: lambdaY },
      data: {
        label: 'Raw Json',
        service: 'CloudWatch',
        logData: xrayData.lambdaLogs,
        error: hasErrors,
      },
      style: {
        border: hasErrors ? '2px solid #f44336' : '2px solid #1976d2',
        borderRadius: '8px',
        background: hasErrors ? '#ffebee' : '#e3f2fd',
        minWidth: '120px',
        padding: '8px',
      },
    });
  }

  // 서비스 노드들의 위치를 추적하기 위한 맵
  const servicePositions = new Map<string, { x: number; y: number; count: number }>();

  // 2. 각 segment (Lambda 함수) 처리
  xrayData.segments.forEach((segment: any, segmentIndex: number) => {
    const segmentId = segment.id;
    const isError = segment.error || segment.fault;
    const lambdaName = segment.name || 'Lambda Function';

    // Lambda 노드 생성
    nodes.push({
      id: segmentId,
      type: 'xraySegment',
      position: { x: LAMBDA_X, y: lambdaY },
      data: {
        label: lambdaName,
        segmentData: segment,
        error: isError,
        fault: segment.fault,
        duration: segment.duration ? segment.duration * 1000 : 0,
        service: 'Lambda',
        origin: segment.origin,
      },
      style: {
        border: isError ? '2px solid #f44336' : '2px solid #FF9900',
        borderRadius: '8px',
        background: isError ? '#ffebee' : '#fff3e0',
        minWidth: '220px',
        padding: '10px',
      },
    });

    // Raw Json 노드와 첫 번째 Lambda 연결
    if (segmentIndex === 0 && xrayData.lambdaLogs && xrayData.lambdaLogs.length > 0) {
      edges.push({
        id: `raw-json-to-lambda`,
        source: rawJsonNodeId,
        target: segmentId,
        type: 'smoothstep',
        style: { stroke: '#1976d2', strokeWidth: 2 },
      });
    }

    // 이전 Lambda와 연결 (체인 형태)
    if (segmentIndex > 0) {
      const prevSegmentId = xrayData.segments[segmentIndex - 1].id;
      edges.push({
        id: `chain-${prevSegmentId}-${segmentId}`,
        source: prevSegmentId,
        target: segmentId,
        type: 'smoothstep',
        style: { stroke: '#FF9900', strokeWidth: 2 },
        label: 'invokes',
      });
    }

    // 3. Subsegments 전처리 및 처리
    if (segment.subsegments && segment.subsegments.length > 0) {
      const processedItems = preprocessSubsegments(segment.subsegments, segment);

      // 서비스 타입별로 그룹화하되, depth(계층) 정보도 함께 저장
      const serviceGroups = new Map<string, Array<{ subsegment: any; parentId: string; depth: number }>>();

      processedItems.forEach(({ subsegment, parentId }) => {
        const serviceType = getServiceType(subsegment);

        // depth 계산: parent가 segment면 0, 아니면 parent의 depth + 1
        let depth = 0;
        if (parentId !== segmentId) {
          // parent subsegment 찾기
          const parentItem = processedItems.find(item => item.subsegment.id === parentId);
          if (parentItem) {
            depth = (parentItem as any).depth !== undefined ? (parentItem as any).depth + 1 : 1;
          } else {
            depth = 1;
          }
        }

        if (!serviceGroups.has(serviceType)) {
          serviceGroups.set(serviceType, []);
        }
        serviceGroups.get(serviceType)!.push({ subsegment, parentId, depth });
      });

      // 각 서비스 타입별로 노드 생성
      let columnIndex = 0;
      serviceGroups.forEach((items, serviceType) => {
        const serviceX = SERVICE_BASE_X + (columnIndex * SERVICE_X_SPACING);
        let serviceY = lambdaY;

        items.forEach(({ subsegment, parentId, depth }) => {
          const subId = subsegment.id;
          const subError = subsegment.error || subsegment.fault;

          // depth에 따라 X 위치 조정 (중첩된 호출은 오른쪽으로)
          const adjustedX = serviceX + (depth * 50);

          // 서비스 노드 생성
          nodes.push({
            id: subId,
            type: 'xraySegment',
            position: { x: adjustedX, y: serviceY },
            data: {
              label: getServiceLabel(subsegment),
              segmentData: subsegment,
              error: subError,
              fault: subsegment.fault,
              duration: subsegment.duration ? subsegment.duration * 1000 : 0,
              service: serviceType,
              operation: subsegment.aws?.operation,
              resource: subsegment.aws?.resource_names?.[0],
              httpMethod: subsegment.http?.request?.method,
              httpUrl: subsegment.http?.request?.url,
              httpStatus: subsegment.http?.response?.status,
            },
            style: {
              border: subError ? '2px solid #f44336' : '1px solid #757575',
              borderRadius: '6px',
              background: subError ? '#ffebee' : '#ffffff',
              minWidth: '180px',
              padding: '8px',
            },
          });

          // Parent에서 서비스로 연결
          const edgeLabelData = getEdgeLabel(subsegment);
          const edgeConfig: any = {
            id: `${parentId}-${subId}`,
            source: parentId,
            target: subId,
            label: edgeLabelData.label.replace(/\\n/g, '\n'), // 줄바꿈 처리
            type: 'smoothstep',
            animated: subError,
            style: {
              stroke: subError ? '#f44336' : '#757575',
              strokeWidth: subError ? 2 : 1,
            },
          };

          // xlabel이 있으면 label에 추가 (에러 상태 등)
          if (edgeLabelData.xlabel) {
            edgeConfig.label = `${edgeConfig.label}\n${edgeLabelData.xlabel}`;
          }

          edges.push(edgeConfig);

          serviceY += Y_SPACING;
        });

        columnIndex++;
      });
    }

    lambdaY += Y_SPACING * 3; // 다음 Lambda를 위한 충분한 간격
  });

  return { nodes, edges };
};

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
        <MiniMap
          nodeStrokeColor={(node) => {
            if (node.data?.error) return '#f44336';
            return '#4caf50';
          }}
          nodeColor={(node) => {
            if (node.data?.error) return '#ffebee';
            return '#e8f5e9';
          }}
          nodeBorderRadius={4}
        />
      </ReactFlow>
    </ReactFlowProvider>
  );
};

/**
 * X-Ray 트레이스 요약 정보 표시
 */
const XRayTraceSummaryCard: React.FC<{ xrayData: any }> = ({ xrayData }) => {
  const getStats = () => {
    let warnCount = 0;
    let errorCount = 0;
    let totalSegments = 0;

    if (xrayData.segments) {
      totalSegments = xrayData.segments.length;
      xrayData.segments.forEach((seg: any) => {
        if (seg.error) errorCount++;
        if (seg.fault) warnCount++;
      });
    }

    if (xrayData.lambdaLogs) {
      xrayData.lambdaLogs.forEach((log: any) => {
        if (log.level === 'ERROR') errorCount++;
        if (log.level === 'WARN') warnCount++;
      });
    }

    return { warnCount, errorCount, totalSegments };
  };

  const stats = getStats();

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Trace Summary
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <Chip
            icon={<InfoIcon />}
            label={`${stats.totalSegments} Segments`}
            color="info"
            variant="outlined"
          />
          {stats.errorCount > 0 && (
            <Chip
              icon={<ErrorIcon />}
              label={`${stats.errorCount} Errors`}
              color="error"
            />
          )}
          {stats.warnCount > 0 && (
            <Chip
              icon={<WarningIcon />}
              label={`${stats.warnCount} Warnings`}
              color="warning"
            />
          )}
          {xrayData.duration && (
            <Chip
              label={`Duration: ${(xrayData.duration * 1000).toFixed(2)}ms`}
              variant="outlined"
            />
          )}
        </Stack>

        {xrayData.lambdaLogs && xrayData.lambdaLogs.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>
              Lambda Logs ({xrayData.lambdaLogs.length})
            </Typography>
            <List dense>
              {xrayData.lambdaLogs.slice(0, 5).map((log: any, index: number) => (
                <ListItem key={index} disableGutters>
                  <ListItemText
                    primary={log.message || 'No message'}
                    secondary={`${log.level || 'INFO'} - ${new Date(log.timestamp).toLocaleTimeString()}`}
                  />
                </ListItem>
              ))}
              {xrayData.lambdaLogs.length > 5 && (
                <ListItem disableGutters>
                  <ListItemText
                    secondary={`... and ${xrayData.lambdaLogs.length - 5} more`}
                  />
                </ListItem>
              )}
            </List>
          </>
        )}
      </CardContent>
    </Card>
  );
};

const XRayTraceViewerContent: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const xrayTraceId = searchParams.get('traceId');
  const contactId = searchParams.get('contactId');

  const { config, isConfigured } = useConfig();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fetch X-Ray trace data using enhanced method
  const { data: xrayData, isLoading, error, refetch } = useQuery({
    queryKey: ['xrayTrace', xrayTraceId],
    queryFn: async () => {
      if (!isConfigured || !xrayTraceId) return null;
      const service = getAWSConnectService(config);
      return await service.getXRayTraceEnhanced(xrayTraceId);
    },
    enabled: isConfigured && !!xrayTraceId,
  });

  // Build React Flow nodes and edges from X-Ray trace data
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
    if (contactId) {
      navigate(`/contact-flow/${contactId}`);
    } else {
      navigate(-1);
    }
  };

  if (!isConfigured) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="warning">
          AWS configuration is required. Please configure your settings first.
        </Alert>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/settings')} sx={{ mt: 2 }}>
          Go to Settings
        </Button>
      </Container>
    );
  }

  if (!xrayTraceId) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="error">X-Ray Trace ID is required</Alert>
        <Button startIcon={<BackIcon />} onClick={handleBack} sx={{ mt: 2 }}>
          Go Back
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth={false} disableGutters sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header Toolbar */}
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
          </Box>
          <Stack direction="row" spacing={1}>
            <Tooltip title="Refresh">
              <IconButton onClick={() => refetch()}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Fullscreen">
              <IconButton>
                <FullscreenIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Download">
              <IconButton>
                <DownloadIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Toolbar>
      </Paper>

      {/* Summary Card */}
      {!isLoading && !error && xrayData && (
        <Box sx={{ px: 2, pt: 2 }}>
          <XRayTraceSummaryCard xrayData={xrayData} />
        </Box>
      )}

      {/* Main Content */}
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
            <Typography variant="h6" color="text.secondary">
              No trace data available
            </Typography>
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
