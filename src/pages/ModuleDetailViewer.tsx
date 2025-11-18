import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Button,
  Alert,
  Paper,
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
import CustomNode from '@/components/FlowNodes/CustomNode';

const nodeTypes = {
  custom: CustomNode,
};

interface LocationState {
  chunkedLogs?: ContactLog[];
  moduleName?: string;
  contactId?: string;
  flowName?: string;
}

// 헬퍼 함수: 연속되는 SetAttributes 로그를 병합합니다.
const consolidateSetAttributesLogs = (logs: ContactLog[]): ContactLog[] => {
  if (!logs || logs.length === 0) {
    return [];
  }

  const consolidated: ContactLog[] = [];
  let group: ContactLog[] = [];
  let currentGroupType: string | null = null;

  const mergeGroup = () => {
    if (group.length === 0) return;

    if (group.length === 1) {
      consolidated.push(group[0]);
    } else {
      const baseLog = { ...group[0] };
      const isCheckAttribute = baseLog.ContactFlowModuleType === 'CheckAttribute';

      // CheckAttribute의 경우 Parameters에 Results 키를 추가
      if (isCheckAttribute) {
        baseLog.Parameters = group.map(log => ({
          ...log.Parameters,
          Results: log.Results
        }));
      } else {
        // SetAttributes, SetFlowAttributes의 경우 Parameters만 배열로 저장
        baseLog.Parameters = group.map(log => log.Parameters);
      }

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
    group = [];
    currentGroupType = null;
  };

  for (const log of logs) {
     if (['SetAttributes', 'SetFlowAttributes', 'CheckAttribute'].includes(log.ContactFlowModuleType)) {
      const logType = log.ContactFlowModuleType;

      // 타입이 다르면 이전 그룹을 먼저 병합
      if (currentGroupType !== null && currentGroupType !== logType) {
        mergeGroup();
      }

      currentGroupType = logType;
      group.push(log);
    } else {
      mergeGroup();
      consolidated.push(log);
    }
  }

  mergeGroup();
  return consolidated;
};

const ModuleDetailViewer: React.FC = () => {
  const { contactId, flowName, moduleName } = useParams<{ contactId: string; flowName: string; moduleName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [originalLogs, setOriginalLogs] = useState<ContactLog[]>([]);
  const [processedLogs, setProcessedLogs] = useState<ContactLog[]>([]);

  const [selectedLog, setSelectedLog] = useState<ContactLog | null>(null);
  const [isTimelineVisible, setIsTimelineVisible] = useState(false);

  // Initialize logs from location state
  useEffect(() => {
    if (state?.chunkedLogs) {
      setOriginalLogs(state.chunkedLogs);

      // SetAttributes 병합
      const consolidated = consolidateSetAttributesLogs(state.chunkedLogs);
      setProcessedLogs(consolidated);

      buildFlowVisualization(consolidated);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Build flow visualization from chunked logs with "ㄹ" pattern layout
  const buildFlowVisualization = (logsToProcess: ContactLog[]) => {
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    // Grid layout configuration
    const columns = 5;
    const nodeWidth = 280;
    const nodeHeight = 180;
    const horizontalGap = 40;
    const verticalGap = 80;

    logsToProcess.forEach((log, index) => {
      const hasError =
        (log as any)._isGroupError ||
        log.Results?.includes('Error') ||
        log.Results?.includes('Failed') ||
        log.ExternalResults?.isSuccess === 'false';

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
          logData: log,
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
          source: `${prevLog.Timestamp}_${index - 1}`,
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
      setSelectedLog(node.data.logData);
      setIsTimelineVisible(true);
    }
  }, []);

  // Handle export
  const handleExport = () => {
    const dataStr = JSON.stringify({ moduleName: state?.moduleName, logs: originalLogs }, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `module-detail-${moduleName}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const renderValue = (value: any) => {
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
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          No module data available. Please navigate from the flow detail view.
        </Alert>
        <Button
          variant="outlined"
          onClick={() => navigate(`/contact-flow/${contactId}/flow/${encodeURIComponent(flowName || '')}`)}
          startIcon={<BackIcon />}
        >
          Back to Flow Detail
        </Button>
      </Container>
    );
  }

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
      {/* Toolbar */}
      <Paper elevation={1} sx={{ zIndex: 10 }}>
        <Toolbar>
          <IconButton edge="start" onClick={() => navigate(`/contact-flow/${contactId}/flow/${encodeURIComponent(state?.flowName || flowName || '')}`)}>
            <BackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1, ml: 2 }}>
            Module Detail: {state?.moduleName || moduleName || 'Unknown'}
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

      {/* Module Statistics */}
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
            icon={errorCount > 0 ? <ErrorIcon /> : <SuccessIcon />}
            label={`Errors: ${errorCount}`}
            size="small"
            color={errorCount > 0 ? 'error' : 'default'}
            variant="outlined"
          />
        </Stack>
      </Paper>

      {/* Main Content: Split View */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
        {/* Left: Flow Visualization */}
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

        {/* Right: Log Details Panel */}
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

export default ModuleDetailViewer;
