import React from 'react';
import { Drawer, Box, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface LogDetailsDrawerProps {
  open: boolean;
  onClose: () => void;
  log?: any;
}

const LogDetailsDrawer: React.FC<LogDetailsDrawerProps> = ({ open, onClose, log }) => {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: 400,
          p: 2
        }
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Log Details</Typography>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Box>
        {log ? (
          <pre style={{ fontSize: '0.875rem', overflow: 'auto' }}>
            {JSON.stringify(log, null, 2)}
          </pre>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No log data available
          </Typography>
        )}
      </Box>
    </Drawer>
  );
};

export default LogDetailsDrawer;
