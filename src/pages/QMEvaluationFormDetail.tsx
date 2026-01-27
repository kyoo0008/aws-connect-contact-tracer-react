
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
    ListItemSecondaryAction,
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
} from '@/services/qmEvaluationFormService';
import {
    QmEvaluationForm,
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
}

const SubItemDialog: React.FC<SubItemDialogProps> = ({
    open,
    onClose,
    onSubmit,
    initialData,
    isLoading,
}) => {
    const [formData, setFormData] = useState<CreateSubItemRequest>({
        subItemName: '',
        displayOrder: 1,
        evaluationCriteria: [],
        ...initialData,
    });

    // Criteria state management
    const handleAddCriteria = () => {
        setFormData((prev) => ({
            ...prev,
            evaluationCriteria: [
                ...prev.evaluationCriteria,
                { criteriaId: '', description: '', details: '' },
            ],
        }));
    };

    const handleCriteriaChange = (index: number, field: keyof EvaluationCriterion, value: string) => {
        const newCriteria = [...formData.evaluationCriteria];
        newCriteria[index] = { ...newCriteria[index], [field]: value };
        setFormData((prev) => ({ ...prev, evaluationCriteria: newCriteria }));
    };

    const handleDeleteCriteria = (index: number) => {
        const newCriteria = formData.evaluationCriteria.filter((_, i) => i !== index);
        setFormData((prev) => ({ ...prev, evaluationCriteria: newCriteria }));
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{initialData ? '소항목 수정' : '소항목 추가'}</DialogTitle>
            <DialogContent>
                <Stack spacing={3} sx={{ mt: 1 }}>
                    <TextField
                        label="소항목 명"
                        fullWidth
                        required
                        value={formData.subItemName}
                        onChange={(e) => setFormData({ ...formData, subItemName: e.target.value })}
                    />
                    <TextField
                        label="표시 순서"
                        type="number"
                        fullWidth
                        value={formData.displayOrder}
                        onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) })}
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
                                        value={criterion.criteriaId}
                                        onChange={(e) => handleCriteriaChange(index, 'criteriaId', e.target.value)}
                                        placeholder="1.1.1"
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
                    onClick={() => onSubmit(formData)}
                    disabled={!formData.subItemName || isLoading}
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
}

