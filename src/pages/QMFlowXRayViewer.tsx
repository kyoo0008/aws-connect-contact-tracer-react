/**
 * QM Flow X-Ray Trace Viewer
 *
 * QM Automation의 Lambda 로그를 조회하고 X-Ray 트레이스를 시각화합니다.
 * requestId를 key로 QM_LAMBDA_LOG_GROUPS에서 로그를 조회합니다.
 */

import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Container,
  Paper,
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Toolbar,
  IconButton,
  Tooltip,
  Chip,
  Stack,
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemButton,
  Drawer,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  BugReport as XRayIcon,
  Functions as FunctionIcon,
  Close as CloseIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { getAWSConnectService } from '@/services/awsConnectService';
import { useConfig } from '@/contexts/ConfigContext';
import { LambdaLog } from '@/types/contact.types';

const QMFlowXRayViewerContent: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get('requestId');
  const createdAt = searchParams.get('createdAt');
  const completedAt = searchParams.get('completedAt');

  const { config, isConfigured } = useConfig();
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fetch QM Lambda logs
  const { data: lambdaLogsData, isLoading: isLoadingLogs, error: logsError, refetch: refetchLogs } = useQuery({
    queryKey: ['qm-lambda-logs', requestId, config.credentials?.accessKeyId],
    queryFn: async () => {
      if (!isConfigured || !requestId) return null;

      const service = getAWSConnectService(config);

      // Calculate time range from createdAt/completedAt or use default
      let startTime: Date;
      let endTime: Date;

      if (createdAt) {
        startTime = new Date(createdAt);
        startTime.setHours(startTime.getHours() - 1);
      } else {
        startTime = new Date();
        startTime.setHours(startTime.getHours() - 24);
      }

      if (completedAt) {
        endTime = new Date(completedAt);
        endTime.setHours(endTime.getHours() + 1);
      } else {
        endTime = new Date();
        endTime.setHours(endTime.getHours() + 1);
      }

      const lambdaLogs = await service.getAllLambdaLogs(requestId, startTime, endTime, true);
      return lambdaLogs;
    },
    enabled: isConfigured && !!requestId,
  });

  const filterKeywords = config.qmFlowLogFilterKeywords || [];

  // Filter logs by keywords
  const filteredLogsData = React.useMemo(() => {
    if (!lambdaLogsData) return null;
    if (filterKeywords.length === 0) return lambdaLogsData;

    const filtered: Record<string, LambdaLog[]> = {};
    Object.entries(lambdaLogsData).forEach(([functionName, logs]) => {
      const filteredLogs = logs.filter((log: LambdaLog) => {
        const msg = typeof log.message === 'string' ? log.message : JSON.stringify(log.message || '');
        return !filterKeywords.some(keyword => msg.includes(keyword));
      });
      if (filteredLogs.length > 0) {
        filtered[functionName] = filteredLogs;
      }
    });
    return filtered;
  }, [lambdaLogsData, filterKeywords]);

  // Extract unique X-Ray trace IDs from lambda logs
  const traceIds = React.useMemo(() => {
    if (!filteredLogsData) return [];
    const ids = new Set<string>();
    Object.values(filteredLogsData).forEach((logs: LambdaLog[]) => {
      logs.forEach(log => {
        const traceId = log.xrayTraceId || log.xray_trace_id;
        if (traceId) ids.add(traceId);
      });
    });
    return Array.from(ids);
  }, [filteredLogsData]);

  const handleBack = () => {
    if (requestId) {
      navigate(`/qm-automation/detail/${requestId}`);
    } else {
      navigate(-1);
    }
  };

  const handleViewTrace = (traceId: string) => {
    navigate(`/xray-trace?traceId=${traceId}&requestId=${requestId}`);
  };

  // Total log count
  const totalLogCount = React.useMemo(() => {
    if (!filteredLogsData) return 0;
    return Object.values(filteredLogsData).reduce((sum, logs) => sum + logs.length, 0);
  }, [filteredLogsData]);

  // Error/warn counts
  const logStats = React.useMemo(() => {
    if (!filteredLogsData) return { errorCount: 0, warnCount: 0, infoCount: 0 };
    let errorCount = 0, warnCount = 0, infoCount = 0;
    Object.values(filteredLogsData).forEach((logs: LambdaLog[]) => {
      logs.forEach(log => {
        const level = log.level?.toUpperCase() || 'INFO';
        if (level === 'ERROR') errorCount++;
        else if (level === 'WARN' || level === 'WARNING') warnCount++;
        else infoCount++;
      });
    });
    return { errorCount, warnCount, infoCount };
  }, [filteredLogsData]);

  if (!isConfigured) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="warning">
          AWS 설정이 필요합니다. Settings 페이지에서 설정해주세요.
        </Alert>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/settings')} sx={{ mt: 2 }}>
          Settings로 이동
        </Button>
      </Container>
    );
  }

  if (!requestId) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="error">Request ID가 필요합니다.</Alert>
        <Button startIcon={<BackIcon />} onClick={handleBack} sx={{ mt: 2 }}>
          뒤로 가기
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth={false} disableGutters sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header Toolbar */}
      <Paper elevation={2} sx={{ borderRadius: 0 }}>
        <Toolbar sx={{ gap: 2 }}>
          <IconButton edge="start" onClick={handleBack}>
            <BackIcon />
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
            <Typography variant="h6" component="h1" noWrap>
              QM Flow X-Ray Trace
            </Typography>
            <Chip label={`Request: ${requestId}`} size="small" color="primary" sx={{ fontFamily: 'monospace' }} />
            {filterKeywords.length > 0 && (
              <Chip
                icon={<FilterIcon />}
                label={`${filterKeywords.length}개 키워드 필터 적용중`}
                size="small"
                color="warning"
                variant="outlined"
              />
            )}
          </Box>
          <Stack direction="row" spacing={1}>
            <Tooltip title="새로고침">
              <IconButton onClick={() => refetchLogs()}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Toolbar>
      </Paper>

      {/* Main Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {/* Loading */}
        {isLoadingLogs && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <Stack alignItems="center" spacing={2}>
              <CircularProgress />
              <Typography variant="body2" color="text.secondary">
                QM Lambda 로그를 조회하고 있습니다...
              </Typography>
            </Stack>
          </Box>
        )}

        {/* Error */}
        {logsError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            로그 조회 실패: {logsError instanceof Error ? logsError.message : 'Unknown error'}
          </Alert>
        )}

        {/* Results */}
        {!isLoadingLogs && !logsError && filteredLogsData && (
          <Stack spacing={2}>
            {/* Summary Card */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Lambda 로그 요약
                </Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap">
                  <Chip
                    icon={<FunctionIcon />}
                    label={`${Object.keys(filteredLogsData).length} Lambda 함수`}
                    color="primary"
                    variant="outlined"
                  />
                  <Chip
                    icon={<InfoIcon />}
                    label={`${totalLogCount} 총 로그`}
                    color="info"
                    variant="outlined"
                  />
                  {logStats.errorCount > 0 && (
                    <Chip
                      icon={<ErrorIcon />}
                      label={`${logStats.errorCount} Errors`}
                      color="error"
                    />
                  )}
                  {logStats.warnCount > 0 && (
                    <Chip
                      icon={<WarningIcon />}
                      label={`${logStats.warnCount} Warnings`}
                      color="warning"
                    />
                  )}
                  <Chip
                    icon={<XRayIcon />}
                    label={`${traceIds.length} X-Ray Traces`}
                    color="success"
                    variant="outlined"
                  />
                </Stack>
              </CardContent>
            </Card>

            {/* Lambda Log Groups */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Lambda 함수별 로그
                </Typography>
                <Divider sx={{ mb: 2 }} />
                {Object.keys(filteredLogsData).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    조회된 Lambda 로그가 없습니다.
                  </Typography>
                ) : (
                  <List dense>
                    {Object.entries(filteredLogsData).map(([functionName, logs]) => {
                      const errorCount = logs.filter((l: LambdaLog) => l.level?.toUpperCase() === 'ERROR').length;
                      const warnCount = logs.filter((l: LambdaLog) => {
                        const level = l.level?.toUpperCase();
                        return level === 'WARN' || level === 'WARNING';
                      }).length;

                      return (
                        <ListItem key={functionName} divider>
                          <ListItemIcon>
                            <FunctionIcon color={errorCount > 0 ? 'error' : 'primary'} />
                          </ListItemIcon>
                          <ListItemText
                            primary={functionName}
                            secondary={
                              <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                                <Chip label={`${logs.length} logs`} size="small" variant="outlined" />
                                {errorCount > 0 && (
                                  <Chip label={`${errorCount} errors`} size="small" color="error" />
                                )}
                                {warnCount > 0 && (
                                  <Chip label={`${warnCount} warns`} size="small" color="warning" />
                                )}
                              </Stack>
                            }
                          />
                        </ListItem>
                      );
                    })}
                  </List>
                )}
              </CardContent>
            </Card>

            {/* X-Ray Traces */}
            {traceIds.length > 0 && (
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    X-Ray Traces
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  <List dense>
                    {traceIds.map((traceId) => (
                      <ListItemButton
                        key={traceId}
                        onClick={() => handleViewTrace(traceId)}
                        sx={{
                          borderRadius: 1,
                          mb: 0.5,
                          '&:hover': { backgroundColor: 'rgba(76, 175, 80, 0.08)' },
                        }}
                      >
                        <ListItemIcon>
                          <XRayIcon sx={{ color: '#4CAF50' }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                              {traceId}
                            </Typography>
                          }
                          secondary="클릭하여 X-Ray Trace 상세 보기"
                        />
                      </ListItemButton>
                    ))}
                  </List>
                </CardContent>
              </Card>
            )}

            {/* All Lambda Logs */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  전체 Lambda 로그
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <List dense sx={{ maxHeight: 600, overflow: 'auto' }}>
                  {Object.entries(filteredLogsData).flatMap(([functionName, logs]) =>
                    logs.map((log: LambdaLog, index: number) => {
                      const level = log.level?.toUpperCase() || 'INFO';
                      const isError = level === 'ERROR';
                      const isWarn = level === 'WARN' || level === 'WARNING';

                      return (
                        <ListItemButton
                          key={`${functionName}-${index}`}
                          onClick={() => {
                            setSelectedLog(log);
                            setDrawerOpen(true);
                          }}
                          sx={{
                            borderRadius: 1,
                            mb: 0.5,
                            backgroundColor: isError ? 'rgba(244, 67, 54, 0.04)' : isWarn ? 'rgba(255, 152, 0, 0.04)' : 'transparent',
                          }}
                        >
                          <ListItemIcon>
                            {isError ? <ErrorIcon color="error" fontSize="small" /> :
                              isWarn ? <WarningIcon color="warning" fontSize="small" /> :
                                <InfoIcon color="info" fontSize="small" />}
                          </ListItemIcon>
                          <ListItemText
                            primary={
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Chip label={functionName} size="small" variant="outlined" />
                                <Chip label={level} size="small" color={isError ? 'error' : isWarn ? 'warning' : 'info'} />
                                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                  {log.timestamp}
                                </Typography>
                              </Stack>
                            }
                            secondary={
                              <Typography
                                variant="body2"
                                sx={{
                                  fontFamily: 'monospace',
                                  fontSize: '0.75rem',
                                  mt: 0.5,
                                  maxWidth: '100%',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {typeof log.message === 'string' ? log.message.substring(0, 200) : JSON.stringify(log.message).substring(0, 200)}
                              </Typography>
                            }
                          />
                        </ListItemButton>
                      );
                    })
                  ).sort((a, b) => {
                    // Sort by timestamp
                    const aTime = a.key?.toString() || '';
                    const bTime = b.key?.toString() || '';
                    return aTime.localeCompare(bTime);
                  })}
                </List>
              </CardContent>
            </Card>
          </Stack>
        )}

        {/* No data */}
        {!isLoadingLogs && !logsError && !filteredLogsData && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary">
              데이터가 없습니다.
            </Typography>
          </Box>
        )}
      </Box>

      {/* Lambda Log Details Drawer */}
      <Drawer
        anchor="right"
        variant="persistent"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onClick={(e) => e.stopPropagation()}
        PaperProps={{
          sx: {
            width: { xs: '90%', sm: 400, md: 500 },
            p: 2,
            position: 'absolute',
            top: 0,
            right: 0,
            height: '100%',
            boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
          }
        }}
        sx={{
          position: 'absolute',
          right: 0,
          top: 0,
          height: '100%',
          zIndex: 1200,
          pointerEvents: drawerOpen ? 'auto' : 'none',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Log Details</Typography>
          <IconButton onClick={() => setDrawerOpen(false)}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Divider sx={{ mb: 2 }} />
        <Box sx={{ overflow: 'auto', flex: 1 }}>
          {selectedLog ? (
            <Stack spacing={2}>
              {/* Basic Info */}
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" gutterBottom>기본 정보</Typography>
                <Stack spacing={1}>
                  <Chip
                    label={`Service: ${selectedLog.service || 'N/A'}`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                  <Chip
                    label={`Level: ${selectedLog.level?.toUpperCase() || 'INFO'}`}
                    size="small"
                    color={
                      selectedLog.level?.toUpperCase() === 'ERROR' ? 'error' :
                      selectedLog.level?.toUpperCase() === 'WARN' || selectedLog.level?.toUpperCase() === 'WARNING' ? 'warning' : 'info'
                    }
                  />
                  <Typography variant="body2" color="text.secondary">
                    <strong>Timestamp:</strong> {selectedLog.timestamp || 'N/A'}
                  </Typography>
                  {selectedLog.logGroup && (
                    <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                      <strong>Log Group:</strong> {selectedLog.logGroup}
                    </Typography>
                  )}
                  {selectedLog.logStream && (
                    <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                      <strong>Log Stream:</strong> {selectedLog.logStream}
                    </Typography>
                  )}
                  {(selectedLog.xrayTraceId || selectedLog.xray_trace_id) && (
                    <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                      <strong>X-Ray Trace ID:</strong> {selectedLog.xrayTraceId || selectedLog.xray_trace_id}
                    </Typography>
                  )}
                </Stack>
              </Paper>

              {/* Message */}
              {selectedLog.message && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>Message</Typography>
                  <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                    {typeof selectedLog.message === 'string' ? selectedLog.message : JSON.stringify(selectedLog.message, null, 2)}
                  </pre>
                </Paper>
              )}

              {/* Error */}
              {selectedLog.error && (
                <Paper variant="outlined" sx={{ p: 2, backgroundColor: 'rgba(244, 67, 54, 0.04)' }}>
                  <Typography variant="subtitle1" gutterBottom color="error">Error</Typography>
                  <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                    {typeof selectedLog.error === 'string' ? selectedLog.error : JSON.stringify(selectedLog.error, null, 2)}
                  </pre>
                </Paper>
              )}

              {/* Request */}
              {selectedLog.request && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>Request</Typography>
                  <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                    {JSON.stringify(selectedLog.request, null, 2)}
                  </pre>
                </Paper>
              )}

              {/* Response */}
              {selectedLog.response && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>Response</Typography>
                  <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                    {JSON.stringify(selectedLog.response, null, 2)}
                  </pre>
                </Paper>
              )}

              {/* Parameters */}
              {selectedLog.parameters && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>Parameters</Typography>
                  <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                    {JSON.stringify(selectedLog.parameters, null, 2)}
                  </pre>
                </Paper>
              )}

              {/* Event */}
              {selectedLog.event && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>Event</Typography>
                  <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                    {JSON.stringify(selectedLog.event, null, 2)}
                  </pre>
                </Paper>
              )}

              {/* Duration */}
              {selectedLog.duration !== undefined && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>Duration</Typography>
                  <Typography variant="body2">{selectedLog.duration}ms</Typography>
                </Paper>
              )}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              로그를 클릭하면 상세 정보를 확인할 수 있습니다.
            </Typography>
          )}
        </Box>
      </Drawer>
    </Container>
  );
};

const QMFlowXRayViewer: React.FC = () => {
  return <QMFlowXRayViewerContent />;
};

export default QMFlowXRayViewer;
