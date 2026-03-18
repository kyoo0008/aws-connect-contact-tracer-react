import React, { useState } from 'react';
import {
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  Alert,
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  ArrowBack as BackIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Refresh as RefreshIcon,
  ChevronRight as ChevronRightIcon,
  Assignment as ChecklistIcon,
  Checklist as ActionIcon,
  Category as CategoryIcon,
  Layers as ServiceIcon,
  Extension as EntityIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  SopCategory,
  SopService,
  Checklist,
  ActionItem,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getServices,
  createService,
  updateService,
  deleteService,
  getChecklists,
  createChecklist,
  updateChecklist,
  deleteChecklist,
  getActionItems,
  createActionItem,
  updateActionItem,
  deleteActionItem,
  RequiredEntity,
  getRequiredEntities,
  createRequiredEntity,
  updateRequiredEntity,
  deleteRequiredEntity,
} from '@/services/sopManagerService';
import { useConfig } from '@/contexts/ConfigContext';

const LANG_OPTIONS = ['KO', 'EN'];
const DEFAULT_LANG = 'KO';

// ---- 공통 다이얼로그 ----

interface SelectOption {
  value: string;
  label: string;
}

interface FieldConfig {
  key: string;
  label: string;
  required?: boolean;
  multiline?: boolean;
  type?: 'select';
  options?: string[];
  optionItems?: SelectOption[];
}

interface FormDialogProps {
  open: boolean;
  title: string;
  fields: FieldConfig[];
  initialValues?: Record<string, string>;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void;
  loading?: boolean;
}

