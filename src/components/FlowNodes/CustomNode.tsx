import React from 'react';
import { Handle, Position } from 'react-flow-renderer';
import { Box, Typography, Chip, Stack } from '@mui/material';

interface CustomNodeProps {
  data: {
    label: string;
    moduleType?: string;
    error?: boolean;
    timestamp?: string;
    logCount?: number;
    timeRange?: {
      start: string;
      end: string;
    };
  };
}

const CustomNode: React.FC<CustomNodeProps> = ({ data }) => {
  const hasError = data.error || false;
  const bgColor = hasError ? '#FFEBEE' : '#FFFFFF';
  const borderColor = hasError ? '#F44336' : '#E0E0E0';

  return (
    <Box
      sx={{
        padding: 1.5,
        borderRadius: 2,
        border: `2px solid ${borderColor}`,
        backgroundColor: bgColor,
        width: 250,
        height: 150,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        '&:hover': {
          boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
        },
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: '#555',
          width: 10,
          height: 10,
        }}
      />

      <Stack spacing={0.5}>
        <Typography
          variant="subtitle2"
          fontWeight="bold"
          sx={{
            color: hasError ? '#D32F2F' : '#1976D2',
            fontSize: '0.875rem',
            lineHeight: 1.2,
          }}
        >
          {data.label}
        </Typography>

        {data.logCount && data.logCount > 1 && (
          <Chip
            label={`${data.logCount} logs`}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.7rem',
              alignSelf: 'flex-start',
            }}
            color="primary"
            variant="outlined"
          />
        )}

        {data.timestamp && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
            {new Date(data.timestamp).toLocaleTimeString()}
          </Typography>
        )}
      </Stack>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: '#555',
          width: 10,
          height: 10,
        }}
      />
    </Box>
  );
};

export default CustomNode;
