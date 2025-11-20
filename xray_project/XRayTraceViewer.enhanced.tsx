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
 * X-Ray 트레이스를 React Flow 노드/엣지로 변환
 * Python의 build_xray_nodes 로직 참고
 */
const buildXRayFlowData = (xrayData: any): { nodes: Node[]; edges: Edge[] } => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  
  const xSpacing = 400;
  const ySpacing = 150;
  let currentY = 0;

  if (!xrayData?.segments || xrayData.segments.length === 0) {
    return { nodes, edges };
  }

  // Process segments
  const processSegment = (
    segment: any,
    xPosition: number,
    yPosition: number,
    parentId?: string
  ): number => {
    const segmentId = segment.id;
    const isError = segment.error || segment.fault;
    
    // Determine icon/service type
    let serviceIcon = 'AWS::Lambda::Function'; // default
    if (segment.origin) {
      const parts = segment.origin.split('::');
      if (parts.length > 1) {
        serviceIcon = parts[1]; // e.g., "Lambda", "DynamoDB", "S3"
      }
    }

    // Create segment node
    nodes.push({
      id: segmentId,
      type: 'xraySegment',
      position: { x: xPosition, y: yPosition },
      data: {
        label: segment.name,
        segmentData: segment,
        error: isError,
        fault: segment.fault,
        duration: segment.duration,
        service: serviceIcon,
        origin: segment.origin,
      },
      style: {
        border: isError ? '2px solid #f44336' : '1px solid #4caf50',
        borderRadius: '8px',
      },
    });

    // Connect to parent if exists
    if (parentId) {
      edges.push({
        id: `${parentId}-${segmentId}`,
        source: parentId,
        target: segmentId,
        type: 'smoothstep',
        animated: isError,
        style: { stroke: isError ? '#f44336' : '#4caf50' },
      });
    }

    let maxY = yPosition;

    // Process subsegments
    if (segment.subsegments && segment.subsegments.length > 0) {
      let subY = yPosition;
      segment.subsegments.forEach((subsegment: any, index: number) => {
        const subMaxY = processSubsegment(
          subsegment,
          xPosition + xSpacing,
          subY,
          segmentId
        );
        subY = subMaxY + ySpacing;
        maxY = Math.max(maxY, subMaxY);
      });
    }

    return maxY;
  };

  const processSubsegment = (
    subsegment: any,
    xPosition: number,
    yPosition: number,
    parentId: string
  ): number => {
    const subId = subsegment.id;
    const isError = subsegment.error || subsegment.fault;

    // Determine operation label
    let operationLabel = subsegment.name;
    if (subsegment.aws?.operation) {
      operationLabel = subsegment.aws.operation;
      if (subsegment.aws.resource_names && subsegment.aws.resource_names.length > 0) {
        operationLabel += ` (${subsegment.aws.resource_names[0]})`;
      }
    } else if (subsegment.http?.request?.method) {
      operationLabel = `${subsegment.http.request.method} ${subsegment.http.request.url || ''}`;
    }

    nodes.push({
      id: subId,
      type: 'xraySegment',
      position: { x: xPosition, y: yPosition },
      data: {
        label: operationLabel,
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
      style: {
        border: isError ? '2px solid #f44336' : '1px solid #9e9e9e',
        borderRadius: '4px',
      },
    });

    // Create edge with operation label
    const edgeLabel = subsegment.aws?.operation || 
                      subsegment.http?.request?.method || '';
    
    edges.push({
      id: `${parentId}-${subId}`,
      source: parentId,
      target: subId,
      label: edgeLabel,
      type: 'smoothstep',
      animated: isError,
      style: { 
        stroke: isError ? '#f44336' : '#9e9e9e',
      },
    });

    let maxY = yPosition;

    // Recursively process nested subsegments
    if (subsegment.subsegments && subsegment.subsegments.length > 0) {
      let nestedY = yPosition;
      subsegment.subsegments.forEach((nested: any) => {
        const nestedMaxY = processSubsegment(
          nested,
          xPosition + xSpacing,
          nestedY,
          subId
        );
        nestedY = nestedMaxY + ySpacing;
        maxY = Math.max(maxY, nestedMaxY);
      });
    }

    return maxY;
  };

  // Process all segments
  let currentX = 100;
  xrayData.segments.forEach((segment: any, index: number) => {
    const maxY = processSegment(segment, currentX, currentY, undefined);
    currentY = maxY + ySpacing * 2; // Add extra space between top-level segments
    // currentX += xSpacing * 2; // Move to the right for next segment
  });

  // Add Lambda CloudWatch Logs section
  if (xrayData.lambdaLogs && xrayData.lambdaLogs.length > 0) {
    currentY += 200; // Add space before logs section

    // Add section header node
    nodes.push({
      id: 'lambda-logs-header',
      type: 'default',
      position: { x: 100, y: currentY },
      data: {
        label: '📝 Lambda CloudWatch Logs',
      },
      style: {
        background: '#e3f2fd',
        border: '2px solid #1976d2',
        borderRadius: '8px',
        fontWeight: 'bold',
      },
    });

    currentY += 100;

    xrayData.lambdaLogs.forEach((log: any, index: number) => {
      const logId = `log_${log.timestamp}_${index}`;
      const isError = log.level === 'ERROR' || log.level === 'WARN';
      
      let logLabel = log.level || 'INFO';
      if (log.level === 'ERROR') {
        logLabel = `🚨 ${log.level}`;
      } else if (log.level === 'WARN') {
        logLabel = `⚠️ ${log.level}`;
      }

      nodes.push({
        id: logId,
        type: 'lambdaLog',
        position: { x: 100, y: currentY + (index * 120) },
        data: {
          label: logLabel,
          logData: log,
          error: isError,
          message: log.message,
          timestamp: log.timestamp,
          service: log.service,
        },
        style: {
          background: isError ? '#ffebee' : '#f5f5f5',
          border: isError ? '2px solid #f44336' : '1px solid #9e9e9e',
          borderRadius: '4px',
        },
      });

      // Connect logs sequentially
      if (index > 0) {
        const prevLogId = `log_${xrayData.lambdaLogs[index - 1].timestamp}_${index - 1}`;
        edges.push({
          id: `log-edge-${index}`,
          source: prevLogId,
          target: logId,
          type: 'smoothstep',
          style: { stroke: isError ? '#ff9800' : '#9e9e9e' },
        });
      } else {
        // Connect first log to header
        edges.push({
          id: 'header-to-first-log',
          source: 'lambda-logs-header',
          target: logId,
          type: 'smoothstep',
          style: { stroke: '#1976d2' },
        });
      }
    });
  }

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
      // Use the enhanced method - you need to update awsConnectService.ts
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
