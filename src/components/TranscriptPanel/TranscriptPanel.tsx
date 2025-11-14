import React from 'react';
import { Drawer, Box, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface TranscriptPanelProps {
  open: boolean;
  onClose: () => void;
  transcript?: any[];
}

const TranscriptPanel: React.FC<TranscriptPanelProps> = ({ open, onClose, transcript = [] }) => {
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
        <Typography variant="h6">Transcript</Typography>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Box>
        {transcript.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No transcript available
          </Typography>
        ) : (
          <Box>
            {transcript.map((item, index) => (
              <Box key={index} sx={{ mb: 2, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                <pre style={{ fontSize: '0.875rem', overflow: 'auto', margin: 0 }}>
                  {JSON.stringify(item, null, 2)}
                </pre>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Drawer>
  );
};

export default TranscriptPanel;
