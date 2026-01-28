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
  Functions as FunctionIcon,
  AccessTime as TimeIcon,
  Token as TokenIcon,
  Gavel as ObjectionIcon,
  ThumbUp as AcceptIcon,
  ThumbDown as RejectIcon,
  History as HistoryIcon,
  Person as PersonIcon,
  SupervisorAccount as QAIcon,
  Business as BusinessIcon,
  Email as EmailIcon,
  Badge as BadgeIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useConfig } from '@/contexts/ConfigContext';
import {
  getQMAutomationStatus,
  getStatusLabel,
  getStatusColor,
  submitAgentConfirm,
  submitAgentObjection,
  submitQAFeedback,
  submitBulkAgentAction,
  submitBulkQAFeedback,
  EvaluationCategory,
  getQMEvaluationStatusLabel,
  getQMEvaluationStatusColor,
} from '@/services/qmAutomationService';
import EvaluationStateModal, {
  ModalAction,
  ModalSubmitData,
} from '@/components/EvaluationStateModal/EvaluationStateModal';
import BulkEvaluationModal, {
  BulkModalAction,
  BulkModalSubmitData,
  CategoryInfo,
} from '@/components/EvaluationStateModal/BulkEvaluationModal';
import {
  QMAutomationStatusResponse,
  FunctionCall,
  FunctionCallResultData,
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
  const { requestId } = useParams<{ requestId: string }>();
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
  if (!requestId) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">Request ID가 제공되지 않았습니다.</Alert>
        <Button onClick={() => navigate('/qm-automation')} startIcon={<BackIcon />} sx={{ mt: 2 }}>
          목록으로 돌아가기
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
            <IconButton onClick={() => navigate('/qm-automation')}>
              <BackIcon />
            </IconButton>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h5" fontWeight={600}>
                QM 분석 상세
              </Typography>
              <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  Request ID: {requestId}
                </Typography>
                {qmDetail && (
                  <>
                    <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                      Contact ID: {qmDetail.contactId || '-'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                      상담원 센터: {qmDetail.agentCenter || '-'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      상담 연결: {qmDetail.connectedToAgentTimestamp ? dayjs(qmDetail.connectedToAgentTimestamp).format('YYYY-MM-DD HH:mm:ss') : '-'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      최근 수정: {qmDetail.completedAt ? dayjs(qmDetail.completedAt).format('YYYY-MM-DD HH:mm:ss') : (qmDetail.createdAt ? dayjs(qmDetail.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-')}
                    </Typography>
                  </>
                )}
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                {qmDetail && (
                  <>
                    <Chip
                      label={`Gemini 평가 상태: ${getStatusLabel(qmDetail.status)}`}
                      color={getStatusColor(qmDetail.status)}
                    />
                    {qmDetail.qmEvaluationStatus && (
                      <Tooltip title="QM 평가 상태">
                        <Chip
                          size="small"
                          label={`QM 평가 상태: ${getQMEvaluationStatusLabel(qmDetail.qmEvaluationStatus)}`}
                          variant="outlined"
                          color={getQMEvaluationStatusColor(qmDetail.qmEvaluationStatus)}
                        />
                      </Tooltip>
                    )}
                    <Tooltip title="상담원 확인 여부">
                      <Chip
                        size="small"
                        label={`상담원 확인 여부: ${qmDetail.agentConfirmYN}`}
                        variant="outlined"
                        color={qmDetail.agentConfirmYN === 'Y' ? 'success' : 'default'}
                      />
                    </Tooltip>
                    <Tooltip title="QA 피드백 여부">
                      <Chip
                        size="small"
                        label={`QA 피드백 여부: ${qmDetail.qaFeedbackYN}`}
                        variant="outlined"
                        color={qmDetail.qaFeedbackYN === 'Y' ? 'success' : 'default'}
                      />
                    </Tooltip>
                  </>
                )}
                <Tooltip title="새로고침">
                  <IconButton onClick={() => refetch()}>
                    <RefreshIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>
          </Stack>


        </Stack>
      </Paper>

      {/* Agent & QA Information Cards */}
      {qmDetail && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {/* Agent Information Card */}
          <Grid item xs={12} md={6}>
            <Card elevation={2}>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                  <PersonIcon color="primary" />
                  <Typography variant="h6" fontWeight={600}>
                    상담사 정보
                  </Typography>
                </Stack>
                <Divider sx={{ mb: 2 }} />
                <Stack spacing={1.5}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <BadgeIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                      이름
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {qmDetail.agentUserFullName || '-'}
                    </Typography>
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <EmailIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                      이메일
                    </Typography>
                    <Typography variant="body2" fontWeight={500} sx={{ fontFamily: 'monospace' }}>
                      {qmDetail.agentUserName || '-'}
                    </Typography>
                  </Stack>
                  {/* <Stack direction="row" alignItems="center" spacing={1}>
                    <BusinessIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                      센터
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {qmDetail.agentCenter || '-'}
                    </Typography>
                  </Stack> */}
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <InfoIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                      Agent ID
                    </Typography>
                    <Typography variant="body2" fontWeight={500} sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {qmDetail.agentId || '-'}
                    </Typography>
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <CheckIcon fontSize="small" sx={{ color: qmDetail.agentConfirmYN === 'Y' ? 'success.main' : 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                      확인 여부
                    </Typography>
                    <Chip
                      size="small"
                      label={qmDetail.agentConfirmYN === 'Y' ? '확인됨' : '미확인'}
                      color={qmDetail.agentConfirmYN === 'Y' ? 'success' : 'default'}
                      variant="outlined"
                    />
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          {/* QA Information Card */}
          <Grid item xs={12} md={6}>
            <Card elevation={2}>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                  <QAIcon color="secondary" />
                  <Typography variant="h6" fontWeight={600}>
                    QA 담당자 정보
                  </Typography>
                </Stack>
                <Divider sx={{ mb: 2 }} />
                <Stack spacing={1.5}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <BadgeIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                      이름
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {qmDetail.qaAgentUserFullName || '-'}
                    </Typography>
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <EmailIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                      이메일
                    </Typography>
                    <Typography variant="body2" fontWeight={500} sx={{ fontFamily: 'monospace' }}>
                      {qmDetail.qaAgentUserName || '-'}
                    </Typography>
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <InfoIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                      QA User ID
                    </Typography>
                    <Typography variant="body2" fontWeight={500} sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {qmDetail.qaAgentUserId || '-'}
                    </Typography>
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <CheckIcon fontSize="small" sx={{ color: qmDetail.qaFeedbackYN === 'Y' ? 'success.main' : 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>
                      피드백 여부
                    </Typography>
                    <Chip
                      size="small"
                      label={qmDetail.qaFeedbackYN === 'Y' ? '완료' : '미완료'}
                      color={qmDetail.qaFeedbackYN === 'Y' ? 'success' : 'default'}
                      variant="outlined"
                    />
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

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
                        return (qmTime + toolTime).toFixed(2);
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
                        return (qmTokens + toolTokens).toLocaleString();
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
              <Tab label="AI 평가 분석 결과" />
              <Tab label="평가 상세" disabled={!qmDetail.result?.evaluationResult} />
              <Tab label="Function Calls" disabled={!qmDetail.input?.toolResult} />
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
                  <EvaluationDetailView
                    evaluationResult={qmDetail.result.evaluationResult}
                    requestId={requestId}
                    onStateChange={() => refetch()}
                    defaultUserId={qmDetail.agentId}
                    defaultUserName={qmDetail.agentUserName}
                  />
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

// DynamoDB 형식 데이터를 JavaScript 객체로 변환하는 유틸리티 함수
const convertDynamoDBValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  const obj = value as Record<string, unknown>;

  // DynamoDB 타입 체크
  if ('S' in obj && Object.keys(obj).length === 1) {
    return obj.S; // String
  }
  if ('N' in obj && Object.keys(obj).length === 1) {
    const num = parseFloat(obj.N as string);
    return isNaN(num) ? obj.N : num; // Number
  }
  if ('BOOL' in obj && Object.keys(obj).length === 1) {
    return obj.BOOL; // Boolean
  }
  if ('NULL' in obj && Object.keys(obj).length === 1) {
    return null; // Null
  }
  if ('L' in obj && Object.keys(obj).length === 1) {
    // List
    return (obj.L as unknown[]).map(item => convertDynamoDBValue(item));
  }
  if ('M' in obj && Object.keys(obj).length === 1) {
    // Map
    const map = obj.M as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(map)) {
      result[key] = convertDynamoDBValue(map[key]);
    }
    return result;
  }

  // 일반 객체 (재귀적으로 처리)
  if (Array.isArray(value)) {
    return value.map(item => convertDynamoDBValue(item));
  }

  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    result[key] = convertDynamoDBValue(obj[key]);
  }
  return result;
};

// 라벨 매핑 (알려진 키에 대한 한글 라벨, 없으면 키 이름 그대로 표시)
const LABEL_MAP: Record<string, string> = {
  // 대항목
  greeting: '인사',
  languageUse: '언어 사용',
  speed: '속도',
  voiceProduction: '음성 표현',
  accuracy: '정확성',
  efficiency: '효율성',
  proactivity: '적극성',
  waitManagement: '대기 관리',
  // 인사 소항목
  opening: '첫인사',
  response: '인사 호응',
  additionalInquiryCheck: '추가 문의 확인',
  closing: '끝인사',
  // 언어 사용 소항목
  languageQualityScore: '언어 품질 점수',
  inappropriateVocabulary: '부적절한 어휘',
  unpoliteToneManner: '공손하지 않은 표현',
  badHabits: '습관적 표현',
  // 속도 소항목
  interruptionAnalysis: '끼어들기 분석',
  pacingUnderstanding: '속도/이해도 분석',
  // 음성 표현 소항목
  toneManner: '어조/매너',
  handlingNegativity: '부정적 상황 대처',
  activeListening: '적극적 경청',
  // 정확성 소항목
  accuracyScore: '정확성 점수',
  accuracyIssues: '정확성 문제',
  completenessCheck: '완결성 확인',
  explanationStructure: '설명 구조',
  // 효율성 소항목
  efficiencyScore: '효율성 점수',
  callPurposeClarification: '통화 목적 파악',
  inefficiencyDetection: '비효율 감지',
  processCompliance: '프로세스 준수',
  // 적극성 소항목
  proactivityScore: '적극성 점수',
  concreteExplanationCheck: '구체적 설명 확인',
  additionalServiceOffer: '추가 서비스 제안',
  // 대기 관리 소항목
  waitManagementScore: '대기 관리 점수',
  holdTimeManagement: '홀드 시간 관리',
  waitNotification: '대기 안내',
  holdProcessEvaluation: '대기 처리 평가',
  // 프로세스 준수 세부
  aiccEfficiencyCheck: 'AICC 효율성 체크',
  leadingStandardProcessCheck: '표준 프로세스 준수',
  // 증거 컨텍스트
  triggerSituation: '트리거 상황',
  agentClarifyingQuestion: '상담원 확인 질문',
  customerConfirmation: '고객 확인',
  // 공통
  feedbackMessage: '피드백',
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
    case 'AGENT_CONFIRM_COMPLETED':
      return {
        label: '상담원 확인 완료',
        color: 'info' as const,
        icon: <InfoIcon fontSize="small" />,
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
                <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                  <Typography
                    variant="body2"
                    fontWeight={isLatest ? 600 : 400}
                    color={isLatest ? 'text.primary' : 'text.secondary'}
                  >
                    {config.label}
                  </Typography>
                  {state.evaluationStatus && (
                    <StatusChip status={state.evaluationStatus} />
                  )}
                  {isLatest && (
                    <Chip size="small" label="현재" variant="outlined" color="primary" sx={{ height: 20, fontSize: '0.7rem' }} />
                  )}
                </Stack>
                {state.statusReason && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                    {state.statusReason}
                  </Typography>
                )}
                {/* updatedAt, updatedBy 표시 */}
                <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap">
                  {state.updatedAt && (
                    <Typography variant="caption" color="text.disabled">
                      {dayjs(state.updatedAt).format('YYYY-MM-DD HH:mm:ss')}
                    </Typography>
                  )}
                  {state.updatedBy && (
                    <Typography variant="caption" color="text.disabled">
                      by {state.updatedBy}
                    </Typography>
                  )}
                </Stack>
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

// 점수+레벨 형태 (accuracyScore, efficiencyScore 등)
const isScoreWithLevel = (value: unknown): value is { score: string; level: string } => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'score' in value &&
    'level' in value
  );
};

// 완결성 체크 (completenessCheck)
const isCompletenessCheck = (value: unknown): value is { status: string; finalRecapTimestamp?: string; recapContent?: string } => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    ('finalRecapTimestamp' in value || 'recapContent' in value)
  );
};

// 설명 구조 (explanationStructure)
const isExplanationStructure = (value: unknown): value is { rating: string; analysis: string } => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'rating' in value &&
    'analysis' in value
  );
};

// 통화 목적 파악 (callPurposeClarification)
const isCallPurposeClarification = (value: unknown): value is {
  clarificationQuality: string;
  identifiedPurpose: string;
  evidenceContext?: Record<string, unknown>;
} => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'clarificationQuality' in value &&
    'identifiedPurpose' in value
  );
};

// 비효율 감지 (inefficiencyDetection)
const isInefficiencyDetection = (value: unknown): value is {
  summary: { repetitionCount?: number; misunderstandingCount?: number };
  details: Array<Record<string, unknown>>;
} => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;

  if (!('summary' in v) || !('details' in v) || !Array.isArray(v.details)) return false;

  // summary 내부의 고유 키 확인
  const summary = v.summary as Record<string, unknown>;
  return 'repetitionCount' in summary || 'misunderstandingCount' in summary;
};

// 프로세스 준수 (processCompliance)
const isProcessCompliance = (value: unknown): value is Record<string, { status: string; violationDetail?: string; missingScript?: string }> => {
  if (typeof value !== 'object' || value === null) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length > 0 && entries.every(([, v]) =>
    typeof v === 'object' && v !== null && 'status' in v
  );
};

// 구체적 설명 체크 (concreteExplanationCheck)
const isConcreteExplanationCheck = (value: unknown): value is {
  situationInquiryPerformed: boolean;
  executionGuidanceQuality: string;
  analysisLog?: string;
} => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'situationInquiryPerformed' in value &&
    'executionGuidanceQuality' in value
  );
};

