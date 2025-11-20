import React from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Divider,
  Chip,
  Stack,
  Paper,
  Button,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { ContactLog } from '@/types/contact.types';

interface LogDetailsDrawerProps {
  open: boolean;
  onClose: () => void;
  log?: ContactLog | null;
  subFlowLogs?: ContactLog[];
  isFetchingSubFlow?: boolean;
  fetchSubFlowLogs?: (flowId: string) => void;
}

const LogDetailsDrawer: React.FC<LogDetailsDrawerProps> = ({
  open,
  onClose,
  log,
  subFlowLogs,
  isFetchingSubFlow,
  fetchSubFlowLogs,
}) => {
  const renderValue = (value: any) => {
    if (typeof value === 'object' && value !== null) {
      return (
        <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    }
    return String(value);
  };

  return (
    <Drawer
      anchor="right"
      variant="persistent"
      open={open}
      onClose={onClose}
      onClick={(e) => e.stopPropagation()} // Prevent clicks inside drawer from closing it
      PaperProps={{
        sx: {
          width: { xs: '90%', sm: 400, md: 500 },
          p: 2,
          position: 'absolute',
          top: 0,
          right: 0,
          height: '100%',
          boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
        }
      }}
      sx={{
        position: 'absolute',
        right: 0,
        top: 0,
        height: '100%',
        zIndex: 1200,
        pointerEvents: open ? 'auto' : 'none', // Pass through clicks when closed
        '& .MuiDrawer-root': {
          position: 'absolute'
        }
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Log Details</Typography>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Divider sx={{ mb: 2 }} />
      <Box>
        {log ? (
          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" gutterBottom>
                Flow Info
              </Typography>
              <Stack spacing={1}>
                <Chip
                  label={`Flow: ${log.ContactFlowName}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
                {subFlowLogs && subFlowLogs.length > 1 && (
                  <Chip
                    label={`${subFlowLogs.length} logs in this flow`}
                    size="small"
                    color="secondary"
                  />
                )}
                <Typography variant="body2" color="text.secondary">
                  <strong>First Timestamp:</strong> {new Date(log.Timestamp).toLocaleString()}
                </Typography>
                {subFlowLogs && subFlowLogs.length > 1 && (
                  <Typography variant="body2" color="text.secondary">
                    <strong>Last Timestamp:</strong>{' '}
                    {new Date(subFlowLogs[subFlowLogs.length - 1].Timestamp).toLocaleString()}
                  </Typography>
                )}
              </Stack>
            </Paper>

            {log.Parameters && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Parameters
                </Typography>
                {Object.entries(log.Parameters).map(([key, value]) => (
                  <Box key={key} sx={{ mb: 1 }}>
                    <Typography variant="body2">
                      <strong>{key}:</strong>
                    </Typography>
                    {renderValue(value)}
                  </Box>
                ))}
              </Paper>
            )}

            {log.Results && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Results
                </Typography>
                <Typography variant="body2">{log.Results}</Typography>
              </Paper>
            )}

            {log.ExternalResults && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  External Results
                </Typography>
                {renderValue(log.ExternalResults)}
              </Paper>
            )}

            {/* Display chunked logs for this flow node */}
            {subFlowLogs && subFlowLogs.length > 0 && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Flow Logs (Time-ordered)
                </Typography>
                <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
                  {subFlowLogs.map((subLog, index) => (
                    <Paper
                      key={index}
                      sx={{
                        p: 1.5,
                        my: 1,
                        backgroundColor: subLog.Results?.includes('Error') || subLog.Results?.includes('Failed')
                          ? '#FFEBEE'
                          : '#F5F5F5',
                        borderLeft: `3px solid ${subLog.Results?.includes('Error') || subLog.Results?.includes('Failed')
                            ? '#F44336'
                            : '#2196F3'
                          }`,
                      }}
                      variant="outlined"
                    >
                      <Stack spacing={0.5}>
                        <Typography variant="body2" fontWeight="bold">
                          {subLog.ContactFlowModuleType}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(subLog.Timestamp).toLocaleString()}
                        </Typography>
                        {subLog.Identifier && (
                          <Typography variant="caption" color="text.secondary">
                            ID: {subLog.Identifier}
                          </Typography>
                        )}
                        {subLog.Results && (
                          <Typography variant="caption" color="text.primary">
                            Result: {subLog.Results}
                          </Typography>
                        )}
                      </Stack>
                    </Paper>
                  ))}
                </Box>
              </Paper>
            )}

            {log.ContactFlowModuleType === 'InvokeFlowModule' && !subFlowLogs?.length && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Sub-Flow Logs
                </Typography>
                {isFetchingSubFlow ? (
                  <CircularProgress size={24} />
                ) : (
                  <Button
                    variant="outlined"
                    onClick={() => fetchSubFlowLogs?.(log.Parameters?.ContactFlowId)}
                  >
                    View Sub-Flow Logs
                  </Button>
                )}
              </Paper>
            )}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No log data available. Click on a node to see its details.
          </Typography>
        )}
      </Box>
    </Drawer>
  );
};

export default LogDetailsDrawer;
