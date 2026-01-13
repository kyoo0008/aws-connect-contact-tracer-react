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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Switch,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  Settings as SettingsIcon,
  PlayArrow as PlayIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useConfig } from '@/contexts/ConfigContext';
import {
  getQMAutomationListByContactId,
  requestQMAutomation,
  getStatusLabel,
  getStatusColor,
  pollQMAutomationUntilComplete,
} from '@/services/qmAutomationService';
import {
  QMAutomationListItem,
  QMAutomationRequestBody,
  QMStatus,
} from '@/types/qmAutomation.types';
import dayjs from 'dayjs';

const QMAutomationList: React.FC = () => {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const { config, isConfigured } = useConfig();
  const queryClient = useQueryClient();

  // State for new request dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [requestOptions, setRequestOptions] = useState<QMAutomationRequestBody>({
    contactId: contactId,
    model: 'gemini-2.5-pro',
    useDefaultPrompt: true,
    useTools: true,
    useAudioAnalysis: false,
    useContextCaching: false,
    temperature: 0,
    maxOutputTokens: 65535,
  });
  const [pollingRequestId, setPollingRequestId] = useState<string | null>(null);
  const [pollingStatus, setPollingStatus] = useState<QMStatus | null>(null);

  // Fetch QM Automation list
  const {
    data: qmList,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['qm-automation-list', contactId],
    queryFn: async () => {
      if (!contactId) throw new Error('Contact ID is required');
      return getQMAutomationListByContactId(contactId, config);
    },
    enabled: !!contactId && isConfigured,
  });

  // Mutation for creating new QM request
  const createQMMutation = useMutation({
    mutationFn: async (body: QMAutomationRequestBody) => {
      const response = await requestQMAutomation(body, config);
      return response;
    },
    onSuccess: async (response) => {
      setDialogOpen(false);
      setPollingRequestId(response.requestId);
      setPollingStatus('PENDING');

      // Start polling
      try {
        await pollQMAutomationUntilComplete(response.requestId, config, {
          onStatusChange: (status) => setPollingStatus(status),
        });
        // Refresh list after completion
        queryClient.invalidateQueries({ queryKey: ['qm-automation-list', contactId] });
      } catch (error) {
        console.error('Polling error:', error);
      } finally {
        setPollingRequestId(null);
        setPollingStatus(null);
      }
    },
  });

  const handleCreateRequest = () => {
    createQMMutation.mutate({
      ...requestOptions,
      contactId,
    });
  };

  const handleRowClick = (requestId: string) => {
    navigate(`/qm-automation/${contactId}/detail/${requestId}`);
  };

  // Validation checks
  if (!contactId) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">Contact ID가 제공되지 않았습니다.</Alert>
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
            <IconButton onClick={() => navigate(-1)}>
              <BackIcon />
            </IconButton>
            <Box>
              <Typography variant="h5" fontWeight={600}>
                QM Automation
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Contact ID: {contactId}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Tooltip title="새로고침">
              <IconButton onClick={() => refetch()}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setDialogOpen(true)}
              disabled={!!pollingRequestId}
            >
              새 QM 분석
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* Polling Progress */}
      {pollingRequestId && (
        <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <CircularProgress size={24} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" fontWeight={500}>
                QM 분석 진행 중...
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Request ID: {pollingRequestId}
              </Typography>
              <LinearProgress sx={{ mt: 1 }} />
            </Box>
            {pollingStatus && (
              <Chip
                label={getStatusLabel(pollingStatus)}
                color={getStatusColor(pollingStatus)}
                size="small"
              />
            )}
          </Stack>
        </Paper>
      )}

      {/* Loading */}
      {isLoading && (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <CircularProgress />
          <Typography sx={{ ml: 2 }}>QM 분석 목록을 불러오는 중...</Typography>
        </Box>
      )}

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          QM 분석 목록을 불러오는데 실패했습니다: {(error as Error).message}
        </Alert>
      )}

      {/* Empty State */}
      {!isLoading && !error && (!qmList || qmList.length === 0) && (
        <Paper elevation={0} sx={{ p: 4, textAlign: 'center', bgcolor: 'grey.50' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            QM 분석 기록이 없습니다
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            새 QM 분석을 요청하여 상담 품질을 평가해보세요.
          </Typography>
          <Button
            variant="contained"
            startIcon={<PlayIcon />}
            onClick={() => setDialogOpen(true)}
          >
            첫 번째 QM 분석 시작
          </Button>
        </Paper>
      )}

      {/* QM List Table */}
      {!isLoading && qmList && qmList.length > 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell>Request ID</TableCell>
                <TableCell>상태</TableCell>
                <TableCell>모델</TableCell>
                <TableCell>처리 시간</TableCell>
                <TableCell>생성일시</TableCell>
                <TableCell>완료일시</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[...qmList].sort((a, b) => {
                const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return dateB - dateA;
              }).map((item: QMAutomationListItem) => (
                <TableRow
                  key={item.requestId}
                  hover
                  onClick={() => handleRowClick(item.requestId)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {item.requestId.substring(0, 8)}...
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={getStatusLabel(item.status)}
                      color={getStatusColor(item.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {item.geminiModel || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {item.processingTime ? `${item.processingTime.toFixed(2)}초` : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {item.createdAt
                        ? dayjs(item.createdAt).format('YYYY-MM-DD HH:mm:ss')
                        : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {item.completedAt
                        ? dayjs(item.completedAt).format('YYYY-MM-DD HH:mm:ss')
                        : '-'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* New Request Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>새 QM 분석 요청</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>모델</InputLabel>
              <Select
                value={requestOptions.model}
                label="모델"
                onChange={(e) =>
                  setRequestOptions({ ...requestOptions, model: e.target.value })
                }
              >
                <MenuItem value="gemini-2.5-pro">Gemini 2.5 Pro (권장)</MenuItem>
                <MenuItem value="gemini-2.5-flash">Gemini 2.5 Flash</MenuItem>
                <MenuItem value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</MenuItem>
              </Select>
            </FormControl>

            <FormControlLabel
              control={
                <Switch
                  checked={requestOptions.useDefaultPrompt}
                  onChange={(e) =>
                    setRequestOptions({ ...requestOptions, useDefaultPrompt: e.target.checked })
                  }
                />
              }
              label="기본 QM 프롬프트 사용"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={requestOptions.useTools}
                  onChange={(e) =>
                    setRequestOptions({ ...requestOptions, useTools: e.target.checked })
                  }
                />
              }
              label="Tool/Function Calling 사용"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={requestOptions.useAudioAnalysis}
                  onChange={(e) =>
                    setRequestOptions({ ...requestOptions, useAudioAnalysis: e.target.checked })
                  }
                />
              }
              label="오디오 분석 사용"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={requestOptions.useContextCaching}
                  onChange={(e) =>
                    setRequestOptions({ ...requestOptions, useContextCaching: e.target.checked })
                  }
                />
              }
              label="Context Caching 사용 (비용 절감)"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>취소</Button>
          <Button
            variant="contained"
            onClick={handleCreateRequest}
            disabled={createQMMutation.isPending}
            startIcon={createQMMutation.isPending ? <CircularProgress size={16} /> : <PlayIcon />}
          >
            분석 시작
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default QMAutomationList;
