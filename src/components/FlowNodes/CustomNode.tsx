import React from 'react';
import { Handle, Position } from 'react-flow-renderer';
import { Box, Typography, Chip } from '@mui/material';
import { AccountTree as ModuleIcon } from '@mui/icons-material';

import { NodeContentRenderer } from './NodeContentRenderer';

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
    isModuleNode?: boolean;
    [key: string]: any; // Allow other properties
  };
  // isMainView?: boolean; // New prop
}

const CustomNode: React.FC<CustomNodeProps> = ({ data }) => {
  const isMainView = data.isMainView || false;
  const hasError = data.error || false;
  const isModuleNode = data.isModuleNode || false;
  const bgColor = hasError ? '#FFEBEE' : isModuleNode ? '#E3F2FD' : '#FFFFFF';
  const borderColor = hasError ? '#F44336' : isModuleNode ? '#2196F3' : '#E0E0E0';
  const targetPosition = data.targetPosition || Position.Left;
  const sourcePosition = data.sourcePosition || Position.Right;

  const renderMainViewContent = () => (
    <>
      {data.timeRange && (
        <Box sx={{ mt: 'auto' }}>
          <Typography variant="caption" color="text.secondary" display="block">
            {new Date(data.timeRange.start).toLocaleString('ko-KR')} ~
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {new Date(data.timeRange.end).toLocaleString('ko-KR')}
          </Typography>
          {data.logCount && (
            <Typography variant="caption" fontWeight="bold" sx={{ mt: 1 }}>
              Nodes : {data.logCount}
            </Typography>
          )}
          <br /> 
          {data.timeRange && (
            <Typography variant="caption" fontWeight="bold" sx={{ mt: 1 }}>
              Duration : {((new Date(data.timeRange.end).getTime() - new Date(data.timeRange.start).getTime()) / 1000).toFixed(2)}s
            </Typography>
          )}
        </Box>
      )}
    </>
  );

  const renderDetailViewContent = () => (
    <>
      {!isModuleNode ? (
        <NodeContentRenderer data={data} />
      ) : (
        <>
          {data.timeRange && (
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">
                {new Date(data.timeRange.start).toLocaleString('ko-KR')} ~
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                {new Date(data.timeRange.end).toLocaleString('ko-KR')}
              </Typography>
            </Box>
          )}
          {data.logCount && (
            <Typography variant="body2" fontWeight="bold" sx={{ mt: 1 }}>
              Nodes : {data.logCount}
            </Typography>
          )}
           <Chip
              label="Click to view details"
              size="small"
              icon={<ModuleIcon sx={{ fontSize: '1rem' }} />}
              sx={{ mt: 1, cursor: 'pointer' }}
            />
        </>
      )}
    </>
  );

  return (
    <Box
      sx={{
        padding: 1,
        borderRadius: 2,
        border: `2px solid ${borderColor}`,
        backgroundColor: bgColor,
        width: 280,
        height: 180,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        '&:hover': {
          boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
        },
      }}
    >
      {/* Target Handles */}
      <Handle type="target" position={Position.Top} id="target-top" style={{ background: '#555' }} />
      <Handle type="target" position={Position.Bottom} id="target-bottom" style={{ background: '#555' }} />
      <Handle type="target" position={Position.Left} id="target-left" style={{ background: '#555' }} />
      <Handle type="target" position={Position.Right} id="target-right" style={{ background: '#555' }} />

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderBottom: `1px solid ${borderColor}` }}>
        <img
          src={isMainView ? `/icons/img/InvokeFlowModule.png` : `/icons/img/${data.moduleType}.png`}
          alt={`${data.moduleType} icon`}
          width="20"
          height="20"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          style={{ objectFit: 'contain' }}
        />
        <Typography variant="subtitle2" fontWeight="600" sx={{ color: hasError ? '#D32F2F' : '#1976D2' }} noWrap>
          {data.label}
        </Typography>
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }}>
        {isMainView ? renderMainViewContent() : renderDetailViewContent()}
      </Box>

      {/* Source Handles */}
      <Handle type="source" position={Position.Top} id="source-top" style={{ background: '#555' }} />
      <Handle type="source" position={Position.Bottom} id="source-bottom" style={{ background: '#555' }} />
      <Handle type="source" position={Position.Left} id="source-left" style={{ background: '#555' }} />
      <Handle type="source" position={Position.Right} id="source-right" style={{ background: '#555' }} />
    </Box>
  );
};

export default CustomNode;

