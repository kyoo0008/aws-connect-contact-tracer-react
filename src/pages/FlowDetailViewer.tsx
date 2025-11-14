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
  List,
  ListItem,
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
import CustomNode from '@/components/FlowNodes/CustomNode';

const nodeTypes = {
  custom: CustomNode,
};

interface LocationState {
  chunkedLogs?: ContactLog[];
  flowName?: string;
  contactId?: string;
}

// 헬퍼 함수: 연속되는 SetAttributes 로그를 병합합니다.
// (수정) 그룹 내 오류를 감지하는 로직 추가
const consolidateSetAttributesLogs = (logs: ContactLog[]): ContactLog[] => {
  if (!logs || logs.length === 0) {
    return [];
  }

  const consolidated: ContactLog[] = [];
  let group: ContactLog[] = [];

  const mergeGroup = () => {
    if (group.length === 0) return;

    if (group.length === 1) {
      // 그룹에 하나만 있으면 그대로 추가
      consolidated.push(group[0]);
    } else {
      // 2개 이상이면 병합
      const baseLog = { ...group[0] }; // 첫 번째 로그를 복사하여 기준으로 사용

      // Parameters를 배열로 병합
      baseLog.Parameters = group.map(log => log.Parameters);
      
      // (추가) 그룹 내에 에러가 하나라도 있는지 확인
      const anyError = group.some(log =>
        log.Results?.includes('Error') ||
        log.Results?.includes('Failed') ||
        log.ExternalResults?.isSuccess === 'false'
      );
      
      if (anyError) {
        (baseLog as any)._isGroupError = true;
        baseLog.Results = group[group.length - 1].Results || "Error in group";
      } else {
        baseLog.Results = group[group.length - 1].Results;
      }
      
      baseLog.Timestamp = group[group.length - 1].Timestamp;

      consolidated.push(baseLog);
    }
    group = []; // 그룹 초기화
  };

  for (const log of logs) {
    if (log.ContactFlowModuleType === 'SetAttributes') {
      group.push(log);
    } else {
      // 다른 모듈 타입을 만나면, 그동안의 SetAttributes 그룹을 병합
      mergeGroup();
      // 그리고 현재 로그를 추가
      consolidated.push(log);
    }
  }

  // 루프가 끝난 후 마지막에 남아있는 그룹이 있다면 병합
  mergeGroup();

  return consolidated;
};


const FlowDetailViewer: React.FC = () => {
  const { contactId, flowName } = useParams<{ contactId: string; flowName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  // --- (수정) 로그 상태를 '원본'과 '처리됨'으로 분리 ---
  const [originalLogs, setOriginalLogs] = useState<ContactLog[]>([]); // 원본 (통계, 내보내기용)
  const [processedLogs, setProcessedLogs] = useState<ContactLog[]>([]); // 병합된 로그 (노드, 사이드바용)
  // ---

  const [selectedLog, setSelectedLog] = useState<ContactLog | null>(null);
  const [isTimelineVisible, setIsTimelineVisible] = useState(true);

  // Initialize logs from location state
  useEffect(() => {
    if (state?.chunkedLogs) {
      setOriginalLogs(state.chunkedLogs); // 원본 로그 저장
      
      // --- (수정) 병합된 로그를 계산하고 상태에 저장 ---
      const consolidated = consolidateSetAttributesLogs(state.chunkedLogs);
      setProcessedLogs(consolidated);
      // ---

      buildFlowVisualization(consolidated); // 병합된 로그로 시각화 빌드
    }
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
      // (수정) 병합된 에러 플래그 확인
      const hasError =
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
          label: log.ContactFlowModuleType,
          moduleType: log.ContactFlowModuleType,
          parameters: log.Parameters, 
          results: log.Results,
          error: hasError,
          timestamp: log.Timestamp,
          sourcePosition,
          targetPosition,
          logData: log, // 노드 클릭 시 사용할 병합된 로그 데이터
        },
        style: {
          background: hasError ? '#FFEBEE' : '#F5F5F5',
          border: hasError ? '2px solid #F44336' : '1px solid #E0E0E0',
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
    if (node.data?.logData) {
      setSelectedLog(node.data.logData); // 병합된 로그를 선택
    }
  }, []); 

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
            <Tooltip title={isTimelineVisible ? "Hide Timeline" : "Show Timeline"}>
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

        {/* --- (수정) Right: Timeline View (병합된 로그 기준) --- */}
        {isTimelineVisible && (
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
                Time-Ordered Logs
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <List sx={{ width: '100%', p: 0 }}>
                {/* --- (수정) processedLogs.map() 사용 --- */}
                {processedLogs.map((log, index) => { 
                  const hasError =
                    (log as any)._isGroupError ||
                    log.Results?.includes('Error') ||
                    log.Results?.includes('Failed') ||
                    log.ExternalResults?.isSuccess === 'false';

                  return (
                    <ListItem key={index} sx={{ p: 0, mb: 1, display: 'block' }}>
                      <Card
                        variant="outlined"
                        sx={{
                          cursor: 'pointer',
                          '&:hover': { boxShadow: 2 },
                          borderLeft: `4px solid ${hasError ? '#F44336' : '#2196F3'}`,
                          backgroundColor: selectedLog === log ? '#F5F5F5' : 'white',
                        }}
                        onClick={() => setSelectedLog(log)} // 병합된 로그를 선택
                      >
                        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                            {hasError ? (
                              <ErrorIcon fontSize="small" color="error" />
                            ) : (
                              <SuccessIcon fontSize="small" color="success" />
                            )}
                            <Typography variant="subtitle2" fontWeight="bold">
                              {log.ContactFlowModuleType}
                            </Typography>
                          </Stack>

                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                            <TimeIcon fontSize="small" color="disabled" />
                            <Typography variant="caption" color="text.secondary">
                              {new Date(log.Timestamp).toLocaleTimeString()}
                            </Typography>
                          </Stack>

                          {log.Identifier && (
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                              ID: {log.Identifier}
                            </Typography>
                          )}

                          {log.Results && (
                            <Chip
                              label={log.Results}
                              size="small"
                              color={hasError ? 'error' : 'success'}
                              sx={{ mt: 0.5 }}
                            />
                          )}

                          {/* selectedLog === log 비교가 이제 정상적으로 동작합니다.
                            (둘 다 processedLogs 배열의 객체를 참조하므로)
                          */}
                          {selectedLog === log && (
                            <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                              {log.Parameters && (
                                <Box sx={{ mb: 1 }}>
                                  <Typography variant="caption" fontWeight="bold">
                                    Parameters:
                                  </Typography>
                                  <Box sx={{ mt: 0.5 }}>
                                    {/* log.Parameters가 배열이면 요청하신 대로 JSON으로 렌더링됩니다.
                                    */}
                                    {renderValue(log.Parameters)}
                                  </Box>
                                </Box>
                              )}
                              {log.ExternalResults && (
                                <Box>
                                  <Typography variant="caption" fontWeight="bold">
                                    External Results:
                                  </Typography>
                                  <Box sx={{ mt: 0.5 }}>
                                    {renderValue(log.ExternalResults)}
                                  </Box>
                                </Box>
                              )}
                            </Box>
                          )}
                        </CardContent>
                      </Card>
                    </ListItem>
                  );
                })}
              </List>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default FlowDetailViewer;