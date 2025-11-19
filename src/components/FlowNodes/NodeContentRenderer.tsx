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
  const { moduleType, parameters, results, externalResults } = data;
  const params = parameters || {};

  const renderContent = () => {
    switch (moduleType) {
      case 'CheckAttribute': {
        const checks = Array.isArray(params) ? params : [params];
        return (
          <Box>
            {checks.map((p, i) => {
              const operator = getOperatorSymbol(p.ComparisonMethod);
              const result = p.Results || (i === checks.length - 1 ? results : '');
              const resultColor = result === 'true' ? 'success' : result === 'false' ? 'error' : 'default';

              // Flow definition에서 가져온 비교값 추가
              const comparisonValue = p._comparisonValue;
              const comparisonSecondValue = p._comparisonSecondValue;

              // 값 표시 형식: value($.Attributes.AttributeName)
              const displayValue = p.Value + (comparisonValue ? `(${comparisonValue})` : '');
              const displaySecondValue = p.SecondValue + (comparisonSecondValue ? `(${comparisonSecondValue})` : '');

              return (
                <Typography variant="body2" key={i} component="div" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                  {renderValue(displayValue)} {operator} {renderValue(displaySecondValue)}?
                  <Chip label={result} color={resultColor} size="small" sx={{ ml: 1 }} />
                </Typography>
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
            {externalResults && (
              <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                <small>Result: {externalResults.isSuccess === 'true' ? 'Success ✅' : 'Failed ❌'}</small>
              </Typography>
            )}
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
