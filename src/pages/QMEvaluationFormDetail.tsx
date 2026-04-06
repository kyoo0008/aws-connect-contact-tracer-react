
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
    Upload as UploadIcon,
    Download as DownloadIcon,
    Visibility as VisibilityIcon,
} from '@mui/icons-material';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragStartEvent,
    useDroppable,
    useDraggable,
    DragOverlay,
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
    createCategory,
    updateCategory,
    deleteCategory,
    createSubItem,
    updateSubItem,
    deleteSubItem,
    updateCategoryOrder,
    bulkUpdateCategories,
    getQmEvaluationFormPromptPreview,
} from '@/services/qmEvaluationFormService';
import {
    EvaluationCategory,
    EvaluationSubItem,
    UpdateQmEvaluationFormRequest,
    CreateCategoryRequest,
    CreateSubItemRequest,
    BulkUpdateCategoriesRequest,
} from '@/types/qmEvaluationForm.types';

// --- Bulk Update Dialog Component ---
interface BulkUpdateDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: BulkUpdateCategoriesRequest) => void;
    isLoading: boolean;
    currentCategories?: EvaluationCategory[];
}

const BulkUpdateDialog: React.FC<BulkUpdateDialogProps> = ({
    open,
    onClose,
    onSubmit,
    isLoading,
    currentCategories,
}) => {
    const [jsonInput, setJsonInput] = useState('');
    const [jsonError, setJsonError] = useState<string | null>(null);

    // Generate sample JSON from current categories (with subItems already included)
    const generateSampleJson = async () => {
        if (currentCategories && currentCategories.length > 0) {
            const categoriesWithSubItems = currentCategories.map((cat) => ({
                categoryId: cat.categoryId,
                categoryName: cat.categoryName,
                displayOrder: cat.displayOrder,
                enabled: cat.enabled,
                weight: cat.weight,
                instructions: cat.instructions || [],
                feedbackMessageTemplate: cat.feedbackMessageTemplate || '',
                subItems: (cat.subItems || []).map(si => ({
                    subItemId: si.subItemId,
                    subItemName: si.subItemName,
                    displayOrder: si.displayOrder,
                    weight: si.weight,
                    instruction: si.instruction || '',
                    description: si.description || '',
                })),
            }));
            const sampleData: BulkUpdateCategoriesRequest = {
                categories: categoriesWithSubItems,
            };
            setJsonInput(JSON.stringify(sampleData, null, 2));
        } else {
            const sampleData: BulkUpdateCategoriesRequest = {
                categories: [
                    {
                        categoryId: 'greeting',
                        categoryName: '인사',
                        displayOrder: 1,
                        enabled: true,
                        weight: 1,
                        instructions: ['인사말 평가 지침'],
                        feedbackMessageTemplate: '피드백 템플릿',
                        subItems: [
                            {
                                subItemId: 'opening',
                                subItemName: '오프닝 인사',
                                displayOrder: 1,
                                weight: 1,
                                instruction: '지시사항',
                            },
                        ],
                    },
                ],
            };
            setJsonInput(JSON.stringify(sampleData, null, 2));
        }
        setJsonError(null);
    };

    const handleSubmit = () => {
        try {
            const parsed = JSON.parse(jsonInput);
            if (!parsed.categories || !Array.isArray(parsed.categories)) {
                setJsonError('JSON must contain a "categories" array');
                return;
            }
            // Validate each category has required fields
            for (const cat of parsed.categories) {
                if (!cat.categoryId || !cat.categoryName) {
                    setJsonError('Each category must have "categoryId" and "categoryName"');
                    return;
                }
            }
            setJsonError(null);
            onSubmit(parsed);
        } catch (e) {
            setJsonError('Invalid JSON format');
        }
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target?.result as string;
                setJsonInput(content);
                setJsonError(null);
            };
            reader.readAsText(file);
        }
    };

    const handleDownloadTemplate = async () => {
        await generateSampleJson();
        const blob = new Blob([jsonInput || ''], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bulk-categories-template.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogTitle>Bulk Update Categories</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <Stack direction="row" spacing={2}>
                        <Button
                            variant="outlined"
                            startIcon={<DownloadIcon />}
                            onClick={generateSampleJson}
                        >
                            Load Current Data
                        </Button>
                        <Button
                            variant="outlined"
                            component="label"
                            startIcon={<UploadIcon />}
                        >
                            Upload JSON File
                            <input
                                type="file"
                                hidden
                                accept=".json"
                                onChange={handleFileUpload}
                            />
                        </Button>
                    </Stack>
                    <TextField
                        label="Categories JSON"
                        fullWidth
                        multiline
                        rows={20}
                        value={jsonInput}
                        onChange={(e) => {
                            setJsonInput(e.target.value);
                            setJsonError(null);
                        }}
                        error={!!jsonError}
                        helperText={jsonError || 'Paste or upload JSON data for bulk category update'}
                        sx={{
                            '& .MuiInputBase-input': {
                                fontFamily: 'monospace',
                                fontSize: '0.85rem',
                            },
                        }}
                    />
                </Stack>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    variant="contained"
                    onClick={handleSubmit}
                    disabled={!jsonInput.trim() || isLoading}
                >
                    {isLoading ? 'Updating...' : 'Bulk Update'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

// --- SubItem Dialog Component ---
interface SubItemDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: CreateSubItemRequest) => void;
    initialData?: EvaluationSubItem;
    isLoading: boolean;
    defaultDisplayOrder?: number;
    categoryId?: string;
    existingSubItems?: EvaluationSubItem[];
}

const SubItemDialog: React.FC<SubItemDialogProps> = ({
    open,
    onClose,
    onSubmit,
    initialData,
    isLoading,
    defaultDisplayOrder = 1,
    categoryId,
    existingSubItems,
}) => {
    const generateSubItemId = () => {
        if (!categoryId || initialData) return initialData?.subItemId || '';
        const existing = existingSubItems || [];
        const prefix = `${categoryId}_`;
        let maxSeq = 0;
        existing.forEach(si => {
            if (si.subItemId.startsWith(prefix)) {
                const num = parseInt(si.subItemId.slice(prefix.length), 10);
                if (!isNaN(num) && num > maxSeq) maxSeq = num;
            }
        });
        return `${prefix}${String(maxSeq + 1).padStart(2, '0')}`;
    };

    const [formData, setFormData] = useState<CreateSubItemRequest>(() => {
        return {
            subItemId: generateSubItemId(),
            subItemName: initialData?.subItemName || '',
            displayOrder: initialData?.displayOrder || defaultDisplayOrder,
            weight: initialData?.weight ?? 1,
            instruction: initialData?.instruction || '',
            description: initialData?.description || '',
        };
    });
    const [jsonError, setJsonError] = useState<string | null>(null);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{initialData ? '소항목 수정' : '소항목 추가'}</DialogTitle>
            <DialogContent>
                <Stack spacing={3} sx={{ mt: 1 }}>
                    <TextField
                        label="소항목 ID (Key)"
                        fullWidth
                        required
                        disabled
                        value={formData.subItemId}
                        onChange={(e) => setFormData({ ...formData, subItemId: e.target.value })}
                        error={!formData.subItemId?.trim()}
                        helperText={!formData.subItemId?.trim() ? "소항목 ID는 필수 항목입니다." : (initialData ? "ID는 변경할 수 없습니다." : "카테고리 내 자동 할당")}
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
                        label="배점 (Weight)"
                        type="number"
                        fullWidth
                        value={formData.weight ?? 3}
                        onChange={(e) => setFormData({ ...formData, weight: e.target.value ? parseInt(e.target.value) : 1 })}
                        helperText="소항목 배점"
                    />
                    <TextField
                        label="Instructions (가이드)"
                        fullWidth
                        multiline
                        rows={3}
                        value={formData.instruction}
                        onChange={(e) => setFormData({ ...formData, instruction: e.target.value })}
                        helperText="AI를 위한 평가 가이드라인입니다."
                    />
                    <TextField
                        label="설명 (Description)"
                        fullWidth
                        multiline
                        rows={3}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        helperText="소항목에 대한 설명입니다."
                    />


                </Stack>
                <DialogActions>
                    <Button onClick={onClose}>취소</Button>
                    <Button
                        variant="contained"
                        onClick={() => {
                            let finalData = { ...formData };


                            onSubmit(finalData);
                        }}
                        disabled={!formData.subItemName || !formData.subItemId || isLoading}
                    >
                        {isLoading ? '저장 중...' : '저장'}
                    </Button>
                </DialogActions>

            </DialogContent>
        </Dialog>
    );
};

