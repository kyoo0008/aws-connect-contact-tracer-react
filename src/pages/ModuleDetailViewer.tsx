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
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Download as DownloadIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  AccessTime as TimeIcon,
  VerticalSplit as VerticalSplitIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import ReactFlow, {
  Node as ReactFlowNode,
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
import { useConfig } from '@/contexts/ConfigContext';
import { enrichCheckAttributeLogs } from '@/utils/logProcessor';

const nodeTypes = {
  custom: (props: any) => <CustomNode {...props} isMainView={false} />,
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
  let getUserInputGroup: ContactLog[] = [];
  let currentGetUserInputIdentifier: string | null = null;
  let invokeExternalGroup: ContactLog[] = [];
  let currentInvokeExternalIdentifier: string | null = null;

  const mergeGroup = () => {
    if (group.length === 0) return;

    if (group.length === 1) {
      consolidated.push(group[0]);
    } else {
      const baseLog = { ...group[0] };
      const isCheckAttribute = baseLog.ContactFlowModuleType === 'CheckAttribute';

      // CheckAttribute의 경우 Parameters에 Results 키를 추가하고 enrichment 데이터 보존
      if (isCheckAttribute) {
        baseLog.Parameters = group.map(log => ({
          ...log.Parameters,
          Results: log.Results,
          _comparisonValue: log.Parameters?._comparisonValue,
          _comparisonSecondValue: log.Parameters?._comparisonSecondValue,
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

  const mergeGetUserInputGroup = () => {
    if (getUserInputGroup.length === 0) return;

    if (getUserInputGroup.length === 1) {
      consolidated.push(getUserInputGroup[0]);
    } else {
      // GetUserInput 로그 병합: 첫 번째 로그의 Parameters를 사용하고, 마지막 로그의 Results를 footer로 표시
      const baseLog = { ...getUserInputGroup[0] };

      // 마지막 로그의 Results 사용 (사용자 입력 결과)
      const finalResults = getUserInputGroup[getUserInputGroup.length - 1].Results;
      baseLog.Results = finalResults;
      baseLog.Timestamp = getUserInputGroup[getUserInputGroup.length - 1].Timestamp;

      // Footer에 표시할 Results를 별도 필드로 저장
      (baseLog as any)._footerResults = finalResults;

      consolidated.push(baseLog);
    }
    getUserInputGroup = [];
    currentGetUserInputIdentifier = null;
  };

  const mergeInvokeExternalGroup = () => {
    if (invokeExternalGroup.length === 0) return;

    if (invokeExternalGroup.length === 1) {
      consolidated.push(invokeExternalGroup[0]);
    } else {
      // InvokeExternalResource 로그 병합: 첫 번째 로그의 Parameters를 사용하고, 마지막 로그의 ExternalResults를 footer로 표시
      const baseLog = { ...invokeExternalGroup[0] };

      // 마지막 로그의 ExternalResults 사용
      const finalExternalResults = invokeExternalGroup[invokeExternalGroup.length - 1].ExternalResults;
      baseLog.ExternalResults = finalExternalResults;
      baseLog.Timestamp = invokeExternalGroup[invokeExternalGroup.length - 1].Timestamp;

      // Footer에 표시할 ExternalResults를 별도 필드로 저장
      (baseLog as any)._footerExternalResults = finalExternalResults;

      consolidated.push(baseLog);
    }
    invokeExternalGroup = [];
    currentInvokeExternalIdentifier = null;
  };

  for (const log of logs) {
    if (['GetUserInput','PlayPrompt','StoreUserInput'].includes(log.ContactFlowModuleType)) {
      // GetUserInput 로그 처리: 같은 Identifier를 가진 연속된 로그를 병합
      const identifier = log.Identifier;

      // Identifier가 다르면 이전 그룹을 먼저 병합
      if (currentGetUserInputIdentifier !== null && currentGetUserInputIdentifier !== identifier) {
        mergeGetUserInputGroup();
      }

      // 이전에 다른 그룹이 있었다면 먼저 병합
      mergeGroup();
      mergeInvokeExternalGroup();

      currentGetUserInputIdentifier = identifier || null;
      getUserInputGroup.push(log);
    } else if (['InvokeExternalResource', 'InvokeLambdaFunction'].includes(log.ContactFlowModuleType)) {
      // InvokeExternalResource 로그 처리: 같은 Identifier를 가진 연속된 로그를 병합
      const identifier = log.Identifier;

      // Identifier가 다르면 이전 그룹을 먼저 병합
      if (currentInvokeExternalIdentifier !== null && currentInvokeExternalIdentifier !== identifier) {
        mergeInvokeExternalGroup();
      }

      // 이전에 다른 그룹이 있었다면 먼저 병합
      mergeGroup();
      mergeGetUserInputGroup();

      currentInvokeExternalIdentifier = identifier || null;
      invokeExternalGroup.push(log);
    } else if (['SetAttributes', 'SetFlowAttributes', 'CheckAttribute'].includes(log.ContactFlowModuleType)) {
      const logType = log.ContactFlowModuleType;

      // 다른 그룹이 있었다면 먼저 병합
      mergeGetUserInputGroup();
      mergeInvokeExternalGroup();

      // 타입이 다르면 이전 그룹을 먼저 병합
      if (currentGroupType !== null && currentGroupType !== logType) {
        mergeGroup();
      }

      currentGroupType = logType;
      group.push(log);
    } else {
      mergeGroup();
      mergeGetUserInputGroup();
      mergeInvokeExternalGroup();
      consolidated.push(log);
    }
  }

  mergeGroup();
  mergeGetUserInputGroup();
  mergeInvokeExternalGroup();
  return consolidated;
};

const ModuleDetailViewer: React.FC = () => {
  const { contactId, flowName, moduleName } = useParams<{ contactId: string; flowName: string; moduleName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  const { config } = useConfig();

  const [nodes, setNodes, onNodesChange] = useNodesState<ReactFlowNode[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [originalLogs, setOriginalLogs] = useState<ContactLog[]>([]);
  const [processedLogs, setProcessedLogs] = useState<ContactLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [selectedLog, setSelectedLog] = useState<ContactLog | null>(null);
  const [isTimelineVisible, setIsTimelineVisible] = useState(false);
  const detailsPanelRef = React.useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Effect to handle Esc key and click outside to close details panel
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsTimelineVisible(false);
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (detailsPanelRef.current && !detailsPanelRef.current.contains(event.target as Node)) {
        setIsTimelineVisible(false);
      }
    };

    if (isTimelineVisible) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isTimelineVisible]);

  // Initialize logs from location state
  useEffect(() => {
    const processLogs = async () => {
      if (state?.chunkedLogs && config) {
        setIsLoading(true);
        try {
          setOriginalLogs(state.chunkedLogs);

          // 1. CheckAttribute 로그에 flow definition 데이터 추가
          const enrichedLogs = await enrichCheckAttributeLogs(state.chunkedLogs, config);

          // 2. SetAttributes 병합
          const consolidated = consolidateSetAttributesLogs(enrichedLogs);
          setProcessedLogs(consolidated);

          buildFlowVisualization(consolidated);
        } catch (error) {
          console.error('Error processing logs:', error);
          // 에러 발생 시 enrichment 없이 진행
          const consolidated = consolidateSetAttributesLogs(state.chunkedLogs);
          setProcessedLogs(consolidated);
          buildFlowVisualization(consolidated);
        } finally {
          setIsLoading(false);
        }
      }
    };

    processLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, config]);

  // Build flow visualization from chunked logs with "ㄹ" pattern layout
  const buildFlowVisualization = (logsToProcess: ContactLog[]) => {
    const flowNodes: ReactFlowNode[] = [];
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

      const node: ReactFlowNode = {
        id: `${log.Timestamp}_${index}`,
        type: 'custom',
        position: { x, y },
        data: {
          label: log.ContactFlowModuleType,
          moduleType: log.ContactFlowModuleType,
          parameters: log.Parameters,
          results: log.Results,
          externalResults: log.ExternalResults, // ExternalResults 추가
          error: hasError,
          timestamp: log.Timestamp,
          sourcePosition,
          targetPosition,
          logData: log, // footer를 위해 필요
          isMainView: false, // Module Detail View임을 CustomNode에 전달
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
  const onNodeClick = useCallback((event: React.MouseEvent, node: ReactFlowNode) => {
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

  // Handle search
  const handleSearch = (term: string) => {
    setSearchTerm(term);

    if (term) {
      const filteredNodes = nodes.map((node: ReactFlowNode) => {
        const lowerTerm = term.toLowerCase();
        const label = node.data?.label || '';
        const parameters = node.data?.parameters || {};
        const identifier = node.data?.logData?.Identifier || '';

        const matches =
          label.toLowerCase().includes(lowerTerm) ||
          identifier.toLowerCase().includes(lowerTerm) ||
          JSON.stringify(parameters).toLowerCase().includes(lowerTerm);

        return {
          ...node,
          style: {
            ...node.style,
            opacity: matches ? 1 : 0.3,
          },
        };
      });

      setNodes(filteredNodes);
    } else {
      // Reset opacity
      const resetNodes = nodes.map((node: ReactFlowNode) => ({
        ...node,
        style: {
          ...node.style,
          opacity: 1,
        },
      }));

      setNodes(resetNodes);
    }
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
      {/* Header - Fixed */}
      <Box sx={{ position: 'sticky', top: 0, zIndex: 1000, backgroundColor: 'background.paper' }}>
        {/* Toolbar */}
        <Paper elevation={1} sx={{ zIndex: 10 }}>
          <Toolbar>
            <IconButton edge="start" onClick={() => navigate(-1)}>
              <BackIcon />
            </IconButton>
            <Typography variant="h6" sx={{ flexGrow: 1, ml: 2 }}>
              Module Detail: {state?.moduleName || moduleName || 'Unknown'}
            </Typography>

            {/* Search */}
            <TextField
              size="small"
              placeholder="Search nodes..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              sx={{ mr: 2, width: 250 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />

            <Stack direction="row" spacing={1}>
              <Tooltip title="Export JSON">
                <IconButton onClick={handleExport}>
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
              {/* <Tooltip title={isTimelineVisible ? "Hide Details" : "Show Details"}>
                <IconButton onClick={() => setIsTimelineVisible(!isTimelineVisible)}>
                  <VerticalSplitIcon />
                </IconButton>
              </Tooltip> */}
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
      </Box>

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
            ref={detailsPanelRef}
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