// 대기 처리 평가 (holdProcessEvaluation)
interface HoldProcessDetail {
  seq: number;
  durationSec: number;
  gapStartTime: string;
  gapEndTime: string;
  holdType: string;
  isPreHoldValid: boolean;
  isPostHoldValid: boolean;
  preHoldContent: string;
  postHoldContent: string;
}

interface HoldProcessEvaluation {
  details: HoldProcessDetail[];
  summary: {
    finalResult: string;
    totalHoldsDetected: number;
    violationLongHold: number;
    violationShortHold: number;
  };
}

const isHoldProcessEvaluation = (value: unknown): value is HoldProcessEvaluation => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!('details' in v) || !('summary' in v)) return false;
  if (!Array.isArray(v.details)) return false;
  // holdProcessEvaluation 특정 필드 확인 (finalResult, totalHoldsDetected 등)
  const summary = v.summary as Record<string, unknown> | undefined;
  if (!summary || typeof summary !== 'object') return false;
  return 'finalResult' in summary || 'totalHoldsDetected' in summary || 'violationLongHold' in summary;
};

// 정확성 이슈 (accuracyIssues)
const isAccuracyIssues = (value: unknown): value is {
  summary: { misinformationConflictCount?: number; arbitraryJudgmentCount?: number };
  details: Array<Record<string, unknown>>;
} => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;

  if (!('summary' in v) || !('details' in v) || !Array.isArray(v.details)) return false;

  // summary 내부의 고유 키 확인
  const summary = v.summary as Record<string, unknown>;
  return 'misinformationConflictCount' in summary || 'arbitraryJudgmentCount' in summary;
};

