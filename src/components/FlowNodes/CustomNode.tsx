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
    sourcePosition?: Position;
    targetPosition?: Position;
  };
}

const CustomNode: React.FC<CustomNodeProps> = ({ data }) => {
  const hasError = data.error || false;
  const bgColor = hasError ? '#FFEBEE' : '#FFFFFF';
  const borderColor = hasError ? '#F44336' : '#E0E0E0';
  const targetPosition = data.targetPosition || Position.Left;
  const sourcePosition = data.sourcePosition || Position.Right;

  return (
    <Box
      sx={{
        padding: 2,
        borderRadius: 2,
        border: `2px solid ${borderColor}`,
        backgroundColor: bgColor,
        width: 280,
        height: 180,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        '&:hover': {
          boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
        },
      }}
    >
      {/* Target Handles - All 4 sides */}
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        style={{
          background: '#555',
          width: 10,
          height: 10,
          opacity: targetPosition === Position.Top ? 1 : 0.3,
        }}
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="target-bottom"
        style={{
          background: '#555',
          width: 10,
          height: 10,
          opacity: targetPosition === Position.Bottom ? 1 : 0.3,
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        style={{
          background: '#555',
          width: 10,
          height: 10,
          opacity: targetPosition === Position.Left ? 1 : 0.3,
        }}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="target-right"
        style={{
          background: '#555',
          width: 10,
          height: 10,
          opacity: targetPosition === Position.Right ? 1 : 0.3,
        }}
      />

      {/* Flow Name */}
      <Typography
        variant="subtitle1"
        fontWeight="600"
        sx={{
          color: hasError ? '#D32F2F' : '#1976D2',
          fontSize: '1rem',
          lineHeight: 1.3,
          mb: 1,
        }}
      >
        {data.label}
      </Typography>

      {/* Timestamp */}
      {data.timestamp && (
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
          오전 {new Date(data.timestamp).toLocaleTimeString('ko-KR', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })}
        </Typography>
      )}

      {/* Source Handles - All 4 sides */}
      <Handle
        type="source"
        position={Position.Top}
        id="source-top"
        style={{
          background: '#555',
          width: 10,
          height: 10,
          opacity: sourcePosition === Position.Top ? 1 : 0.3,
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        style={{
          background: '#555',
          width: 10,
          height: 10,
          opacity: sourcePosition === Position.Bottom ? 1 : 0.3,
        }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="source-left"
        style={{
          background: '#555',
          width: 10,
          height: 10,
          opacity: sourcePosition === Position.Left ? 1 : 0.3,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        style={{
          background: '#555',
          width: 10,
          height: 10,
          opacity: sourcePosition === Position.Right ? 1 : 0.3,
        }}
      />
    </Box>
  );
};

export default CustomNode;