// --- Helper ---
const truncateText = (text: string, maxLen: number) =>
    text.length > maxLen ? text.slice(0, maxLen) + '...' : text;

const WEIGHT_CONFIG = [
    { weight: 5, label: '가중치 5 (가장 중요)', color: '#d32f2f' },
    { weight: 4, label: '가중치 4 (고려 필요)', color: '#f9a825' },
    { weight: 3, label: '가중치 3 (보통)', color: '#7cb342' },
    { weight: 2, label: '가중치 2 (덜 중요)', color: '#2e7d32' },
    { weight: 1, label: '가중치 1 (미미함)', color: '#1b5e20' },
];

// --- Droppable Weight Column ---
const DroppableWeightColumn: React.FC<{
    weight: number;
    label: string;
    color: string;
    children: React.ReactNode;
}> = ({ weight, label, color, children }) => {
    const { setNodeRef, isOver } = useDroppable({
        id: `weight-${weight}`,
        data: { weight },
    });

    return (
        <Box
            ref={setNodeRef}
            sx={{
                flex: '1 1 0',
                minWidth: 180,
                borderTop: `3px solid ${color}`,
                bgcolor: isOver ? 'action.hover' : 'grey.50',
                borderRadius: 1,
                display: 'flex',
                flexDirection: 'column',
                transition: 'background-color 0.2s',
            }}
        >
            <Typography variant="caption" fontWeight={600} sx={{ p: 1, pb: 0.5, color: 'text.secondary' }}>
                {label}
            </Typography>
            <Box sx={{ p: 1, pt: 0.5, display: 'flex', flexDirection: 'column', gap: 1, minHeight: 80 }}>
                {children}
            </Box>
        </Box>
    );
};