const FormDialog: React.FC<FormDialogProps> = ({ open, title, fields, initialValues = {}, onClose, onSubmit, loading }) => {
  const [values, setValues] = useState<Record<string, string>>({});

  React.useEffect(() => {
    if (open) {
      const defaults: Record<string, string> = {};
      fields.forEach(f => {
        if (f.key === 'lang' && !initialValues[f.key]) defaults[f.key] = DEFAULT_LANG;
      });
      setValues({ ...defaults, ...initialValues });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {fields.map(f =>
            f.type === 'select' ? (
              <FormControl key={f.key} size="small" fullWidth required={f.required}>
                <InputLabel>{f.label}</InputLabel>
                <Select
                  label={f.label}
                  value={values[f.key] ?? ''}
                  onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                >
                  {f.optionItems
                    ? f.optionItems.map(opt => (
                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                      ))
                    : (f.options ?? []).map(opt => (
                        <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                      ))}
                </Select>
              </FormControl>
            ) : (
              <TextField
                key={f.key}
                label={f.label}
                required={f.required}
                multiline={f.multiline}
                rows={f.multiline ? 3 : 1}
                value={values[f.key] ?? ''}
                onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                size="small"
                fullWidth
              />
            )
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>취소</Button>
        <Button
          variant="contained"
          disabled={loading || fields.filter(f => f.required).some(f => !values[f.key])}
          onClick={() => onSubmit(values)}
        >
          {loading ? <CircularProgress size={18} /> : '저장'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ---- 삭제 확인 다이얼로그 ----

interface ConfirmDialogProps {
  open: boolean;
  message: string;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ open, message, onClose, onConfirm, loading }) => (
  <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
    <DialogTitle>삭제 확인</DialogTitle>
    <DialogContent>
      <Typography>{message}</Typography>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={loading}>취소</Button>
      <Button color="error" variant="contained" onClick={onConfirm} disabled={loading}>
        {loading ? <CircularProgress size={18} /> : '삭제'}
      </Button>
    </DialogActions>
  </Dialog>
);

// ================================================================
// 카테고리 목록 화면
// ================================================================

const CategoryList: React.FC = () => {
  const qc = useQueryClient();
  const { config } = useConfig();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SopCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SopCategory | null>(null);

  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ['sop-categories'],
    queryFn: () => getCategories(config),
  });

  const createMut = useMutation({
    mutationFn: (v: Record<string, string>) => createCategory(config, { categoryName: v.categoryName, lang: v.lang }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sop-categories'] }); setFormOpen(false); },
  });

  const updateMut = useMutation({
    mutationFn: (v: Record<string, string>) => updateCategory(config, editTarget!.categoryId, { lang: v.lang, categoryName: v.categoryName }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sop-categories'] }); setEditTarget(null); },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteCategory(config, deleteTarget!.categoryId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sop-categories'] }); setDeleteTarget(null); },
  });

  const fields: FieldConfig[] = [
    { key: 'categoryName', label: '카테고리명', required: true },
    { key: 'lang', label: '언어', required: true, type: 'select', options: LANG_OPTIONS },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <CategoryIcon color="primary" />
          <Typography variant="h6" fontWeight={600}>카테고리 관리</Typography>
          <Chip label={`${data.length}개`} size="small" color="primary" variant="outlined" />
        </Stack>
        <Stack direction="row" spacing={1}>
          <Tooltip title="새로고침">
            <IconButton onClick={() => refetch()} size="small"><RefreshIcon /></IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<AddIcon />} size="small" onClick={() => setFormOpen(true)}>
            카테고리 추가
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{String(error)}</Alert>}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell>카테고리명</TableCell>
              <TableCell>상태</TableCell>
              <TableCell>생성일</TableCell>
              <TableCell align="right">작업</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} align="center"><CircularProgress size={24} /></TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={4} align="center" sx={{ color: 'text.secondary' }}>카테고리가 없습니다.</TableCell></TableRow>
            ) : data.map(cat => (
              <TableRow key={cat.categoryId} hover>
                <TableCell sx={{ fontWeight: 500 }}>{cat.categoryName}</TableCell>
                <TableCell>
                  <Chip
                    label={cat.isActive ? '활성' : '비활성'}
                    size="small"
                    color={cat.isActive ? 'success' : 'default'}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>
                  {cat.createdAt ? new Date(cat.createdAt).toLocaleDateString('ko-KR') : '-'}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="수정">
                    <IconButton size="small" onClick={() => setEditTarget(cat)}><EditIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="삭제">
                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(cat)}><DeleteIcon fontSize="small" /></IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <FormDialog
        open={formOpen}
        title="카테고리 추가"
        fields={fields}
        onClose={() => setFormOpen(false)}
        onSubmit={v => createMut.mutate(v)}
        loading={createMut.isPending}
      />
      <FormDialog
        open={!!editTarget}
        title="카테고리 수정"
        fields={fields}
        initialValues={editTarget ? { categoryName: editTarget.categoryName, lang: DEFAULT_LANG } : {}}
        onClose={() => setEditTarget(null)}
        onSubmit={v => updateMut.mutate(v)}
        loading={updateMut.isPending}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        message={`"${deleteTarget?.categoryName}" 카테고리를 삭제하시겠습니까?`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate()}
        loading={deleteMut.isPending}
      />
    </Box>
  );
};

// ================================================================
// 서비스 목록 화면
// ================================================================

interface ServiceListProps {
  onSelect: (service: SopService) => void;
}

