
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box,
    Paper,
    Typography,
    Button,
    CircularProgress,
    IconButton,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Grid,
    Card,
    CardContent,
    CardHeader,
    Collapse,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    List,
    ListItem,
    ListItemText,
    Divider,
    Switch,
    FormControlLabel,
    Chip,
    Stack,
    LinearProgress,
} from '@mui/material';
import {
    ArrowBack as BackIcon,
    Save as SaveIcon,
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    DragIndicator as DragIcon,
} from '@mui/icons-material';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useConfig } from '@/contexts/ConfigContext';
import {
    getQmEvaluationForm,
    updateQmEvaluationForm,
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    getSubItems,
    createSubItem,
    updateSubItem,
    deleteSubItem,
    updateCategoryOrder,
} from '@/services/qmEvaluationFormService';
import {
    EvaluationCategory,
    EvaluationSubItem,
    EvaluationCriterion,
    UpdateQmEvaluationFormRequest,
    CreateCategoryRequest,
    CreateSubItemRequest,
} from '@/types/qmEvaluationForm.types';

// --- SubItem Dialog Component ---
interface SubItemDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: CreateSubItemRequest) => void;
    initialData?: EvaluationSubItem;
    isLoading: boolean;
    defaultDisplayOrder?: number;
}

const SubItemDialog: React.FC<SubItemDialogProps> = ({
    open,
    onClose,
    onSubmit,
    initialData,
    isLoading,
    defaultDisplayOrder = 1,
}) => {
    const [formData, setFormData] = useState<CreateSubItemRequest>({
        subItemId: '',
        subItemName: '',
        displayOrder: initialData?.displayOrder || defaultDisplayOrder,
        resultJsonFormat: initialData?.resultJsonFormat || '',
        instruction: initialData?.instruction || '',
        ...initialData,
        evaluationCriteria: (initialData?.evaluationCriteria || []).map((crit, i) => ({
            ...crit,
            criteriaId: `${i + 1}`,
        })),
    });
    const [jsonError, setJsonError] = useState<string | null>(null);

    // Criteria state management
    const handleAddCriteria = () => {
        setFormData((prev) => ({
            ...prev,
            evaluationCriteria: [
                ...prev.evaluationCriteria,
                // Sequential Criteria ID: length + 1
                { criteriaId: `${prev.evaluationCriteria.length + 1}`, description: '', details: '' },
            ],
        }));
    };

    const handleCriteriaChange = (index: number, field: keyof EvaluationCriterion, value: string) => {
        const newCriteria = [...formData.evaluationCriteria];
        newCriteria[index] = { ...newCriteria[index], [field]: value };
        setFormData((prev) => ({ ...prev, evaluationCriteria: newCriteria }));
    };

    const handleDeleteCriteria = (index: number) => {
        const newCriteria = formData.evaluationCriteria
            .filter((_, i) => i !== index)
            .map((crit, i) => ({ ...crit, criteriaId: `${i + 1}` }));
        setFormData((prev) => ({ ...prev, evaluationCriteria: newCriteria }));
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{initialData ? '소항목 수정' : '소항목 추가'}</DialogTitle>
            <DialogContent>
                <Stack spacing={3} sx={{ mt: 1 }}>
                    <TextField
                        label="소항목 ID (Key)"
                        fullWidth
                        required
                        disabled={!!initialData}
                        value={formData.subItemId}
                        onChange={(e) => setFormData({ ...formData, subItemId: e.target.value })}
                        error={!formData.subItemId?.trim()}
                        helperText={!formData.subItemId?.trim() ? "소항목 ID는 필수 항목입니다." : (initialData ? "ID는 변경할 수 없습니다." : "고유 식별자 (예: greeting_check)")}
                    />
                    <TextField
                        label="소항목 명"
                        fullWidth
                        required
                        value={formData.subItemName}
                        onChange={(e) => setFormData({ ...formData, subItemName: e.target.value })}
                        error={!formData.subItemName?.trim()}
                        helperText={!formData.subItemName?.trim() ? "소항목 명은 필수 항목입니다." : ""}
                    />
                    <TextField
                        label="표시 순서"
                        type="number"
                        fullWidth
                        value={formData.displayOrder}
                        onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) })}
                    />
                    <TextField
                        label="Instruction (가이드)"
                        fullWidth
                        multiline
                        rows={3}
                        value={formData.instruction}
                        onChange={(e) => setFormData({ ...formData, instruction: e.target.value })}
                        helperText="AI를 위한 추가 가이드라인입니다."
                    />
                    <TextField
                        label="Result JSON Format"
                        fullWidth
                        multiline
                        required
                        rows={3}
                        value={formData.resultJsonFormat}
                        onChange={(e) => {
                            setFormData({ ...formData, resultJsonFormat: e.target.value });
                            setJsonError(null);
                        }}
                        error={!!jsonError}
                        helperText={jsonError || "AI 응답에서 추출할 JSON 포맷 샘플입니다."}
                    />

                    <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 2 }}>
                        평가 기준 (Criteria)
                    </Typography>

                    {formData.evaluationCriteria.map((criterion, index) => (
                        <Paper key={index} variant="outlined" sx={{ p: 2 }}>
                            <Grid container spacing={2} alignItems="flex-start">
                                <Grid item xs={12} sm={2}>
                                    <TextField
                                        label="ID"
                                        size="small"
                                        fullWidth
                                        disabled
                                        value={criterion.criteriaId}
                                        onChange={(e) => handleCriteriaChange(index, 'criteriaId', e.target.value)}
                                        placeholder="1"
                                    />
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <TextField
                                        label="설명"
                                        size="small"
                                        fullWidth
                                        multiline
                                        value={criterion.description}
                                        onChange={(e) => handleCriteriaChange(index, 'description', e.target.value)}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={5}>
                                    <TextField
                                        label="세부 내용"
                                        size="small"
                                        fullWidth
                                        multiline
                                        value={criterion.details}
                                        onChange={(e) => handleCriteriaChange(index, 'details', e.target.value)}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={1}>
                                    <IconButton color="error" onClick={() => handleDeleteCriteria(index)}>
                                        <DeleteIcon />
                                    </IconButton>
                                </Grid>
                            </Grid>
                        </Paper>
                    ))}

                    <Button startIcon={<AddIcon />} onClick={handleAddCriteria} variant="outlined">
                        평가 기준 추가
                    </Button>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>취소</Button>
                <Button
                    variant="contained"
                    onClick={() => {
                        let finalData = { ...formData };
                        if (!formData.resultJsonFormat?.trim()) {
                            setJsonError('AI 추출 포맷(JSON)은 필수 입력 항목입니다.');
                            return;
                        }
                        try {
                            const parsed = JSON.parse(formData.resultJsonFormat);
                            finalData.resultJsonFormat = JSON.stringify(parsed, null, 2);
                        } catch (e) {
                            setJsonError('유효하지 않은 JSON 형식입니다.');
                            return;
                        }
                        onSubmit(finalData);
                    }}
                    disabled={!formData.subItemName || !formData.subItemId || !formData.resultJsonFormat?.trim() || isLoading}
                >
                    {isLoading ? '저장 중...' : '저장'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

// --- Category Item Component ---


interface CategoryItemProps {
    formId: string;
    category: EvaluationCategory;
    onEdit: (category: EvaluationCategory) => void;
    onDelete: (categoryId: string) => void;
    config: any;
    allExpanded?: boolean;
    allSubExpanded?: boolean;
}

const SortableCategoryItem: React.FC<CategoryItemProps> = ({
    formId,
    category,
    onEdit,
    onDelete,
    config,
    allExpanded,
    allSubExpanded
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: category.categoryId });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };
    const [expanded, setExpanded] = useState(false);
    const [subItemsExpanded, setSubItemsExpanded] = useState(false);
    const [expandedSubItemIds, setExpandedSubItemIds] = useState<Record<string, boolean>>({});
    const [openSubItemDialog, setOpenSubItemDialog] = useState(false); // Create SubItem
    const [editingSubItem, setEditingSubItem] = useState<EvaluationSubItem | null>(null); // Edit SubItem

    useEffect(() => {
        if (allExpanded !== undefined) setExpanded(allExpanded);
    }, [allExpanded]);

    const queryClient = useQueryClient();

    // Fetch SubItems
    const { data: subItems, isLoading } = useQuery({
        queryKey: ['qm-subitems', formId, category.categoryId],
        queryFn: () => getSubItems(formId, category.categoryId, config),
        enabled: expanded, // Only fetch when expanded
    });

    useEffect(() => {
        if (allSubExpanded !== undefined) {
            setSubItemsExpanded(allSubExpanded);
            if (subItems) {
                const newStates: Record<string, boolean> = {};
                subItems.forEach(item => {
                    newStates[item.subItemId] = allSubExpanded;
                });
                setExpandedSubItemIds(newStates);
            }
        }
    }, [allSubExpanded, subItems]);

    const handleToggleAllSubItems = () => {
        const nextState = !subItemsExpanded;
        setSubItemsExpanded(nextState);
        if (subItems) {
            const newStates: Record<string, boolean> = {};
            subItems.forEach(item => {
                newStates[item.subItemId] = nextState;
            });
            setExpandedSubItemIds(newStates);
        }
    };

    const toggleSubItem = (subItemId: string) => {
        setExpandedSubItemIds(prev => ({
            ...prev,
            [subItemId]: !prev[subItemId]
        }));
    };

    // Create/Update SubItem Mutation
    const subItemMutation = useMutation({
        mutationFn: async ({ data, subItemId }: { data: CreateSubItemRequest, subItemId?: string }) => {
            if (subItemId) {
                return updateSubItem(formId, category.categoryId, subItemId, data, config);
            }
            return createSubItem(formId, category.categoryId, data, config);
        },
        onSuccess: () => {
            setOpenSubItemDialog(false);
            setEditingSubItem(null);
            queryClient.invalidateQueries({ queryKey: ['qm-subitems', formId, category.categoryId] });
        },
    });

    const deleteSubItemMutation = useMutation({
        mutationFn: async (subItemId: string) => {
            await deleteSubItem(formId, category.categoryId, subItemId, config);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['qm-subitems', formId, category.categoryId] });
        },
    });

    const handleSaveSubItem = (data: CreateSubItemRequest) => {
        subItemMutation.mutate({ data, subItemId: editingSubItem?.subItemId });
    };

    return (
        <Card variant="outlined" sx={{ mb: 2, ...style }} ref={setNodeRef}>
            <CardHeader
                title={
                    <Stack direction="row" alignItems="center" spacing={2}>
                        <IconButton {...attributes} {...listeners} size="small" sx={{ cursor: 'grab' }}>
                            <DragIcon />
                        </IconButton>
                        <Chip label={`${category.displayOrder}`} size="small" color="primary" />
                        <Typography variant="h6">{category.categoryId} ( {category.categoryName} )</Typography>
                        {!category.enabled && <Chip label="Disabled" size="small" />}
                        <Chip label={`Weight: ${category.weight}`} size="small" variant="outlined" />
                    </Stack>
                }
                action={
                    <Stack direction="row">
                        <IconButton onClick={() => onEdit(category)}>
                            <EditIcon />
                        </IconButton>
                        <IconButton onClick={() => onDelete(category.categoryId)}>
                            <DeleteIcon />
                        </IconButton>
                        <IconButton onClick={() => setExpanded(!expanded)}>
                            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                    </Stack>
                }
            />
            <Collapse in={expanded} timeout="auto" unmountOnExit>
                <CardContent>
                    <Box mb={2}>
                        <Typography variant="subtitle2" gutterBottom>Instructions</Typography>
                        {(category.instructions && category.instructions.length > 0) ? (
                            <List dense sx={{ bgcolor: 'action.hover', borderRadius: 1 }}>
                                {category.instructions.map((inst, idx) => (
                                    <ListItem key={idx}>
                                        <ListItemText primary={inst} primaryTypographyProps={{ sx: { whiteSpace: 'pre-wrap' } }} />
                                    </ListItem>
                                ))}
                            </List>
                        ) : (
                            <Typography variant="body2" color="text.secondary">No instructions.</Typography>
                        )}
                    </Box>

                    <Box mb={2}>
                        <Typography variant="subtitle2" gutterBottom>Feedback Message</Typography>
                        {category.feedbackMessageTemplate ? (
                            // <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>{category.feedbackMessageTemplate}</Typography>
                            <Paper
                                variant="outlined"
                                sx={{
                                    p: 1,
                                    bgcolor: 'grey.100',
                                    fontFamily: 'monospace',
                                    fontSize: '0.75rem',
                                    whiteSpace: 'pre-wrap',
                                    borderStyle: 'dashed'
                                }}
                            >
                                {category.feedbackMessageTemplate}
                            </Paper>
                        ) : (
                            <Typography variant="body2" color="text.secondary">No feedback message.</Typography>
                        )}
                    </Box>

                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle1" fontWeight={600}>SubItems</Typography>
                            <Button size="small" onClick={handleToggleAllSubItems}>
                                {subItemsExpanded ? 'Collapse All Details' : 'Expand All Details'}
                            </Button>
                        </Stack>
                        <Button startIcon={<AddIcon />} size="small" onClick={() => { setEditingSubItem(null); setOpenSubItemDialog(true); }}>
                            Add SubItem
                        </Button>
                    </Stack>

                    {isLoading ? (
                        <LinearProgress />
                    ) : (
                        <List dense>
                            {subItems?.sort((a, b) => a.displayOrder - b.displayOrder).map((subItem) => (
                                <React.Fragment key={subItem.subItemId}>
                                    <ListItem
                                        secondaryAction={
                                            <>
                                                <IconButton edge="end" aria-label="edit" onClick={() => { setEditingSubItem(subItem); setOpenSubItemDialog(true); }}>
                                                    <EditIcon />
                                                </IconButton>
                                                <IconButton edge="end" aria-label="delete" onClick={() => {
                                                    if (window.confirm('Delete this subitem?')) deleteSubItemMutation.mutate(subItem.subItemId);
                                                }}>
                                                    <DeleteIcon />
                                                </IconButton>
                                            </>
                                        }
                                    >
                                        <IconButton size="small" onClick={() => toggleSubItem(subItem.subItemId)} sx={{ mr: 1 }}>
                                            {expandedSubItemIds[subItem.subItemId] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                        </IconButton>
                                        <ListItemText
                                            primary={
                                                <Typography variant="subtitle2" fontWeight="bold">
                                                    {subItem.displayOrder}. {subItem.subItemId} ( {subItem.subItemName} )
                                                </Typography>
                                            }
                                        />
                                    </ListItem>

                                    <Collapse in={expandedSubItemIds[subItem.subItemId] || false}>
                                        {/* Instruction Display */}
                                        {subItem.instruction && (
                                            <Box sx={{ pl: 4, pr: 8, mb: 1 }}>
                                                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', whiteSpace: 'pre-wrap', display: 'block' }}>
                                                    Guide: {subItem.instruction}
                                                </Typography>
                                            </Box>
                                        )}

                                        {/* Result JSON Format Display */}
                                        {subItem.resultJsonFormat && (
                                            <Box sx={{ pl: 4, pr: 8, mb: 1 }}>
                                                <Typography variant="caption" color="primary" fontWeight={600} display="block">
                                                    AI 추출 포맷 (JSON):
                                                </Typography>
                                                <Paper
                                                    variant="outlined"
                                                    sx={{
                                                        p: 1,
                                                        bgcolor: 'grey.100',
                                                        fontFamily: 'monospace',
                                                        fontSize: '0.75rem',
                                                        whiteSpace: 'pre-wrap',
                                                        borderStyle: 'dashed'
                                                    }}
                                                >
                                                    {subItem.resultJsonFormat}
                                                </Paper>
                                            </Box>
                                        )}

                                        {/* Evaluation Criteria Details */}
                                        {subItem.evaluationCriteria && subItem.evaluationCriteria.length > 0 && (
                                            <Box sx={{ pl: 4, pr: 8, pb: 2 }}>
                                                <Grid container spacing={1}>
                                                    {subItem.evaluationCriteria.map((crit) => (
                                                        <Grid item xs={12} key={crit.criteriaId}>
                                                            <Paper variant="outlined" sx={{ p: 1, bgcolor: 'grey.50' }}>
                                                                <Stack direction="row" spacing={1} alignItems="flex-start">
                                                                    <Chip label={crit.criteriaId} size="small" sx={{ height: 20, fontSize: '0.7rem', minWidth: 40 }} />
                                                                    <Box>
                                                                        <Typography variant="body2" fontWeight={500} sx={{ whiteSpace: 'pre-wrap' }}>
                                                                            {crit.description}
                                                                        </Typography>
                                                                        {crit.details && (
                                                                            <Typography variant="caption" color="text.secondary" display="block" sx={{ whiteSpace: 'pre-wrap' }}>
                                                                                {crit.details}
                                                                            </Typography>
                                                                        )}
                                                                    </Box>
                                                                </Stack>
                                                            </Paper>
                                                        </Grid>
                                                    ))}
                                                </Grid>
                                            </Box>
                                        )}
                                    </Collapse>
                                    <Divider />
                                </React.Fragment>
                            ))}
                            {subItems?.length === 0 && <Typography variant="body2" color="text.secondary">No subitems.</Typography>}
                        </List>
                    )}
                </CardContent>
            </Collapse>

            {/* SubItem Dialog */}
            {openSubItemDialog && (
                <SubItemDialog
                    open={openSubItemDialog}
                    onClose={() => setOpenSubItemDialog(false)}
                    onSubmit={handleSaveSubItem}
                    initialData={editingSubItem || undefined}
                    isLoading={subItemMutation.isPending}
                    defaultDisplayOrder={(subItems?.length || 0) + 1}
                />
            )}
        </Card>
    );
};



