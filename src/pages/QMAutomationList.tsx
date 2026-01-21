import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  TextField,
  TablePagination,
  TableSortLabel,
  Collapse,
  Grid,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  Settings as SettingsIcon,
  PlayArrow as PlayIcon,
  Search as SearchIcon,
  FilterList as FilterListIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useConfig } from '@/contexts/ConfigContext';
import {
  getQMAutomationListSearch,
  QMAutomationSearchFilters,
  requestQMAutomation,
  getStatusLabel,
  getStatusColor,
} from '@/services/qmAutomationService';
import {
  QMAutomationListItem,
  QMAutomationRequestBody,
} from '@/types/qmAutomation.types';
import dayjs, { Dayjs } from 'dayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

const DEFAULT_TOOL_DEFINITIONS_JSON = JSON.stringify([
  {
    "functionDeclarations": [
      {
        "name": "DOB_Authenticate",
        "description": "상담사가 고객에게 본인 확인을 요청/질문한 경우 1회 호출합니다. 본인 확인 질문/요청 시점에 호출하세요. 확인 완료 여부와 무관합니다. 예: 생년월일 확인 부탁드립니다, 본인 확인을 위해 생년월일 말씀해주세요, 고객님 성함과 생년월일 확인 부탁드려요",
        "parameters": {
          "type": "OBJECT",
          "properties": {
            "transcriptAuthenticated": {
              "type": "BOOLEAN",
              "description": "본인 확인 요청 여부 (true: 요청함, false: 요청하지 않음)"
            },
            "transcriptAgent_confirmation": {
              "type": "STRING",
              "description": "상담사가 본인 확인을 요청한 발화 내용"
            }
          },
          "required": [
            "transcriptAuthenticated"
          ]
        },
        "enabled": true
      },
      {
        "name": "PNR_Itinerary_Detected",
        "description": "상담 전체를 분석하여 최종 확정된 여정만 호출합니다. 중복 호출 금지. \\n            - 왕복: 가는 편 1회 + 오는 편 1회 = 최대 2회 \\n            - 편도: 1회만 호출 \\n            - 출발지(from), 도착지(to), 날짜(date)가 모두 명확한 경우에만 호출 \\n            - 대화 중 언급된 모든 날짜/장소가 아닌, 최종 확정된 여정만 호출 \\n \\n            **중요: 파라미터는 반드시 아래 형식으로 추출** \\n            - transcriptFrom, transcriptTo: IATA 3-letter 공항코드 (예: ICN, LAX, NRT) \\n            - transcriptDate: DDMMYY 형식 (예: 301225) \\n            - 대화에서 년도가 언급되지 않은 경우 #{currentYear}년을 기준으로 합니다. (오늘: #{currentDateKorean})",
        "parameters": {
          "type": "OBJECT",
          "properties": {
            "transcriptFrom": {
              "type": "STRING",
              "description": "IATA 3-letter 공항코드 (예: ICN, GMP, LAX, JFK). 도시명이 언급된 경우 해당 주요 공항코드로 변환"
            },
            "transcriptTo": {
              "type": "STRING",
              "description": "IATA 3-letter 공항코드 (예: ICN, GMP, LAX, JFK). 도시명이 언급된 경우 해당 주요 공항코드로 변환"
            },
            "transcriptDate": {
              "type": "STRING",
              "description": "출발 날짜를 DDMMYY 형식으로 (예: 301225). 상대적 표현(내일, 다음주)은 절대 날짜로 변환 필요"
            }
          },
          "required": [
            "transcriptFrom",
            "transcriptTo",
            "transcriptDate"
          ]
        },
        "enabled": false
      }
    ]
  }
], null, 2);