const ServiceList: React.FC<ServiceListProps> = ({ onSelect }) => {
  const qc = useQueryClient();
  const { config } = useConfig();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SopService | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SopService | null>(null);

  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ['sop-services'],
    queryFn: () => getServices(config),
  });

  const createMut = useMutation({
    mutationFn: (v: Record<string, string>) => createService(config, { serviceName: v.serviceName, lang: v.lang }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sop-services'] }); setFormOpen(false); },
  });

  const updateMut = useMutation({
    mutationFn: (v: Record<string, string>) => updateService(config, editTarget!.serviceId, { lang: v.lang, serviceName: v.serviceName }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sop-services'] }); setEditTarget(null); },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteService(config, deleteTarget!.serviceId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sop-services'] }); setDeleteTarget(null); },
  });

  const serviceFields: FieldConfig[] = [
    { key: 'serviceName', label: '서비스명', required: true },
    { key: 'lang', label: '언어', required: true, type: 'select', options: LANG_OPTIONS },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <ServiceIcon color="primary" />
          <Typography variant="h6" fontWeight={600}>서비스 관리</Typography>
          <Chip label={`${data.length}개`} size="small" color="primary" variant="outlined" />
        </Stack>
        <Stack direction="row" spacing={1}>
          <Tooltip title="새로고침">
            <IconButton onClick={() => refetch()} size="small"><RefreshIcon /></IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<AddIcon />} size="small" onClick={() => setFormOpen(true)}>
            서비스 추가
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{String(error)}</Alert>}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell>서비스명</TableCell>
              <TableCell>상태</TableCell>
              <TableCell>생성일</TableCell>
              <TableCell align="right">작업</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} align="center"><CircularProgress size={24} /></TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={4} align="center" sx={{ color: 'text.secondary' }}>서비스가 없습니다.</TableCell></TableRow>
            ) : data.map(svc => (
              <TableRow key={svc.serviceId} hover sx={{ cursor: 'pointer' }}>
                <TableCell
                  onClick={() => onSelect(svc)}
                  sx={{ fontWeight: 500, color: 'primary.main' }}
                >
                  {svc.serviceName}
                  <ChevronRightIcon sx={{ fontSize: 16, ml: 0.5, verticalAlign: 'middle' }} />
                </TableCell>
                <TableCell onClick={() => onSelect(svc)}>
                  <Chip
                    label={svc.isActive ? '활성' : '비활성'}
                    size="small"
                    color={svc.isActive ? 'success' : 'default'}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell onClick={() => onSelect(svc)} sx={{ color: 'text.secondary' }}>
                  {svc.createdAt ? new Date(svc.createdAt).toLocaleDateString('ko-KR') : '-'}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="수정">
                    <IconButton size="small" onClick={() => setEditTarget(svc)}><EditIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="삭제">
                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(svc)}><DeleteIcon fontSize="small" /></IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <FormDialog
        open={formOpen}
        title="서비스 추가"
        fields={serviceFields}
        onClose={() => setFormOpen(false)}
        onSubmit={v => createMut.mutate(v)}
        loading={createMut.isPending}
      />
      <FormDialog
        open={!!editTarget}
        title="서비스 수정"
        fields={serviceFields}
        initialValues={editTarget ? { serviceName: editTarget.serviceName, lang: DEFAULT_LANG } : {}}
        onClose={() => setEditTarget(null)}
        onSubmit={v => updateMut.mutate(v)}
        loading={updateMut.isPending}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        message={`"${deleteTarget?.serviceName}" 서비스를 삭제하시겠습니까?`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate()}
        loading={deleteMut.isPending}
      />
    </Box>
  );
};

// ================================================================
// 체크리스트 목록 화면
// ================================================================

interface ChecklistListProps {
  service: SopService;
  onSelect: (checklist: Checklist) => void;
}