// --- Draggable SubItem Card ---
const DraggableSubItemCard: React.FC<{
    subItem: EvaluationSubItem;
    weightColor: string;
    bgColor: string;
    categoryName: string;
    onEdit: (subItem: EvaluationSubItem) => void;
    onDelete: (subItemId: string) => void;
}> = ({ subItem, weightColor, bgColor, categoryName, onEdit, onDelete }) => {
    const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
        id: subItem.subItemId,
        data: { subItem },
    });
    const { setNodeRef: setDropRef, isOver } = useDroppable({
        id: `card-${subItem.subItemId}`,
        data: { subItem },
    });
    const setNodeRef = (node: HTMLElement | null) => {
        setDragRef(node);
        setDropRef(node);
    };
    const pointerStart = React.useRef<{ x: number; y: number } | null>(null);

    return (
        <Paper
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            onPointerDown={(e) => {
                pointerStart.current = { x: e.clientX, y: e.clientY };
                listeners?.onPointerDown?.(e as any);
            }}
            onPointerUp={(e) => {
                if (pointerStart.current) {
                    const dx = Math.abs(e.clientX - pointerStart.current.x);
                    const dy = Math.abs(e.clientY - pointerStart.current.y);
                    if (dx < 5 && dy < 5) {
                        onEdit(subItem);
                    }
                }
                pointerStart.current = null;
            }}
            variant="outlined"
            sx={{
                p: 1.5,
                bgcolor: bgColor,
                cursor: 'grab',
                '&:hover': { boxShadow: 1 },
                position: 'relative',
                opacity: isDragging ? 0.3 : 1,
                borderTop: isOver && !isDragging ? '2px solid #1976d2' : undefined,
            }}
        >
            <IconButton
                size="small"
                sx={{ position: 'absolute', top: 2, right: 22, opacity: 0.6, '&:hover': { opacity: 1 } }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onEdit(subItem); }}
            >
                <EditIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <IconButton
                size="small"
                sx={{ position: 'absolute', top: 2, right: 2, opacity: 0.6, '&:hover': { opacity: 1 } }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Delete this subitem?')) onDelete(subItem.subItemId);
                }}
            >
                <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <Typography variant="body2" fontWeight={600} sx={{ color: weightColor, pr: 5 }}>
                {subItem.subItemName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
                [{categoryName}]
            </Typography>
            {subItem.instruction && (
                <Typography variant="caption" fontWeight={700} display="block" sx={{ mt: 0.5 }}>
                    {truncateText(subItem.instruction, 10)}
                </Typography>
            )}
            {subItem.description && (
                <Typography variant="caption" display="block" color="text.secondary">
                    {truncateText(subItem.description, 10)}
                </Typography>
            )}
        </Paper>
    );
};

// --- Category Item Component ---


