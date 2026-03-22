
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
    EvaluationCriterion,
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
                passCondition: cat.passCondition || '',
                warningCondition: cat.warningCondition || '',
                failCondition: cat.failCondition || '',
                feedbackMessageTemplate: cat.feedbackMessageTemplate || '',
                subItems: (cat.subItems || []).map(si => ({
                    subItemId: si.subItemId,
                    subItemName: si.subItemName,
                    displayOrder: si.displayOrder,
                    evaluationCriteria: si.evaluationCriteria || [],
                    resultJsonFormat: si.resultJsonFormat || '',
                    instruction: si.instruction || '',
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
                                evaluationCriteria: [
                                    {
                                        criteriaId: '1.1.1',
                                        description: '표준 인사말 준수',
                                        passCondition: 'PASS 조건',
                                        failCondition: 'FAIL 조건',
                                    },
                                ],
                                resultJsonFormat: '포맷',
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

    const generateDefaultJsonFormat = (criteria: EvaluationCriterion[]) => {
        const descriptions = criteria.length > 0
            ? criteria.map((c: EvaluationCriterion) => c.description).filter(Boolean)
            : ['평가 기준'];
        const criteriaEntries = descriptions.reduce((acc: Record<string, object>, desc: string, i: number) => {
            acc[`criteria${i + 1}`] = {
                type: desc,
                events: [
                    {
                        timestamp: `type 평가 기준 발화된 시점(mm:ss)`,
                        customerTranscript: `type 평가 기준 고객 발화 내용(생략가능)`,
                        agentTranscript: `type 평가 기준 상담사 발화 내용(생략가능)`,
                        reason: `type 평가 기준 이유`,
                    },
                ],
            };
            return acc;
        }, {});
        return JSON.stringify({ status: 'PASS | FAIL', ...criteriaEntries }, null, 2);
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
                // Fill in default resultJsonFormat for subItems with empty value
                if (Array.isArray(cat.subItems)) {
                    for (const si of cat.subItems) {
                        if (!si.resultJsonFormat?.trim()) {
                            si.resultJsonFormat = generateDefaultJsonFormat(si.evaluationCriteria || []);
                        }
                    }
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
}

const SubItemDialog: React.FC<SubItemDialogProps> = ({
    open,
    onClose,
    onSubmit,
    initialData,
    isLoading,
    defaultDisplayOrder = 1,
}) => {
    const generateDefaultResultJsonFormat = (criteria: EvaluationCriterion[]) => {
        const descriptions = criteria.length > 0
            ? criteria.map(c => c.description).filter(Boolean)
            : ['평가 기준'];
        const criteriaEntries = descriptions.reduce((acc, desc, i) => {
            acc[`criteria${i + 1}`] = {
                type: desc,
                events: [
                    {
                        timestamp: `type 평가 기준 발화된 시점(mm:ss)`,
                        customerTranscript: `type 평가 기준 고객 발화 내용`,
                        agentTranscript: `type 평가 기준 상담사 대응 발화 내용`,
                        reason: `type 평가 기준 이유`,
                    },
                ],
            };
            return acc;
        }, {} as Record<string, object>);
        return JSON.stringify({
            status: 'PASS | FAIL',
            ...criteriaEntries,
        }, null, 2);
    };

    const [formData, setFormData] = useState<CreateSubItemRequest>(() => {
        const criteria = (initialData?.evaluationCriteria || []).map((crit, i) => ({
            ...crit,
            criteriaId: `${i + 1}`,
        }));
        return {
            subItemId: initialData?.subItemId || '',
            subItemName: initialData?.subItemName || '',
            displayOrder: initialData?.displayOrder || defaultDisplayOrder,
            resultJsonFormat: initialData?.resultJsonFormat || generateDefaultResultJsonFormat(criteria),
            instruction: initialData?.instruction || '',
            evaluationCriteria: criteria,
        };
    });
    const [jsonError, setJsonError] = useState<string | null>(null);

    const syncResultJsonFormatType = (criteria: EvaluationCriterion[], currentFormat: string) => {
        try {
            const parsed = JSON.parse(currentFormat);
            const descriptions = criteria.length > 0
                ? criteria.map(c => c.description).filter(Boolean)
                : ['평가 기준'];
            // Remove old criteria keys
            Object.keys(parsed).forEach(key => {
                if (/^criteria\d+$/.test(key)) delete parsed[key];
            });
            // Add new criteria keys
            descriptions.forEach((desc, i) => {
                const key = `criteria${i + 1}`;
                parsed[key] = {
                    type: desc,
                    events: [
                        {
                            timestamp: `type 평가 기준 발화된 시점(mm:ss)`,
                            customerTranscript: `type 평가 기준 고객 발화 내용`,
                            agentTranscript: `type 평가 기준 상담사 대응 발화 내용`,
                            reason: `type 평가 기준 이유`,
                        },
                    ],
                };
            });
            return JSON.stringify(parsed, null, 2);
        } catch {
            // ignore parse errors, return unchanged
        }
        return currentFormat;
    };

    // Criteria state management
    const handleAddCriteria = () => {
        setFormData((prev) => {
            const newCriteria = [
                ...prev.evaluationCriteria,
                { criteriaId: `${prev.evaluationCriteria.length + 1}`, description: '', passCondition: '', failCondition: '' },
            ];
            return {
                ...prev,
                evaluationCriteria: newCriteria,
                resultJsonFormat: syncResultJsonFormatType(newCriteria, prev.resultJsonFormat || ''),
            };
        });
    };

    const handleCriteriaChange = (index: number, field: keyof EvaluationCriterion, value: string) => {
        const newCriteria = [...formData.evaluationCriteria];
        newCriteria[index] = { ...newCriteria[index], [field]: value };
        setFormData((prev) => ({
            ...prev,
            evaluationCriteria: newCriteria,
            resultJsonFormat: field === 'description'
                ? syncResultJsonFormatType(newCriteria, prev.resultJsonFormat || '')
                : prev.resultJsonFormat,
        }));
    };

    const handleDeleteCriteria = (index: number) => {
        const newCriteria = formData.evaluationCriteria
            .filter((_, i) => i !== index)
            .map((crit, i) => ({ ...crit, criteriaId: `${i + 1}` }));
        setFormData((prev) => ({
            ...prev,
            evaluationCriteria: newCriteria,
            resultJsonFormat: syncResultJsonFormatType(newCriteria, prev.resultJsonFormat || ''),
        }));
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
                        label="Instructions (가이드)"
                        fullWidth
                        multiline
                        rows={3}
                        value={formData.instruction}
                        onChange={(e) => setFormData({ ...formData, instruction: e.target.value })}
                        helperText="AI를 위한 평가 가이드라인입니다."
                    />

                    {/* 평가 기준 (Evaluation Criteria) */}
                    <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 2 }}>
                        평가 기준 (evaluationCriteria)
                    </Typography>

                    {formData.evaluationCriteria.map((criterion, index) => (
                        <Paper key={index} variant="outlined" sx={{ p: 2 }}>
                            <Stack spacing={2}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Chip label={`#${criterion.criteriaId}`} size="small" color="primary" />
                                    <IconButton color="error" size="small" onClick={() => handleDeleteCriteria(index)}>
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                </Stack>
                                <TextField
                                    label="설명 (description)"
                                    size="small"
                                    fullWidth
                                    multiline
                                    value={criterion.description}
                                    onChange={(e) => handleCriteriaChange(index, 'description', e.target.value)}
                                />
                                <TextField
                                    label="상세 설명 (details)"
                                    size="small"
                                    fullWidth
                                    multiline
                                    rows={3}
                                    value={criterion.details || ''}
                                    onChange={(e) => handleCriteriaChange(index, 'details', e.target.value)}
                                    helperText="평가 기준에 대한 상세 설명 및 예외 사항 등을 입력하세요."
                                />
                                <Chip label="PASS 조건" size="small" color="success" sx={{ mb: 0.5 }} />
                                <TextField

                                    size="small"
                                    fullWidth
                                    multiline
                                    rows={2}
                                    value={criterion.passCondition}
                                    onChange={(e) => handleCriteriaChange(index, 'passCondition', e.target.value)}

                                />
                                <Chip label="FAIL 조건" size="small" color="error" sx={{ mb: 0.5 }} />
                                <TextField

                                    size="small"
                                    fullWidth
                                    multiline
                                    rows={2}
                                    value={criterion.failCondition}
                                    onChange={(e) => handleCriteriaChange(index, 'failCondition', e.target.value)}

                                />
                            </Stack>
                        </Paper>
                    ))}

                    <Button startIcon={<AddIcon />} onClick={handleAddCriteria} variant="outlined">
                        평가 기준 추가
                    </Button>

                    {/* Result JSON Format */}
                    {/* <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 2 }}>
                        Result JSON Format
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        status는 PASS / FAIL 중 하나가 들어갑니다.
                    </Typography>

                    <TextField
                        label="Result JSON Format"
                        fullWidth
                        multiline
                        rows={4}
                        value={formData.resultJsonFormat}
                        onChange={(e) => {
                            setFormData({ ...formData, resultJsonFormat: e.target.value });
                            setJsonError(null);
                        }}
                        error={!!jsonError}
                        helperText={jsonError || "JSON 포맷을 직접 입력하세요."}
                        sx={{
                            '& .MuiInputBase-input': {
                                fontFamily: 'monospace',
                                fontSize: '0.85rem',
                            },
                        }}
                    /> */}

                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>취소</Button>
                <Button
                    variant="contained"
                    onClick={() => {
                        let finalData = { ...formData };

                        if (formData.resultJsonFormat?.trim()) {
                            try {
                                const parsed = JSON.parse(formData.resultJsonFormat);
                                finalData.resultJsonFormat = JSON.stringify(parsed, null, 2);
                            } catch (e) {
                                setJsonError('유효하지 않은 JSON 형식입니다.');
                                return;
                            }
                        }
                        onSubmit(finalData);
                    }}
                    disabled={!formData.subItemName || !formData.subItemId || isLoading}
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
    categorySubItems?: EvaluationSubItem[];
    onEdit: (category: EvaluationCategory) => void;
    onDelete: (categoryId: string) => void;
    config: any;
    allExpanded?: boolean;
    allSubExpanded?: boolean;
}

const SortableCategoryItem: React.FC<CategoryItemProps> = ({
    formId,
    category,
    categorySubItems,
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

    // Use subItems from the form response (passed via props)
    const subItems = categorySubItems;

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
            queryClient.invalidateQueries({ queryKey: ['qm-evaluation-form', formId] });
        },
    });

    const deleteSubItemMutation = useMutation({
        mutationFn: async (subItemId: string) => {
            await deleteSubItem(formId, category.categoryId, subItemId, config);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['qm-evaluation-form', formId] });
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
                    {/* 판정 기준 */}
                    <Box mb={2}>
                        <Typography variant="subtitle2" gutterBottom>판정 기준</Typography>
                        <Stack spacing={1}>
                            {category.passCondition && (
                                <Box>
                                    <Chip label="PASS 조건" size="small" color="success" sx={{ mb: 0.5 }} />
                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{category.passCondition}</Typography>
                                </Box>
                            )}
                            {category.warningCondition && (
                                <Box>
                                    <Chip label="WARNING 조건" size="small" color="warning" sx={{ mb: 0.5 }} />
                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{category.warningCondition}</Typography>
                                </Box>
                            )}
                            {category.failCondition && (
                                <Box>
                                    <Chip label="FAIL 조건" size="small" color="error" sx={{ mb: 0.5 }} />
                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{category.failCondition}</Typography>
                                </Box>
                            )}


                            {(category.instructions && category.instructions.length > 0) ? (
                                <List dense sx={{ bgcolor: 'action.hover', borderRadius: 1 }}>
                                    {category.instructions.map((inst, idx) => (
                                        <ListItem key={idx}>
                                            <ListItemText primary={inst} primaryTypographyProps={{ sx: { whiteSpace: 'pre-wrap' } }} />
                                        </ListItem>
                                    ))}
                                </List>
                            ) : (
                                <Typography variant="body2" color="text.secondary">판정 기준이 설정되지 않았습니다.</Typography>
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
                                            <Typography variant="caption" fontWeight={600} display="block">Instructions (가이드):</Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', display: 'block' }}>
                                                {subItem.instruction}
                                            </Typography>
                                        </Box>
                                    )}

                                    {/* 평가 기준 (evaluationCriteria) */}
                                    {subItem.evaluationCriteria && subItem.evaluationCriteria.length > 0 && (
                                        <Box sx={{ pl: 4, pr: 8, mb: 1 }}>
                                            <Typography variant="caption" fontWeight={600} display="block" gutterBottom>평가 기준:</Typography>
                                            <Stack spacing={1}>
                                                {subItem.evaluationCriteria.map((crit) => (
                                                    <Paper key={crit.criteriaId} variant="outlined" sx={{ p: 1, bgcolor: 'grey.50' }}>
                                                        <Stack spacing={0.5}>
                                                            <Stack direction="row" spacing={1} alignItems="center">
                                                                <Chip label={`#${crit.criteriaId}`} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
                                                                <Typography variant="body2" fontWeight={500}>{crit.description}</Typography>
                                                            </Stack>
                                                            {crit.details && (
                                                                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-wrap', display: 'block', pl: 0.5 }}>
                                                                    {crit.details}
                                                                </Typography>
                                                            )}
                                                            {crit.passCondition && (
                                                                <Box>
                                                                    <Chip label="PASS" size="small" color="success" sx={{ height: 18, fontSize: '0.7rem', mb: 0.5 }} />
                                                                    <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap', display: 'block' }}>{crit.passCondition}</Typography>
                                                                </Box>
                                                            )}
                                                            {crit.failCondition && (
                                                                <Box>
                                                                    <Chip label="FAIL" size="small" color="error" sx={{ height: 18, fontSize: '0.7rem', mb: 0.5 }} />
                                                                    <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap', display: 'block' }}>{crit.failCondition}</Typography>
                                                                </Box>
                                                            )}
                                                        </Stack>
                                                    </Paper>
                                                ))}
                                            </Stack>
                                        </Box>
                                    )}

                                    {/* Result JSON Format Display */}
                                    {/* <Box sx={{ pl: 4, pr: 8, mb: 1 }}>
                                        <Typography variant="caption" color="primary" fontWeight={600} display="block">
                                            Result JSON Format:
                                        </Typography>
                                        {subItem.resultJsonFormat && (
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
                                        )}
                                    </Box> */}

                                </Collapse>
                                <Divider />
                            </React.Fragment>
                        ))}
                        {subItems?.length === 0 && <Typography variant="body2" color="text.secondary">No subitems.</Typography>}
                    </List>
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
        passCondition: '',
        warningCondition: '',
        failCondition: '',
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
                passCondition: category.passCondition || '',
                warningCondition: category.warningCondition || '',
                failCondition: category.failCondition || '',
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
                passCondition: '',
                warningCondition: '',
                failCondition: '',
                feedbackMessageTemplate: '',
            });
        }
        setOpenCategoryDialog(true);
    };

    // Bulk Expansion States
    const [bulkExpandCategories, setBulkExpandCategories] = useState<boolean | undefined>(undefined);
    const [bulkExpandSubItems, setBulkExpandSubItems] = useState<boolean | undefined>(undefined);

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
                                <Button size="small" variant="outlined" onClick={() => setBulkExpandSubItems(!bulkExpandSubItems)}>
                                    {bulkExpandSubItems ? 'Collapse All SubItems' : 'Expand All SubItems'}
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

                        {/* 판정 기준 (Judgment Criteria) */}
                        <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 2 }}>판정 기준</Typography>
                        <Typography variant="caption" color="text.secondary">
                            각 조건은 개별 키값(passCondition, warningCondition, failCondition)으로 저장됩니다.
                        </Typography>
                        <Chip label="PASS 조건" size="small" color="success" sx={{ mb: 0.5 }} />
                        <TextField
                            fullWidth
                            multiline
                            rows={2}
                            value={categoryFormData.passCondition || ''}
                            onChange={(e) => setCategoryFormData({ ...categoryFormData, passCondition: e.target.value })}
                        />
                        <Chip label="WARNING 조건" size="small" color="warning" sx={{ mb: 0.5 }} />
                        <TextField
                            fullWidth
                            multiline
                            rows={2}
                            value={categoryFormData.warningCondition || ''}
                            onChange={(e) => setCategoryFormData({ ...categoryFormData, warningCondition: e.target.value })}
                        />

                        <Chip label="FAIL 조건" size="small" color="error" sx={{ mb: 0.5 }} />
                        <TextField
                            fullWidth
                            multiline
                            rows={2}
                            value={categoryFormData.failCondition || ''}
                            onChange={(e) => setCategoryFormData({ ...categoryFormData, failCondition: e.target.value })}
                        />

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