const ChecklistList: React.FC<ChecklistListProps> = ({ service, onSelect }) => {
  const qc = useQueryClient();
  const { config } = useConfig();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Checklist | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Checklist | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['sop-categories'],
    queryFn: () => getCategories(config),
  });

  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ['sop-checklists', service.serviceId],
    queryFn: () => getChecklists(config, service.serviceId),
  });

  const categoryMap = React.useMemo(
    () => Object.fromEntries(categories.map(c => [c.categoryId, c.categoryName])),
    [categories]
  );

  const createMut = useMutation({
    mutationFn: (v: Record<string, string>) => createChecklist(config, {
      checklistName: v.checklistName,
      serviceId: service.serviceId,
      categoryId: v.categoryId,
      lang: v.lang,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sop-checklists', service.serviceId] }); setFormOpen(false); },
  });

  const updateMut = useMutation({
    mutationFn: (v: Record<string, string>) => updateChecklist(config, editTarget!.checklistId, {
      lang: v.lang,
      checklistName: v.checklistName,
      categoryId: v.categoryId,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sop-checklists', service.serviceId] }); setEditTarget(null); },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteChecklist(config, deleteTarget!.checklistId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sop-checklists', service.serviceId] }); setDeleteTarget(null); },
  });

  const checklistFields: FieldConfig[] = [
    { key: 'checklistName', label: '체크리스트명', required: true },
    {
      key: 'categoryId',
      label: '카테고리',
      required: true,
      type: 'select',
      optionItems: categories.map(c => ({ value: c.categoryId, label: c.categoryName })),
    },
    { key: 'lang', label: '언어', required: true, type: 'select', options: LANG_OPTIONS },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <ChecklistIcon color="primary" />
          <Typography variant="h6" fontWeight={600}>{service.serviceName} - 체크리스트</Typography>
          <Chip label={`${data.length}개`} size="small" color="primary" variant="outlined" />
        </Stack>
        <Stack direction="row" spacing={1}>
          <Tooltip title="새로고침">
            <IconButton onClick={() => refetch()} size="small"><RefreshIcon /></IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<AddIcon />} size="small" onClick={() => setFormOpen(true)}>
            체크리스트 추가
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{String(error)}</Alert>}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell>체크리스트명</TableCell>
              <TableCell>카테고리</TableCell>
              <TableCell>상태</TableCell>
              <TableCell>생성일</TableCell>
              <TableCell align="right">작업</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} align="center"><CircularProgress size={24} /></TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>체크리스트가 없습니다.</TableCell></TableRow>
            ) : data.map(cl => (
              <TableRow key={cl.checklistId} hover sx={{ cursor: 'pointer' }}>
                <TableCell
                  onClick={() => onSelect(cl)}
                  sx={{ fontWeight: 500, color: 'primary.main' }}
                >
                  {cl.checklistName}
                  <ChevronRightIcon sx={{ fontSize: 16, ml: 0.5, verticalAlign: 'middle' }} />
                </TableCell>
                <TableCell onClick={() => onSelect(cl)}>
                  {cl.categoryId ? (
                    <Chip label={categoryMap[cl.categoryId] ?? cl.categoryId} size="small" variant="outlined" />
                  ) : '-'}
                </TableCell>
                <TableCell onClick={() => onSelect(cl)}>
                  <Chip
                    label={cl.isActive ? '활성' : '비활성'}
                    size="small"
                    color={cl.isActive ? 'success' : 'default'}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell onClick={() => onSelect(cl)} sx={{ color: 'text.secondary' }}>
                  {cl.createdAt ? new Date(cl.createdAt).toLocaleDateString('ko-KR') : '-'}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="수정">
                    <IconButton size="small" onClick={() => setEditTarget(cl)}><EditIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="삭제">
                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(cl)}><DeleteIcon fontSize="small" /></IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <FormDialog
        open={formOpen}
        title="체크리스트 추가"
        fields={checklistFields}
        onClose={() => setFormOpen(false)}
        onSubmit={v => createMut.mutate(v)}
        loading={createMut.isPending}
      />
      <FormDialog
        open={!!editTarget}
        title="체크리스트 수정"
        fields={checklistFields}
        initialValues={editTarget ? { checklistName: editTarget.checklistName, categoryId: editTarget.categoryId, lang: DEFAULT_LANG } : {}}
        onClose={() => setEditTarget(null)}
        onSubmit={v => updateMut.mutate(v)}
        loading={updateMut.isPending}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        message={`"${deleteTarget?.checklistName}" 체크리스트를 삭제하시겠습니까?`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate()}
        loading={deleteMut.isPending}
      />
    </Box>
  );
};

// ================================================================
// 액션 아이템 목록 화면
// ================================================================

interface ActionItemListProps {
  checklist: Checklist;
}