interface CategoryItemProps {
    formId: string;
    category: EvaluationCategory;
    categorySubItems?: EvaluationSubItem[];
    onEdit: (category: EvaluationCategory) => void;
    onDelete: (categoryId: string) => void;
    config: any;
    allExpanded?: boolean;
}

const SortableCategoryItem: React.FC<CategoryItemProps> = ({
    formId,
    category,
    categorySubItems,
    onEdit,
    onDelete,
    config,
    allExpanded,
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
    const [openSubItemDialog, setOpenSubItemDialog] = useState(false); // Create SubItem
    const [editingSubItem, setEditingSubItem] = useState<EvaluationSubItem | null>(null); // Edit SubItem
    const [activeDragId, setActiveDragId] = useState<string | null>(null);

    const subItemSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    useEffect(() => {
        if (allExpanded !== undefined) setExpanded(allExpanded);
    }, [allExpanded]);

    const queryClient = useQueryClient();

    // Use subItems from the form response (passed via props)
    const subItems = categorySubItems;

    // Helper: reorder displayOrder (1-based) for items in a weight group
    const reorderWeightGroup = async (weight: number, items: EvaluationSubItem[]) => {
        const group = items
            .filter(si => (si.weight ?? 1) === weight)
            .sort((a, b) => a.displayOrder - b.displayOrder);
        await Promise.all(group.map((item, idx) =>
            item.displayOrder !== idx + 1
                ? updateSubItem(formId, category.categoryId, item.subItemId, {
                    subItemName: item.subItemName,
                    displayOrder: idx + 1,
                    weight: item.weight,
                    instruction: item.instruction,
                    description: item.description,
                }, config)
                : Promise.resolve()
        ));
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
            queryClient.invalidateQueries({ queryKey: ['qm-evaluation-form', formId] });
        },
    });

    const deleteSubItemMutation = useMutation({
        mutationFn: async (subItemId: string) => {
            const deletedItem = subItems?.find(si => si.subItemId === subItemId);
            await deleteSubItem(formId, category.categoryId, subItemId, config);
            // Reorder remaining items in the same weight group
            if (deletedItem) {
                const remaining = (subItems || []).filter(si => si.subItemId !== subItemId);
                await reorderWeightGroup(deletedItem.weight ?? 1, remaining);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['qm-evaluation-form', formId] });
        },
    });

    const handleSaveSubItem = async (data: CreateSubItemRequest) => {
        const allItems = subItems || [];
        const newWeight = data.weight ?? 1;

        if (!editingSubItem) {
            // Add: auto-set displayOrder to end of target weight group
            const count = allItems.filter(si => (si.weight ?? 1) === newWeight).length;
            data = { ...data, displayOrder: count + 1 };
            subItemMutation.mutate({ data });
        } else {
            const oldWeight = editingSubItem.weight ?? 1;
            if (oldWeight !== newWeight) {
                // Weight changed: place at end of new group
                const newGroupCount = allItems.filter(si => (si.weight ?? 1) === newWeight).length;
                data = { ...data, displayOrder: newGroupCount + 1 };
            }
            subItemMutation.mutate({ data, subItemId: editingSubItem.subItemId });

            if (oldWeight !== newWeight) {
                // Reorder old weight group (excluding moved item)
                const remaining = allItems.filter(si => si.subItemId !== editingSubItem.subItemId);
                await reorderWeightGroup(oldWeight, remaining);
            }
        }
    };

    const handleSubItemDragEnd = async (event: DragEndEvent) => {
        setActiveDragId(null);
        const { active, over } = event;
        if (!over) return;

        const draggedSubItem = (active.data.current as any)?.subItem as EvaluationSubItem | undefined;
        if (!draggedSubItem) return;

        const overId = over.id as string;
        const allItems = subItems || [];
        const sourceWeight = draggedSubItem.weight ?? 1;

        try {
            if (overId.startsWith('card-')) {
                // Dropped on another card
                const targetSubItem = (over.data.current as any)?.subItem as EvaluationSubItem;
                if (!targetSubItem || targetSubItem.subItemId === draggedSubItem.subItemId) return;

                const targetWeight = targetSubItem.weight ?? 1;

                if (sourceWeight === targetWeight) {
                    // Same weight: reorder within group
                    const group = allItems
                        .filter(si => (si.weight ?? 1) === targetWeight)
                        .sort((a, b) => a.displayOrder - b.displayOrder);
                    const oldIndex = group.findIndex(si => si.subItemId === draggedSubItem.subItemId);
                    const newIndex = group.findIndex(si => si.subItemId === targetSubItem.subItemId);
                    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

                    const reordered = arrayMove(group, oldIndex, newIndex);
                    await Promise.all(reordered.map((item, idx) =>
                        item.displayOrder !== idx + 1
                            ? updateSubItem(formId, category.categoryId, item.subItemId, {
                                subItemName: item.subItemName,
                                displayOrder: idx + 1,
                                weight: item.weight,
                                instruction: item.instruction,
                                description: item.description,
                            }, config)
                            : Promise.resolve()
                    ));
                } else {
                    // Different weight: move to target weight, insert at target position
                    const targetGroup = allItems
                        .filter(si => (si.weight ?? 1) === targetWeight)
                        .sort((a, b) => a.displayOrder - b.displayOrder);
                    const targetIndex = targetGroup.findIndex(si => si.subItemId === targetSubItem.subItemId);
                    targetGroup.splice(targetIndex, 0, { ...draggedSubItem, weight: targetWeight });

                    // Update dragged item + reorder target group
                    await Promise.all(targetGroup.map((item, idx) =>
                        updateSubItem(formId, category.categoryId, item.subItemId, {
                            subItemName: item.subItemName,
                            displayOrder: idx + 1,
                            weight: targetWeight,
                            instruction: item.instruction,
                            description: item.description,
                        }, config)
                    ));
                    // Reorder source group
                    const remaining = allItems.filter(si => si.subItemId !== draggedSubItem.subItemId);
                    await reorderWeightGroup(sourceWeight, remaining);
                }
            } else {
                // Dropped on a weight column → move to end
                const newWeight = (over.data.current as any)?.weight as number | undefined;
                if (newWeight === undefined || newWeight === sourceWeight) return;

                const newGroupCount = allItems.filter(si => (si.weight ?? 1) === newWeight).length;
                await updateSubItem(formId, category.categoryId, draggedSubItem.subItemId, {
                    subItemName: draggedSubItem.subItemName,
                    weight: newWeight,
                    displayOrder: newGroupCount + 1,
                    instruction: draggedSubItem.instruction,
                    description: draggedSubItem.description,
                }, config);

                const remaining = allItems.filter(si => si.subItemId !== draggedSubItem.subItemId);
                await reorderWeightGroup(sourceWeight, remaining);
            }
        } finally {
            queryClient.invalidateQueries({ queryKey: ['qm-evaluation-form', formId] });
        }
    };

    const activeDragItem = subItems?.find(si => si.subItemId === activeDragId);

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
                    {/* Instructions */}
                    <Box mb={2}>
                        <Typography variant="subtitle2" gutterBottom>Instructions</Typography>
                        <Stack spacing={1}>
                            {(category.instructions && category.instructions.length > 0) ? (
                                <List dense sx={{ bgcolor: 'action.hover', borderRadius: 1 }}>
                                    {category.instructions.map((inst, idx) => (
                                        <ListItem key={idx}>
                                            <ListItemText primary={inst} primaryTypographyProps={{ sx: { whiteSpace: 'pre-wrap' } }} />
                                        </ListItem>
                                    ))}
                                </List>
                            ) : (
                                <Typography variant="body2" color="text.secondary">Instructions이 설정되지 않았습니다.</Typography>
                            )}
                        </Stack>
                    </Box>

                    <Box mb={2}>
                        <Typography variant="subtitle2" gutterBottom>상담원 피드백 문구</Typography>
                        {category.feedbackMessageTemplate ? (
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
                            <Typography variant="body2" color="text.secondary">피드백 문구가 설정되지 않았습니다.</Typography>
                        )}
                    </Box>

                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                        <Typography variant="subtitle1" fontWeight={600}>SubItems</Typography>
                        <Button startIcon={<AddIcon />} size="small" onClick={() => { setEditingSubItem(null); setOpenSubItemDialog(true); }}>
                            Add SubItem
                        </Button>
                    </Stack>

                    {/* Weight-based Kanban Columns with Drag & Drop */}
                    <DndContext
                        sensors={subItemSensors}
                        collisionDetection={closestCenter}
                        onDragStart={(event: DragStartEvent) => setActiveDragId(event.active.id as string)}
                        onDragEnd={handleSubItemDragEnd}
                    >
                        <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 1 }}>
                            {WEIGHT_CONFIG.map(({ weight, label, color }) => {
                                const items = (subItems?.slice().sort((a, b) => a.displayOrder - b.displayOrder) || [])
                                    .filter(si => (si.weight ?? 1) === weight);
                                return (
                                    <DroppableWeightColumn key={weight} weight={weight} label={label} color={color}>
                                        {items.map((subItem) => (
                                            <DraggableSubItemCard
                                                key={subItem.subItemId}
                                                subItem={subItem}
                                                weightColor={color}
                                                bgColor={weight >= 4 ? '#e3f2fd' : 'background.paper'}
                                                categoryName={category.categoryName}
                                                onEdit={(si) => { setEditingSubItem(si); setOpenSubItemDialog(true); }}
                                                onDelete={(id) => deleteSubItemMutation.mutate(id)}
                                            />
                                        ))}
                                    </DroppableWeightColumn>
                                );
                            })}
                        </Box>
                        <DragOverlay dropAnimation={null}>
                            {activeDragItem ? (
                                <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#e3f2fd', boxShadow: 3, width: 180 }}>
                                    <Typography variant="body2" fontWeight={600}>{activeDragItem.subItemName}</Typography>
                                    <Typography variant="caption" color="text.secondary">[{category.categoryName}]</Typography>
                                </Paper>
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                    {subItems?.length === 0 && <Typography variant="body2" color="text.secondary">No subitems.</Typography>}
                </CardContent>
            </Collapse>

            {/* SubItem Dialog */}
            {
                openSubItemDialog && (
                    <SubItemDialog
                        open={openSubItemDialog}
                        onClose={() => setOpenSubItemDialog(false)}
                        onSubmit={handleSaveSubItem}
                        initialData={editingSubItem || undefined}
                        isLoading={subItemMutation.isPending}
                        defaultDisplayOrder={(subItems?.length || 0) + 1}
                        categoryId={category.categoryId}
                        existingSubItems={subItems}
                    />
                )
            }
        </Card >
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
    const [openBulkUpdateDialog, setOpenBulkUpdateDialog] = useState(false);
    const [categoryFormData, setCategoryFormData] = useState<CreateCategoryRequest>({
        categoryId: '',
        categoryName: '',
        displayOrder: 1,
        enabled: true,
        weight: 0,
        instructions: [],
        feedbackMessageTemplate: '',
    });

    // Fetch Form (includes categories and subItems)
    const { data: form, isLoading: isFormLoading } = useQuery({
        queryKey: ['qm-evaluation-form', formId],
        queryFn: () => getQmEvaluationForm(formId!, config),
        enabled: !!formId,
    });

    // Derive categories from the form response
    const categories = form?.categories;

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
                queryClient.invalidateQueries({ queryKey: ['qm-evaluation-form', formId] });
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
            queryClient.invalidateQueries({ queryKey: ['qm-evaluation-form', formId] });
        }
    });

    const deleteCategoryMutation = useMutation({
        mutationFn: async (categoryId: string) => {
            await deleteCategory(formId!, categoryId, config);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['qm-evaluation-form', formId] });
        }
    });

    // Bulk Update Categories Mutation
    const bulkUpdateMutation = useMutation({
        mutationFn: async (data: BulkUpdateCategoriesRequest) => {
            return bulkUpdateCategories(formId!, data, config);
        },
        onSuccess: () => {
            setOpenBulkUpdateDialog(false);
            queryClient.invalidateQueries({ queryKey: ['qm-evaluation-form', formId] });
            alert('Categories bulk updated successfully.');
        },
        onError: (error) => {
            alert(`Failed to bulk update categories: ${(error as Error).message}`);
        },
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

    // Prompt Preview
    const [openPromptPreview, setOpenPromptPreview] = useState(false);
    const [promptPreviewText, setPromptPreviewText] = useState('');
    const [promptPreviewFunctionCalls, setPromptPreviewFunctionCalls] = useState<Record<string, unknown> | null>(null);
    const [promptPreviewLoading, setPromptPreviewLoading] = useState(false);

    const handleOpenPromptPreview = async () => {
        setOpenPromptPreview(true);
        setPromptPreviewLoading(true);
        try {
            const result = await getQmEvaluationFormPromptPreview(formId!, config);
            setPromptPreviewText(result.prompt);
            setPromptPreviewFunctionCalls(result.functionCalls ?? null);
        } catch (error) {
            setPromptPreviewText(`오류가 발생했습니다: ${(error as Error).message}`);
            setPromptPreviewFunctionCalls(null);
        } finally {
            setPromptPreviewLoading(false);
        }
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
                            <Button
                                variant="outlined" startIcon={<VisibilityIcon />}
                                onClick={handleOpenPromptPreview}
                            >
                                프롬프트 미리보기
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
                            </Stack>
                        </Stack>
                        <Stack direction="row" spacing={1}>
                            <Button
                                variant="outlined"
                                startIcon={<UploadIcon />}
                                onClick={() => setOpenBulkUpdateDialog(true)}
                            >
                                Bulk Update
                            </Button>
                            <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenCategoryDialog()}>
                                Add Category
                            </Button>
                        </Stack>
                    </Stack>

                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={categories?.map(c => c.categoryId) || []} strategy={verticalListSortingStrategy}>
                            {categories?.sort((a, b) => a.displayOrder - b.displayOrder).map((category) => (
                                <SortableCategoryItem
                                    key={category.categoryId}
                                    formId={formId!}
                                    category={category}
                                    categorySubItems={category.subItems}
                                    onEdit={handleOpenCategoryDialog}
                                    onDelete={(id) => { if (window.confirm('Delete category?')) deleteCategoryMutation.mutate(id); }}
                                    config={config}
                                    allExpanded={bulkExpandCategories}

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
                            <Stack key={index} direction="row" spacing={1} alignItems="flex-start">
                                <TextField
                                    fullWidth
                                    multiline
                                    rows={3}
                                    value={instruction}
                                    onChange={(e) => {
                                        const newInstructions = [...(categoryFormData.instructions || [])];
                                        newInstructions[index] = e.target.value;
                                        setCategoryFormData({ ...categoryFormData, instructions: newInstructions });
                                    }}
                                    placeholder={`Instruction ${index + 1}`}
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

                        {/* Feedback Message Template */}
                        <TextField
                            label="상담원 피드백 문구 (Feedback Message Template)" fullWidth multiline rows={3}
                            value={categoryFormData.feedbackMessageTemplate}
                            onChange={(e) => setCategoryFormData({ ...categoryFormData, feedbackMessageTemplate: e.target.value })}
                            helperText="상담원에게 전달될 피드백 메시지 템플릿입니다."
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenCategoryDialog(false)}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={() => {
                            categoryMutation.mutate({ data: categoryFormData, categoryId: editingCategory?.categoryId });
                        }}
                        disabled={!categoryFormData.categoryName || !categoryFormData.categoryId || categoryMutation.isPending}
                    >
                        Save
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Bulk Update Dialog */}
            <BulkUpdateDialog
                open={openBulkUpdateDialog}
                onClose={() => setOpenBulkUpdateDialog(false)}
                onSubmit={(data) => bulkUpdateMutation.mutate(data)}
                isLoading={bulkUpdateMutation.isPending}
                currentCategories={categories}
            />

            {/* Prompt Preview Dialog */}
            <Dialog open={openPromptPreview} onClose={() => setOpenPromptPreview(false)} maxWidth="md" fullWidth>
                <DialogTitle>프롬프트 미리보기</DialogTitle>
                <DialogContent>
                    {promptPreviewLoading ? (
                        <Box display="flex" justifyContent="center" p={4}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <>
                            <Paper
                                variant="outlined"
                                sx={{
                                    p: 2,
                                    mt: 1,
                                    bgcolor: 'grey.50',
                                    fontFamily: 'monospace',
                                    fontSize: '0.8rem',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    maxHeight: '60vh',
                                    overflowY: 'auto',
                                }}
                            >
                                {promptPreviewText}
                            </Paper>
                            {promptPreviewFunctionCalls && (
                                <>
                                    <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5, fontWeight: 600 }}>
                                        Function Calls
                                    </Typography>
                                    <Paper
                                        variant="outlined"
                                        sx={{
                                            p: 2,
                                            bgcolor: 'grey.50',
                                            fontFamily: 'monospace',
                                            fontSize: '0.8rem',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                            maxHeight: '40vh',
                                            overflowY: 'auto',
                                        }}
                                    >
                                        {JSON.stringify(promptPreviewFunctionCalls, null, 2)}
                                    </Paper>
                                </>
                            )}
                        </>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenPromptPreview(false)}>닫기</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default QMEvaluationFormDetail;