const CategoryItem: React.FC<CategoryItemProps> = ({ formId, category, onEdit, onDelete, config }) => {
    const [expanded, setExpanded] = useState(false);
    const [openSubItemDialog, setOpenSubItemDialog] = useState(false); // Create SubItem
    const [editingSubItem, setEditingSubItem] = useState<EvaluationSubItem | null>(null); // Edit SubItem

    const queryClient = useQueryClient();

    // Fetch SubItems
    const { data: subItems, isLoading } = useQuery({
        queryKey: ['qm-subitems', formId, category.categoryId],
        queryFn: () => getSubItems(formId, category.categoryId, config),
        enabled: expanded, // Only fetch when expanded
    });

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
        // If editing, we might need to preserve ID or use a different call.
        // The prompts says "POST ... (Add/Modify)". So maybe we just pass the ID in the body if it exists?
        // But `CreateSubItemRequest` doesn't have ID.
        // Ideally we should have `updateSubItem` if modifying.
        // I'll assume `createSubItem` handles it or I need to handle it.
        // Since I don't have `updateSubItem` in service yet (oops, I missed it in service based on plan?
        // Plan: POST .../subitems (소항목 추가/수정) -> ONE endpoint.
        // So if I include subItemId in body, it updates?
        // `CreateSubItemRequest` defined in types didn't include ID.
        // Let's assume for now we just call the same API.
        const payload = { ...data };
        if (editingSubItem) {
            // payload.subItemId = editingSubItem.subItemId; // If the API supports it
            // Since I can't easily change the type definition in the middle of this file generation without context loss,
            // I will assume the backend handles upsert based on name or I'm creating new ones.
            // Actually, for "Edit", usually it's PUT /subitems/{id} OR POST /subitems with ID.
            // The plan says: POST .../subitems (Add/Modify).
            // It's ambiguous. I'll proceed with creating sending the data.
            // Wait, I should probably check if I can add ID to the payload.
            (payload as any).subItemId = editingSubItem.subItemId;
        }
        subItemMutation.mutate({ data, subItemId: editingSubItem?.subItemId });
    };

    return (
        <Card variant="outlined" sx={{ mb: 2 }}>
            <CardHeader
                title={
                    <Stack direction="row" alignItems="center" spacing={2}>
                        <Typography variant="h6">{category.categoryName}</Typography>
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
                        <Typography variant="body2" color="text.secondary" style={{ whiteSpace: 'pre-line' }}>
                            {category.promptSection}
                        </Typography>
                    </Box>

                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                        <Typography variant="subtitle1" fontWeight={600}>SubItems</Typography>
                        <Button startIcon={<AddIcon />} size="small" onClick={() => { setEditingSubItem(null); setOpenSubItemDialog(true); }}>
                            Add SubItem
                        </Button>
                    </Stack>

                    {isLoading ? (
                        <LinearProgress />
                    ) : (
                        <List dense>
                            {subItems?.map((subItem) => (
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
                                        <ListItemText
                                            primary={`${subItem.displayOrder}. ${subItem.subItemName}`}
                                            secondary={`${subItem.evaluationCriteria?.length || 0} Criteria`}
                                        />
                                    </ListItem>
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
    const [version, setVersion] = useState('');
    const [status, setStatus] = useState<any>('DRAFT');

    // Category Dialog State
    const [openCategoryDialog, setOpenCategoryDialog] = useState(false);
    const [editingCategory, setEditingCategory] = useState<EvaluationCategory | null>(null);
    const [categoryFormData, setCategoryFormData] = useState<CreateCategoryRequest>({
        categoryName: '',
        displayOrder: 1,
        enabled: true,
        weight: 0,
        promptSection: '',
        feedbackMessageTemplate: '',
    });

    // Fetch Form
    const { data: form, isLoading: isFormLoading } = useQuery({
        queryKey: ['qm-evaluation-form', formId],
        queryFn: () => getQmEvaluationForm(formId!, config),
        enabled: !!formId,
    });

    // Fetch Categories
    const { data: categories, isLoading: isCategoriesLoading } = useQuery({
        queryKey: ['qm-categories', formId],
        queryFn: () => getCategories(formId!, config),
        enabled: !!formId,
    });

    // Initialize form state
    React.useEffect(() => {
        if (form) {
            setFormName(form.formName);
            setDescription(form.description || '');
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
                categoryName: category.categoryName,
                displayOrder: category.displayOrder,
                enabled: category.enabled,
                weight: category.weight,
                promptSection: category.promptSection,
                feedbackMessageTemplate: category.feedbackMessageTemplate,
            });
        } else {
            setEditingCategory(null);
            setCategoryFormData({
                categoryName: '',
                displayOrder: (categories?.length || 0) + 1,
                enabled: true,
                weight: 10,
                promptSection: '## ',
                feedbackMessageTemplate: '',
            });
        }
        setOpenCategoryDialog(true);
    };

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
                                label="Form Name" fullWidth
                                value={formName} onChange={(e) => setFormName(e.target.value)}
                            />
                            <TextField
                                label="Description" fullWidth multiline rows={3}
                                value={description} onChange={(e) => setDescription(e.target.value)}
                            />
                            <TextField
                                label="Version" fullWidth
                                value={version} onChange={(e) => setVersion(e.target.value)}
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
                                onClick={() => updateFormMutation.mutate({ formName, description, version, status })}
                                disabled={updateFormMutation.isPending}
                            >
                                Save Changes
                            </Button>
                        </Stack>
                    </Paper>
                </Grid>

                {/* Right Col: Categories & SubItems */}
                <Grid item xs={12} md={8}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                        <Typography variant="h6">Categories ({categories?.length || 0})</Typography>
                        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenCategoryDialog()}>
                            Add Category
                        </Button>
                    </Stack>

                    {categories?.map((category) => (
                        <CategoryItem
                            key={category.categoryId}
                            formId={formId!}
                            category={category}
                            onEdit={handleOpenCategoryDialog}
                            onDelete={(id) => { if (window.confirm('Delete category?')) deleteCategoryMutation.mutate(id); }}
                            config={config}
                        />
                    ))}
                </Grid>
            </Grid>

            {/* Category Dialog */}
            <Dialog open={openCategoryDialog} onClose={() => setOpenCategoryDialog(false)} maxWidth="md" fullWidth>
                <DialogTitle>{editingCategory ? 'Edit Category' : 'New Category'}</DialogTitle>
                <DialogContent>
                    <Stack spacing={3} mt={1}>
                        <TextField
                            label="Category Name" fullWidth required
                            value={categoryFormData.categoryName}
                            onChange={(e) => setCategoryFormData({ ...categoryFormData, categoryName: e.target.value })}
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
                        <TextField
                            label="Prompt Section" fullWidth multiline rows={6}
                            value={categoryFormData.promptSection}
                            onChange={(e) => setCategoryFormData({ ...categoryFormData, promptSection: e.target.value })}
                            helperText="Use Markdown for prompt section"
                        />
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
                        disabled={!categoryFormData.categoryName || categoryMutation.isPending}
                    >
                        Save
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default QMEvaluationFormDetail;