// 이벤트 렌더링 컴포넌트
const EventItemView: React.FC<{ event: EvaluationEvent }> = ({ event }) => {
  const timestamp = event.timestamp ||
    (event.timestampStart && event.timestampEnd ? `${event.timestampStart} ~ ${event.timestampEnd}` : '');

  // 감지된 내용
  const detectedContent = event.detectedSentence ||
    (event as Record<string, unknown>).detectedWord;

  // 수정 제안
  const correctionContent = event.correction ||
    (event as Record<string, unknown>).suggestedCorrection;

  // 컨텍스트
  const contextContent = event.contentContext ||
    (event as Record<string, unknown>).context;

  // 습관적 표현 관련 필드 (badHabits)
  const habitType = (event as Record<string, unknown>).habitType as string | undefined;
  const habitContent = (event as Record<string, unknown>).content as string | undefined;
  const habitCount = (event as Record<string, unknown>).count as number | undefined;

  // 오류 문장/이유 (languageQualityScore)
  const errorSentence = (event as Record<string, unknown>).errorSentence as string | undefined;
  const reason = (event as Record<string, unknown>).reason as string | undefined;

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
            {habitType && <Chip size="small" label={habitType} color="warning" variant="outlined" />}
            {event.judgment && <StatusChip status={event.judgment} />}
            {habitCount !== undefined && habitCount > 1 && (
              <Chip size="small" label={`${habitCount}회`} color="error" />
            )}
          </Stack>
        }
        secondary={
          <>
            {/* 습관적 표현 (badHabits) */}
            {habitContent && (
              <Typography component="span" variant="body2" color="warning.main" sx={{ display: 'block', mb: 0.5, fontWeight: 500 }}>
                습관적 표현: "{habitContent}"
              </Typography>
            )}
            {/* 오류 문장 (languageQualityScore) */}
            {errorSentence && (
              <Typography component="span" variant="body2" color="error.main" sx={{ display: 'block', mb: 0.5 }}>
                오류: "{errorSentence}"
              </Typography>
            )}
            {reason && (
              <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                이유: {reason}
              </Typography>
            )}
            {detectedContent && (
              <Typography component="span" variant="body2" color="error.main" sx={{ display: 'block', mb: 0.5 }}>
                감지: "{String(detectedContent)}"
              </Typography>
            )}
            {correctionContent && (
              <Typography component="span" variant="body2" color="success.main" sx={{ display: 'block', mb: 0.5 }}>
                수정 제안: "{String(correctionContent)}"
              </Typography>
            )}
            {contextContent && (
              <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontStyle: 'italic' }}>
                상황: {String(contextContent)}
              </Typography>
            )}
            {event.analysis && (
              <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                분석: {event.analysis}
              </Typography>
            )}
            {event.customerReaction && (
              <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                고객 반응: {event.customerReaction}
              </Typography>
            )}
            {event.agentResponseQuality && (
              <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                상담사 대응: {event.agentResponseQuality}
              </Typography>
            )}
          </>
        }
      />
    </ListItem>
  );
};