const ActionItemList: React.FC<ActionItemListProps> = ({ checklist }) => {
  const qc = useQueryClient();
  const { config } = useConfig();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ActionItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ActionItem | null>(null);

  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ['sop-action-items', checklist.checklistId],
    queryFn: () => getActionItems(config, checklist.checklistId),
  });

  const createMut = useMutation({
    mutationFn: (v: Record<string, string>) => createActionItem(config, checklist.checklistId, {
      itemName: v.itemName,
      lang: v.lang,
      evalOrder: Number(v.evalOrder),
      apiEndpoint: v.apiEndpoint || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sop-action-items', checklist.checklistId] }); setFormOpen(false); },
  });

  const updateMut = useMutation({
    mutationFn: (v: Record<string, string>) => updateActionItem(config, checklist.checklistId, editTarget!.actionId, {
      lang: v.lang,
      evalOrder: Number(v.evalOrder),
      itemName: v.itemName,
      apiEndpoint: v.apiEndpoint || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sop-action-items', checklist.checklistId] }); setEditTarget(null); },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteActionItem(
      config,
      checklist.checklistId,
      deleteTarget!.actionId,
      deleteTarget!.lang ?? DEFAULT_LANG,
      deleteTarget!.evalOrder ?? 0,
    ),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sop-action-items', checklist.checklistId] }); setDeleteTarget(null); },
  });

  const actionItemFields: FieldConfig[] = [
    { key: 'itemName', label: '액션 아이템명', required: true },
    { key: 'lang', label: '언어', required: true, type: 'select', options: LANG_OPTIONS },
    { key: 'evalOrder', label: '평가 순서 (숫자)', required: true },
    { key: 'apiEndpoint', label: 'API 엔드포인트' },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <ActionIcon color="primary" />
          <Typography variant="h6" fontWeight={600}>{checklist.checklistName} - 액션 아이템</Typography>
          <Chip label={`${data.length}개`} size="small" color="primary" variant="outlined" />
        </Stack>
        <Stack direction="row" spacing={1}>
          <Tooltip title="새로고침">
            <IconButton onClick={() => refetch()} size="small"><RefreshIcon /></IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<AddIcon />} size="small" onClick={() => setFormOpen(true)}>
            액션 아이템 추가
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{String(error)}</Alert>}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell width={60}>순서</TableCell>
              <TableCell>액션 아이템명</TableCell>
              <TableCell>API 엔드포인트</TableCell>
              <TableCell>상태</TableCell>
              <TableCell>생성일</TableCell>
              <TableCell align="right">작업</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} align="center"><CircularProgress size={24} /></TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ color: 'text.secondary' }}>액션 아이템이 없습니다.</TableCell></TableRow>
            ) : [...data].sort((a, b) => (a.evalOrder ?? 0) - (b.evalOrder ?? 0)).map(item => (
              <TableRow key={item.actionId} hover>
                <TableCell>
                  {item.evalOrder != null ? (
                    <Chip label={item.evalOrder} size="small" variant="outlined" />
                  ) : '-'}
                </TableCell>
                <TableCell sx={{ fontWeight: 500 }}>{item.itemName}</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>{item.apiEndpoint || '-'}</TableCell>
                <TableCell>
                  <Chip
                    label={item.isActive !== false ? '활성' : '비활성'}
                    size="small"
                    color={item.isActive !== false ? 'success' : 'default'}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>
                  {item.createdAt ? new Date(item.createdAt).toLocaleDateString('ko-KR') : '-'}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="수정">
                    <IconButton size="small" onClick={() => setEditTarget(item)}><EditIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="삭제">
                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(item)}><DeleteIcon fontSize="small" /></IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <FormDialog
        open={formOpen}
        title="액션 아이템 추가"
        fields={actionItemFields}
        onClose={() => setFormOpen(false)}
        onSubmit={v => createMut.mutate(v)}
        loading={createMut.isPending}
      />
      <FormDialog
        open={!!editTarget}
        title="액션 아이템 수정"
        fields={actionItemFields}
        initialValues={editTarget ? {
          itemName: editTarget.itemName,
          lang: editTarget.lang ?? DEFAULT_LANG,
          evalOrder: String(editTarget.evalOrder ?? ''),
          apiEndpoint: editTarget.apiEndpoint ?? '',
        } : {}}
        onClose={() => setEditTarget(null)}
        onSubmit={v => updateMut.mutate(v)}
        loading={updateMut.isPending}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        message={`"${deleteTarget?.itemName}" 액션 아이템을 삭제하시겠습니까?`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate()}
        loading={deleteMut.isPending}
      />
    </Box>
  );
};

