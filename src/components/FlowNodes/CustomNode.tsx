import React from 'react';
import { Handle, Position } from 'react-flow-renderer';
import { Box, Typography } from '@mui/material';

interface CustomNodeProps {
  data: {
    label: string;
    type?: string;
    status?: string;
  };
}

const CustomNode: React.FC<CustomNodeProps> = ({ data }) => {
  return (
    <Box
      sx={{
        padding: 2,
        borderRadius: 1,
        border: '1px solid #ddd',
        backgroundColor: '#fff',
        minWidth: 150
      }}
    >
      <Handle type="target" position={Position.Top} />
      <Typography variant="body2">{data.label}</Typography>
      <Handle type="source" position={Position.Bottom} />
    </Box>
  );
};

export default CustomNode;
