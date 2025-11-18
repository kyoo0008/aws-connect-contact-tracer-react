import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
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
  Card,
  CardContent,
  Chip,
  Stack,
  Divider,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Download as DownloadIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  AccessTime as TimeIcon,
  VerticalSplit as VerticalSplitIcon,
} from '@mui/icons-material';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  ReactFlowProvider,
  Position,
} from 'react-flow-renderer';
import { ContactLog } from '@/types/contact.types';
import { processLogsForDetailView } from '@/utils/logProcessor';
import CustomNode from '@/components/FlowNodes/CustomNode';

const nodeTypes = {
  custom: CustomNode,
};

interface LocationState {
  chunkedLogs?: ContactLog[];
  flowName?: string;
  contactId?: string;
}

const FlowDetailViewer: React.FC = () => {
  const { contactId, flowName } = useParams<{ contactId: string; flowName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [originalLogs, setOriginalLogs] = useState<ContactLog[]>([]);
  const [processedLogs, setProcessedLogs] = useState<ContactLog[]>([]);

  const [selectedLog, setSelectedLog] = useState<ContactLog | null>(null);
  const [isTimelineVisible, setIsTimelineVisible] = useState(false);

  useEffect(() => {
    if (state?.chunkedLogs) {
      setOriginalLogs(state.chunkedLogs);

      // 통합된 로그 처리 함수 사용
      const consolidated = processLogsForDetailView(state.chunkedLogs);
      setProcessedLogs(consolidated);

      buildFlowVisualization(consolidated);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Build flow visualization from chunked logs with "ㄹ" pattern layout
  const buildFlowVisualization = (logsToProcess: ContactLog[]) => {
    // 이제 이 함수는 '병합된' 로그 리스트(logsToProcess)를 받습니다.
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    // Grid layout configuration
    const columns = 5;
    const nodeWidth = 280;
    const nodeHeight = 180;
    const horizontalGap = 40;
    const verticalGap = 80;

    logsToProcess.forEach((log, index) => {
      // 모듈 노드 확인
      const isModuleNode = (log as any)._isModuleNode;
      const moduleName = (log as any)._moduleName;
      const moduleLogs = (log as any)._moduleLogs;

      // (수정) 병합된 에러 플래그 확인
      const hasError =
        (log as any)._hasError ||
        (log as any)._isGroupError ||
        log.Results?.includes('Error') ||
        log.Results?.includes('Failed') ||
        log.ExternalResults?.isSuccess === 'false';

      // ... (x, y 좌표 계산 로직은 동일) ...
      const row = Math.floor(index / columns);
      const isEvenRow = row % 2 === 0;
      let column: number;
      if (isEvenRow) {
        column = index % columns;
      } else {
        column = columns - 1 - (index % columns);
      }
      const x = column * (nodeWidth + horizontalGap);
      const y = row * (nodeHeight + verticalGap);

      // ... (Handle Posiion 계산 로직은 동일) ...
      const hasNextNode = index < logsToProcess.length - 1;
      const isLastInRow = (index + 1) % columns === 0;
      const isFirstInRow = index % columns === 0;
      let sourcePosition: Position | undefined = undefined;
      let targetPosition: Position | undefined = undefined;

      if (hasNextNode) {
        if (isLastInRow) {
          sourcePosition = Position.Bottom;
        } else {
          sourcePosition = isEvenRow ? Position.Right : Position.Left;
        }
      }
      if (index === 0) {
        targetPosition = Position.Left;
      } else if (isFirstInRow && row > 0) {
        targetPosition = Position.Top;
      } else {
        targetPosition = isEvenRow ? Position.Left : Position.Right;
      }

      const node: Node = {
        id: `${log.Timestamp}_${index}`,
        type: 'custom',
        position: { x, y },
        data: {
          label: isModuleNode ? moduleName : log.ContactFlowModuleType,
          moduleType: isModuleNode ? 'FlowModule' : log.ContactFlowModuleType,
          parameters: log.Parameters,
          results: log.Results,
          error: hasError,
          timestamp: log.Timestamp,
          sourcePosition,
          targetPosition,
          logData: log, // 노드 클릭 시 사용할 병합된 로그 데이터
          isModuleNode, // 모듈 노드 플래그
          moduleLogs, // 모듈 내부 로그들
          timeRange: (log as any)._timeRange, // 모듈 시간 범위
          logCount: (log as any)._logCount, // 모듈 로그 개수
        },
        style: {
          background: hasError ? '#FFEBEE' : isModuleNode ? '#E3F2FD' : '#F5F5F5',
          border: hasError ? '2px solid #F44336' : isModuleNode ? '2px solid #2196F3' : '1px solid #E0E0E0',
          borderRadius: '8px',
          padding: '10px',
          width: nodeWidth,
        },
      };

      flowNodes.push(node);

      // ... (Edge 생성 로직은 동일) ...
      if (index > 0) {
        const prevLog = logsToProcess[index - 1];
        const prevNode = flowNodes[index - 1];

        const getHandleId = (pos: Position | undefined): string | undefined => {
          if (!pos) return undefined;
          const posMap: Record<Position, string> = {
            [Position.Top]: 'top', [Position.Bottom]: 'bottom', [Position.Left]: 'left', [Position.Right]: 'right',
          };
          return posMap[pos];
        };

        const sourceHandleId = prevNode.data.sourcePosition ? `source-${getHandleId(prevNode.data.sourcePosition)}` : undefined;
        const targetHandleId = targetPosition ? `target-${getHandleId(targetPosition)}` : undefined;

        flowEdges.push({
          id: `edge_${index - 1}_${index}`,
          source: `${prevLog.Timestamp}_${index - 1}`, // prevLog 사용
          target: `${log.Timestamp}_${index}`,
          sourceHandle: sourceHandleId,
          targetHandle: targetHandleId,
          type: 'smoothstep',
          animated: false,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: hasError ? '#F44336' : '#B0B0B0', strokeWidth: 2 },
        });
      }
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  };

  // Handle node click
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.data?.isModuleNode && node.data?.moduleLogs) {
      // 모듈 노드 클릭 시 ModuleDetailViewer로 이동
      const moduleName = node.data.label;
      const currentFlowName = state?.flowName || flowName;
      navigate(`/contact-flow/${contactId}/flow/${encodeURIComponent(currentFlowName || '')}/module/${encodeURIComponent(moduleName)}`, {
        state: {
          chunkedLogs: node.data.moduleLogs,
          moduleName,
          contactId,
          flowName: currentFlowName,
        },
      });
    } else if (node.data?.logData) {
      setSelectedLog(node.data.logData); // 병합된 로그를 선택
      setIsTimelineVisible(true); // 노드 클릭 시 타임라인 자동으로 열기
    }
  }, [contactId, flowName, navigate, state?.flowName]); 

  // Handle export
  const handleExport = () => {
    // 내보내기는 '원본' 로그를 사용
    const dataStr = JSON.stringify({ flowName: state?.flowName, logs: originalLogs }, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `flow-detail-${flowName}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const renderValue = (value: any) => {
    // 이 함수는 Parameters가 배열이든 객체이든 알아서 잘 처리합니다.
    if (typeof value === 'object' && value !== null) {
      return (
        <pre style={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    }
    return String(value);
  };

  if (!state?.chunkedLogs) {
    // ... (No data Alert) ...
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          No flow data available. Please navigate from the main contact flow view.
        </Alert>
        <Button
          variant="outlined"
          onClick={() => navigate(`/contact-flow/${contactId}`)}
          startIcon={<BackIcon />}
        >
          Back to Contact Flow
        </Button>
      </Container>
    );
  }

  // 통계는 '원본' 로그 기준
  const errorCount = originalLogs.filter(log =>
    log.Results?.includes('Error') ||
    log.Results?.includes('Failed') ||
    log.ExternalResults?.isSuccess === 'false'
  ).length;

  const timeRangeText = originalLogs.length > 0
    ? `${new Date(originalLogs[0].Timestamp).toLocaleTimeString()} - ${new Date(originalLogs[originalLogs.length - 1].Timestamp).toLocaleTimeString()}`
    : 'N/A';

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ... Toolbar (변경 없음) ... */}
      <Paper elevation={1} sx={{ zIndex: 10 }}>
        <Toolbar>
          <IconButton edge="start" onClick={() => navigate(`/contact-flow/${contactId}`)}>
            <BackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1, ml: 2 }}>
            Flow Detail: {state?.flowName || flowName || 'Unknown'}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Tooltip title="Export JSON">
              <IconButton onClick={handleExport}>
                <DownloadIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={isTimelineVisible ? "Hide Details" : "Show Details"}>
              <IconButton onClick={() => setIsTimelineVisible(!isTimelineVisible)}>
                <VerticalSplitIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Toolbar>
      </Paper>

      {/* Flow Statistics (원본 로그 기준) */}
      <Paper elevation={0} sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Chip
            label={`Total Logs: ${originalLogs.length}`}
            size="small"
            color="primary"
            variant="outlined"
          />
          <Chip
            label={`Time Range: ${timeRangeText}`}
            size="small"
            color="secondary"
            variant="outlined"
          />
          <Chip
            label={`Errors: ${errorCount}`}
            size="small"
            color={errorCount > 0 ? 'error' : 'default'}
            variant="outlined"
          />
        </Stack>
      </Paper>

      {/* Main Content: Split View */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
        {/* Left: Flow Visualization (병합된 노드) */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
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
                nodeStrokeColor={(n) => (n.data?.error ? '#f44336' : '#888')}
                nodeColor={(n) => (n.data?.error ? '#ffebee' : '#f5f5f5')}
                nodeBorderRadius={4}
              />
            </ReactFlow>
          </ReactFlowProvider>
        </Box>

        {/* --- (수정) Right: Log Details Panel (선택된 노드만 표시) --- */}
        {isTimelineVisible && selectedLog && (
          <Box
            sx={{
              width: 450,
              borderLeft: 1,
              borderColor: 'divider',
              overflowY: 'auto',
              bgcolor: 'background.paper',
            }}
          >
            <Box sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Log Details
              </Typography>
              <Divider sx={{ mb: 2 }} />

              {(() => {
                const hasError =
                  (selectedLog as any)._isGroupError ||
                  selectedLog.Results?.includes('Error') ||
                  selectedLog.Results?.includes('Failed') ||
                  selectedLog.ExternalResults?.isSuccess === 'false';

                return (
                  <Card
                    variant="outlined"
                    sx={{
                      borderLeft: `4px solid ${hasError ? '#F44336' : '#2196F3'}`,
                    }}
                  >
                    <CardContent>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                        {hasError ? (
                          <ErrorIcon fontSize="small" color="error" />
                        ) : (
                          <SuccessIcon fontSize="small" color="success" />
                        )}
                        <Typography variant="h6" fontWeight="bold">
                          {selectedLog.ContactFlowModuleType}
                        </Typography>
                      </Stack>

                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        <TimeIcon fontSize="small" color="disabled" />
                        <Typography variant="body2" color="text.secondary">
                          {new Date(selectedLog.Timestamp).toLocaleString()}
                        </Typography>
                      </Stack>

                      {selectedLog.Identifier && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          <strong>ID:</strong> {selectedLog.Identifier}
                        </Typography>
                      )}

                      {selectedLog.Results && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
                            Results:
                          </Typography>
                          <Chip
                            label={selectedLog.Results}
                            size="small"
                            color={hasError ? 'error' : 'success'}
                          />
                        </Box>
                      )}

                      <Divider sx={{ my: 2 }} />

                      {selectedLog.Parameters && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
                            Parameters:
                          </Typography>
                          <Box sx={{
                            bgcolor: '#F5F5F5',
                            p: 1.5,
                            borderRadius: 1,
                            maxHeight: '400px',
                            overflowY: 'auto'
                          }}>
                            {renderValue(selectedLog.Parameters)}
                          </Box>
                        </Box>
                      )}

                      {selectedLog.ExternalResults && (
                        <Box>
                          <Typography variant="body2" fontWeight="bold" sx={{ mb: 1 }}>
                            External Results:
                          </Typography>
                          <Box sx={{
                            bgcolor: '#F5F5F5',
                            p: 1.5,
                            borderRadius: 1,
                            maxHeight: '400px',
                            overflowY: 'auto'
                          }}>
                            {renderValue(selectedLog.ExternalResults)}
                          </Box>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default FlowDetailViewer;