import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'react-flow-renderer';
import { Box, Typography } from '@mui/material';
import {
  CloudCircle as CloudIcon,
  Storage as StorageIcon,
  Functions as LambdaIcon,
  Http as HttpIcon,
  CloudQueue as CloudWatchIcon,
  Api as ApiIcon,
  Public as GlobeIcon,
  Dns as DatabaseIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';

interface XRayNodeData {
  label: string;
  service?: string;
  error?: boolean;
  fault?: boolean;
  logData?: any;
  segmentData?: any;
}

const XRayNode = ({ data }: NodeProps<XRayNodeData>) => {
  const isError = data.error || false;
  const isFault = data.fault || false;

  // Determine color based on state
  const color = isError ? '#D32F2F' : isFault ? '#F57C00' : '#455a64';
  const iconColor = isError ? '#D32F2F' : isFault ? '#F57C00' : '#232F3E'; // AWS Dark Blue for normal

  const getIcon = () => {
    const service = data.service?.toLowerCase() || '';
    const label = data.label?.toLowerCase() || '';

    // Lambda Log specific
    if (data.logData) {
      if (label.includes('error')) return <ErrorIcon sx={{ fontSize: 40, color: '#D32F2F' }} />;
      if (label.includes('warn')) return <WarningIcon sx={{ fontSize: 40, color: '#F57C00' }} />;
      return <CloudWatchIcon sx={{ fontSize: 40, color: '#1976D2' }} />;
    }

    // AWS Services
    if (service.includes('lambda')) return <LambdaIcon sx={{ fontSize: 48, color: '#FF9900' }} />;
    if (service.includes('dynamodb')) return <DatabaseIcon sx={{ fontSize: 48, color: '#3D48CC' }} />;
    if (service.includes('s3')) return <StorageIcon sx={{ fontSize: 48, color: '#569A31' }} />;
    if (service.includes('sns') || service.includes('sqs')) return <CloudIcon sx={{ fontSize: 48, color: '#CC2264' }} />;
    if (service.includes('cloudwatch')) return <CloudWatchIcon sx={{ fontSize: 48, color: '#FF4F8B' }} />;

    // HTTP / External
    if (service.includes('api') || service.includes('gateway')) return <ApiIcon sx={{ fontSize: 48, color: '#232F3E' }} />;
    if (service.includes('http') || service.includes('remote') || service.includes('external')) return <GlobeIcon sx={{ fontSize: 48, color: '#232F3E' }} />;

    // Default
    return <CloudIcon sx={{ fontSize: 48, color: iconColor }} />;
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '120px',
        maxWidth: '250px',
        textAlign: 'center',
        padding: 1,
        // Transparent background, no border to mimic "plaintext"
        background: 'transparent',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ visibility: 'hidden' }} // Hide handles for cleaner look
        isConnectable={false}
      />

      <Box sx={{
        filter: isError ? 'drop-shadow(0 0 4px rgba(211, 47, 47, 0.5))' : 'none',
        mb: 1
      }}>
        {getIcon()}
      </Box>

      <Typography
        variant="body2"
        sx={{
          fontWeight: 500,
          fontSize: '0.75rem',
          color: color,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.2
        }}
      >
        {data.label}
      </Typography>

      {data.service && !data.logData && (
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.65rem',
            color: '#757575',
            mt: 0.5
          }}
        >
          {data.service}
        </Typography>
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{ visibility: 'hidden' }}
        isConnectable={false}
      />
    </Box>
  );
};

export default memo(XRayNode);