const QMEvaluationFormDetail: React.FC = () => {
    const { formId } = useParams<{ formId: string }>();
    const navigate = useNavigate();
    const { config } = useConfig();
    const queryClient = useQueryClient();

    // Form State
    const [formName, setFormName] = useState('');
    const [description, setDescription] = useState('');
    const [systemPrompt, setSystemPrompt] = useState('');
    const [version, setVersion] = useState('');
    const [status, setStatus] = useState<any>('DRAFT');

    // Category Dialog State
    const [openCategoryDialog, setOpenCategoryDialog] = useState(false);
    const [editingCategory, setEditingCategory] = useState<EvaluationCategory | null>(null);
    const [categoryFormData, setCategoryFormData] = useState<CreateCategoryRequest>({
        categoryId: '',
        categoryName: '',
        displayOrder: 1,
        enabled: true,
        weight: 0,
        instructions: [],
        feedbackMessageTemplate: '',
    });

    // Fetch Form
    const { data: form, isLoading: isFormLoading } = useQuery({
        queryKey: ['qm-evaluation-form', formId],
        queryFn: () => getQmEvaluationForm(formId!, config),
        enabled: !!formId,
    });

    // Fetch Categories
    const { data: categories } = useQuery({
        queryKey: ['qm-categories', formId],
        queryFn: () => getCategories(formId!, config),
        enabled: !!formId,
    });

    // DnD Sensors
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id || !categories) return;

        const oldIndex = categories.findIndex((c) => c.categoryId === active.id);
        const newIndex = categories.findIndex((c) => c.categoryId === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
            const newOrder = arrayMove(categories, oldIndex, newIndex);
            const updates = newOrder.map((cat, index) => ({
                categoryId: cat.categoryId,
                displayOrder: index + 1
            }));

            try {
                await Promise.all(updates.map(u =>
                    updateCategoryOrder(formId!, u.categoryId, { displayOrder: u.displayOrder }, config)

                ));
                queryClient.invalidateQueries({ queryKey: ['qm-categories', formId] });
            } catch (err) {
                console.error("Failed to reorder:", err);
                alert("Failed to save reorder.");
            }
        }
    };

    // Initialize form state
    React.useEffect(() => {
        if (form) {
            setFormName(form.formName);
            setDescription(form.description || '');
            setSystemPrompt(form.systemPrompt || '');
            setVersion(form.version);
            setStatus(form.status);
        }
    }, [form]);

    // Update Form Mutation
    const updateFormMutation = useMutation({
        mutationFn: async (data: UpdateQmEvaluationFormRequest) => {
            return updateQmEvaluationForm(formId!, data, config);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['qm-evaluation-form', formId] });
            alert('Form info updated.');
        },
    });

    // Category Mutations
    const categoryMutation = useMutation({
        mutationFn: async ({ data, categoryId }: { data: CreateCategoryRequest, categoryId?: string }) => {
            if (categoryId) {
                return updateCategory(formId!, categoryId, data, config);
            }
            return createCategory(formId!, data, config);
        },
        onSuccess: () => {
            setOpenCategoryDialog(false);
            setEditingCategory(null);
            queryClient.invalidateQueries({ queryKey: ['qm-categories', formId] });
        }
    });

    const deleteCategoryMutation = useMutation({
        mutationFn: async (categoryId: string) => {
            await deleteCategory(formId!, categoryId, config);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['qm-categories', formId] });
        }
    });

    const handleOpenCategoryDialog = (category?: EvaluationCategory) => {
        if (category) {
            setEditingCategory(category);
            setCategoryFormData({
                categoryId: category.categoryId,
                categoryName: category.categoryName,
                displayOrder: category.displayOrder,
                enabled: category.enabled,
                weight: category.weight,
                instructions: category.instructions || [],
                feedbackMessageTemplate: category.feedbackMessageTemplate,
            });
        } else {
            setEditingCategory(null);
            setCategoryFormData({
                categoryId: '',
                categoryName: '',
                displayOrder: (categories?.length || 0) + 1,
                enabled: true,
                weight: 10,
                instructions: [],
                feedbackMessageTemplate: '',
            });
        }
        setOpenCategoryDialog(true);
    };

    // Bulk Expansion States
    const [bulkExpandCategories, setBulkExpandCategories] = useState<boolean | undefined>(undefined);
    const [bulkExpandSubItems, setBulkExpandSubItems] = useState<boolean | undefined>(undefined);

    if (isFormLoading) return <Box p={4}><CircularProgress /></Box>;
    if (!form) return <Box p={4}>Form not found</Box>;

    return (
        <Box sx={{ p: 3, pb: 10 }}>
            {/* Header */}
            <Stack direction="row" alignItems="center" spacing={2} mb={3}>
                <IconButton onClick={() => navigate('/qm-evaluation-form')}>
                    <BackIcon />
                </IconButton>
                <Typography variant="h5" fontWeight={600}>Edit Evaluation Form</Typography>
            </Stack>

            <Grid container spacing={3}>
                {/* Left Col: Form Info */}
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 3, position: 'sticky', top: 20 }}>
                        <Typography variant="h6" gutterBottom>Basic Info</Typography>
                        <Stack spacing={3}>
                            <TextField
                                label="Form Name" fullWidth required
                                value={formName} onChange={(e) => setFormName(e.target.value)}
                                error={!formName.trim()}
                                helperText={!formName.trim() ? "평가표 명은 필수 항목입니다." : ""}
                            />
                            <TextField
                                label="Description" fullWidth multiline rows={3}
                                value={description} onChange={(e) => setDescription(e.target.value)}
                            />
                            <TextField
                                label="System Prompt" fullWidth multiline rows={8}
                                value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
                                helperText="AI 평가 모델에 전달될 시스템 프롬프트입니다."
                            />
                            <TextField
                                label="Version" fullWidth required
                                value={version} onChange={(e) => setVersion(e.target.value)}
                                error={!version.trim()}
                                helperText={!version.trim() ? "버전은 필수 항목입니다." : ""}
                            />
                            <FormControl fullWidth>
                                <InputLabel>Status</InputLabel>
                                <Select value={status} label="Status" onChange={(e) => setStatus(e.target.value)}>
                                    <MenuItem value="DRAFT">DRAFT</MenuItem>
                                    <MenuItem value="ACTIVE">ACTIVE</MenuItem>
                                    <MenuItem value="INACTIVE">INACTIVE</MenuItem>
                                </Select>
                            </FormControl>
                            <Button
                                variant="contained" startIcon={<SaveIcon />}
                                onClick={() => updateFormMutation.mutate({ formName, description, systemPrompt, version, status })}
                                disabled={!formName.trim() || !version.trim() || updateFormMutation.isPending}
                            >
                                Save Changes
                            </Button>
                        </Stack>
                    </Paper>
                </Grid>

                {/* Right Col: Categories & SubItems */}
                <Grid item xs={12} md={8}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="h6">Categories ({categories?.length || 0})</Typography>
                            <Stack direction="row" spacing={1}>
                                <Button size="small" variant="outlined" onClick={() => setBulkExpandCategories(!bulkExpandCategories)}>
                                    {bulkExpandCategories ? 'Collapse All Categories' : 'Expand All Categories'}
                                </Button>
                                <Button size="small" variant="outlined" onClick={() => setBulkExpandSubItems(!bulkExpandSubItems)}>
                                    {bulkExpandSubItems ? 'Collapse All SubItems' : 'Expand All SubItems'}
                                </Button>
                            </Stack>
                        </Stack>
                        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenCategoryDialog()}>
                            Add Category
                        </Button>
                    </Stack>

                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={categories?.map(c => c.categoryId) || []} strategy={verticalListSortingStrategy}>
                            {categories?.sort((a, b) => a.displayOrder - b.displayOrder).map((category) => (
                                <SortableCategoryItem
                                    key={category.categoryId}
                                    formId={formId!}
                                    category={category}
                                    onEdit={handleOpenCategoryDialog}
                                    onDelete={(id) => { if (window.confirm('Delete category?')) deleteCategoryMutation.mutate(id); }}
                                    config={config}
                                    allExpanded={bulkExpandCategories}
                                    allSubExpanded={bulkExpandSubItems}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                </Grid>
            </Grid>

            {/* Category Dialog */}
            <Dialog open={openCategoryDialog} onClose={() => setOpenCategoryDialog(false)} maxWidth="md" fullWidth>
                <DialogTitle>{editingCategory ? 'Edit Category' : 'New Category'}</DialogTitle>
                <DialogContent>
                    <Stack spacing={3} mt={1}>
                        <TextField
                            label="Category ID (Key)" fullWidth required
                            disabled={!!editingCategory}
                            value={categoryFormData.categoryId}
                            onChange={(e) => setCategoryFormData({ ...categoryFormData, categoryId: e.target.value })}
                            error={!categoryFormData.categoryId?.trim()}
                            helperText={!categoryFormData.categoryId?.trim() ? "카테고리 ID는 필수 항목입니다." : (editingCategory ? "ID cannot be changed after creation" : "Unique identifier (e.g., accuracy, speed)")}
                        />
                        <TextField
                            label="Category Name" fullWidth required
                            value={categoryFormData.categoryName}
                            onChange={(e) => setCategoryFormData({ ...categoryFormData, categoryName: e.target.value })}
                            error={!categoryFormData.categoryName?.trim()}
                            helperText={!categoryFormData.categoryName?.trim() ? "카테고리 명은 필수 항목입니다." : ""}
                        />
                        <Stack direction="row" spacing={2}>
                            <TextField
                                label="Display Order" type="number" fullWidth
                                value={categoryFormData.displayOrder}
                                onChange={(e) => setCategoryFormData({ ...categoryFormData, displayOrder: parseInt(e.target.value) })}
                            />
                            <TextField
                                label="Weight" type="number" fullWidth
                                value={categoryFormData.weight}
                                onChange={(e) => setCategoryFormData({ ...categoryFormData, weight: parseInt(e.target.value) })}
                            />
                        </Stack>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={categoryFormData.enabled}
                                    onChange={(e) => setCategoryFormData({ ...categoryFormData, enabled: e.target.checked })}
                                />
                            }
                            label="Enabled"
                        />
                        {/* Instructions List Management */}
                        <Typography variant="subtitle2" sx={{ mt: 2 }}>Instructions</Typography>
                        {(categoryFormData.instructions || []).map((instruction, index) => (
                            <Stack key={index} direction="row" spacing={1} alignItems="center">
                                <TextField
                                    fullWidth size="small"
                                    value={instruction}
                                    onChange={(e) => {
                                        const newInstructions = [...(categoryFormData.instructions || [])];
                                        newInstructions[index] = e.target.value;
                                        setCategoryFormData({ ...categoryFormData, instructions: newInstructions });
                                    }}
                                />
                                <IconButton onClick={() => {
                                    const newInstructions = (categoryFormData.instructions || []).filter((_, i) => i !== index);
                                    setCategoryFormData({ ...categoryFormData, instructions: newInstructions });
                                }}>
                                    <DeleteIcon />
                                </IconButton>
                            </Stack>
                        ))}
                        <Button
                            startIcon={<AddIcon />} size="small"
                            onClick={() => setCategoryFormData({ ...categoryFormData, instructions: [...(categoryFormData.instructions || []), ''] })}
                        >
                            Add Instruction
                        </Button>

                        <TextField
                            label="Feedback Message Template" fullWidth multiline rows={3}
                            value={categoryFormData.feedbackMessageTemplate}
                            onChange={(e) => setCategoryFormData({ ...categoryFormData, feedbackMessageTemplate: e.target.value })}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenCategoryDialog(false)}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={() => categoryMutation.mutate({ data: categoryFormData, categoryId: editingCategory?.categoryId })}
                        disabled={!categoryFormData.categoryName || !categoryFormData.categoryId || categoryMutation.isPending}
                    >
                        Save
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default QMEvaluationFormDetail;