// ================================================================
// 필수 엔티티 목록 화면
// ================================================================

interface RequiredEntityListProps {
  checklist: Checklist;
}

const RequiredEntityList: React.FC<RequiredEntityListProps> = ({ checklist }) => {
  const qc = useQueryClient();
  const { config } = useConfig();
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RequiredEntity | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RequiredEntity | null>(null);

  const { data = [], isLoading, error, refetch } = useQuery({
    queryKey: ['sop-required-entities', checklist.checklistId],
    queryFn: () => getRequiredEntities(config, checklist.checklistId),
  });

  const createMut = useMutation({
    mutationFn: (v: Record<string, string>) => createRequiredEntity(config, checklist.checklistId, {
      entityName: v.entityName,
      lang: v.lang,
      inductionPrompt: v.inductionPrompt || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sop-required-entities', checklist.checklistId] }); setFormOpen(false); },
  });

  const updateMut = useMutation({
    mutationFn: (v: Record<string, string>) => updateRequiredEntity(config, checklist.checklistId, editTarget!.reqId, {
      lang: v.lang,
      entityName: v.entityName,
      inductionPrompt: v.inductionPrompt || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sop-required-entities', checklist.checklistId] }); setEditTarget(null); },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteRequiredEntity(
      config,
      checklist.checklistId,
      deleteTarget!.reqId,
      deleteTarget!.lang ?? DEFAULT_LANG,
    ),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sop-required-entities', checklist.checklistId] }); setDeleteTarget(null); },
  });

  const entityFields: FieldConfig[] = [
    { key: 'entityName', label: '엔티티명', required: true },
    { key: 'lang', label: '언어', required: true, type: 'select', options: LANG_OPTIONS },
    { key: 'inductionPrompt', label: '유도 프롬프트', multiline: true },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <EntityIcon color="primary" />
          <Typography variant="h6" fontWeight={600}>{checklist.checklistName} - 필수 엔티티</Typography>
          <Chip label={`${data.length}개`} size="small" color="primary" variant="outlined" />
        </Stack>
        <Stack direction="row" spacing={1}>
          <Tooltip title="새로고침">
            <IconButton onClick={() => refetch()} size="small"><RefreshIcon /></IconButton>
          </Tooltip>
          <Button variant="contained" startIcon={<AddIcon />} size="small" onClick={() => setFormOpen(true)}>
            엔티티 추가
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{String(error)}</Alert>}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell>엔티티명</TableCell>
              <TableCell>유도 프롬프트</TableCell>
              <TableCell>상태</TableCell>
              <TableCell>생성일</TableCell>
              <TableCell align="right">작업</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} align="center"><CircularProgress size={24} /></TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={5} align="center" sx={{ color: 'text.secondary' }}>필수 엔티티가 없습니다.</TableCell></TableRow>
            ) : data.map(ent => (
              <TableRow key={ent.reqId} hover>
                <TableCell sx={{ fontWeight: 500 }}>{ent.entityName}</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ent.inductionPrompt || '-'}
                </TableCell>
                <TableCell>
                  <Chip
                    label={ent.isActive !== false ? '활성' : '비활성'}
                    size="small"
                    color={ent.isActive !== false ? 'success' : 'default'}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>
                  {ent.createdAt ? new Date(ent.createdAt).toLocaleDateString('ko-KR') : '-'}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="수정">
                    <IconButton size="small" onClick={() => setEditTarget(ent)}><EditIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="삭제">
                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(ent)}><DeleteIcon fontSize="small" /></IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <FormDialog
        open={formOpen}
        title="필수 엔티티 추가"
        fields={entityFields}
        onClose={() => setFormOpen(false)}
        onSubmit={v => createMut.mutate(v)}
        loading={createMut.isPending}
      />
      <FormDialog
        open={!!editTarget}
        title="필수 엔티티 수정"
        fields={entityFields}
        initialValues={editTarget ? {
          entityName: editTarget.entityName,
          lang: editTarget.lang ?? DEFAULT_LANG,
          inductionPrompt: editTarget.inductionPrompt ?? '',
        } : {}}
        onClose={() => setEditTarget(null)}
        onSubmit={v => updateMut.mutate(v)}
        loading={updateMut.isPending}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        message={`"${deleteTarget?.entityName}" 필수 엔티티를 삭제하시겠습니까?`}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate()}
        loading={deleteMut.isPending}
      />
    </Box>
  );
};

