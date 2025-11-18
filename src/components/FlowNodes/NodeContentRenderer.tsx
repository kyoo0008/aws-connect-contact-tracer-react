import React from 'react';
import { Box, Typography } from '@mui/material';

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
        const { ComparisonMethod, Value, SecondValue } = params;
        const operator = getOperatorSymbol(ComparisonMethod);
        return (
          <Typography variant="body2">
            {renderValue(Value)} {operator} {renderValue(SecondValue)}?
            <br />
            <small>Result: {results}</small>
          </Typography>
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
      case 'GetUserInput':
      case 'StoreUserInput': {
        return (
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {params.Text || params.PromptLocation}
          </Typography>
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
