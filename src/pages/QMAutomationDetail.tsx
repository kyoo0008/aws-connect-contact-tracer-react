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
  Gavel as ObjectionIcon,
  ThumbUp as AcceptIcon,
  ThumbDown as RejectIcon,
  History as HistoryIcon,
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
  FunctionCallResultData,
  AudioAnalyzeResult,
  EvaluationResult,
  EvaluationEvent,
  EvaluationState,
  EvaluationStatusType,
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

  // const score = qmDetail?.result?.geminiResponse
  //   ? extractScoreFromResponse(qmDetail.result.geminiResponse)
  //   : null;

  const score = null; // To-do : 점수 추출 로직 개선 필요

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
              <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  Request ID: {requestId}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  Contact ID: {contactId}
                </Typography>
                {qmDetail && (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      상담 연결: {qmDetail.connectedToAgentTimestamp ? dayjs(qmDetail.connectedToAgentTimestamp).format('YYYY-MM-DD HH:mm:ss') : '-'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      최근 수정: {qmDetail.completedAt ? dayjs(qmDetail.completedAt).format('YYYY-MM-DD HH:mm:ss') : (qmDetail.createdAt ? dayjs(qmDetail.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-')}
                    </Typography>
                  </>
                )}
              </Stack>
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



      {/* Error State */}
      {qmDetail && (qmDetail.status === 'FAILED' || qmDetail.status === 'ERROR') && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            QM 분석 실패
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {qmDetail.error || '알 수 없는 오류가 발생했습니다.'}
          </Typography>
          {qmDetail.result?.errorDetails && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, fontFamily: 'monospace' }}>
              상세 정보: {JSON.stringify(qmDetail.result.errorDetails, null, 2)}
            </Typography>
          )}
        </Alert>
      )}

      {/* Main Content */}
      {qmDetail && !['FAILED', 'ERROR'].includes(qmDetail.status) && (
        <>
          {/* Processing Banner */}
          {(qmDetail.status === 'PENDING' || qmDetail.status === 'PROCESSING' || qmDetail.status === 'AUDIO_ANALYSIS_PROCESSING') && (
            <Paper elevation={1} sx={{ p: 2, mb: 3, bgcolor: 'info.50', borderColor: 'info.main' }} variant="outlined">
              <Stack direction="row" alignItems="center" spacing={2}>
                <CircularProgress size={24} />
                <Box>
                  <Typography variant="subtitle2" fontWeight={600}>
                    {qmDetail.status === 'AUDIO_ANALYSIS_PROCESSING' ? '오디오 분석 중...' : 'QM 분석 진행 중...'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    분석이 완료되면 자동으로 결과가 표시됩니다.
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          )}

          {/* Summary Cards */}
          {/* Summary Cards */}
          {qmDetail.result && (
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
                        총 처리 시간
                      </Typography>
                    </Stack>
                    <Typography variant="h4" fontWeight={600}>
                      {(() => {
                        const qmTime = qmDetail.result.processingTime || 0;
                        const toolTime = qmDetail.input?.toolResult?.processingTime || 0;
                        let audioTime = 0;
                        try {
                          if (qmDetail.result.audioAnalyzeResult?.body) {
                            audioTime = JSON.parse(qmDetail.result.audioAnalyzeResult.body).processingTime || 0;
                          }
                        } catch (e) { }
                        return (qmTime + toolTime + audioTime).toFixed(2);
                      })()}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        QM: {qmDetail.result.processingTime?.toFixed(1) || '0'}s
                      </Typography>
                      {qmDetail.input?.toolResult?.processingTime && (
                        <Typography variant="caption" color="text.secondary">
                          / Tool: {qmDetail.input.toolResult.processingTime.toFixed(1)}s
                        </Typography>
                      )}
                      {qmDetail.result.audioAnalyzeResult?.body && (
                        <Typography variant="caption" color="text.secondary">
                          / Audio: {(() => {
                            try { return JSON.parse(qmDetail.result.audioAnalyzeResult.body).processingTime?.toFixed(1); }
                            catch { return '0'; }
                          })()}s
                        </Typography>
                      )}
                    </Stack>
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
                        총 토큰 사용량
                      </Typography>
                    </Stack>
                    <Typography variant="h4" fontWeight={600}>
                      {(() => {
                        const qmTokens = qmDetail.result.totalTokens || 0;
                        const toolTokens = qmDetail.input?.toolResult?.tokenUsage?.totalTokens || 0;
                        let audioTokens = 0;
                        try {
                          if (qmDetail.result.audioAnalyzeResult?.body) {
                            audioTokens = JSON.parse(qmDetail.result.audioAnalyzeResult.body).totalTokens || 0;
                          }
                        } catch (e) { }
                        return (qmTokens + toolTokens + audioTokens).toLocaleString();
                      })()}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                      <Typography variant="caption" color="text.secondary">
                        QM: {(qmDetail.result.totalTokens || 0).toLocaleString()}
                      </Typography>
                      {qmDetail.input?.toolResult?.tokenUsage?.totalTokens && (
                        <Typography variant="caption" color="text.secondary">
                          / Tool: {qmDetail.input.toolResult.tokenUsage.totalTokens.toLocaleString()}
                        </Typography>
                      )}
                      {qmDetail.result.audioAnalyzeResult?.body && (
                        <Typography variant="caption" color="text.secondary">
                          / Audio: {(() => {
                            try { return JSON.parse(qmDetail.result.audioAnalyzeResult.body).totalTokens?.toLocaleString() || '0'; }
                            catch { return '0'; }
                          })()}
                        </Typography>
                      )}
                    </Stack>
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
                    <Stack direction="column" spacing={0} sx={{ mt: 0.5 }}>
                      {qmDetail.input?.toolResult?.geminiModel && qmDetail.input.toolResult.geminiModel !== qmDetail.result.geminiModel && (
                        <Typography variant="caption" color="text.secondary">
                          Tool: {qmDetail.input.toolResult.geminiModel}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary">
                        {dayjs(qmDetail.completedAt).format('YYYY-MM-DD HH:mm:ss')}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}

          {/* Tabs */}
          <Paper elevation={1}>
            <Tabs
              value={tabValue}
              onChange={(_, newValue) => setTabValue(newValue)}
              sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
            >
              <Tab label="QM 평가 결과" />
              <Tab label="평가 상세" disabled={!qmDetail.result?.evaluationResult} />
              <Tab label="Function Calls" disabled={!qmDetail.input?.toolResult} />
              {/* <Tab label="오디오 분석" disabled={!qmDetail.result?.audioAnalyzeResult} /> */}
            </Tabs>

            <Box sx={{ p: 3 }}>
              {/* QM Result Tab */}
              <TabPanel value={tabValue} index={0}>
                <Stack spacing={3}>
                  {/* Input Prompt Section */}
                  {qmDetail.input?.prompt && (
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                        <InfoIcon color="info" />
                        <Typography variant="subtitle1" fontWeight={600}>
                          QM 분석 프롬프트
                        </Typography>
                      </Stack>
                      <Box
                        sx={{
                          p: 2,
                          bgcolor: 'grey.50',
                          borderRadius: 1,
                          maxHeight: '200px',
                          overflow: 'auto',
                          fontFamily: 'monospace',
                          fontSize: '0.875rem',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {qmDetail.input.prompt}
                      </Box>
                    </Paper>
                  )}

                  {/* Evaluation Meta Data */}
                  {qmDetail.result && (
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                        평가 메타데이터
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="caption" color="text.secondary">처리 시간</Typography>
                          <Typography variant="body2">
                            {qmDetail.result.processingTime?.toFixed(2) || '-'}s
                          </Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="caption" color="text.secondary">총 토큰</Typography>
                          <Typography variant="body2">
                            {qmDetail.result.totalTokens?.toLocaleString() || '-'}
                          </Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="caption" color="text.secondary">입력 토큰</Typography>
                          <Typography variant="body2">
                            {qmDetail.input?.inputTokens?.toLocaleString() || '-'}
                          </Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="caption" color="text.secondary">출력 토큰</Typography>
                          <Typography variant="body2">
                            {qmDetail.result.outputTokens?.toLocaleString() || '-'}
                          </Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="caption" color="text.secondary">Thinking 토큰</Typography>
                          <Typography variant="body2">
                            {((qmDetail.result.totalTokens || 0) - ((qmDetail.input?.inputTokens || 0) + (qmDetail.result.outputTokens || 0))).toLocaleString()}
                          </Typography>
                        </Grid>
                      </Grid>
                    </Paper>
                  )}

                  {/* Thinking Process Section */}
                  {qmDetail.result?.thinkingText && (
                    <Box sx={{ mb: 3 }}>
                      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                        Thinking Process
                      </Typography>
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 3,
                          bgcolor: 'grey.50',
                          maxHeight: '40vh',
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'monospace',
                          fontSize: '0.875rem',
                          lineHeight: 1.6,
                        }}
                      >
                        {qmDetail.result.thinkingText}
                      </Paper>
                    </Box>
                  )}

                  {/* Result Section */}
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                      평가 결과
                    </Typography>
                    {qmDetail.result?.geminiResponse ? (
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
                    ) : (
                      <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', bgcolor: 'grey.50' }}>
                        <Typography color="text.secondary">분석 결과 대기 중...</Typography>
                      </Paper>
                    )}
                  </Box>
                </Stack>
              </TabPanel>

              {/* Evaluation Detail Tab */}
              <TabPanel value={tabValue} index={1}>
                {qmDetail.result?.evaluationResult ? (
                  <EvaluationDetailView evaluationResult={qmDetail.result.evaluationResult} />
                ) : (
                  <Typography color="text.secondary">평가 상세 데이터가 없습니다.</Typography>
                )}
              </TabPanel>

              {/* Function Calls Tab */}
              <TabPanel value={tabValue} index={2}>
                <Stack spacing={3}>
                  {/* Tool Prompt Section */}
                  {qmDetail.input?.toolResult?.toolPrompt && (
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                        <InfoIcon color="info" />
                        <Typography variant="subtitle1" fontWeight={600}>
                          Tool 분석 프롬프트
                        </Typography>
                      </Stack>
                      <Box
                        sx={{
                          p: 2,
                          bgcolor: 'grey.50',
                          borderRadius: 1,
                          maxHeight: '200px',
                          overflow: 'auto',
                          fontFamily: 'monospace',
                          fontSize: '0.875rem',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {qmDetail.input.toolResult.toolPrompt}
                      </Box>
                    </Paper>
                  )}

                  {/* Tool Meta Data */}
                  {qmDetail.input?.toolResult && (
                    <Paper variant="outlined" sx={{ p: 2 }}>
                      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                        Tool 실행 메타데이터
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="caption" color="text.secondary">처리 시간</Typography>
                          <Typography variant="body2">
                            {qmDetail.input?.toolResult?.processingTime?.toFixed(2) || '-'}s
                          </Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="caption" color="text.secondary">총 토큰</Typography>
                          <Typography variant="body2">
                            {qmDetail.input?.toolResult?.tokenUsage?.totalTokens?.toLocaleString() || '-'}
                          </Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="caption" color="text.secondary">입력 토큰</Typography>
                          <Typography variant="body2">
                            {qmDetail.input?.toolResult?.tokenUsage?.inputTokens?.toLocaleString() || '-'}
                          </Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="caption" color="text.secondary">출력 토큰</Typography>
                          <Typography variant="body2">
                            {qmDetail.input?.toolResult?.tokenUsage?.outputTokens?.toLocaleString() || '-'}
                          </Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="caption" color="text.secondary">Thinking 토큰</Typography>
                          <Typography variant="body2">
                            {((qmDetail.input?.toolResult?.tokenUsage?.totalTokens || 0) - ((qmDetail.input?.toolResult?.tokenUsage?.inputTokens || 0) + (qmDetail.input?.toolResult?.tokenUsage?.outputTokens || 0))).toLocaleString()}
                          </Typography>
                        </Grid>
                      </Grid>
                    </Paper>
                  )}
                  {/* Tool Thinking Process Section */}
                  {qmDetail.input?.toolResult?.thinkingText && (
                    <Box sx={{ mb: 3 }}>
                      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                        Tool Thinking Process
                      </Typography>
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 3,
                          bgcolor: 'grey.50',
                          maxHeight: '40vh',
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'monospace',
                          fontSize: '0.875rem',
                          lineHeight: 1.6,
                        }}
                      >
                        {qmDetail.input.toolResult.thinkingText}
                      </Paper>
                    </Box>
                  )}



                  {/* Function Calls List */}
                  {qmDetail.input?.toolResult?.functionCalls && qmDetail.input?.toolResult?.functionCalls.length > 0 ? (
                    <Stack spacing={2}>
                      {qmDetail.input?.toolResult?.functionCalls.map((fc: FunctionCall, index: number) => {
                        // functionCallResults에서 해당 functionCall의 결과 찾기
                        const fcResult = qmDetail.input?.toolResult?.functionCallResults?.find(
                          (result: FunctionCallResultData) => result.functionCallId === fc.id
                        );
                        return (
                          <Accordion key={fc.id || index} defaultExpanded>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                              <Stack direction="row" alignItems="center" spacing={2}>
                                <FunctionIcon color="primary" />
                                <Typography fontWeight={600}>{fc.name}</Typography>
                                {fcResult && (
                                  <Chip
                                    size="small"
                                    icon={fcResult.success ? <CheckIcon /> : <ErrorIcon />}
                                    label={fcResult.success ? '성공' : '실패'}
                                    color={fcResult.success ? 'success' : 'error'}
                                  />
                                )}
                              </Stack>
                            </AccordionSummary>
                            <AccordionDetails>
                              <Grid container spacing={2}>
                                <Grid item xs={12} md={6}>
                                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                    Arguments (요청)
                                  </Typography>
                                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50', maxHeight: '300px', overflow: 'auto' }}>
                                    <pre style={{ margin: 0, fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                      {JSON.stringify(fc.args, null, 2)}
                                    </pre>
                                  </Paper>
                                </Grid>
                                {fcResult && (
                                  <Grid item xs={12} md={6}>
                                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                      Result (응답)
                                    </Typography>
                                    <Paper
                                      variant="outlined"
                                      sx={{
                                        p: 2,
                                        bgcolor: fcResult.data?.errorMessage ? 'error.50' : 'success.50',
                                        borderColor: fcResult.data?.errorMessage ? 'error.main' : 'success.main',
                                        maxHeight: '300px',
                                        overflow: 'auto',
                                      }}
                                    >
                                      <pre style={{ margin: 0, fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                        {JSON.stringify(fcResult.data || fcResult.error, null, 2)}
                                      </pre>
                                    </Paper>
                                  </Grid>
                                )}
                              </Grid>
                            </AccordionDetails>
                          </Accordion>
                        );
                      })}
                    </Stack>
                  ) : (
                    <Typography color="text.secondary">Function Call 데이터가 없습니다.</Typography>
                  )}
                </Stack>
              </TabPanel>

              {/* Audio Analysis Tab */}
              <TabPanel value={tabValue} index={3}>
                {qmDetail.result?.audioAnalyzeResult ? (
                  <AudioAnalysisView
                    result={qmDetail.result.audioAnalyzeResult}
                    prompt={qmDetail.input?.audioAnalysisPrompt}
                  />
                ) : (
                  <Typography color="text.secondary">오디오 분석 데이터가 없습니다.</Typography>
                )}
              </TabPanel>
            </Box>
          </Paper>

          {/* Metadata */}
          {qmDetail.result && (
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
          )}
        </>
      )
      }
    </Box >
  );
};

// 라벨 매핑 (알려진 키에 대한 한글 라벨, 없으면 키 이름 그대로 표시)
const LABEL_MAP: Record<string, string> = {
  // 대항목
  greeting: '인사',
  Language_Use: '언어 사용',
  Speed: '속도',
  VoiceProduction: '음성 표현',
  // 소항목
  opening: '첫인사',
  response: '인사 호응',
  additional_inquiry_check: '추가 문의 확인',
  closing: '끝인사',
  language_quality_score: '언어 품질 점수',
  inappropriate_vocabulary: '부적절한 어휘',
  Unpolite_Tone_Manner: '공손하지 않은 표현',
  bad_habits: '습관적 표현',
  Interruption_Analysis: '끼어들기 분석',
  pacing_understanding: '속도/이해도 분석',
  Tone_Manner: '어조/매너',
  handling_negativity: '부정적 상황 대처',
  active_listening: '적극적 경청',
  feedback_message: '피드백',
};

// 키 이름을 라벨로 변환 (매핑이 없으면 키 이름을 읽기 쉽게 변환)
const getLabel = (key: string): string => {
  if (LABEL_MAP[key]) return LABEL_MAP[key];
  // snake_case나 camelCase를 읽기 쉽게 변환
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (str) => str.toUpperCase());
};

// Status chip component
const StatusChip: React.FC<{ status: string }> = ({ status }) => {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'PASS':
        return { label: 'PASS', color: 'success' as const, icon: <CheckIcon fontSize="small" /> };
      case 'FAIL':
        return { label: 'FAIL', color: 'error' as const, icon: <ErrorIcon fontSize="small" /> };
      case 'N/A':
        return { label: 'N/A', color: 'default' as const, icon: <InfoIcon fontSize="small" /> };
      default:
        return { label: status, color: 'default' as const, icon: null };
    }
  };
  const config = getStatusConfig(status);
  return (
    <Chip
      size="small"
      label={config.label}
      color={config.color}
      icon={config.icon || undefined}
      sx={{ fontWeight: 600 }}
    />
  );
};

// 대항목 상태 레이블 및 색상 매핑
const getEvaluationStatusConfig = (status: EvaluationStatusType) => {
  switch (status) {
    case 'GEMINI_EVAL_COMPLETED':
      return {
        label: 'AI 평가 완료',
        color: 'info' as const,
        icon: <AIIcon fontSize="small" />,
        bgColor: 'info.50',
        borderColor: 'info.main',
      };
    case 'AGENT_OBJECTION_REQUESTED':
      return {
        label: '이의제기 요청',
        color: 'warning' as const,
        icon: <ObjectionIcon fontSize="small" />,
        bgColor: 'warning.50',
        borderColor: 'warning.main',
      };
    case 'QA_AGENT_OBJECTION_ACCEPTED':
      return {
        label: '이의제기 수용',
        color: 'success' as const,
        icon: <AcceptIcon fontSize="small" />,
        bgColor: 'success.50',
        borderColor: 'success.main',
      };
    case 'QA_AGENT_OBJECTION_REJECTED':
      return {
        label: '이의제기 거절',
        color: 'error' as const,
        icon: <RejectIcon fontSize="small" />,
        bgColor: 'error.50',
        borderColor: 'error.main',
      };
    default:
      return {
        label: status,
        color: 'default' as const,
        icon: <InfoIcon fontSize="small" />,
        bgColor: 'grey.50',
        borderColor: 'grey.300',
      };
  }
};

// 대항목 상태 칩 컴포넌트
const EvaluationStatusChip: React.FC<{ status: EvaluationStatusType }> = ({ status }) => {
  const config = getEvaluationStatusConfig(status);
  return (
    <Chip
      size="small"
      label={config.label}
      color={config.color}
      icon={config.icon}
      sx={{ fontWeight: 600 }}
    />
  );
};

// 상태 히스토리 컴포넌트
const StateHistoryView: React.FC<{ states: EvaluationState[] }> = ({ states }) => {
  if (!states || states.length === 0) return null;

  // seq 기준으로 정렬 (최신이 위로)
  const sortedStates = [...states].sort((a, b) => b.seq - a.seq);

  return (
    <Box sx={{ mt: 2, mb: 1 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <HistoryIcon fontSize="small" color="action" />
        <Typography variant="subtitle2" color="text.secondary">
          상태 히스토리
        </Typography>
      </Stack>
      <Box sx={{ pl: 1 }}>
        {sortedStates.map((state, index) => {
          const config = getEvaluationStatusConfig(state.status);
          const isLatest = index === 0;
          return (
            <Box
              key={state.seq}
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                mb: 1.5,
                position: 'relative',
                '&::before': index < sortedStates.length - 1 ? {
                  content: '""',
                  position: 'absolute',
                  left: '11px',
                  top: '24px',
                  bottom: '-12px',
                  width: '2px',
                  bgcolor: 'grey.300',
                } : undefined,
              }}
            >
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  bgcolor: isLatest ? `${config.color}.main` : 'grey.300',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mr: 1.5,
                  flexShrink: 0,
                  color: isLatest ? 'white' : 'grey.600',
                }}
              >
                {React.cloneElement(config.icon, {
                  fontSize: 'inherit',
                  sx: { fontSize: '14px' }
                })}
              </Box>
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography
                    variant="body2"
                    fontWeight={isLatest ? 600 : 400}
                    color={isLatest ? 'text.primary' : 'text.secondary'}
                  >
                    {config.label}
                  </Typography>
                  {isLatest && (
                    <Chip size="small" label="현재" variant="outlined" color="primary" sx={{ height: 20, fontSize: '0.7rem' }} />
                  )}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                  {state.status_reason}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

// 소항목 데이터 타입 판별 및 렌더링
const isStatusItem = (value: unknown): value is { status: string; reason: string } => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    'reason' in value &&
    typeof (value as Record<string, unknown>).status === 'string'
  );
};

const isEventList = (value: unknown): value is { events: EvaluationEvent[] } => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'events' in value &&
    Array.isArray((value as Record<string, unknown>).events)
  );
};

const hasEventsOrIssues = (value: unknown): value is { events?: EvaluationEvent[]; issues?: EvaluationEvent[]; summary?: Record<string, unknown> } => {
  return (
    typeof value === 'object' &&
    value !== null &&
    (('events' in value && Array.isArray((value as Record<string, unknown>).events)) ||
     ('issues' in value && Array.isArray((value as Record<string, unknown>).issues)))
  );
};

// 이벤트 렌더링 컴포넌트
const EventItemView: React.FC<{ event: EvaluationEvent }> = ({ event }) => {
  const timestamp = event.timestamp ||
    (event.timestamp_start && event.timestamp_end ? `${event.timestamp_start} ~ ${event.timestamp_end}` : '');

  return (
    <ListItem sx={{ px: 0, alignItems: 'flex-start' }}>
      <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
        <TimeIcon fontSize="small" color="action" />
      </ListItemIcon>
      <ListItemText
        primary={
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            {timestamp && (
              <Typography variant="body2" fontWeight={600}>
                {timestamp}
              </Typography>
            )}
            {event.type && <Chip size="small" label={event.type} variant="outlined" />}
            {event.category && <Chip size="small" label={event.category} variant="outlined" />}
            {event.judgment && <StatusChip status={event.judgment} />}
          </Stack>
        }
        secondary={
          <Box sx={{ mt: 0.5 }}>
            {event.detected_sentence && (
              <Typography variant="body2" color="error.main" sx={{ mb: 0.5 }}>
                감지: "{event.detected_sentence}"
              </Typography>
            )}
            {event.correction && (
              <Typography variant="body2" color="success.main" sx={{ mb: 0.5 }}>
                수정: "{event.correction}"
              </Typography>
            )}
            {event.content_context && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                상황: {event.content_context}
              </Typography>
            )}
            {event.analysis && (
              <Typography variant="body2" color="text.secondary">
                분석: {event.analysis}
              </Typography>
            )}
            {event.customer_reaction && (
              <Typography variant="body2" color="text.secondary">
                고객 반응: {event.customer_reaction}
              </Typography>
            )}
            {event.agent_response_quality && (
              <Typography variant="body2" color="text.secondary">
                상담사 대응: {event.agent_response_quality}
              </Typography>
            )}
          </Box>
        }
      />
    </ListItem>
  );
};

// 소항목 렌더링 컴포넌트
const SubItemRenderer: React.FC<{ itemKey: string; value: unknown }> = ({ itemKey, value }) => {
  const label = getLabel(itemKey);

  // feedback_message는 별도 처리
  if (itemKey === 'feedback_message' && typeof value === 'string') {
    return (
      <Alert severity="info" sx={{ mt: 2 }}>
        <Typography variant="body2">{value}</Typography>
      </Alert>
    );
  }

  // status + reason 형태의 항목
  if (isStatusItem(value)) {
    const cushionWords = (value as Record<string, unknown>).cushion_words_used as string[] | undefined;
    return (
      <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            {label}
          </Typography>
          <StatusChip status={value.status} />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
          {value.reason}
        </Typography>
        {cushionWords && cushionWords.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              사용한 쿠션 멘트:
            </Typography>
            {cushionWords.map((word, idx) => (
              <Chip key={idx} size="small" label={word} variant="outlined" color="primary" />
            ))}
          </Stack>
        )}
      </Box>
    );
  }

  // events 배열만 있는 경우
  if (isEventList(value)) {
    const events = value.events;
    return (
      <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            {label}
          </Typography>
          <Chip
            size="small"
            label={events.length > 0 ? `${events.length}건 감지` : '감지 없음'}
            color={events.length > 0 ? 'warning' : 'success'}
          />
        </Stack>
        {events.length > 0 ? (
          <List dense disablePadding>
            {events.map((event, idx) => (
              <EventItemView key={idx} event={event} />
            ))}
          </List>
        ) : (
          <Typography variant="body2" color="text.secondary">
            감지된 이벤트가 없습니다.
          </Typography>
        )}
      </Box>
    );
  }

  // summary + events/issues 형태 (복잡한 분석 항목)
  if (hasEventsOrIssues(value)) {
    const events = value.events || value.issues || [];
    const summary = value.summary as Record<string, unknown> | undefined;

    const summaryChips = [];
    if (summary?.grade) {
      summaryChips.push(<StatusChip key="grade" status={String(summary.grade)} />);
    }
    if (summary?.assessment) {
      summaryChips.push(
        <Chip
          key="assessment"
          size="small"
          label={String(summary.assessment)}
          color={summary.assessment === 'Fast' ? 'warning' : 'success'}
        />
      );
    }
    if (summary?.total_interruptions !== undefined) {
      summaryChips.push(
        <Chip key="interruptions" size="small" label={`${summary.total_interruptions}회`} variant="outlined" />
      );
    }
    if (summary?.re_explanation_requests !== undefined) {
      summaryChips.push(
        <Chip key="re_explanation" size="small" label={`재설명 요청 ${summary.re_explanation_requests}회`} variant="outlined" />
      );
    }

    return (
      <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
          <Typography variant="subtitle2" fontWeight={600}>
            {label}
          </Typography>
          {summaryChips}
        </Stack>
        {events.length > 0 && (
          <List dense disablePadding>
            {events.map((event, idx) => (
              <EventItemView key={idx} event={event as EvaluationEvent} />
            ))}
          </List>
        )}
      </Box>
    );
  }

  // 기타 - JSON으로 표시
  if (typeof value === 'object' && value !== null) {
    return (
      <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
          {label}
        </Typography>
        <Paper
          variant="outlined"
          sx={{
            p: 1,
            bgcolor: 'background.paper',
            maxHeight: '200px',
            overflow: 'auto',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
          }}
        >
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {JSON.stringify(value, null, 2)}
          </pre>
        </Paper>
      </Box>
    );
  }

  return null;
};

// Evaluation Detail View Component - 동적 렌더링
const EvaluationDetailView: React.FC<{ evaluationResult: EvaluationResult }> = ({
  evaluationResult,
}) => {
  const { details, summary } = evaluationResult;

  // 대항목 키 추출 (details의 키들)
  const sectionKeys = Object.keys(details);

  // summary에서 _result로 끝나는 키들 추출하여 대항목별 결과 매핑
  const getSectionResult = (sectionKey: string): string | undefined => {
    return summary[`${sectionKey}_result`];
  };

  return (
    <Stack spacing={3}>
      {/* Summary Section */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" fontWeight={600} gutterBottom>
          평가 요약
        </Typography>
        <Grid container spacing={2}>
          {sectionKeys.map((sectionKey) => {
            const result = getSectionResult(sectionKey);
            if (!result) return null;
            return (
              <Grid item xs={6} sm={3} key={sectionKey}>
                <Stack alignItems="center" spacing={1}>
                  <Typography variant="caption" color="text.secondary">
                    {getLabel(sectionKey)}
                  </Typography>
                  <StatusChip status={result} />
                </Stack>
              </Grid>
            );
          })}
        </Grid>
        {summary.score && (
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              종합 점수
            </Typography>
            <Typography
              variant="h4"
              fontWeight={700}
              color={
                parseInt(summary.score) >= 80
                  ? 'success.main'
                  : parseInt(summary.score) >= 60
                  ? 'warning.main'
                  : 'error.main'
              }
            >
              {summary.score}점
            </Typography>
          </Box>
        )}
      </Paper>

      {/* 대항목별 섹션 - 동적 렌더링 */}
      {sectionKeys.map((sectionKey) => {
        const sectionData = details[sectionKey];
        const sectionResult = getSectionResult(sectionKey);
        // states와 feedback_message 제외한 소항목들
        const subItemKeys = Object.keys(sectionData).filter((key) => key !== 'feedback_message' && key !== 'states');
        const feedbackMessage = sectionData.feedback_message as string | undefined;
        const states = sectionData.states as EvaluationState[] | undefined;
        // 현재 상태 (가장 최신 seq)
        const currentState = states && states.length > 0
          ? states.reduce((latest, current) => current.seq > latest.seq ? current : latest, states[0])
          : undefined;

        return (
          <Accordion key={sectionKey} defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ flexWrap: 'wrap' }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  {getLabel(sectionKey)}
                </Typography>
                {sectionResult && <StatusChip status={sectionResult} />}
                {currentState && (
                  <EvaluationStatusChip status={currentState.status} />
                )}
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              {/* 상태 히스토리 */}
              {states && states.length > 0 && (
                <StateHistoryView states={states} />
              )}
              {states && states.length > 0 && <Divider sx={{ my: 2 }} />}
              {/* 소항목들 렌더링 */}
              {subItemKeys.map((subItemKey) => (
                <SubItemRenderer
                  key={subItemKey}
                  itemKey={subItemKey}
                  value={sectionData[subItemKey]}
                />
              ))}
              {/* 피드백 메시지 */}
              {feedbackMessage && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  <Typography variant="body2">{feedbackMessage}</Typography>
                </Alert>
              )}
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Stack>
  );
};

// Audio Analysis Sub-component
const AudioAnalysisView: React.FC<{ result: AudioAnalyzeResult; prompt?: string }> = ({
  result,
  prompt,
}) => {
  // Parse body if available
  const parsedBody = React.useMemo(() => {
    if (!result.body) return null;
    try {
      return JSON.parse(result.body);
    } catch (e) {
      console.error('Failed to parse audio analysis body', e);
      return null;
    }
  }, [result.body]);

  // Try to parse audioAnalysisResponse if it is a JSON string
  const analysisResponse = React.useMemo(() => {
    if (!parsedBody?.audioAnalysisResponse) return null;
    try {
      if (typeof parsedBody.audioAnalysisResponse === 'string') {
        // Check if it looks like JSON
        if (parsedBody.audioAnalysisResponse.trim().startsWith('{')) {
          return JSON.parse(parsedBody.audioAnalysisResponse);
        }
        return parsedBody.audioAnalysisResponse;
      }
      return parsedBody.audioAnalysisResponse;
    } catch (e) {
      return parsedBody.audioAnalysisResponse;
    }
  }, [parsedBody]);

  // Merge structured data from result or parsed body/response
  const customerDissatisfaction =
    result.customer_dissatisfaction || analysisResponse?.customer_dissatisfaction;
  const agentInterruption =
    result.agent_interruption || analysisResponse?.agent_interruption;
  const summary = result.summary || analysisResponse?.summary;

  return (
    <Stack spacing={3}>
      {/* Input Prompt Section */}
      {prompt && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <InfoIcon color="info" />
            <Typography variant="subtitle1" fontWeight={600}>
              분석 프롬프트
            </Typography>
          </Stack>
          <Box
            sx={{
              p: 2,
              bgcolor: 'grey.50',
              borderRadius: 1,
              maxHeight: '200px',
              overflow: 'auto',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              whiteSpace: 'pre-wrap',
            }}
          >
            {prompt}
          </Box>
        </Paper>
      )}

      {/* Analysis Metadata from Parsed Body */}
      {parsedBody && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            분석 메타데이터
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">처리 시간</Typography>
              <Typography variant="body2">{parsedBody.processingTime?.toFixed(2)}s</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">총 토큰</Typography>
              <Typography variant="body2">{parsedBody.totalTokens?.toLocaleString()}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">입력 토큰</Typography>
              <Typography variant="body2">{parsedBody.inputTokens?.toLocaleString()}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">출력 토큰</Typography>
              <Typography variant="body2">{parsedBody.outputTokens?.toLocaleString()}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">Thinking 토큰</Typography>
              <Typography variant="body2">
                {((parsedBody.totalTokens || 0) - ((parsedBody.inputTokens || 0) + (parsedBody.outputTokens || 0))).toLocaleString()}
              </Typography>
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* Summary */}
      {(summary || result.summary) && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            분석 요약
          </Typography>
          <Typography variant="body2">{summary || result.summary}</Typography>
        </Paper>
      )}

      {/* Raw Response Text if we couldn't parse specific fields but have response */}
      {analysisResponse && !customerDissatisfaction && !agentInterruption && !summary && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            분석 결과 (Raw)
          </Typography>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              bgcolor: 'grey.50',
              maxHeight: '400px',
              overflow: 'auto',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              whiteSpace: 'pre-wrap',
            }}
          >
            {typeof analysisResponse === 'string'
              ? analysisResponse
              : JSON.stringify(analysisResponse, null, 2)}
          </Paper>
        </Paper>
      )}

      {/* Customer Dissatisfaction */}
      {customerDissatisfaction && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            {customerDissatisfaction.detected ? (
              <WarningIcon color="warning" />
            ) : (
              <CheckIcon color="success" />
            )}
            <Typography variant="subtitle1" fontWeight={600}>
              고객 불만족
            </Typography>
            <Chip
              size="small"
              label={customerDissatisfaction.detected ? '감지됨' : '감지 안됨'}
              color={customerDissatisfaction.detected ? 'warning' : 'success'}
            />
          </Stack>
          {customerDissatisfaction.detected && (
            <List dense>
              <ListItem>
                <ListItemIcon>
                  <InfoIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="심각도"
                  secondary={customerDissatisfaction.severity || '-'}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <InfoIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="사유"
                  secondary={customerDissatisfaction.reason || '-'}
                />
              </ListItem>
              {customerDissatisfaction.timestamp_range && (
                <ListItem>
                  <ListItemIcon>
                    <TimeIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="발생 구간"
                    secondary={customerDissatisfaction.timestamp_range}
                  />
                </ListItem>
              )}
            </List>
          )}
        </Paper>
      )}

      {/* Agent Interruption */}
      {agentInterruption && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            {agentInterruption.detected ? (
              <WarningIcon color="warning" />
            ) : (
              <CheckIcon color="success" />
            )}
            <Typography variant="subtitle1" fontWeight={600}>
              상담사 끼어들기
            </Typography>
            <Chip
              size="small"
              label={agentInterruption.detected ? '감지됨' : '감지 안됨'}
              color={agentInterruption.detected ? 'warning' : 'success'}
            />
          </Stack>
          {agentInterruption.detected && agentInterruption.instances && agentInterruption.instances.length > 0 && (
            <List dense>
              {agentInterruption.instances.map((instance: any, index: number) => (
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
      )}
    </Stack>
  );
};

export default QMAutomationDetail;
