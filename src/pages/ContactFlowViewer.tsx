import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Fullscreen as FullscreenIcon,
  Download as DownloadIcon,
  Timeline as TimelineIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
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
import { useQuery } from '@tanstack/react-query';
import { getAWSConnectService } from '@/services/awsConnectService';
import { FlowBuilderService } from '@/services/flowBuilderService';
import { ContactLog } from '@/types/contact.types';
import CustomNode from '@/components/FlowNodes/CustomNode';
import TranscriptPanel from '@/components/TranscriptPanel/TranscriptPanel';
import LogDetailsDrawer from '@/components/LogDetailsDrawer/LogDetailsDrawer';
import { useConfig } from '@/contexts/ConfigContext';

const nodeTypes = {
  custom: CustomNode,
};

const ContactFlowViewer: React.FC = () => {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const { config, isConfigured } = useConfig();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedLog, setSelectedLog] = useState<ContactLog | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [subFlowLogs, setSubFlowLogs] = useState<ContactLog[]>([]);
  const [isFetchingSubFlow, setIsFetchingSubFlow] = useState(false);

  const fetchSubFlowLogs = useCallback(async (flowId: string) => {
    if (!contactId) return;

    setIsFetchingSubFlow(true);
    try {
      const service = getAWSConnectService(config);
      const details = await service.getContactDetails(contactId);
      const startTime = new Date(details.initiationTimestamp);
      startTime.setHours(startTime.getHours() - 1);
      const endTime = details.disconnectTimestamp 
        ? new Date(details.disconnectTimestamp)
        : new Date();
      endTime.setHours(endTime.getHours() + 1);
      
      const logs = await service.getContactLogs(flowId, startTime, endTime);
      setSubFlowLogs(logs);
    } catch (error) {
      console.error('Error fetching sub-flow logs:', error);
      setSubFlowLogs([]);
    } finally {
      setIsFetchingSubFlow(false);
    }
  }, [contactId, config]);

  const { data: queryData, isLoading, error, refetch } = useQuery({
    queryKey: ['contact-flow', contactId, config.credentials?.accessKeyId],
    queryFn: async () => {
      if (!contactId) throw new Error('Contact ID is required');

      // Initialize service with current config
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
      
      // Fetch logs
      const [contactLogs, transcript] = await Promise.all([
        service.getContactLogs(contactId, startTime, endTime),
        service.getTranscript(contactId, startTime),
      ]);
      
      // Build flow for main view (with filtering)
      const flowBuilder = new FlowBuilderService(contactLogs, { filterModules: true });
      const flowData = flowBuilder.buildFlow();
      
      // Add transcript if available
      if (transcript.length > 0) {
        flowBuilder.addTranscript(transcript);
        flowData.transcript = transcript;
      }
      
      return { flowData, originalLogs: contactLogs }; // Return both
    },
    enabled: !!contactId,
    retry: 2,
  });

  // Extract flowData for convenience
  const flowData = queryData?.flowData;

  // Update nodes and edges when flow data changes
  useEffect(() => {
    if (flowData) {

      // Convert to React Flow format
      const flowNodes: Node[] = flowData.nodes.map((node) => ({
        id: node.id,
        type: node.type || 'custom',
        position: node.position,
        data: node.data,
        style: node.style,
      }));

      const flowEdges: Edge[] = flowData.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        type: edge.type || 'smoothstep',
        animated: edge.animated || false,
        style: edge.style || {},
        label: edge.label,
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
      }));

      setNodes(flowNodes);
      setEdges(flowEdges);
    }
  }, [flowData, setNodes, setEdges]);

  // Handle node click - Navigate to flow detail page
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const flowName = node.data?.label as string;
      const timeRange = node.data?.timeRange as { start: string, end:string } | undefined;

      if (flowName && timeRange && queryData?.originalLogs) {
        // Filter originalLogs to get all logs within the node's time range
        const nodeOriginalLogs = queryData.originalLogs.filter(log => {
          const logTime = new Date(log.Timestamp).getTime();
          const startTime = new Date(timeRange.start).getTime();
          const endTime = new Date(timeRange.end).getTime();
          return logTime >= startTime && logTime <= endTime;
        });

        // Navigate to flow detail page with the unfiltered logs for that chunk
        navigate(`/contact-flow/${contactId}/flow/${encodeURIComponent(flowName)}`, {
          state: {
            chunkedLogs: nodeOriginalLogs, // Pass the unfiltered logs
            flowName,
            contactId,
          },
        });
      } else {
        // Fallback: try to find log by node_id for backward compatibility
        const log = queryData?.flowData?.logs.find((l) => l.node_id === node.id);
        if (log) {
          setSelectedLog(log);
          setDrawerOpen(true);
          setSubFlowLogs([]); // Reset sub-flow logs

          if (log.ContactFlowModuleType === 'InvokeFlowModule' && log.Parameters?.ContactFlowId) {
            fetchSubFlowLogs(log.Parameters.ContactFlowId);
          }
        }
      }
    },
    [queryData, contactId, navigate, fetchSubFlowLogs]
  );

  // Handle export
  const handleExport = () => {
    if (!flowData) return;
    
    const dataStr = JSON.stringify(flowData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `contact-flow-${contactId}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  // Handle search
  const handleSearch = (term: string) => {
    setSearchTerm(term);

    if (term) {
      const filteredNodes = nodes.map((node) => {
        const lowerTerm = term.toLowerCase();
        const label = node.data?.label || '';
        const parameters = node.data?.parameters || {};

        const matches =
          label.toLowerCase().includes(lowerTerm) ||
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
      const resetNodes = nodes.map((node) => ({
        ...node,
        style: {
          ...node.style,
          opacity: 1,
        },
      }));

      setNodes(resetNodes);
    }
  };

  if (!contactId) {
    return (
      <Container>
        <Alert severity="error">No Contact ID provided</Alert>
        <Button onClick={() => navigate('/')} startIcon={<BackIcon />}>
          Back to Dashboard
        </Button>
      </Container>
    );
  }

  if (!isConfigured || !config.credentials) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          AWS 자격 증명이 설정되지 않았습니다. Settings 페이지에서 자격 증명을 설정해주세요.
        </Alert>
        <Stack direction="row" spacing={2}>
          <Button
            variant="contained"
            onClick={() => navigate('/settings')}
            startIcon={<SettingsIcon />}
          >
            Settings로 이동
          </Button>
          <Button
            variant="outlined"
            onClick={() => navigate('/')}
            startIcon={<BackIcon />}
          >
            Dashboard로 돌아가기
          </Button>
        </Stack>
      </Container>
    );
  }

  if (isLoading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="80vh"
      >
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading contact flow...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Container>
        <Alert severity="error" sx={{ mb: 2 }}>
          Error loading contact flow: {(error as Error).message}
        </Alert>
        <Button onClick={() => navigate('/')} startIcon={<BackIcon />}>
          Back to Dashboard
        </Button>
      </Container>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <Paper elevation={1} sx={{ zIndex: 10 }}>
        <Toolbar>
          <IconButton edge="start" onClick={() => navigate('/')}>
            <BackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1, ml: 2 }}>
            Contact Flow: {contactId}
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
          
          {/* Actions */}
          <Stack direction="row" spacing={1}>
            <Tooltip title="Refresh">
              <IconButton onClick={() => refetch()}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="View Transcript">
              <IconButton onClick={() => setTranscriptOpen(true)}>
                <TimelineIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Export JSON">
              <IconButton onClick={handleExport}>
                <DownloadIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Fullscreen">
              <IconButton onClick={() => document.documentElement.requestFullscreen()}>
                <FullscreenIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Toolbar>
      </Paper>

      {/* Flow Statistics */}
      <Paper elevation={0} sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Chip
            label={`Nodes: ${nodes.length}`}
            size="small"
            color="primary"
            variant="outlined"
          />
          <Chip
            label={`Duration: ${flowData?.logs[flowData.logs.length - 1]?.Duration || 'N/A'}`}
            size="small"
            color="secondary"
            variant="outlined"
          />
          <Chip
            label={`Errors: ${nodes.filter(n => n.data.error).length}`}
            size="small"
            color={nodes.filter(n => n.data.error).length > 0 ? 'error' : 'default'}
            variant="outlined"
          />
        </Stack>
      </Paper>

      {/* React Flow Canvas */}
      <Box sx={{ flex: 1 }}>
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
                if (node.type === 'input') return '#4caf50';
                if (node.type === 'output') return '#2196f3';
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

      {/* Log Details Drawer */}
      <LogDetailsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        log={selectedLog}
        subFlowLogs={subFlowLogs}
        isFetchingSubFlow={isFetchingSubFlow}
        fetchSubFlowLogs={fetchSubFlowLogs}
      />

      {/* Transcript Panel */}
      <TranscriptPanel
        open={transcriptOpen}
        onClose={() => setTranscriptOpen(false)}
        transcript={flowData?.transcript || []}
      />
    </Box>
  );
};

export default ContactFlowViewer;