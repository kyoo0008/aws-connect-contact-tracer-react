import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'react-flow-renderer';
import { Box, Typography } from '@mui/material';
import {
  Cloud as CloudIcon,
  Storage as StorageIcon,
  Functions as LambdaIcon,
  Http as HttpIcon,
  CloudQueue as CloudWatchIcon,
  Api as ApiIcon,
  Public as GlobeIcon,
  Dns as DatabaseIcon,
  Settings as SettingsIcon,
  Email as SnsIcon,
  MoveToInbox as SqsIcon,
  FolderOpen as S3Icon,
  VpnKey as SecretsIcon,
  Speed as SSMIcon,
  Phone as ConnectIcon,
} from '@mui/icons-material';

interface XRayNodeData {
  label: string;
  service?: string;
  error?: boolean;
  fault?: boolean;
  logData?: any;
  segmentData?: any;
  // Log card fields
  level?: string;
  subtitle?: string;
  bodyText?: string;
  blockId?: string;
}

/**
 * Service icon node - displays an AWS service icon with name below
 * Matches Graphviz get_image_label style
 */
const ServiceIconNode = ({ data }: { data: XRayNodeData }) => {
  const isError = data.error || data.fault || false;

  const getIcon = () => {
    const service = (data.service || '').toLowerCase();
    const iconSize = 48;

    if (service.includes('lambda')) return <LambdaIcon sx={{ fontSize: iconSize, color: '#FF9900' }} />;
    if (service.includes('dynamodb')) return <DatabaseIcon sx={{ fontSize: iconSize, color: '#3D48CC' }} />;
    if (service.includes('s3')) return <S3Icon sx={{ fontSize: iconSize, color: '#569A31' }} />;
    if (service.includes('sns')) return <SnsIcon sx={{ fontSize: iconSize, color: '#CC2264' }} />;
    if (service.includes('sqs')) return <SqsIcon sx={{ fontSize: iconSize, color: '#CC2264' }} />;
    if (service.includes('ssm')) return <SSMIcon sx={{ fontSize: iconSize, color: '#E7157B' }} />;
    if (service.includes('connect')) return <ConnectIcon sx={{ fontSize: iconSize, color: '#FF9900' }} />;
    if (service.includes('secretsmanager')) return <SecretsIcon sx={{ fontSize: iconSize, color: '#DD344C' }} />;
    if (service.includes('cloudwatch')) return <CloudWatchIcon sx={{ fontSize: iconSize, color: '#FF4F8B' }} />;
    if (service.includes('api') || service.includes('gateway')) return <ApiIcon sx={{ fontSize: iconSize, color: '#232F3E' }} />;
    if (service.includes('http') || service.includes('remote') || service.includes('external')) return <GlobeIcon sx={{ fontSize: iconSize, color: '#232F3E' }} />;
    return <SettingsIcon sx={{ fontSize: iconSize, color: '#232F3E' }} />;
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '80px',
        maxWidth: '200px',
        textAlign: 'center',
        p: 1,
        background: 'transparent',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} isConnectable={false} />
      <Handle type="target" position={Position.Top} id="top" style={{ visibility: 'hidden' }} isConnectable={false} />
      <Box sx={{ filter: isError ? 'drop-shadow(0 0 4px rgba(211, 47, 47, 0.5))' : 'none', mb: 0.5 }}>
        {getIcon()}
      </Box>
      <Typography
        variant="body2"
        sx={{
          fontWeight: 500,
          fontSize: '0.7rem',
          color: isError ? '#D32F2F' : '#232F3E',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.2,
        }}
      >
        {data.label}
      </Typography>
      <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ visibility: 'hidden' }} isConnectable={false} />
    </Box>
  );
};

/**
 * Lambda log card node - table-style card matching Graphviz get_node_label
 * Shows: header (level) | optional subtitle | body text
 */
const LogCardNode = ({ data }: { data: XRayNodeData }) => {
  const isError = data.level === 'ERROR';
  const isWarn = data.level === 'WARN';
  const borderColor = isError ? '#f44336' : isWarn ? '#FF9800' : '#bdbdbd';
  const headerBg = isError ? '#ffcdd2' : isWarn ? '#ffe0b2' : '#e0e0e0';

  let levelLabel = data.level || 'INFO';
  if (isError) levelLabel = `🚨  ${data.level}`;
  else if (isWarn) levelLabel = `⚠️  ${data.level}`;

  return (
    <Box
      sx={{
        background: '#fff',
        border: `2px solid ${borderColor}`,
        borderRadius: '6px',
        minWidth: '180px',
        maxWidth: '280px',
        overflow: 'hidden',
        boxShadow: data.subtitle === 'attributes' ? '3px 3px 6px rgba(0,0,0,0.15)' : '1px 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} isConnectable={false} />

      {/* Header row: level */}
      <Box sx={{ background: headerBg, px: 1.5, py: 0.5, borderBottom: `1px solid ${borderColor}` }}>
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.75rem', color: '#333', textAlign: 'center' }}>
          {levelLabel}
        </Typography>
      </Box>

      {/* Optional subtitle row */}
      {data.subtitle && (
        <Box sx={{ background: '#f5f5f5', px: 1.5, py: 0.3, borderBottom: `1px solid ${borderColor}` }}>
          <Typography variant="caption" sx={{ fontSize: '0.7rem', color: '#555', fontWeight: 500, textAlign: 'center', display: 'block' }}>
            {data.subtitle}
          </Typography>
        </Box>
      )}

      {/* Body text */}
      {data.bodyText && (
        <Box sx={{ px: 1.5, py: 0.8, background: '#fff' }}>
          <Typography
            variant="body2"
            sx={{
              fontSize: '0.7rem',
              color: '#333',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              lineHeight: 1.4,
              fontFamily: 'monospace',
            }}
          >
            {data.bodyText}
          </Typography>
        </Box>
      )}

      <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} isConnectable={false} />
    </Box>
  );
};

/**
 * Raw Json cloud icon node
 */
const RawJsonNode = ({ data }: { data: XRayNodeData }) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '60px',
        textAlign: 'center',
        p: 0.5,
        background: 'transparent',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} isConnectable={false} />
      <CloudIcon sx={{ fontSize: 36, color: '#1976D2' }} />
      <Typography variant="caption" sx={{ fontSize: '0.65rem', color: '#333', fontWeight: 500 }}>
        Raw Json
      </Typography>
      <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} isConnectable={false} />
    </Box>
  );
};

const XRayNode = ({ data, type }: NodeProps<XRayNodeData>) => {
  if (type === 'rawJson') {
    return <RawJsonNode data={data} />;
  }
  if (type === 'lambdaLog') {
    return <LogCardNode data={data} />;
  }
  return <ServiceIconNode data={data} />;
};

export default memo(XRayNode);
