import React from 'react';
import { Box, Typography, Chip } from '@mui/material';

const renderValue = (value: any, max_length: number = 30) => {
  let strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (strValue.length > max_length) {
    strValue = strValue.substring(0, max_length) + '...';
  }
  return strValue;
};

const getOperatorSymbol = (op: string) => {
  const symbols: Record<string, string> = {
    'Contains': '⊃',
    'Equals': '=',
    'GreaterThan': '>',
    'GreaterThanOrEqualTo': '≥',
    'LessThan': '<',
    'LessThanOrEqualTo': '≤',
    'StartsWith': 'SW',
  };
  return symbols[op] || op;
};

export const NodeContentRenderer = ({ data }: { data: any }) => {
  const { moduleType, parameters, results } = data;
  const params = parameters || {};

  const renderContent = () => {
    switch (moduleType) {
      case 'CheckAttribute': {
        const checks = Array.isArray(params) ? params : [params];
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {checks.map((p, i) => {
              const operator = getOperatorSymbol(p.ComparisonMethod);
              const result = p.Results || (i === checks.length - 1 ? results : '');

              // Flow definition에서 가져온 비교값 추가
              const comparisonValue = p._comparisonValue;
              const comparisonSecondValue = p._comparisonSecondValue;

              // 값 표시 형식: value($.Attributes.AttributeName)
              const displayValue = p.Value + (comparisonValue ? `(${comparisonValue})` : '');
              const displaySecondValue = p.SecondValue + (comparisonSecondValue ? `(${comparisonSecondValue})` : '');

              return (
                <Box key={i} sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  p: 0.5,
                  borderRadius: 0.75,
                  backgroundColor: '#F9FAFB',
                  border: '1px solid #E5E7EB'
                }}>
                  <Typography variant="caption" sx={{
                    flex: 1,
                    color: '#374151',
                    lineHeight: 1.3,
                    fontSize: '0.7rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {renderValue(displayValue, 20)} <Box component="span" sx={{ color: '#6B7280', fontWeight: 600 }}>{operator}</Box> {renderValue(displaySecondValue, 15)}?
                  </Typography>
                  <Box sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.4,
                    px: 0.6,
                    py: 0.2,
                    borderRadius: '10px',
                    fontSize: '0.6rem',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    ...(result === 'true' ? {
                      backgroundColor: '#ECFDF5',
                      color: '#047857',
                      border: '1px solid #A7F3D0'
                    } : result === 'false' ? {
                      backgroundColor: '#FEF2F2',
                      color: '#DC2626',
                      border: '1px solid #FECACA'
                    } : {
                      backgroundColor: '#F3F4F6',
                      color: '#6B7280',
                      border: '1px solid #E5E7EB'
                    })
                  }}>
                    <Box sx={{
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      backgroundColor: result === 'true' ? '#10B981' : result === 'false' ? '#EF4444' : '#9CA3AF'
                    }} />
                    {result || 'N/A'}
                  </Box>
                </Box>
              );
            })}
          </Box>
        );
      }
      case 'InvokeExternalResource':
      case 'InvokeLambdaFunction': {
        const funcParams = params.Parameters || {};
        return (
          <Box>
            {Object.entries(funcParams).map(([key, value]) => (
              <Typography variant="caption" display="block" key={key}>
                {key}: {renderValue(value)}
              </Typography>
            ))}
            {/* Results는 이제 Footer에 표시되므로 여기서는 제거 */}
          </Box>
        );
      }
      case 'PlayPrompt':
      case 'StoreUserInput':
      case 'GetUserInput': {
        // GetUserInput의 경우 Parameters의 주요 정보 표시
        return (
          <Box>
            {/* Text-to-Speech 또는 S3 Prompt 표시 */}
            {params.Text && (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', mb: 1 }}>
                {renderValue(params.Text, 100)}
              </Typography>
            )}
            {params.PromptLocation && (
              <Typography variant="caption" display="block" sx={{ mb: 1 }}>
                📢 Prompt: {renderValue(params.PromptLocation, 50)}
              </Typography>
            )}
            {/* 추가 파라미터 표시 */}
            {params.TextToSpeechType && (
              <Typography variant="caption" display="block">
                TTS Type: {params.TextToSpeechType}
              </Typography>
            )}
            {params.Voice && (
              <Typography variant="caption" display="block">
                Voice: {params.Voice}
              </Typography>
            )}
            {params.PromptSource && (
              <Typography variant="caption" display="block">
                Source: {params.PromptSource}
              </Typography>
            )}
            {params.MaxDigits && (
              <Typography variant="caption" display="block">
                Max Digits: {params.MaxDigits}
              </Typography>
            )}
            {params.Timeout && (
              <Typography variant="caption" display="block">
                Timeout: {params.Timeout}ms
              </Typography>
            )}
          </Box>
        );
      }
      
      case 'SetAttributes':
      case 'SetFlowAttributes': {
        const attrs = Array.isArray(params) ? params : [params];
        return (
          <Box>
            {attrs.map((p, i) => (
              <Typography variant="caption" display="block" key={i}>
                {p.Key} = {renderValue(p.Value, 15)}
              </Typography>
            ))}
          </Box>
        );
      }
      case 'SetLoggingBehavior':
        return <Typography variant="body2">Logging: {params.LoggingBehavior}</Typography>;
      case 'TagContact':
        return (
          <Box>
            {Object.entries(params.Tags).map(([key, value]) => (
              <Typography variant="caption" display="block" key={key}>
                {key}: {renderValue(value)}
              </Typography>
            ))}
          </Box>
        )
      case 'SetContactFlow':
      case 'SetContactData':
        return (
          <Box>
            {Object.entries(params).map(([key, value]) => (
              <Typography variant="caption" display="block" key={key}>
                {key}: {renderValue(value)}
              </Typography>
            ))}
          </Box>
        );
      case 'GetCustomerProfile':
        return (
          <Typography variant="body2">
            ProfileId: {data.logData?.ResultData?.ProfileId}
            <br />
            <small>Result: {results}</small>
          </Typography>
        );
      default:
        return (
          <Box>
            {Object.entries(params).map(([key, value]) => (
              <Typography variant="caption" display="block" key={key}>
                {key}: {renderValue(value)}
              </Typography>
            ))}
            {results && <small>Result: {results}</small>}
          </Box>
        );
    }
  };

  return (
    <Box sx={{ p: 1, height: '100%', overflowY: 'auto' }}>
      {renderContent()}
    </Box>
  );
};