const QMAutomationList: React.FC = () => {
  const navigate = useNavigate();
  const { config, isConfigured } = useConfig();
  const queryClient = useQueryClient();

  // State for new request dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [requestOptions, setRequestOptions] = useState<QMAutomationRequestBody>({
    contactId: '',
    model: 'gemini-2.5-flash',
    useDefaultPrompt: true,
    prompt: '',
    useThinking: true,
    thinkingBudget: 24576,
    useTools: true,
    useDefaultToolDefinitions: true,
    useAudioAnalysis: false,
    useContextCaching: false,
    temperature: 0,
    maxOutputTokens: 65535,
  });
  const [toolDefinitionsJson, setToolDefinitionsJson] = useState(DEFAULT_TOOL_DEFINITIONS_JSON);

  // Search Date Range State (Default: Last 30 days)
  const [startDate, setStartDate] = useState<Dayjs | null>(dayjs().subtract(30, 'day'));
  const [endDate, setEndDate] = useState<Dayjs | null>(dayjs());

  // Search Filters State (for input fields)
  const [searchFilters, setSearchFilters] = useState<QMAutomationSearchFilters>({
    contactId: '',
    agentUserName: '',
    agentCenter: '',
    agentConfirmYN: undefined,
    qaFeedbackYN: undefined,
    qmEvaluationStatus: '',
  });
  // Applied filters (used in query)
  const [appliedFilters, setAppliedFilters] = useState<QMAutomationSearchFilters>({
    contactId: '',
    agentUserName: '',
    agentCenter: '',
    agentConfirmYN: undefined,
    qaFeedbackYN: undefined,
    qmEvaluationStatus: '',
  });
  const [appliedStartDate, setAppliedStartDate] = useState<Dayjs | null>(dayjs().subtract(30, 'day'));
  const [appliedEndDate, setAppliedEndDate] = useState<Dayjs | null>(dayjs());
  const [showFilters, setShowFilters] = useState(true);

  // Pagination state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Sorting state
  type Order = 'asc' | 'desc';
  type OrderBy = 'connectedToAgentTimestamp' | 'totalProcessingTime' | 'updatedAt' | null;
  const [order, setOrder] = useState<Order>('desc');
  const [orderBy, setOrderBy] = useState<OrderBy>('updatedAt');

  const handleRequestSort = (property: Exclude<OrderBy, null>) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const getProcessingTime = (item: QMAutomationListItem) => {
    const qmTime = Number(item.result?.processingTime ?? item.processingTime ?? 0);
    const toolTime = Number(item.input?.toolResult?.processingTime ?? 0);

    return qmTime + toolTime;
  };

  // Handle search action
  const handleSearch = () => {
    setAppliedFilters({ ...searchFilters });
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setPage(0);
  };

  // Handle Enter key in search fields
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Fetch QM Automation list
  const {
    data: qmList,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      'qm-automation-list',
      appliedStartDate?.format('YYYYMM'),
      appliedEndDate?.format('YYYYMM'),
      appliedFilters.contactId,
      appliedFilters.agentUserName,
      appliedFilters.agentCenter,
      appliedFilters.agentConfirmYN,
      appliedFilters.qaFeedbackYN,
      appliedFilters.qmEvaluationStatus,
    ],
    queryFn: async () => {
      // Search with filters
      if (!appliedStartDate || !appliedEndDate) return [];
      const filters: QMAutomationSearchFilters = {
        startMonth: appliedStartDate.format('YYYYMM'),
        endMonth: appliedEndDate.format('YYYYMM'),
      };
      if (appliedFilters.contactId) filters.contactId = appliedFilters.contactId;
      if (appliedFilters.agentUserName) filters.agentUserName = appliedFilters.agentUserName;
      if (appliedFilters.agentCenter) filters.agentCenter = appliedFilters.agentCenter;
      if (appliedFilters.agentConfirmYN) filters.agentConfirmYN = appliedFilters.agentConfirmYN;
      if (appliedFilters.qaFeedbackYN) filters.qaFeedbackYN = appliedFilters.qaFeedbackYN;
      if (appliedFilters.qmEvaluationStatus) filters.qmEvaluationStatus = appliedFilters.qmEvaluationStatus;

      return getQMAutomationListSearch(config, filters);
    },
    enabled: isConfigured,
  });

  // Mutation for creating new QM request
  const createQMMutation = useMutation({
    mutationFn: async (body: QMAutomationRequestBody) => {
      const response = await requestQMAutomation(body, config);
      return response;
    },
    onSuccess: (response) => {
      setDialogOpen(false);
      // Navigate to detail page with requestId from response
      navigate(`/qm-automation/detail/${response.requestId}`);
    },
    onError: (error: Error) => {
      // Error will be displayed in the UI via createQMMutation.error
      console.error('QM Automation creation failed:', error);
    },
  });

  const handleCreateRequest = () => {
    let finalToolDefinitions = undefined;
    // IF Use Default Tool Definitions is FALSE (meaning Custom), we parse the JSON
    if (requestOptions.useTools && !requestOptions.useDefaultToolDefinitions) {
      try {
        finalToolDefinitions = JSON.parse(toolDefinitionsJson);
      } catch (e) {
        alert('Tool Definitions JSON 형식이 올바르지 않습니다.');
        return;
      }
    }

    createQMMutation.mutate({
      ...requestOptions,
      contactId: requestOptions.contactId,
      toolDefinitions: finalToolDefinitions,
    });
  };

  const handleRowClick = (requestId: string) => {
    navigate(`/qm-automation/detail/${requestId}`);
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

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
      {/* Header & Search */}
      <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
          <Stack direction="row" alignItems="center" spacing={2} sx={{ flex: 1 }}>
            <IconButton onClick={() => navigate(-1)}>
              <BackIcon />
            </IconButton>
            <Box>
              <Typography variant="h5" fontWeight={600}>
                QM Evaluation
              </Typography>
            </Box>

            {/* Search Controls Container */}
            <Stack direction="row" spacing={2} alignItems="center" sx={{ ml: 4, flex: 1 }}>

              <Stack direction="row" spacing={1} alignItems="center">
                <DatePicker
                  label="Start Date"
                  value={startDate}
                  format="YYYY-MM-DD"
                  onChange={(newValue) => setStartDate(newValue)}
                  slotProps={{ textField: { size: 'small', sx: { width: 170 } } }}
                />
                <Typography>-</Typography>
                <DatePicker
                  label="End Date"
                  value={endDate}
                  format="YYYY-MM-DD"
                  onChange={(newValue) => setEndDate(newValue)}
                  slotProps={{ textField: { size: 'small', sx: { width: 170 } } }}
                />
              </Stack>


              <Button
                variant="contained"
                size="medium"
                onClick={handleSearch}
                startIcon={<SearchIcon />}
                sx={{ minWidth: '80px' }}
              >
                검색
              </Button>
            </Stack>
          </Stack>

          <Stack direction="row" spacing={1}>
            <Tooltip title="필터">
              <IconButton
                onClick={() => setShowFilters(!showFilters)}
                color={showFilters ? 'primary' : 'default'}
              >
                <FilterListIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="새로고침">
              <IconButton onClick={() => refetch()}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>

            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setDialogOpen(true)}
              disabled={createQMMutation.isPending}
            >
              새 QM 분석
            </Button>

          </Stack>
        </Stack>

        {/* Advanced Filters */}
        <Collapse in={showFilters}>
          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  size="small"
                  fullWidth
                  label="Contact ID"
                  placeholder="예: 12345678-..."
                  value={searchFilters.contactId || ''}
                  onChange={(e) =>
                    setSearchFilters({ ...searchFilters, contactId: e.target.value })
                  }
                  onKeyDown={handleKeyDown}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  size="small"
                  fullWidth
                  label="상담사 (Username)"
                  placeholder="예: user@example.com"
                  value={searchFilters.agentUserName || ''}
                  onChange={(e) =>
                    setSearchFilters({ ...searchFilters, agentUserName: e.target.value })
                  }
                  onKeyDown={handleKeyDown}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <TextField
                  size="small"
                  fullWidth
                  label="센터"
                  placeholder="예: Seoul"
                  value={searchFilters.agentCenter || ''}
                  onChange={(e) =>
                    setSearchFilters({ ...searchFilters, agentCenter: e.target.value })
                  }
                  onKeyDown={handleKeyDown}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <FormControl size="small" fullWidth>
                  <InputLabel>상담원 확인</InputLabel>
                  <Select
                    value={searchFilters.agentConfirmYN || ''}
                    label="상담원 확인"
                    onChange={(e) =>
                      setSearchFilters({
                        ...searchFilters,
                        agentConfirmYN: e.target.value as 'Y' | 'N' | undefined || undefined,
                      })
                    }
                  >
                    <MenuItem value="">전체</MenuItem>
                    <MenuItem value="Y">확인됨</MenuItem>
                    <MenuItem value="N">미확인</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <FormControl size="small" fullWidth>
                  <InputLabel>QA 피드백</InputLabel>
                  <Select
                    value={searchFilters.qaFeedbackYN || ''}
                    label="QA 피드백"
                    onChange={(e) =>
                      setSearchFilters({
                        ...searchFilters,
                        qaFeedbackYN: e.target.value as 'Y' | 'N' | undefined || undefined,
                      })
                    }
                  >
                    <MenuItem value="">전체</MenuItem>
                    <MenuItem value="Y">피드백 있음</MenuItem>
                    <MenuItem value="N">피드백 없음</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={2}>
                <FormControl size="small" fullWidth>
                  <InputLabel>평가 상태</InputLabel>
                  <Select
                    value={searchFilters.qmEvaluationStatus || ''}
                    label="평가 상태"
                    onChange={(e) =>
                      setSearchFilters({
                        ...searchFilters,
                        qmEvaluationStatus: e.target.value || undefined,
                      })
                    }
                  >
                    <MenuItem value="">전체</MenuItem>
                    <MenuItem value="COMPLETED">완료</MenuItem>
                    <MenuItem value="PENDING">대기</MenuItem>
                    <MenuItem value="PROCESSING">처리중</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<ClearIcon />}
                  onClick={() =>
                    setSearchFilters({
                      contactId: '',
                      agentUserName: '',
                      agentCenter: '',
                      agentConfirmYN: undefined,
                      qaFeedbackYN: undefined,
                      qmEvaluationStatus: '',
                    })
                  }
                >
                  필터 초기화
                </Button>
              </Grid>
            </Grid>
          </Box>
        </Collapse>
      </Paper>

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
            기간을 조정하거나 새 QM 분석을 요청하세요.
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
        <>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>Request ID</TableCell>
                  <TableCell>Contact ID</TableCell>
                  <TableCell>센터</TableCell>
                  <TableCell>상담사</TableCell>
                  <TableCell>상태</TableCell>
                  <TableCell>상담원 확인</TableCell>
                  <TableCell>QA 피드백</TableCell>
                  <TableCell>모델</TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={orderBy === 'connectedToAgentTimestamp'}
                      direction={orderBy === 'connectedToAgentTimestamp' ? order : 'asc'}
                      onClick={() => handleRequestSort('connectedToAgentTimestamp')}
                    >
                      상담 연결 일시
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={orderBy === 'totalProcessingTime'}
                      direction={orderBy === 'totalProcessingTime' ? order : 'asc'}
                      onClick={() => handleRequestSort('totalProcessingTime')}
                    >
                      총 처리 시간
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={orderBy === 'updatedAt'}
                      direction={orderBy === 'updatedAt' ? order : 'asc'}
                      onClick={() => handleRequestSort('updatedAt')}
                    >
                      최근 평가 수정 일시
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...qmList]
                  .sort((a, b) => {
                    // orderBy가 null이면 정렬하지 않음
                    if (!orderBy) return 0;

                    let comparison = 0;
                    if (orderBy === 'connectedToAgentTimestamp') {
                      const dateA = new Date(a.connectedToAgentTimestamp || 0).getTime();
                      const dateB = new Date(b.connectedToAgentTimestamp || 0).getTime();
                      comparison = dateA - dateB;
                    } else if (orderBy === 'updatedAt') {
                      const dateA = new Date(a.completedAt || a.createdAt || 0).getTime();
                      const dateB = new Date(b.completedAt || b.createdAt || 0).getTime();
                      comparison = dateA - dateB;
                    } else if (orderBy === 'totalProcessingTime') {
                      comparison = getProcessingTime(a) - getProcessingTime(b);
                    }
                    return order === 'desc' ? -comparison : comparison;
                  })
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((item: QMAutomationListItem) => (
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
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {item.contactId ? `${item.contactId.substring(0, 8)}...` : '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 100 }}>
                          {item.agentCenter || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                          {item.agentUserName || '-'}
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
                        <Chip
                          label={item.agentConfirmYN === 'Y' ? '확인됨' : '미확인'}
                          color={item.agentConfirmYN === 'Y' ? 'success' : 'default'}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={item.qaFeedbackYN === 'Y' ? '있음' : '없음'}
                          color={item.qaFeedbackYN === 'Y' ? 'info' : 'default'}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {item.geminiModel || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {item.connectedToAgentTimestamp
                            ? dayjs(item.connectedToAgentTimestamp).format('YYYY-MM-DD HH:mm:ss')
                            : '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {(() => {
                            const qmTime = Number(item.result?.processingTime ?? item.processingTime ?? 0);
                            const toolTime = Number(item.input?.toolResult?.processingTime ?? 0);
                            const totalTime = qmTime + toolTime;
                            return totalTime > 0 ? `${totalTime.toFixed(2)}초` : '-';
                          })()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {item.completedAt
                            ? dayjs(item.completedAt).format('YYYY-MM-DD HH:mm:ss')
                            : (item.createdAt ? dayjs(item.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-')}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[5, 10, 25]}
            component="div"
            count={qmList.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>새 QM 분석 요청</DialogTitle>
        <DialogContent>
          {/* Error Alert */}
          {createQMMutation.isError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              <Typography variant="subtitle2" fontWeight={600}>
                QM 분석 요청 실패
              </Typography>
              <Typography variant="body2">
                {(createQMMutation.error as Error)?.message || '알 수 없는 오류가 발생했습니다.'}
              </Typography>
            </Alert>
          )}

          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField
              label="Contact ID"
              fullWidth
              value={requestOptions.contactId}
              onChange={(e) =>
                setRequestOptions({ ...requestOptions, contactId: e.target.value })
              }
            />

            <FormControl fullWidth>
              <InputLabel>모델</InputLabel>
              <Select
                value={requestOptions.model}
                label="모델"
                onChange={(e) =>
                  setRequestOptions({ ...requestOptions, model: e.target.value })
                }
              >
                <MenuItem value="gemini-2.5-flash">Gemini 2.5 Flash(권장)</MenuItem>
                <MenuItem value="gemini-2.5-pro">Gemini 2.5 Pro</MenuItem>


              </Select>
            </FormControl>

            <Stack direction="row" spacing={2}>
              <TextField
                label="Temperature"
                type="number"
                inputProps={{ min: 0, max: 1, step: 0.1 }}
                fullWidth
                value={requestOptions.temperature}
                onChange={(e) =>
                  setRequestOptions({ ...requestOptions, temperature: Number(e.target.value) })
                }
              />
              <TextField
                label="Max Output Tokens"
                type="number"
                inputProps={{ min: 0, max: 65535 }}
                fullWidth
                value={requestOptions.maxOutputTokens}
                onChange={(e) =>
                  setRequestOptions({ ...requestOptions, maxOutputTokens: Number(e.target.value) })
                }
              />
            </Stack>

            <Box>
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
              {!requestOptions.useDefaultPrompt && (
                <TextField
                  label="Prompt"
                  multiline
                  rows={4}
                  fullWidth
                  sx={{ mt: 1 }}
                  value={requestOptions.prompt}
                  onChange={(e) =>
                    setRequestOptions({ ...requestOptions, prompt: e.target.value })
                  }
                />
              )}
            </Box>

            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={requestOptions.useThinking}
                    onChange={(e) =>
                      setRequestOptions({ ...requestOptions, useThinking: e.target.checked })
                    }
                  />
                }
                label="Thinking Process 사용"
              />
              {requestOptions.useThinking && (
                <TextField
                  label="Thinking Budget"
                  type="number"
                  fullWidth
                  sx={{ mt: 1 }}
                  value={requestOptions.thinkingBudget}
                  onChange={(e) =>
                    setRequestOptions({ ...requestOptions, thinkingBudget: Number(e.target.value) })
                  }
                />
              )}
            </Box>

            <Box>
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
              {requestOptions.useTools && (
                <Box sx={{ pl: 2, mt: 1, borderLeft: '2px solid #eee' }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={requestOptions.useDefaultToolDefinitions}
                        onChange={(e) =>
                          setRequestOptions({ ...requestOptions, useDefaultToolDefinitions: e.target.checked })
                        }
                      />
                    }
                    label="기본 Tool Definitions 사용"
                  />
                  {!requestOptions.useDefaultToolDefinitions && (
                    <Typography variant="caption" color="error" sx={{ display: 'block', mt: -0.5, mb: 1, ml: 1 }}>
                      * Lambda에 Tool 구현이 되어 있는 것만 호출 가능합니다.
                    </Typography>
                  )}
                  {!requestOptions.useDefaultToolDefinitions && (
                    <TextField
                      label="Tool Definitions (JSON)"
                      multiline
                      rows={10}
                      fullWidth
                      sx={{ mt: 1 }}
                      value={toolDefinitionsJson}
                      onChange={(e) => setToolDefinitionsJson(e.target.value)}
                      placeholder='[{"functionDeclarations": [...]}]'
                    />
                  )}
                </Box>
              )}
            </Box>

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
                  readOnly={true}
                  disabled={true}
                  checked={requestOptions.useContextCaching}
                  onChange={(e) =>
                    setRequestOptions({ ...requestOptions, useContextCaching: e.target.checked })
                  }
                />
              }
              label="Context Caching 사용"
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
