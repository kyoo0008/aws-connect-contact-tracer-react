import React, { useEffect, useState } from 'react';
import { Handle, Position } from 'react-flow-renderer';
import { Box, Typography, Chip, IconButton, Tooltip } from '@mui/material';
import { AccountTree as ModuleIcon, BugReport as XRayIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

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
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();

  const isMainView = data.isMainView || false;
  const hasError = data.error || false;
  const isModuleNode = data.isModuleNode || false;
  const bgColor = hasError ? '#FFEBEE' : isModuleNode ? '#E3F2FD' : '#FFFFFF';
  const borderColor = hasError ? '#F44336' : isModuleNode ? '#2196F3' : '#E0E0E0';
  const targetPosition = data.targetPosition || Position.Left;
  const sourcePosition = data.sourcePosition || Position.Right;

  // X-Ray Trace ID 확인
  const xrayTraceId = data.logData?.xray_trace_id || data.logData?.xrayTraceId;
  const isLambdaInvocation = ['InvokeLambdaFunction', 'InvokeExternalResource'].includes(data.moduleType || '');
  const hasXRayTrace = isLambdaInvocation && !!xrayTraceId;


  useEffect(() => {
    console.log(data)
  },[])

  // React Flow 노드의 부모 wrapper에 z-index 적용
  useEffect(() => {
    if (isExpanded) {
      const nodeElement = document.querySelector(`[data-id="${data.id}"]`);
      if (nodeElement) {
        (nodeElement as HTMLElement).style.zIndex = '9999';
      }
    } else {
      const nodeElement = document.querySelector(`[data-id="${data.id}"]`);
      if (nodeElement) {
        (nodeElement as HTMLElement).style.zIndex = '';
      }
    }
  }, [isExpanded, data.id]);




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

  const renderDetailViewContent = () => {
    return (
      <>
        {!isModuleNode ? (
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              <NodeContentRenderer data={data} />
            </Box>
          </Box>
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
  };

  const hasFooterResults = data.logData?._footerResults && ['PlayPrompt', 'StoreUserInput', 'GetUserInput'].includes(data?.moduleType ?? '');
  const footerResults = data.logData?._footerResults;

  const hasFooterExternalResults = data.logData?._footerExternalResults && ['InvokeExternalResource', 'InvokeLambdaFunction'].includes(data?.moduleType ?? '');
  const footerExternalResults = data.logData?._footerExternalResults;

  return (
    <Box
      className="nopan" // React Flow class to disable panning on drag
      onWheel={(e) => e.stopPropagation()} // Stop zoom/pan on scroll
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      sx={{
        padding: 1,
        borderRadius: 2,
        border: `2px solid ${borderColor}`,
        backgroundColor: bgColor,
        width: 280,
        height: isExpanded ? 'auto' : 180,
        minHeight: 180,
        maxHeight: isExpanded ? 'none' : 180,
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
      <Box sx={{ borderBottom: `1px solid ${borderColor}` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, pb: 0.5 }}>
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
          {hasXRayTrace && (
            <Tooltip title={`View X-Ray Trace: ${xrayTraceId}`} arrow>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/xray-trace?traceId=${xrayTraceId}&contactId=${data.logData?.ContactId}`);
                }}
                sx={{
                  ml: 'auto',
                  p: 0.5,
                  color: '#4CAF50',
                  '&:hover': {
                    color: '#2E7D32',
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                  },
                }}
              >
                <XRayIcon sx={{ fontSize: '1rem' }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        {data.logData?.Identifier && (
          <Box sx={{ px: 1, pb: 0.5 }}>
            <Typography variant="caption" sx={{ color: '#6B7280', fontSize: '0.65rem' }} noWrap>
              {data.logData.Identifier}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Body */}
      <Box
        className="nodrag" // Prevents react-flow drag events on this element
        sx={{
          flex: 1,
          overflowY: isExpanded ? 'visible' : 'auto',
          overflowX: 'hidden',
          p: 1,
          minHeight: 0,
          overscrollBehavior: 'contain' // Prevents scroll chaining to parent (canvas)
        }}
      >
        {isMainView ? renderMainViewContent() : renderDetailViewContent()}
      </Box>

      {/* Footer - GetUserInput Results */}
      {!isMainView && hasFooterResults && (
        <Box sx={{
          borderTop: `1px solid ${borderColor}`,
          p: 1,
          backgroundColor: footerResults?.includes('Error') || footerResults?.includes('Timeout') ? '#FFEBEE' : '#E8F5E9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '32px'
        }}>
          <Typography variant="caption" fontWeight="bold" sx={{
            color: footerResults?.includes('Error') || footerResults?.includes('Timeout') ? '#D32F2F' : '#2E7D32'
          }}>
            Results: {footerResults}
          </Typography>
        </Box>
      )}

      {/* Footer - InvokeExternalResource Results */}
      {!isMainView && hasFooterExternalResults && (
        <Box sx={{
          borderTop: `1px solid ${borderColor}`,
          px: 1.5,
          py: 0.75,
          backgroundColor: footerExternalResults?.isSuccess === 'false' ? '#FFF3F3' : '#F0F9F4',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: '28px'
        }}>
          <Typography variant="caption" sx={{ color: '#666', fontWeight: 500 }}>
            Status
          </Typography>
          <Box sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1,
            py: 0.25,
            borderRadius: '4px',
            backgroundColor: footerExternalResults?.isSuccess === 'false' ? '#FEE' : '#E8F5E9',
            border: `1px solid ${footerExternalResults?.isSuccess === 'false' ? '#FFCDD2' : '#C8E6C9'}`
          }}>
            <Box sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: footerExternalResults?.isSuccess === 'false' ? '#F44336' : '#4CAF50'
            }} />
            <Typography variant="caption" sx={{
              color: footerExternalResults?.isSuccess === 'false' ? '#D32F2F' : '#2E7D32',
              fontWeight: 600,
              fontSize: '0.7rem'
            }}>
              {footerExternalResults?.isSuccess === 'true' ? 'Success' : 'Failed'}
            </Typography>
          </Box>
        </Box>
      )}

      {/* Source Handles */}
      <Handle type="source" position={Position.Top} id="source-top" style={{ background: '#555' }} />
      <Handle type="source" position={Position.Bottom} id="source-bottom" style={{ background: '#555' }} />
      <Handle type="source" position={Position.Left} id="source-left" style={{ background: '#555' }} />
      <Handle type="source" position={Position.Right} id="source-right" style={{ background: '#555' }} />
    </Box>
  );
};

export default CustomNode;

