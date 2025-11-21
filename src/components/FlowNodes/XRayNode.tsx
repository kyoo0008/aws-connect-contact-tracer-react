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
  Http as HttpIcon,
  CloudQueue as CloudWatchIcon,
  Api as ApiIcon,
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

  // Get icon based on service type (Python의 get_segment_node 로직)
  const getServiceIcon = () => {
    if (isLambdaLog) {
      if (data.label === 'ERROR') return <ErrorIcon sx={{ fontSize: '1.2rem', color: '#D32F2F' }} />;
      if (data.label === 'WARN') return <WarningIcon sx={{ fontSize: '1.2rem', color: '#F57C00' }} />;
      return <InfoIcon sx={{ fontSize: '1.2rem', color: '#1976D2' }} />;
    }

    const service = data.service?.toLowerCase() || '';

    // Lambda 함수
    if (service.includes('lambda')) {
      return <LambdaIcon sx={{ fontSize: '1.3rem', color: '#FF9900' }} />;
    }

    // DynamoDB
    if (service.includes('dynamodb')) {
      return <StorageIcon sx={{ fontSize: '1.3rem', color: '#527FFF' }} />;
    }

    // S3
    if (service.includes('s3')) {
      return <StorageIcon sx={{ fontSize: '1.3rem', color: '#569A31' }} />;
    }

    // CloudWatch
    if (service.includes('cloudwatch')) {
      return <CloudWatchIcon sx={{ fontSize: '1.3rem', color: '#FF4F8B' }} />;
    }

    // HTTP / API Gateway / Remote
    if (service.includes('http') || service.includes('api') || service.includes('remote')) {
      return <ApiIcon sx={{ fontSize: '1.3rem', color: '#945DD6' }} />;
    }

    // External API
    if (service.includes('external')) {
      return <HttpIcon sx={{ fontSize: '1.3rem', color: '#00A1C9' }} />;
    }

    // Default AWS service
    return <CloudIcon sx={{ fontSize: '1.3rem', color: '#232F3E' }} />;
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
        borderRadius: 1,
        border: `2px solid ${borderColor}`,
        backgroundColor: bgColor,
        minWidth: isLambdaLog ? 150 : data.service?.includes('Lambda') ? 250 : 200,
        width: 'auto',
        height: isExpanded ? 'auto' : 'auto',
        minHeight: isLambdaLog ? 80 : 100,
        maxHeight: isExpanded ? 'none' : 200,
        boxShadow: isExpanded ? '0 8px 16px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        position: isExpanded ? 'absolute' : 'relative',
        zIndex: isExpanded ? '9999 !important' : 'auto',
        transition: 'all 0.2s ease-in-out',
        transform: isExpanded ? 'scale(1.05)' : 'scale(1)',
        isolation: isExpanded ? 'isolate' : 'auto',
        willChange: isExpanded ? 'transform, z-index' : 'auto',
        '&:hover': {
          boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
        },
      }}
    >
      {/* Target Handles - 각 방향에 대해 명확한 ID */}
      <Handle type="target" position={Position.Top} id="top" style={{ background: '#555' }} />
      <Handle type="target" position={Position.Bottom} id="bottom" style={{ background: '#555' }} />
      <Handle type="target" position={Position.Left} id="left" style={{ background: '#555' }} />
      <Handle type="target" position={Position.Right} id="right" style={{ background: '#555' }} />

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

      {/* Source Handles - 각 방향에 대해 명확한 ID */}
      <Handle type="source" position={Position.Top} id="top" style={{ background: '#555' }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: '#555' }} />
      <Handle type="source" position={Position.Left} id="left" style={{ background: '#555' }} />
      <Handle type="source" position={Position.Right} id="right" style={{ background: '#555' }} />
    </Box>
  );
};

export default XRayNode;
