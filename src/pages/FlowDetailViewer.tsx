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

const FlowDetailViewer: React.FC = () => {
  const { contactId, flowName } = useParams<{ contactId: string; flowName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [logs, setLogs] = useState<ContactLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<ContactLog | null>(null);

  // Initialize logs from location state
  useEffect(() => {
    if (state?.chunkedLogs) {
      setLogs(state.chunkedLogs);
      buildFlowVisualization(state.chunkedLogs);
    }
  }, [state]);

  // Build flow visualization from chunked logs
  const buildFlowVisualization = (chunkedLogs: ContactLog[]) => {
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];
    const nodeSpacing = 280;

    chunkedLogs.forEach((log, index) => {
      const hasError =
        log.Results?.includes('Error') ||
        log.Results?.includes('Failed') ||
        log.ExternalResults?.isSuccess === 'false';

      const node: Node = {
        id: `${log.Timestamp}_${index}`,
        type: 'custom',
        position: { x: index * nodeSpacing, y: 0 },
        data: {
          label: log.ContactFlowModuleType,
          moduleType: log.ContactFlowModuleType,
          parameters: log.Parameters,
          results: log.Results,
          error: hasError,
          timestamp: log.Timestamp,
        },
        style: {
          background: hasError ? '#FFEBEE' : '#F5F5F5',
          border: hasError ? '2px solid #F44336' : '1px solid #E0E0E0',
          borderRadius: '8px',
          padding: '10px',
        },
      };

      flowNodes.push(node);

      // Create edge to next node
      if (index > 0) {
        flowEdges.push({
          id: `edge_${index - 1}_${index}`,
          source: `${chunkedLogs[index - 1].Timestamp}_${index - 1}`,
          target: `${log.Timestamp}_${index}`,
          type: 'smoothstep',
          animated: false,
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
        });
      }
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  };

  // Handle node click
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    const logIndex = parseInt(node.id.split('_').pop() || '0');
    if (logs[logIndex]) {
      setSelectedLog(logs[logIndex]);
    }
  }, [logs]);

  // Handle export
  const handleExport = () => {
    const dataStr = JSON.stringify({ flowName: state?.flowName, logs }, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `flow-detail-${flowName}.json`;

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

  const errorCount = logs.filter(log =>
    log.Results?.includes('Error') ||
    log.Results?.includes('Failed') ||
    log.ExternalResults?.isSuccess === 'false'
  ).length;

  // Get time range safely
  const timeRangeText = logs.length > 0
    ? `${new Date(logs[0].Timestamp).toLocaleTimeString()} - ${new Date(logs[logs.length - 1].Timestamp).toLocaleTimeString()}`
    : 'N/A';

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <Paper elevation={1} sx={{ zIndex: 10 }}>
        <Toolbar>
          <IconButton edge="start" onClick={() => navigate(`/contact-flow/${contactId}`)}>
            <BackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1, ml: 2 }}>
            Flow Detail: {state?.flowName || flowName || 'Unknown'}
          </Typography>

          {/* Actions */}
          <Stack direction="row" spacing={1}>
            <Tooltip title="Export JSON">
              <IconButton onClick={handleExport}>
                <DownloadIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Toolbar>
      </Paper>

      {/* Flow Statistics */}
      <Paper elevation={0} sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Chip
            label={`Total Logs: ${logs.length}`}
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
                nodeStrokeColor={(node) => {
                  if (node.data?.error) return '#f44336';
                  return '#888';
                }}
                nodeColor={(node) => {
                  if (node.data?.error) return '#ffebee';
                  return '#f5f5f5';
                }}
                nodeBorderRadius={4}
              />
            </ReactFlow>
          </ReactFlowProvider>
        </Box>

        {/* Right: Timeline View */}
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
              {logs.map((log, index) => {
                const hasError =
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
                      onClick={() => setSelectedLog(log)}
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

                        {selectedLog === log && (
                          <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                            {log.Parameters && (
                              <Box sx={{ mb: 1 }}>
                                <Typography variant="caption" fontWeight="bold">
                                  Parameters:
                                </Typography>
                                <Box sx={{ mt: 0.5 }}>
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
      </Box>
    </Box>
  );
};

export default FlowDetailViewer;