// ================================================================
// 메인 페이지
// ================================================================

type View =
  | { level: 'top' }
  | { level: 'checklists'; service: SopService }
  | { level: 'action-items'; service: SopService; checklist: Checklist };

type TopTab = 'categories' | 'services';

const SOPManager: React.FC = () => {
  const [view, setView] = useState<View>({ level: 'top' });
  const [topTab, setTopTab] = useState<TopTab>('services');

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/* Breadcrumbs */}
      <Breadcrumbs separator={<ChevronRightIcon fontSize="small" />} sx={{ mb: 2 }}>
        <Link
          component="button"
          underline="hover"
          color={view.level === 'top' ? 'text.primary' : 'inherit'}
          fontWeight={view.level === 'top' ? 600 : 400}
          onClick={() => setView({ level: 'top' })}
        >
          SOP 관리
        </Link>
        {(view.level === 'checklists' || view.level === 'action-items') && (
          <Link
            component="button"
            underline="hover"
            color={view.level === 'checklists' ? 'text.primary' : 'inherit'}
            fontWeight={view.level === 'checklists' ? 600 : 400}
            onClick={() => view.level === 'action-items' && setView({ level: 'checklists', service: view.service })}
          >
            {view.service.serviceName}
          </Link>
        )}
        {view.level === 'action-items' && (
          <Typography color="text.primary" fontWeight={600}>
            {view.checklist.checklistName}
          </Typography>
        )}
      </Breadcrumbs>

      {/* 뒤로 가기 버튼 */}
      {view.level !== 'top' && (
        <Button
          startIcon={<BackIcon />}
          size="small"
          sx={{ mb: 2 }}
          onClick={() => {
            if (view.level === 'checklists') setView({ level: 'top' });
            else if (view.level === 'action-items') setView({ level: 'checklists', service: view.service });
          }}
        >
          뒤로
        </Button>
      )}

      <Divider sx={{ mb: 3 }} />

      {view.level === 'top' && (
        <>
          <Tabs value={topTab} onChange={(_, v) => setTopTab(v)} sx={{ mb: 3 }}>
            <Tab value="services" label="서비스" icon={<ServiceIcon />} iconPosition="start" />
            <Tab value="categories" label="카테고리" icon={<CategoryIcon />} iconPosition="start" />
          </Tabs>
          {topTab === 'services' && (
            <ServiceList onSelect={svc => setView({ level: 'checklists', service: svc })} />
          )}
          {topTab === 'categories' && <CategoryList />}
        </>
      )}
      {view.level === 'checklists' && (
        <ChecklistList
          service={view.service}
          onSelect={cl => setView({ level: 'action-items', service: view.service, checklist: cl })}
        />
      )}
      {view.level === 'action-items' && (
        <>
          <ActionItemList checklist={view.checklist} />
          <Divider sx={{ my: 4 }} />
          <RequiredEntityList checklist={view.checklist} />
        </>
      )}
    </Container>
  );
};

export default SOPManager;
