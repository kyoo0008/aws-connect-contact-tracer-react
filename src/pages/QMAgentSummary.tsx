import React, { useState } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Alert,
  TextField,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Divider,
  Grid,
  Stack,
  Slider,
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
  IconButton,
} from '@mui/material';
import {
  Search as SearchIcon,
  Person as PersonIcon,
  TrendingUp as TrendingUpIcon,
  CheckCircle as PassIcon,
  Warning as WarningIcon,
  Cancel as FailIcon,
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useMutation } from '@tanstack/react-query';
import { useConfig } from '@/contexts/ConfigContext';
import {
  getAgentEvaluationSummaryList,
  getAgentEvaluationSummaryDetail,
  requestAgentEvaluationSummary,
} from '@/services/qmAutomationService';
import {
  AgentEvaluationSummaryItem,
  AgentEvaluationSummaryCategoryStats,
  AgentEvaluationSummaryListData,
} from '@/types/qmAutomation.types';

const categoryLabels: Record<string, string> = {
  greeting: '인사',
  speed: '어속/경청',
  proactivitiness: '적극성',
  proactivity: '적극성',
  // language_use: '언어 사용',
  languageUse: '언어 사용',
  // wait_management: '대기 관리',
  waitManagement: '대기 관리',
  efficiency: '효율성',
  // voice_production: '음성',
  voiceProduction: '음성',
  accuracy: '정확성',
  problemSolving: '문제 해결',
};

function getAchievementColor(rate: number): 'success' | 'warning' | 'error' {
  if (rate >= 80) return 'success';
  if (rate >= 50) return 'warning';
  return 'error';
}

function getScoreColor(score: number): string {
  if (score >= 90) return '#2e7d32';
  if (score >= 70) return '#ed6c02';
  return '#d32f2f';
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  } catch {
    return iso;
  }
}

