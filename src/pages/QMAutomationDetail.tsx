import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Chip,
  Stack,
  Card,
  CardContent,
  Divider,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tab,
  Tabs,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Psychology as AIIcon,
  Headset as AudioIcon,
  Functions as FunctionIcon,
  AccessTime as TimeIcon,
  Token as TokenIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useConfig } from '@/contexts/ConfigContext';
import {
  getQMAutomationStatus,
  getStatusLabel,
  getStatusColor,
  extractScoreFromResponse,
} from '@/services/qmAutomationService';
import {
  QMAutomationStatusResponse,
  FunctionCall,
  AudioAnalyzeResult,
} from '@/types/qmAutomation.types';
import dayjs from 'dayjs';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
};

const QMAutomationDetail: React.FC = () => {
  const { contactId, requestId } = useParams<{ contactId: string; requestId: string }>();
  const navigate = useNavigate();
  const { config, isConfigured } = useConfig();
  const [tabValue, setTabValue] = useState(0);

  // Fetch QM Automation detail
  const {
    data: qmDetail,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['qm-automation-detail', requestId],
    queryFn: async () => {
      if (!requestId) throw new Error('Request ID is required');
      return getQMAutomationStatus(requestId, config);
    },
    enabled: !!requestId && isConfigured,
    refetchInterval: (query) => {
      const data = query.state.data as QMAutomationStatusResponse | undefined;
      // Auto-refresh if still processing
      if (data?.status === 'PENDING' || data?.status === 'PROCESSING' || data?.status === 'AUDIO_ANALYSIS_PROCESSING') {
        return 2000;
      }
      return false;
    },
  });

  const score = qmDetail?.result?.geminiResponse
    ? extractScoreFromResponse(qmDetail.result.geminiResponse)
    : null;

  // Validation checks
  if (!contactId || !requestId) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">Contact ID 또는 Request ID가 제공되지 않았습니다.</Alert>
        <Button onClick={() => navigate('/')} startIcon={<BackIcon />} sx={{ mt: 2 }}>
          Dashboard로 돌아가기
        </Button>
      </Container>
    );
  }

  if (!isConfigured || !config.credentials) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          AWS 자격 증명이 설정되지 않았습니다. Settings 페이지에서 자격 증명을 설정해주세요.
        </Alert>
        <Stack direction="row" spacing={2}>
          <Button
            variant="contained"
            onClick={() => navigate('/settings')}
            startIcon={<SettingsIcon />}
          >
            Settings로 이동
          </Button>
          <Button
            variant="outlined"
            onClick={() => navigate(-1)}
            startIcon={<BackIcon />}
          >
            뒤로 가기
          </Button>
        </Stack>
      </Container>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={2}>
            <IconButton onClick={() => navigate(`/qm-automation/${contactId}`)}>
              <BackIcon />
            </IconButton>
            <Box>
              <Typography variant="h5" fontWeight={600}>
                QM 분석 상세
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                Request ID: {requestId}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            {qmDetail && (
              <Chip
                label={getStatusLabel(qmDetail.status)}
                color={getStatusColor(qmDetail.status)}
              />
            )}
            <Tooltip title="새로고침">
              <IconButton onClick={() => refetch()}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      </Paper>

      {/* Loading */}
      {isLoading && (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <CircularProgress />
          <Typography sx={{ ml: 2 }}>QM 분석 결과를 불러오는 중...</Typography>
        </Box>
      )}

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          QM 분석 결과를 불러오는데 실패했습니다: {(error as Error).message}
        </Alert>
      )}

      {/* Processing State */}
      {qmDetail && (qmDetail.status === 'PENDING' || qmDetail.status === 'PROCESSING' || qmDetail.status === 'AUDIO_ANALYSIS_PROCESSING') && (
        <Paper elevation={1} sx={{ p: 4, textAlign: 'center' }}>
          <CircularProgress size={48} sx={{ mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            {qmDetail.status === 'AUDIO_ANALYSIS_PROCESSING' ? '오디오 분석 중...' : 'QM 분석 진행 중...'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            분석이 완료되면 자동으로 결과가 표시됩니다.
          </Typography>
        </Paper>
      )}

      {/* Error State */}
      {qmDetail && (qmDetail.status === 'FAILED' || qmDetail.status === 'ERROR') && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            QM 분석 실패
          </Typography>
          <Typography variant="body2">
            {qmDetail.error || '알 수 없는 오류가 발생했습니다.'}
          </Typography>
        </Alert>
      )}

      {/* Completed State */}
      {qmDetail && qmDetail.status === 'COMPLETED' && qmDetail.result && (
        <>
          {/* Summary Cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {/* Score Card */}
            {score !== null && (
              <Grid item xs={12} sm={6} md={3}>
                <Card>
                  <CardContent>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                      <AIIcon color="primary" />
                      <Typography variant="subtitle2" color="text.secondary">
                        평가 점수
                      </Typography>
                    </Stack>
                    <Typography variant="h3" fontWeight={700} color={score >= 80 ? 'success.main' : score >= 60 ? 'warning.main' : 'error.main'}>
                      {score}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      / 100점
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* Processing Time */}
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <TimeIcon color="info" />
                    <Typography variant="subtitle2" color="text.secondary">
                      처리 시간
                    </Typography>
                  </Stack>
                  <Typography variant="h4" fontWeight={600}>
                    {qmDetail.result.processingTime?.toFixed(2) || '-'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    초
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Token Usage */}
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <TokenIcon color="secondary" />
                    <Typography variant="subtitle2" color="text.secondary">
                      토큰 사용량
                    </Typography>
                  </Stack>
                  <Typography variant="h4" fontWeight={600}>
                    {qmDetail.result.totalTokens?.toLocaleString() || '-'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    입력: {qmDetail.result.inputTokens?.toLocaleString() || '-'} / 출력: {qmDetail.result.outputTokens?.toLocaleString() || '-'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Model Info */}
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <AIIcon color="primary" />
                    <Typography variant="subtitle2" color="text.secondary">
                      모델
                    </Typography>
                  </Stack>
                  <Typography variant="h6" fontWeight={600}>
                    {qmDetail.result.geminiModel || '-'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {dayjs(qmDetail.completedAt).format('YYYY-MM-DD HH:mm:ss')}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Tabs */}
          <Paper elevation={1}>
            <Tabs
              value={tabValue}
              onChange={(_, newValue) => setTabValue(newValue)}
              sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
            >
              <Tab label="QM 평가 결과" />
              <Tab label="Function Calls" disabled={!qmDetail.result.functionCalls?.length} />
              <Tab label="오디오 분석" disabled={!qmDetail.result.audioAnalyzeResult} />
            </Tabs>

            <Box sx={{ p: 3 }}>
              {/* QM Result Tab */}
              <TabPanel value={tabValue} index={0}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 3,
                    bgcolor: 'grey.50',
                    maxHeight: '60vh',
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    lineHeight: 1.6,
                  }}
                >
                  {qmDetail.result.geminiResponse}
                </Paper>
              </TabPanel>

              {/* Function Calls Tab */}
              <TabPanel value={tabValue} index={1}>
                {qmDetail.result.functionCalls && qmDetail.result.functionCalls.length > 0 ? (
                  <Stack spacing={2}>
                    {qmDetail.result.functionCalls.map((fc: FunctionCall, index: number) => (
                      <Accordion key={fc.id || index} defaultExpanded>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Stack direction="row" alignItems="center" spacing={2}>
                            <FunctionIcon color="primary" />
                            <Typography fontWeight={600}>{fc.name}</Typography>
                            {fc.functionCallResult && (
                              <Chip
                                size="small"
                                icon={fc.functionCallResult.success ? <CheckIcon /> : <ErrorIcon />}
                                label={fc.functionCallResult.success ? '성공' : '실패'}
                                color={fc.functionCallResult.success ? 'success' : 'error'}
                              />
                            )}
                          </Stack>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Grid container spacing={2}>
                            <Grid item xs={12} md={6}>
                              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                Arguments
                              </Typography>
                              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                                <pre style={{ margin: 0, fontSize: '0.75rem', overflow: 'auto' }}>
                                  {JSON.stringify(fc.args, null, 2)}
                                </pre>
                              </Paper>
                            </Grid>
                            {fc.functionCallResult && (
                              <Grid item xs={12} md={6}>
                                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                  Result
                                </Typography>
                                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                                  <pre style={{ margin: 0, fontSize: '0.75rem', overflow: 'auto' }}>
                                    {JSON.stringify(fc.functionCallResult.data || fc.functionCallResult.error, null, 2)}
                                  </pre>
                                </Paper>
                              </Grid>
                            )}
                          </Grid>
                        </AccordionDetails>
                      </Accordion>
                    ))}
                  </Stack>
                ) : (
                  <Typography color="text.secondary">Function Call 데이터가 없습니다.</Typography>
                )}
              </TabPanel>

              {/* Audio Analysis Tab */}
              <TabPanel value={tabValue} index={2}>
                {qmDetail.result.audioAnalyzeResult ? (
                  <AudioAnalysisView result={qmDetail.result.audioAnalyzeResult} />
                ) : (
                  <Typography color="text.secondary">오디오 분석 데이터가 없습니다.</Typography>
                )}
              </TabPanel>
            </Box>
          </Paper>

          {/* Metadata */}
          <Paper elevation={1} sx={{ p: 2, mt: 3 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              상세 정보
            </Typography>
            <Divider sx={{ my: 1 }} />
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="caption" color="text.secondary">
                  GCP Project ID
                </Typography>
                <Typography variant="body2">{qmDetail.result.projectId}</Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="caption" color="text.secondary">
                  Service Account
                </Typography>
                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                  {qmDetail.result.serviceAccount}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="caption" color="text.secondary">
                  프롬프트 길이
                </Typography>
                <Typography variant="body2">{qmDetail.result.promptLength?.toLocaleString()} 자</Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="caption" color="text.secondary">
                  응답 길이
                </Typography>
                <Typography variant="body2">{qmDetail.result.responseLength?.toLocaleString()} 자</Typography>
              </Grid>
            </Grid>
          </Paper>
        </>
      )}
    </Box>
  );
};

// Audio Analysis Sub-component
const AudioAnalysisView: React.FC<{ result: AudioAnalyzeResult }> = ({ result }) => {
  return (
    <Stack spacing={3}>
      {/* Summary */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          분석 요약
        </Typography>
        <Typography variant="body2">{result.summary}</Typography>
      </Paper>

      {/* Customer Dissatisfaction */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          {result.customer_dissatisfaction.detected ? (
            <WarningIcon color="warning" />
          ) : (
            <CheckIcon color="success" />
          )}
          <Typography variant="subtitle1" fontWeight={600}>
            고객 불만족
          </Typography>
          <Chip
            size="small"
            label={result.customer_dissatisfaction.detected ? '감지됨' : '감지 안됨'}
            color={result.customer_dissatisfaction.detected ? 'warning' : 'success'}
          />
        </Stack>
        {result.customer_dissatisfaction.detected && (
          <List dense>
            <ListItem>
              <ListItemIcon>
                <InfoIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="심각도"
                secondary={result.customer_dissatisfaction.severity || '-'}
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <InfoIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="사유"
                secondary={result.customer_dissatisfaction.reason || '-'}
              />
            </ListItem>
            {result.customer_dissatisfaction.timestamp_range && (
              <ListItem>
                <ListItemIcon>
                  <TimeIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="발생 구간"
                  secondary={result.customer_dissatisfaction.timestamp_range}
                />
              </ListItem>
            )}
          </List>
        )}
      </Paper>

      {/* Agent Interruption */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          {result.agent_interruption.detected ? (
            <WarningIcon color="warning" />
          ) : (
            <CheckIcon color="success" />
          )}
          <Typography variant="subtitle1" fontWeight={600}>
            상담사 끼어들기
          </Typography>
          <Chip
            size="small"
            label={result.agent_interruption.detected ? '감지됨' : '감지 안됨'}
            color={result.agent_interruption.detected ? 'warning' : 'success'}
          />
        </Stack>
        {result.agent_interruption.detected && result.agent_interruption.instances.length > 0 && (
          <List dense>
            {result.agent_interruption.instances.map((instance, index) => (
              <ListItem key={index}>
                <ListItemIcon>
                  <AudioIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={instance.timestamp}
                  secondary={instance.description}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Paper>
    </Stack>
  );
};

export default QMAutomationDetail;
