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

  const handleWheel = (event: React.WheelEvent) => {
    const target = event.currentTarget as HTMLElement;
    const { scrollTop, scrollHeight, clientHeight } = target;
    
    // Check if content is scrollable
    const isScrollable = scrollHeight > clientHeight;
    
    if (isScrollable) {
      // Scrolling down
      if (event.deltaY > 0) {
        // If we're at the bottom, allow event to propagate (for ReactFlow zoom)
        if (scrollTop + clientHeight >= scrollHeight - 1) {
          return;
        }
      }
      // Scrolling up
      else {
        // If we're at the top, allow event to propagate (for ReactFlow zoom)
        if (scrollTop <= 1) {
          return;
        }
      }
      
      // We're in the middle of scrollable content, prevent ReactFlow zoom
      event.stopPropagation();
    }
    // If not scrollable, allow ReactFlow to handle the zoom
  };


  const hasFooterResults = data.logData?._footerResults && ['PlayPrompt','StoreUserInput','GetUserInput'].includes(data?.moduleType ?? '');
  const footerResults = data.logData?._footerResults;

  const hasFooterExternalResults = data.logData?._footerExternalResults && ['InvokeExternalResource', 'InvokeLambdaFunction'].includes(data?.moduleType ?? '');
  const footerExternalResults = data.logData?._footerExternalResults;

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
        onWheel={handleWheel} // Prevents zoom on scroll
        sx={{ flex: 1, overflowY: 'auto', p: 1, minHeight: 0 }}
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

