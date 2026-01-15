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
  TextField,
  InputAdornment,
  TablePagination,
  TableSortLabel,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  Settings as SettingsIcon,
  PlayArrow as PlayIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useConfig } from '@/contexts/ConfigContext';
import {
  getQMAutomationListByContactId,
  getQMAutomationListSearch,
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
            "transcript_authenticated": {
              "type": "BOOLEAN",
              "description": "본인 확인 요청 여부 (true: 요청함, false: 요청하지 않음)"
            },
            "transcript_agent_confirmation": {
              "type": "STRING",
              "description": "상담사가 본인 확인을 요청한 발화 내용"
            }
          },
          "required": [
            "transcript_authenticated"
          ]
        },
        "enabled": true
      },
      {
        "name": "PNR_Itinerary_Detected",
        "description": "상담 전체를 분석하여 최종 확정된 여정만 호출합니다. 중복 호출 금지. \\n            - 왕복: 가는 편 1회 + 오는 편 1회 = 최대 2회 \\n            - 편도: 1회만 호출 \\n            - 출발지(from), 도착지(to), 날짜(date)가 모두 명확한 경우에만 호출 \\n            - 대화 중 언급된 모든 날짜/장소가 아닌, 최종 확정된 여정만 호출 \\n \\n            **중요: 파라미터는 반드시 아래 형식으로 추출** \\n            - transcript_from, transcript_to: IATA 3-letter 공항코드 (예: ICN, LAX, NRT) \\n            - transcript_date: DDMMYY 형식 (예: 301225) \\n            - 대화에서 년도가 언급되지 않은 경우 #{currentYear}년을 기준으로 합니다. (오늘: #{currentDateKorean})",
        "parameters": {
          "type": "OBJECT",
          "properties": {
            "transcript_from": {
              "type": "STRING",
              "description": "IATA 3-letter 공항코드 (예: ICN, GMP, LAX, JFK). 도시명이 언급된 경우 해당 주요 공항코드로 변환"
            },
            "transcript_to": {
              "type": "STRING",
              "description": "IATA 3-letter 공항코드 (예: ICN, GMP, LAX, JFK). 도시명이 언급된 경우 해당 주요 공항코드로 변환"
            },
            "transcript_date": {
              "type": "STRING",
              "description": "출발 날짜를 DDMMYY 형식으로 (예: 301225). 상대적 표현(내일, 다음주)은 절대 날짜로 변환 필요"
            }
          },
          "required": [
            "transcript_from",
            "transcript_to",
            "transcript_date"
          ]
        },
        "enabled": false
      }
    ]
  }
], null, 2);

const QMAutomationList: React.FC = () => {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const { config, isConfigured } = useConfig();
  const queryClient = useQueryClient();

  // State for new request dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inputContactId, setInputContactId] = useState(contactId || '');
  const [requestOptions, setRequestOptions] = useState<QMAutomationRequestBody>({
    contactId: contactId || '',
    model: 'gemini-2.5-pro',
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
    let audioTime = 0;
    if (item.result?.audioAnalyzeResult?.body) {
      try {
        const body = JSON.parse(item.result.audioAnalyzeResult.body);
        audioTime = Number(body.processingTime ?? 0);
      } catch (e) {
        // ignore parsing error
      }
    }
    return qmTime + toolTime + audioTime;
  };

  // Fetch QM Automation list
  const {
    data: qmList,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['qm-automation-list', contactId, startDate?.format('YYYY-MM-DD'), endDate?.format('YYYY-MM-DD')],
    queryFn: async () => {
      if (contactId) {
        return getQMAutomationListByContactId(contactId, config);
      } else {
        // Search by Date Range
        if (!startDate || !endDate) return [];
        return getQMAutomationListSearch(
          config,
          startDate.format('YYYY-MM-DD'),
          endDate.format('YYYY-MM-DD')
        );
      }
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
      const targetContactId = requestOptions.contactId || contactId || 'view';
      navigate(`/qm-automation/${targetContactId}/detail/${response.requestId}`);
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

  const handleRowClick = (requestId: string, itemContactId?: string) => {
    const targetContactId = contactId || itemContactId || 'view';
    navigate(`/qm-automation/${targetContactId}/detail/${requestId}`);
  };

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (inputContactId.trim()) {
      navigate(`/qm-automation/${inputContactId.trim()}`);
    }
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Sync input with URL param
  React.useEffect(() => {
    if (contactId) {
      setInputContactId(contactId);
      setRequestOptions(prev => ({ ...prev, contactId }));
    }
  }, [contactId]);

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


              <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, maxWidth: 400 }}>
                <Box component="form" onSubmit={handleSearch} sx={{ flex: 1 }}>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Contact ID 검색..."
                    value={inputContactId}
                    onChange={(e) => setInputContactId(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon color="action" />
                        </InputAdornment>
                      ),
                    }}
                  />
                </Box>
                <Button
                  variant="contained"
                  size="medium"
                  onClick={handleSearch}
                  disabled={!inputContactId.trim()}
                  sx={{ minWidth: '80px' }}
                >
                  검색
                </Button>
              </Stack>
            </Stack>
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
              disabled={createQMMutation.isPending}
            >
              새 QM 분석
            </Button>

          </Stack>
        </Stack>
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
          {contactId && (
            <Button
              variant="contained"
              startIcon={<PlayIcon />}
              onClick={() => setDialogOpen(true)}
            >
              첫 번째 QM 분석 시작
            </Button>
          )}
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
                  <TableCell>상태</TableCell>
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
                      onClick={() => handleRowClick(item.requestId, item.contactId)}
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

                            let audioTime = 0;
                            if (item.result?.audioAnalyzeResult?.body) {
                              try {
                                const body = JSON.parse(item.result.audioAnalyzeResult.body);
                                audioTime = Number(body.processingTime ?? 0);
                              } catch (e) {
                                // ignore parsing error
                              }
                            }

                            const totalTime = qmTime + toolTime + audioTime;
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
                <MenuItem value="gemini-2.5-pro">Gemini 2.5 Pro (권장)</MenuItem>
                <MenuItem value="gemini-2.5-flash">Gemini 2.5 Flash</MenuItem>
                <MenuItem value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</MenuItem>
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