const QMAgentSummary: React.FC = () => {
  const { config } = useConfig();
  const [agentUserName, setAgentUserName] = useState('');
  const [limit, setLimit] = useState<number>(10);
  const [listData, setListData] = useState<AgentEvaluationSummaryListData | null>(null);
  const [detailData, setDetailData] = useState<AgentEvaluationSummaryItem | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Modal state for POST analysis
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAgentUserName, setModalAgentUserName] = useState('');
  const [modalLimit, setModalLimit] = useState<number>(10);

  // List query
  const listMutation = useMutation({
    mutationFn: () =>
      getAgentEvaluationSummaryList(agentUserName.trim(), config, limit),
    onSuccess: (res) => {
      setListData(res.data);
      setShowDetail(false);
      setDetailData(null);
    },
  });

  // Detail query
  const detailMutation = useMutation({
    mutationFn: (params: { agentUserName: string; createdAt: string }) =>
      getAgentEvaluationSummaryDetail(params.agentUserName, params.createdAt, config),
    onSuccess: (res) => {
      setDetailData(res.data);
      setShowDetail(true);
    },
  });

  // POST analysis request
  const analysisMutation = useMutation({
    mutationFn: () =>
      requestAgentEvaluationSummary(
        { agentUserName: modalAgentUserName.trim(), limit: modalLimit },
        config
      ),
    onSuccess: () => {
      setModalOpen(false);
      // Refresh list if same agent
      if (modalAgentUserName.trim() === agentUserName.trim() && agentUserName.trim()) {
        listMutation.mutate();
      }
    },
  });

  const handleSearch = () => {
    if (!agentUserName.trim()) return;
    listMutation.mutate();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleRowClick = (item: AgentEvaluationSummaryItem) => {
    detailMutation.mutate({ agentUserName: item.agentUserName, createdAt: item.createdAt });
  };

  const handleBackToList = () => {
    setShowDetail(false);
    setDetailData(null);
  };

  const handleOpenModal = () => {
    setModalAgentUserName(agentUserName);
    setModalLimit(limit);
    analysisMutation.reset();
    setModalOpen(true);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 2 }}>
      <Typography variant="h5" fontWeight={600} gutterBottom>
        Agent Evaluation Summary
      </Typography>

      {/* Search Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            label="상담원 이메일 (agentUserName)"
            value={agentUserName}
            onChange={(e) => setAgentUserName(e.target.value)}
            onKeyDown={handleKeyPress}
            size="small"
            sx={{ minWidth: 320 }}
            placeholder="agent01@example.com"
          />
          <Box sx={{ width: 200 }}>
            <Typography variant="caption" color="text.secondary">
              조회 건수: {limit}
            </Typography>
            <Slider
              value={limit}
              onChange={(_, v) => setLimit(v as number)}
              min={1}
              max={100}
              size="small"
              valueLabelDisplay="auto"
            />
          </Box>
          <Button
            variant="contained"
            startIcon={<SearchIcon />}
            onClick={handleSearch}
            disabled={!agentUserName.trim() || listMutation.isPending}
          >
            조회
          </Button>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleOpenModal}
          >
            분석 요청
          </Button>
        </Stack>
      </Paper>

      {/* Loading */}
      {(listMutation.isPending || detailMutation.isPending) && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Error */}
      {listMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(listMutation.error as Error).message}
        </Alert>
      )}
      {detailMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(detailMutation.error as Error).message}
        </Alert>
      )}

      {/* Detail View */}
      {showDetail && detailData && (
        <Box>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={handleBackToList}
            sx={{ mb: 2 }}
          >
            목록으로
          </Button>
          <SummaryDetail data={detailData} />
        </Box>
      )}

      {/* List View */}
      {!showDetail && listData && (
        <Box>
          {listData.total === 0 ? (
            <Alert severity="info">
              {listData.agentUserName}에 대한 평가 요약이 없습니다.
            </Alert>
          ) : (
            <>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                {listData.agentUserName} — 총 {listData.total}건
              </Typography>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>생성일시</TableCell>
                      <TableCell align="center">평가 건수</TableCell>
                      <TableCell align="center">평균 점수</TableCell>
                      <TableCell>모델</TableCell>
                      <TableCell>종합 평가</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {listData.items.map((item) => (
                      <TableRow
                        key={item.sk}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => handleRowClick(item)}
                      >
                        <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                        <TableCell align="center">{item.evaluationCount}</TableCell>
                        <TableCell align="center">
                          {item.averageFinalScore != null ? (
                            <Chip
                              label={`${item.averageFinalScore}점`}
                              size="small"
                              sx={{
                                fontWeight: 700,
                                color: getScoreColor(item.averageFinalScore),
                                borderColor: getScoreColor(item.averageFinalScore),
                              }}
                              variant="outlined"
                            />
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">{item.geminiModel}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap sx={{ maxWidth: 400 }}>
                            {item.overallComment}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Box>
      )}

      {/* Analysis Request Modal */}
      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          분석 요청
          <IconButton
            onClick={() => setModalOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="상담원 이메일 (agentUserName)"
              value={modalAgentUserName}
              onChange={(e) => setModalAgentUserName(e.target.value)}
              size="small"
              fullWidth
              placeholder="agent01@example.com"
            />
            <Box>
              <Typography variant="caption" color="text.secondary">
                분석 대상 건수: {modalLimit}
              </Typography>
              <Slider
                value={modalLimit}
                onChange={(_, v) => setModalLimit(v as number)}
                min={1}
                max={100}
                size="small"
                valueLabelDisplay="auto"
              />
            </Box>
            {analysisMutation.isError && (
              <Alert severity="error">
                {(analysisMutation.error as Error).message}
              </Alert>
            )}
            {analysisMutation.isSuccess && (
              <Alert severity="success">분석 요청이 완료되었습니다.</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalOpen(false)}>취소</Button>
          <Button
            variant="contained"
            onClick={() => analysisMutation.mutate()}
            disabled={!modalAgentUserName.trim() || analysisMutation.isPending}
          >
            {analysisMutation.isPending ? <CircularProgress size={20} /> : '분석 요청'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

// ============ Detail View ============

interface SummaryDetailProps {
  data: AgentEvaluationSummaryItem;
}

const SummaryDetail: React.FC<SummaryDetailProps> = ({ data }) => (
  <Box>
    {/* Overview Card */}
    <Paper sx={{ p: 3, mb: 3 }}>
      <Stack direction="row" spacing={3} alignItems="center" sx={{ mb: 2 }}>
        <PersonIcon sx={{ fontSize: 40, color: 'primary.main' }} />
        <Box>
          <Typography variant="h6">{data.agentUserName}</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              label={`평가 ${data.evaluationCount}건`}
              size="small"
              color="primary"
              variant="outlined"
            />
            {data.averageFinalScore != null && (
              <Chip
                icon={<TrendingUpIcon />}
                label={`평균 ${data.averageFinalScore}점`}
                size="small"
                sx={{
                  fontWeight: 700,
                  color: getScoreColor(data.averageFinalScore),
                  borderColor: getScoreColor(data.averageFinalScore),
                }}
                variant="outlined"
              />
            )}
            <Chip
              label={formatDateTime(data.createdAt)}
              size="small"
              variant="outlined"
            />
            <Chip
              label={data.geminiModel}
              size="small"
              variant="outlined"
            />
          </Stack>
        </Box>
      </Stack>
      {data.overallComment && (
        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            종합 평가
          </Typography>
          <Typography variant="body2" sx={{ lineHeight: 1.8 }}>
            {data.overallComment}
          </Typography>
        </Paper>
      )}
    </Paper>

    {/* Category Cards */}
    {data.categories && (
      <Grid container spacing={2}>
        {Object.entries(data.categories).map(([categoryId, stats]) => (
          <Grid item xs={12} md={6} key={categoryId}>
            <CategoryCard categoryId={categoryId} stats={stats} />
          </Grid>
        ))}
      </Grid>
    )}
  </Box>
);

// ============ Category Card ============

interface CategoryCardProps {
  categoryId: string;
  stats: AgentEvaluationSummaryCategoryStats;
}

const CategoryCard: React.FC<CategoryCardProps> = ({ categoryId, stats }) => {
  const color = getAchievementColor(stats.achievementRate);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {categoryLabels[categoryId] || categoryId}
          </Typography>
          <Chip
            label={`${stats.achievementRate}%`}
            color={color}
            size="small"
            sx={{ fontWeight: 700 }}
          />
        </Stack>

        <LinearProgress
          variant="determinate"
          value={stats.achievementRate}
          color={color}
          sx={{ height: 8, borderRadius: 4, mb: 1.5 }}
        />

        <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
          <Chip icon={<PassIcon />} label={`PASS ${stats.pass}`} size="small" color="success" variant="outlined" />
          <Chip icon={<WarningIcon />} label={`WARN ${stats.warning}`} size="small" color="warning" variant="outlined" />
          <Chip icon={<FailIcon />} label={`FAIL ${stats.fail}`} size="small" color="error" variant="outlined" />
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            / {stats.total}건
          </Typography>
        </Stack>

        <Divider sx={{ my: 1 }} />

        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="success.main" fontWeight={600}>
            잘한 점
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, lineHeight: 1.6 }}>
            {stats.goodPoints}
          </Typography>
        </Box>

        <Box>
          <Typography variant="caption" color="error.main" fontWeight={600}>
            개선할 점
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, lineHeight: 1.6 }}>
            {stats.improvementPoints}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default QMAgentSummary;
