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
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TablePagination,
    TableSortLabel,
} from '@mui/material';
import {
    ArrowBack as BackIcon,
    Refresh as RefreshIcon,
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Settings as SettingsIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useConfig } from '@/contexts/ConfigContext';
import {
    getQmEvaluationForms,
    createQmEvaluationForm,
    deleteQmEvaluationForm,
} from '@/services/qmEvaluationFormService';
import {
    QmEvaluationForm,
    CreateQmEvaluationFormRequest,
} from '@/types/qmEvaluationForm.types';
import dayjs from 'dayjs';

const QMEvaluationFormList: React.FC = () => {
    const navigate = useNavigate();
    const { config, isConfigured } = useConfig();
    const queryClient = useQueryClient();

    // State for create dialog
    const [openCreateDialog, setOpenCreateDialog] = useState(false);
    const [newForm, setNewForm] = useState<CreateQmEvaluationFormRequest>({
        formName: '',
        description: '',
        version: '1.0.0',
        status: 'DRAFT',
    });

    // Pagination state
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    // Sorting state
    type Order = 'asc' | 'desc';
    type OrderBy = 'updatedAt' | 'createdAt' | 'formName' | 'version';
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<OrderBy>('updatedAt');

    const handleRequestSort = (property: OrderBy) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    // Fetch Forms
    const {
        data: forms,
        isLoading,
        error,
        refetch,
    } = useQuery({
        queryKey: ['qm-evaluation-forms'],
        queryFn: async () => getQmEvaluationForms(config),
        enabled: isConfigured,
    });

    // Mutation for creating form
    const createFormMutation = useMutation({
        mutationFn: async (data: CreateQmEvaluationFormRequest) => {
            const response = await createQmEvaluationForm(data, config);
            return response;
        },
        onSuccess: (newItem) => {
            setOpenCreateDialog(false);
            setNewForm({
                formName: '',
                description: '',
                version: '1.0.0',
                status: 'DRAFT',
            });
            // Invalidate query to refresh list
            queryClient.invalidateQueries({ queryKey: ['qm-evaluation-forms'] });
            // Navigate to detail page
            navigate(`/qm-evaluation-form/${newItem.formId}`);
        },
    });

    // Mutation for deleting form
    const deleteFormMutation = useMutation({
        mutationFn: async (formId: string) => {
            await deleteQmEvaluationForm(formId, config);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['qm-evaluation-forms'] });
        },
    });

    const handleDeleteClick = (e: React.MouseEvent, formId: string) => {
        e.stopPropagation();
        if (window.confirm('정말로 이 평가 양식을 삭제하시겠습니까?')) {
            deleteFormMutation.mutate(formId);
        }
    };

    const handleChangePage = (event: unknown, newPage: number) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'ACTIVE': return 'success';
            case 'INACTIVE': return 'default';
            case 'DRAFT': return 'warning';
            default: return 'default';
        }
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
                        onClick={() => navigate('/')}
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
                        <Typography variant="h5" fontWeight={600}>
                            QM Evaluation Forms
                        </Typography>
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
                            onClick={() => setOpenCreateDialog(true)}
                        >
                            새 양식 생성
                        </Button>
                    </Stack>
                </Stack>
            </Paper>

            {/* Content */}
            {isLoading && (
                <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
                    <CircularProgress />
                </Box>
            )}

            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    평가 양식 목록을 불러오는데 실패했습니다: {(error as Error).message}
                </Alert>
            )}

            {/* List */}
            {!isLoading && forms && (
                <>
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'grey.100' }}>
                                    <TableCell>
                                        <TableSortLabel
                                            active={orderBy === 'formName'}
                                            direction={orderBy === 'formName' ? order : 'asc'}
                                            onClick={() => handleRequestSort('formName')}
                                        >
                                            양식 명
                                        </TableSortLabel>
                                    </TableCell>
                                    <TableCell>설명</TableCell>
                                    <TableCell>
                                        <TableSortLabel
                                            active={orderBy === 'version'}
                                            direction={orderBy === 'version' ? order : 'asc'}
                                            onClick={() => handleRequestSort('version')}
                                        >
                                            버전
                                        </TableSortLabel>
                                    </TableCell>
                                    <TableCell>상태</TableCell>
                                    <TableCell>
                                        <TableSortLabel
                                            active={orderBy === 'createdAt'}
                                            direction={orderBy === 'createdAt' ? order : 'asc'}
                                            onClick={() => handleRequestSort('createdAt')}
                                        >
                                            생성일
                                        </TableSortLabel>
                                    </TableCell>
                                    <TableCell>
                                        <TableSortLabel
                                            active={orderBy === 'updatedAt'}
                                            direction={orderBy === 'updatedAt' ? order : 'asc'}
                                            onClick={() => handleRequestSort('updatedAt')}
                                        >
                                            수정일
                                        </TableSortLabel>
                                    </TableCell>
                                    <TableCell align="right">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {forms.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                                            <Typography color="text.secondary">등록된 평가 양식이 없습니다.</Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    forms
                                        .sort((a, b) => { // Client-side sorting
                                            const valA = a[orderBy];
                                            const valB = b[orderBy];
                                            if (valA < valB) return order === 'asc' ? -1 : 1;
                                            if (valA > valB) return order === 'asc' ? 1 : -1;
                                            return 0;
                                        })
                                        .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                                        .map((form) => (
                                            <TableRow
                                                key={form.formId}
                                                hover
                                                onClick={() => navigate(`/qm-evaluation-form/${form.formId}`)}
                                                sx={{ cursor: 'pointer' }}
                                            >
                                                <TableCell component="th" scope="row">
                                                    <Typography fontWeight={500}>{form.formName}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                                                        {form.description}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>{form.version}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={form.status}
                                                        color={getStatusColor(form.status)}
                                                        size="small"
                                                    />
                                                </TableCell>
                                                <TableCell>{dayjs(form.createdAt).format('YYYY-MM-DD HH:mm')}</TableCell>
                                                <TableCell>{dayjs(form.updatedAt).format('YYYY-MM-DD HH:mm')}</TableCell>
                                                <TableCell align="right">
                                                    <IconButton
                                                        size="small"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/qm-evaluation-form/${form.formId}`);
                                                        }}
                                                    >
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={(e) => handleDeleteClick(e, form.formId)}
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    <TablePagination
                        rowsPerPageOptions={[5, 10, 25]}
                        component="div"
                        count={forms.length}
                        rowsPerPage={rowsPerPage}
                        page={page}
                        onPageChange={handleChangePage}
                        onRowsPerPageChange={handleChangeRowsPerPage}
                    />
                </>
            )}

            {/* Create Dialog */}
            <Dialog open={openCreateDialog} onClose={() => setOpenCreateDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>새 평가 양식 생성</DialogTitle>
                <DialogContent>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <TextField
                            label="양식 명"
                            fullWidth
                            required
                            value={newForm.formName}
                            onChange={(e) => setNewForm({ ...newForm, formName: e.target.value })}
                        />
                        <TextField
                            label="설명"
                            fullWidth
                            multiline
                            rows={3}
                            value={newForm.description}
                            onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
                        />
                        <TextField
                            label="버전"
                            fullWidth
                            value={newForm.version}
                            onChange={(e) => setNewForm({ ...newForm, version: e.target.value })}
                        />
                        <FormControl fullWidth>
                            <InputLabel>상태</InputLabel>
                            <Select
                                value={newForm.status}
                                label="상태"
                                onChange={(e) => setNewForm({ ...newForm, status: e.target.value as any })}
                            >
                                <MenuItem value="DRAFT">DRAFT</MenuItem>
                                <MenuItem value="ACTIVE">ACTIVE</MenuItem>
                                <MenuItem value="INACTIVE">INACTIVE</MenuItem>
                            </Select>
                        </FormControl>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenCreateDialog(false)}>취소</Button>
                    <Button
                        variant="contained"
                        onClick={() => createFormMutation.mutate(newForm)}
                        disabled={!newForm.formName || createFormMutation.isPending}
                    >
                        {createFormMutation.isPending ? '생성 중...' : '생성'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default QMEvaluationFormList;