// 레벨에 따른 색상 가져오기
const getLevelColor = (level: string): 'success' | 'warning' | 'error' | 'info' | 'default' => {
  switch (level.toUpperCase()) {
    case 'GOOD':
    case 'EXCELLENT':
    case 'DETAILED':
    case 'LOGICAL':
      return 'success';
    case 'WARNING':
    case 'AVERAGE':
    case 'MODERATE':
      return 'warning';
    case 'POOR':
    case 'CRITICAL':
    case 'FAIL':
      return 'error';
    default:
      return 'info';
  }
};

// 소항목 렌더링 컴포넌트
const SubItemRenderer: React.FC<{ itemKey: string; value: unknown }> = ({ itemKey, value: rawValue }) => {
  const label = getLabel(itemKey);

  // DynamoDB 형식 데이터를 JavaScript 객체로 변환
  const value = convertDynamoDBValue(rawValue);

  // feedbackMessage는 별도 처리
  if (itemKey === 'feedbackMessage' && typeof value === 'string') {
    return (
      <Alert severity="info" sx={{ mt: 2 }}>
        <Typography variant="body2">{value}</Typography>
      </Alert>
    );
  }

  // 점수+레벨 형태 (accuracyScore, efficiencyScore 등)
  if (isScoreWithLevel(value)) {
    const numScore = parseInt(value.score);
    return (
      <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            {label}
          </Typography>
          <Chip
            size="small"
            label={`${value.score}점`}
            sx={{
              fontWeight: 600,
              bgcolor: numScore >= 80 ? 'success.100' : numScore >= 60 ? 'warning.100' : 'error.100',
              color: numScore >= 80 ? 'success.dark' : numScore >= 60 ? 'warning.dark' : 'error.dark',
            }}
          />
          <Chip size="small" label={value.level} color={getLevelColor(value.level)} variant="outlined" />
        </Stack>
      </Box>
    );
  }

  // 완결성 체크 (completenessCheck)
  if (isCompletenessCheck(value)) {
    return (
      <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            {label}
          </Typography>
          <StatusChip status={value.status} />
        </Stack>
        {value.finalRecapTimestamp && (
          <Typography variant="body2" color="text.secondary">
            최종 확인 시점: {value.finalRecapTimestamp}
          </Typography>
        )}
        {value.recapContent && (
          <Typography variant="body2" color="text.secondary">
            확인 내용: {value.recapContent}
          </Typography>
        )}
      </Box>
    );
  }

  // 설명 구조 (explanationStructure)
  if (isExplanationStructure(value)) {
    return (
      <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            {label}
          </Typography>
          <Chip size="small" label={value.rating} color={getLevelColor(value.rating)} />
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
          {value.analysis}
        </Typography>
      </Box>
    );
  }

  // 통화 목적 파악 (callPurposeClarification)
  if (isCallPurposeClarification(value)) {
    return (
      <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            {label}
          </Typography>
          <Chip size="small" label={value.clarificationQuality} color={getLevelColor(value.clarificationQuality)} />
        </Stack>
        <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
          파악된 목적: {value.identifiedPurpose}
        </Typography>
        {value.evidenceContext && (
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.paper' }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              증거 컨텍스트
            </Typography>
            {Object.entries(value.evidenceContext).map(([k, v]) => (
              <Typography key={k} variant="body2" color="text.secondary" sx={{ mb: 0.25 }}>
                <strong>{getLabel(k)}:</strong> {String(v)}
              </Typography>
            ))}
          </Paper>
        )}
      </Box>
    );
  }

  // 비효율 감지 (inefficiencyDetection)
  if (isInefficiencyDetection(value)) {
    const { summary, details } = value;
    return (
      <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
          <Typography variant="subtitle2" fontWeight={600}>
            {label}
          </Typography>
          {summary.repetitionCount !== undefined && (
            <Chip size="small" label={`반복 ${summary.repetitionCount}회`} variant="outlined" color={summary.repetitionCount > 0 ? 'warning' : 'success'} />
          )}
          {summary.misunderstandingCount !== undefined && (
            <Chip size="small" label={`오해 ${summary.misunderstandingCount}회`} variant="outlined" color={summary.misunderstandingCount > 0 ? 'warning' : 'success'} />
          )}
        </Stack>
        {details.length > 0 && (
          <List dense disablePadding>
            {details.map((detail, idx) => (
              <ListItem key={idx} sx={{ px: 0, alignItems: 'flex-start' }}>
                <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
                  <WarningIcon fontSize="small" color="warning" />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <>
                      {detail.timestamp && (
                        <Typography component="span" variant="body2" fontWeight={600} sx={{ mr: 1 }}>
                          {String(detail.timestamp)}
                        </Typography>
                      )}
                      {detail.issueType && <Chip size="small" label={String(detail.issueType)} variant="outlined" />}
                    </>
                  }
                  secondary={
                    <>
                      {detail.conversationSnippet && (
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', fontStyle: 'italic', mb: 0.5 }}>
                          "{String(detail.conversationSnippet)}"
                        </Typography>
                      )}
                      {detail.causeAnalysis && (
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                          원인: {String(detail.causeAnalysis)}
                        </Typography>
                      )}
                    </>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    );
  }

  // 정확성 이슈 (accuracyIssues)
  if (isAccuracyIssues(value)) {
    const { summary, details } = value;
    return (
      <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
          <Typography variant="subtitle2" fontWeight={600}>
            {label}
          </Typography>
          {summary.misinformationConflictCount !== undefined && (
            <Chip size="small" label={`잘못된 정보 ${summary.misinformationConflictCount}건`} variant="outlined" color={summary.misinformationConflictCount > 0 ? 'error' : 'success'} />
          )}
          {summary.arbitraryJudgmentCount !== undefined && (
            <Chip size="small" label={`임의 판단 ${summary.arbitraryJudgmentCount}건`} variant="outlined" color={summary.arbitraryJudgmentCount > 0 ? 'warning' : 'success'} />
          )}
        </Stack>
        {details.length > 0 ? (
          <List dense disablePadding>
            {details.map((detail, idx) => (
              <ListItem key={idx} sx={{ px: 0 }}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <ErrorIcon fontSize="small" color="error" />
                </ListItemIcon>
                <ListItemText
                  primary={JSON.stringify(detail)}
                />
              </ListItem>
            ))}
          </List>
        ) : (
          <Typography variant="body2" color="success.main">
            정확성 문제가 감지되지 않았습니다.
          </Typography>
        )}
      </Box>
    );
  }

  // 프로세스 준수 (processCompliance)
  if (isProcessCompliance(value)) {
    return (
      <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
          {label}
        </Typography>
        <Stack spacing={1}>
          {Object.entries(value).map(([checkKey, checkValue]) => (
            <Paper key={checkKey} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.paper' }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <Typography variant="body2" fontWeight={500}>
                  {getLabel(checkKey)}
                </Typography>
                <StatusChip status={checkValue.status} />
              </Stack>
              {checkValue.violationDetail && (
                <Typography variant="caption" color="text.secondary">
                  {checkValue.violationDetail}
                </Typography>
              )}
              {checkValue.missingScript && (
                <Typography variant="caption" color="text.secondary">
                  누락 스크립트: {checkValue.missingScript}
                </Typography>
              )}
            </Paper>
          ))}
        </Stack>
      </Box>
    );
  }

  // 구체적 설명 체크 (concreteExplanationCheck)
  if (isConcreteExplanationCheck(value)) {
    return (
      <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
          <Typography variant="subtitle2" fontWeight={600}>
            {label}
          </Typography>
          <Chip
            size="small"
            label={value.situationInquiryPerformed ? '상황 파악 수행' : '상황 파악 미수행'}
            color={value.situationInquiryPerformed ? 'success' : 'warning'}
          />
          <Chip size="small" label={value.executionGuidanceQuality} color={getLevelColor(value.executionGuidanceQuality)} />
        </Stack>
        {value.analysisLog && (
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
            {value.analysisLog}
          </Typography>
        )}
      </Box>
    );
  }

  // 대기 처리 평가 (holdProcessEvaluation)
  if (isHoldProcessEvaluation(value)) {
    const { details, summary } = value;
    const totalViolations = (summary.violationLongHold || 0) + (summary.violationShortHold || 0);
    return (
      <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
          <Typography variant="subtitle2" fontWeight={600}>
            {label}
          </Typography>
          <StatusChip status={summary.finalResult} />
          <Chip size="small" label={`총 ${summary.totalHoldsDetected}건 감지`} variant="outlined" />
          {totalViolations > 0 && (
            <Chip size="small" label={`위반 ${totalViolations}건`} color="error" />
          )}
        </Stack>

        {/* 요약 정보 */}
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: 'background.paper' }}>
          <Stack direction="row" spacing={3} flexWrap="wrap">
            <Typography variant="body2">
              <strong>긴 대기 위반:</strong> {summary.violationLongHold || 0}건
            </Typography>
            <Typography variant="body2">
              <strong>짧은 대기 위반:</strong> {summary.violationShortHold || 0}건
            </Typography>
          </Stack>
        </Paper>

        {/* 상세 내역 */}
        {details.length > 0 && (
          <Stack spacing={1.5}>
            {details.map((detail, idx) => {
              const hasPreViolation = !detail.isPreHoldValid && detail.preHoldContent !== '없음';
              const hasPostViolation = !detail.isPostHoldValid;
              const isLongHold = detail.holdType?.includes('LONG');

              return (
                <Paper
                  key={idx}
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    bgcolor: 'background.paper',
                    borderColor: (hasPreViolation || hasPostViolation) ? 'warning.main' : 'divider',
                    borderWidth: (hasPreViolation || hasPostViolation) ? 2 : 1,
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
                    <Typography variant="body2" fontWeight={600}>
                      #{detail.seq}
                    </Typography>
                    <Chip
                      size="small"
                      label={`${detail.gapStartTime} ~ ${detail.gapEndTime}`}
                      variant="outlined"
                      icon={<TimeIcon />}
                    />
                    <Chip
                      size="small"
                      label={`${detail.durationSec}초`}
                      color={isLongHold ? 'error' : 'warning'}
                    />
                    <Chip
                      size="small"
                      label={detail.holdType}
                      variant="outlined"
                      color={isLongHold ? 'error' : 'default'}
                    />
                  </Stack>

                  <Grid container spacing={2}>
                    {/* 대기 전 멘트 */}
                    <Grid item xs={12} md={6}>
                      <Box sx={{ p: 1, bgcolor: detail.isPreHoldValid ? 'success.50' : 'warning.50', borderRadius: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                          <Typography variant="caption" fontWeight={600}>
                            대기 전 멘트
                          </Typography>
                          {detail.isPreHoldValid ? (
                            <CheckIcon fontSize="small" color="success" />
                          ) : (
                            <WarningIcon fontSize="small" color="warning" />
                          )}
                        </Stack>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {detail.preHoldContent || '없음'}
                        </Typography>
                      </Box>
                    </Grid>

                    {/* 대기 후 멘트 */}
                    <Grid item xs={12} md={6}>
                      <Box sx={{ p: 1, bgcolor: detail.isPostHoldValid ? 'success.50' : 'warning.50', borderRadius: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                          <Typography variant="caption" fontWeight={600}>
                            대기 후 멘트
                          </Typography>
                          {detail.isPostHoldValid ? (
                            <CheckIcon fontSize="small" color="success" />
                          ) : (
                            <WarningIcon fontSize="small" color="warning" />
                          )}
                        </Stack>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {detail.postHoldContent || '없음'}
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Box>
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

// 점수 색상 가져오기
const getScoreColor = (score: number): string => {
  if (score >= 80) return 'success.main';
  if (score >= 60) return 'warning.main';
  return 'error.main';
};

// 점수 칩 컴포넌트
const ScoreChip: React.FC<{ score: string | number; label?: string }> = ({ score, label }) => {
  const numScore = typeof score === 'string' ? parseInt(score) : score;
  return (
    <Chip
      size="small"
      label={label ? `${label}: ${score}점` : `${score}점`}
      sx={{
        fontWeight: 600,
        bgcolor: numScore >= 80 ? 'success.100' : numScore >= 60 ? 'warning.100' : 'error.100',
        color: numScore >= 80 ? 'success.dark' : numScore >= 60 ? 'warning.dark' : 'error.dark',
      }}
    />
  );
};

// 종료 상태 Set - 상태 다이어그램 기준
const TERMINAL_STATUSES = new Set([
  'AGENT_CONFIRM_COMPLETED',
  'QA_AGENT_OBJECTION_ACCEPTED',
  'QA_AGENT_OBJECTION_REJECTED',
]);

// Evaluation Detail View Component - 동적 렌더링
interface EvaluationDetailViewProps {
  evaluationResult: EvaluationResult;
  requestId: string;
  onStateChange: () => void;
  defaultUserId?: string;
  defaultUserName?: string;
}

const EvaluationDetailView: React.FC<EvaluationDetailViewProps> = ({
  evaluationResult,
  requestId,
  onStateChange,
  defaultUserId,
  defaultUserName,
}) => {
  const { config } = useConfig();
  const { details, summary } = evaluationResult;

  // 단건 모달 상태 관리
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<ModalAction>('confirm');
  const [selectedCategory, setSelectedCategory] = useState<EvaluationCategory>('greeting');
  const [selectedCategoryLabel, setSelectedCategoryLabel] = useState('');
  const [selectedCurrentStatus, setSelectedCurrentStatus] = useState('');
  const [selectedEvaluationStatus, setSelectedEvaluationStatus] = useState<string | undefined>();

  // 벌크 모달 상태 관리
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkModalAction, setBulkModalAction] = useState<BulkModalAction>('bulk-confirm');

  // 모달 열기
  const handleOpenModal = (
    action: ModalAction,
    category: EvaluationCategory,
    categoryLabel: string,
    currentStatus: string,
    evaluationStatus?: string
  ) => {
    setModalAction(action);
    setSelectedCategory(category);
    setSelectedCategoryLabel(categoryLabel);
    setSelectedCurrentStatus(currentStatus);
    setSelectedEvaluationStatus(evaluationStatus);
    setModalOpen(true);
  };

  // 벌크 모달 열기
  const handleOpenBulkModal = (action: BulkModalAction) => {
    setBulkModalAction(action);
    setBulkModalOpen(true);
  };

  // 모달 제출 처리
  const handleModalSubmit = async (data: ModalSubmitData) => {
    const { action, category, reason, userId, userName } = data;

    if (action === 'confirm') {
      await submitAgentConfirm(
        { requestId, category, userId, userName },
        config
      );
    } else if (action === 'objection') {
      await submitAgentObjection(
        { requestId, category, reason, userId, userName },
        config
      );
    } else if (action === 'qa-accept') {
      await submitQAFeedback(
        { requestId, category, action: 'accept', reason, userId, userName },
        config
      );
    } else if (action === 'qa-reject') {
      await submitQAFeedback(
        { requestId, category, action: 'reject', reason, userId, userName },
        config
      );
    }

    // 상태 변경 후 데이터 새로고침
    onStateChange();
  };

  // 벌크 모달 제출 처리
  const handleBulkModalSubmit = async (data: BulkModalSubmitData) => {
    const { action, actions, userId, userName } = data;

    let response;
    if (action === 'bulk-confirm' || action === 'bulk-objection') {
      response = await submitBulkAgentAction(
        { requestId, actions: actions as any, userId, userName },
        config
      );
    } else {
      response = await submitBulkQAFeedback(
        { requestId, actions: actions as any, userId, userName },
        config
      );
    }

    // 상태 변경 후 데이터 새로고침
    onStateChange();

    return response.results;
  };

  // 대항목 키 추출 (details의 키들) - 알파벳 순 정렬
  const sectionKeys = Object.keys(details).sort((a, b) => a.localeCompare(b));

  // summary에서 Result/Score 키들 추출하여 대항목별 결과/점수 매핑
  const getSectionResult = (sectionKey: string): string | undefined => {
    // camelCase 변환 (첫 글자 대문자)
    const capitalizedKey = sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1);
    return summary[`${sectionKey}Result`] || summary[`${capitalizedKey}Result`] || summary[`${sectionKey}_result`];
  };

  const getSectionScore = (sectionKey: string): string | undefined => {
    const capitalizedKey = sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1);
    return summary[`${sectionKey}Score`] || summary[`${capitalizedKey}Score`] || summary[`${sectionKey}_score`];
  };

  // 총점 계산
  const totalScore = React.useMemo(() => {
    const scores = sectionKeys
      .map(key => getSectionScore(key))
      .filter((s): s is string => !!s)
      .map(s => parseInt(s));
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [sectionKeys, summary]);

  // 벌크 모달용 카테고리 정보 생성
  const categoryInfoList: CategoryInfo[] = React.useMemo(() => {
    return sectionKeys.map((key) => {
      const sectionData = details[key];
      const states = sectionData.states as EvaluationState[] | undefined;
      const currentState = states && states.length > 0
        ? states.reduce((latest, current) => current.seq > latest.seq ? current : latest, states[0])
        : undefined;

      return {
        key,
        label: getLabel(key),
        currentStatus: currentState?.status || '',
        evaluationStatus: currentState?.evaluationStatus,
        states,
      };
    });
  }, [sectionKeys, details]);

  // 벌크 액션 가능 여부 계산
  const bulkActionAvailability = React.useMemo(() => {
    let confirmCount = 0;
    let objectionCount = 0;
    let qaFeedbackCount = 0;

    categoryInfoList.forEach((cat) => {
      const currentState = cat.states && cat.states.length > 0
        ? cat.states.reduce((latest, current) => current.seq > latest.seq ? current : latest, cat.states[0])
        : undefined;

      if (currentState && !TERMINAL_STATUSES.has(currentState.status)) {
        if (currentState.status === 'GEMINI_EVAL_COMPLETED') {
          confirmCount++;
          if (currentState.evaluationStatus === 'FAIL') {
            objectionCount++;
          }
        } else if (currentState.status === 'AGENT_OBJECTION_REQUESTED') {
          qaFeedbackCount++;
        }
      }
    });

    return { confirmCount, objectionCount, qaFeedbackCount };
  }, [categoryInfoList]);

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
            const score = getSectionScore(sectionKey);
            return (
              <Grid item xs={6} sm={3} key={sectionKey}>
                <Stack alignItems="center" spacing={1}>
                  <Typography variant="caption" color="text.secondary">
                    {getLabel(sectionKey)}
                  </Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    {result && <StatusChip status={result} />}
                    {score && <ScoreChip score={score} />}
                  </Stack>
                </Stack>
              </Grid>
            );
          })}
        </Grid>
        {totalScore !== null && (
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              평균 점수
            </Typography>
            <Typography
              variant="h4"
              fontWeight={700}
              color={getScoreColor(totalScore)}
            >
              {totalScore}점
            </Typography>
          </Box>
        )}
      </Paper>

      {/* 벌크 액션 버튼 섹션 */}
      {(bulkActionAvailability.confirmCount > 0 ||
        bulkActionAvailability.objectionCount > 0 ||
        bulkActionAvailability.qaFeedbackCount > 0) && (
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
            <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
              <Typography variant="subtitle2" fontWeight={600}>
                일괄 처리:
              </Typography>

              {bulkActionAvailability.confirmCount > 0 && (
                <Button
                  size="small"
                  variant="outlined"
                  color="success"
                  startIcon={<CheckIcon />}
                  onClick={() => handleOpenBulkModal('bulk-confirm')}
                >
                  일괄 확인 ({bulkActionAvailability.confirmCount})
                </Button>
              )}

              {bulkActionAvailability.objectionCount > 0 && (
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  startIcon={<ObjectionIcon />}
                  onClick={() => handleOpenBulkModal('bulk-objection')}
                >
                  일괄 이의제기 ({bulkActionAvailability.objectionCount})
                </Button>
              )}

              {bulkActionAvailability.qaFeedbackCount > 0 && (
                <>
                  <Divider orientation="vertical" flexItem />
                  <Typography variant="body2" color="text.secondary">
                    QA 피드백:
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    color="success"
                    startIcon={<AcceptIcon />}
                    onClick={() => handleOpenBulkModal('bulk-qa-accept')}
                  >
                    일괄 승인 ({bulkActionAvailability.qaFeedbackCount})
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<RejectIcon />}
                    onClick={() => handleOpenBulkModal('bulk-qa-reject')}
                  >
                    일괄 거절 ({bulkActionAvailability.qaFeedbackCount})
                  </Button>
                </>
              )}
            </Stack>
          </Paper>
        )}

      {/* 대항목별 섹션 - 동적 렌더링 */}
      {sectionKeys.map((sectionKey) => {
        const sectionData = details[sectionKey];
        const sectionResult = getSectionResult(sectionKey);
        const sectionScore = getSectionScore(sectionKey);
        // states, feedbackMessage, *Score 키 제외한 소항목들
        const subItemKeys = Object.keys(sectionData).filter((key) =>
          key !== 'feedbackMessage' &&
          key !== 'states' &&
          !key.toLowerCase().endsWith('score')
        );
        const feedbackMessage = sectionData.feedbackMessage as string | undefined;
        const states = sectionData.states as EvaluationState[] | undefined;
        // 현재 상태 (가장 최신 seq)
        const currentState = states && states.length > 0
          ? states.reduce((latest, current) => current.seq > latest.seq ? current : latest, states[0])
          : undefined;

        // 상태에 따른 버튼 표시 여부 결정
        const isTerminalState = currentState && TERMINAL_STATUSES.has(currentState.status);
        const isGeminiCompleted = currentState?.status === 'GEMINI_EVAL_COMPLETED';
        const isObjectionRequested = currentState?.status === 'AGENT_OBJECTION_REQUESTED';
        const isFail = currentState?.evaluationStatus === 'FAIL';
        const categoryLabel = getLabel(sectionKey);

        return (
          <Accordion key={sectionKey} defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ flexWrap: 'wrap' }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  {categoryLabel}
                </Typography>
                {sectionResult && <StatusChip status={sectionResult} />}
                {sectionScore && <ScoreChip score={sectionScore} />}
                {currentState && (
                  <EvaluationStatusChip status={currentState.status} />
                )}
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              {/* 액션 버튼 섹션 */}
              {!isTerminalState && (
                <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1, border: '1px dashed', borderColor: 'grey.300' }}>
                  <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
                    <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
                      상태 변경:
                    </Typography>

                    {/* 상담사 확인 버튼 - GEMINI_EVAL_COMPLETED 상태에서만 */}
                    {isGeminiCompleted && (
                      <Button
                        size="small"
                        variant="outlined"
                        color="success"
                        startIcon={<CheckIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenModal(
                            'confirm',
                            sectionKey as EvaluationCategory,
                            categoryLabel,
                            currentState?.status || '',
                            currentState?.evaluationStatus
                          );
                        }}
                      >
                        확인
                      </Button>
                    )}

                    {/* 상담사 이의제기 버튼 - GEMINI_EVAL_COMPLETED 상태이고 FAIL인 경우만 */}
                    {isGeminiCompleted && isFail && (
                      <Button
                        size="small"
                        variant="outlined"
                        color="warning"
                        startIcon={<ObjectionIcon />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenModal(
                            'objection',
                            sectionKey as EvaluationCategory,
                            categoryLabel,
                            currentState?.status || '',
                            currentState?.evaluationStatus
                          );
                        }}
                      >
                        이의제기
                      </Button>
                    )}

                    {/* QA 피드백 버튼 - AGENT_OBJECTION_REQUESTED 상태에서만 */}
                    {isObjectionRequested && (
                      <>
                        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                        <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
                          QA 피드백:
                        </Typography>
                        <Button
                          size="small"
                          variant="outlined"
                          color="success"
                          startIcon={<AcceptIcon />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenModal(
                              'qa-accept',
                              sectionKey as EvaluationCategory,
                              categoryLabel,
                              currentState?.status || '',
                              currentState?.evaluationStatus
                            );
                          }}
                        >
                          승인
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          startIcon={<RejectIcon />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenModal(
                              'qa-reject',
                              sectionKey as EvaluationCategory,
                              categoryLabel,
                              currentState?.status || '',
                              currentState?.evaluationStatus
                            );
                          }}
                        >
                          거절
                        </Button>
                      </>
                    )}

                    {/* 종료 상태 안내 */}
                    {!isGeminiCompleted && !isObjectionRequested && (
                      <Typography variant="caption" color="text.secondary">
                        현재 상태에서는 변경할 수 없습니다.
                      </Typography>
                    )}
                  </Stack>
                </Box>
              )}

              {/* 종료 상태 안내 */}
              {isTerminalState && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  이 카테고리는 종료 상태입니다. 더 이상 상태를 변경할 수 없습니다.
                </Alert>
              )}

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

      {/* 상태 변경 모달 */}
      <EvaluationStateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleModalSubmit}
        action={modalAction}
        category={selectedCategory}
        categoryLabel={selectedCategoryLabel}
        currentStatus={selectedCurrentStatus}
        evaluationStatus={selectedEvaluationStatus}
        defaultUserId={defaultUserId}
        defaultUserName={defaultUserName}
      />

      {/* 벌크 상태 변경 모달 */}
      <BulkEvaluationModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onSubmit={handleBulkModalSubmit}
        action={bulkModalAction}
        categories={categoryInfoList}
        defaultUserId={defaultUserId}
        defaultUserName={defaultUserName}
      />
    </Stack>
  );
};


export default QMAutomationDetail;
