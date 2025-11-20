import React, { useState } from 'react';
import { Handle, Position } from 'react-flow-renderer';
import { Box, Typography, Chip } from '@mui/material';
import {
  CloudCircle as CloudIcon,
  Storage as StorageIcon,
  Functions as LambdaIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';

interface XRayNodeProps {
  data: {
    label: string;
    segmentData?: any;
    logData?: any;
    error?: boolean;
    duration?: number;
    service?: string;
    operation?: string;
    resource?: string;
    httpMethod?: string;
    httpUrl?: string;
    httpStatus?: number;
    message?: string;
    timestamp?: string;
  };
}

const XRayNode: React.FC<XRayNodeProps> = ({ data }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const isError = data.error || false;
  const isLambdaLog = !!data.logData;
  const isSegment = !!data.segmentData;

  // Determine colors
  const bgColor = isError ? '#FFEBEE' : isLambdaLog ? '#E3F2FD' : '#E8F5E9';
  const borderColor = isError ? '#F44336' : isLambdaLog ? '#2196F3' : '#4CAF50';

  // Get icon based on service type
  const getServiceIcon = () => {
    if (isLambdaLog) {
      if (data.label === 'ERROR') return <ErrorIcon sx={{ fontSize: '1rem', color: '#D32F2F' }} />;
      if (data.label === 'WARN') return <WarningIcon sx={{ fontSize: '1rem', color: '#F57C00' }} />;
      return <InfoIcon sx={{ fontSize: '1rem', color: '#1976D2' }} />;
    }

    const service = data.service?.toLowerCase() || '';
    if (service.includes('lambda')) return <LambdaIcon sx={{ fontSize: '1rem' }} />;
    if (service.includes('dynamodb') || service.includes('s3')) return <StorageIcon sx={{ fontSize: '1rem' }} />;
    return <CloudIcon sx={{ fontSize: '1rem' }} />;
  };

  // Format duration
  const formatDuration = (duration?: number) => {
    if (!duration) return '';
    if (duration < 1) return `${(duration * 1000).toFixed(2)}ms`;
    return `${duration.toFixed(2)}s`;
  };

  // Render segment content
  const renderSegmentContent = () => {
    if (!isSegment) return null;

    return (
      <Box sx={{ p: 1 }}>
        {data.operation && (
          <Typography variant="caption" display="block" sx={{ color: '#666' }}>
            <strong>Operation:</strong> {data.operation}
          </Typography>
        )}
        {data.resource && (
          <Typography variant="caption" display="block" sx={{ color: '#666' }}>
            <strong>Resource:</strong> {data.resource.split('/').pop()}
          </Typography>
        )}
        {data.httpMethod && data.httpUrl && (
          <Typography variant="caption" display="block" sx={{ color: '#666' }}>
            <strong>HTTP:</strong> {data.httpMethod} {data.httpUrl.split('/').slice(3).join('/')}
          </Typography>
        )}
        {data.httpStatus && (
          <Chip
            label={`Status: ${data.httpStatus}`}
            size="small"
            color={data.httpStatus >= 200 && data.httpStatus < 300 ? 'success' : 'error'}
            sx={{ mt: 0.5 }}
          />
        )}
        {data.duration !== undefined && (
          <Typography variant="caption" display="block" sx={{ color: '#666', mt: 0.5 }}>
            <strong>Duration:</strong> {formatDuration(data.duration)}
          </Typography>
        )}
      </Box>
    );
  };

  // Render Lambda log content
  const renderLogContent = () => {
    if (!isLambdaLog) return null;

    return (
      <Box sx={{ p: 1 }}>
        {data.message && (
          <Typography
            variant="caption"
            display="block"
            sx={{
              color: '#333',
              whiteSpace: isExpanded ? 'pre-wrap' : 'nowrap',
              overflow: isExpanded ? 'visible' : 'hidden',
              textOverflow: isExpanded ? 'clip' : 'ellipsis',
              wordBreak: 'break-word',
            }}
          >
            {data.message}
          </Typography>
        )}
        {data.timestamp && (
          <Typography variant="caption" display="block" sx={{ color: '#999', mt: 0.5 }}>
            {new Date(data.timestamp).toLocaleString('ko-KR')}
          </Typography>
        )}
      </Box>
    );
  };

  return (
    <Box
      className="nopan"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      sx={{
        padding: 1,
        borderRadius: 2,
        border: `2px solid ${borderColor}`,
        backgroundColor: bgColor,
        width: 280,
        height: isExpanded ? 'auto' : 160,
        minHeight: 160,
        maxHeight: isExpanded ? 'none' : 160,
        boxShadow: isExpanded ? '0 8px 16px rgba(0,0,0,0.2)' : '0 2px 4px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        position: isExpanded ? 'absolute' : 'relative',
        zIndex: isExpanded ? '9999 !important' : 'auto',
        transition: 'all 0.2s ease-in-out',
        transform: isExpanded ? 'scale(1.02)' : 'scale(1)',
        isolation: isExpanded ? 'isolate' : 'auto',
        willChange: isExpanded ? 'transform, z-index' : 'auto',
        '&:hover': {
          boxShadow: '0 8px 16px rgba(0,0,0,0.2)',
        },
      }}
    >
      {/* Target Handles */}
      <Handle type="target" position={Position.Top} id="target-top" style={{ background: '#555' }} />
      <Handle type="target" position={Position.Bottom} id="target-bottom" style={{ background: '#555' }} />
      <Handle type="target" position={Position.Left} id="target-left" style={{ background: '#555' }} />
      <Handle type="target" position={Position.Right} id="target-right" style={{ background: '#555' }} />

      {/* Header */}
      <Box
        sx={{
          borderBottom: `1px solid ${borderColor}`,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1,
          pb: 0.5,
        }}
      >
        {getServiceIcon()}
        <Typography variant="subtitle2" fontWeight="600" sx={{ color: isError ? '#D32F2F' : '#1976D2' }}>
          {data.label}
        </Typography>
        {data.service && (
          <Chip label={data.service} size="small" sx={{ ml: 'auto', fontSize: '0.65rem', height: '18px' }} />
        )}
      </Box>

      {/* Body */}
      <Box
        className="nodrag"
        sx={{
          flex: 1,
          overflowY: isExpanded ? 'visible' : 'auto',
          overflowX: 'hidden',
          minHeight: 0,
        }}
      >
        {isSegment ? renderSegmentContent() : renderLogContent()}
      </Box>

      {/* Source Handles */}
      <Handle type="source" position={Position.Top} id="source-top" style={{ background: '#555' }} />
      <Handle type="source" position={Position.Bottom} id="source-bottom" style={{ background: '#555' }} />
      <Handle type="source" position={Position.Left} id="source-left" style={{ background: '#555' }} />
      <Handle type="source" position={Position.Right} id="source-right" style={{ background: '#555' }} />
    </Box>
  );
};

export default XRayNode;
