import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Stack,
  Alert,
  CircularProgress,
  Chip,
  Box,
  Checkbox,
  FormControlLabel,
  Divider,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  CheckCircle as CheckIcon,
  Gavel as ObjectionIcon,
  ThumbUp as AcceptIcon,
  ThumbDown as RejectIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { EvaluationCategory } from '@/services/qmAutomationService';
import { BulkActionItem, BulkActionResultItem, BulkQAFeedbackItem, EvaluationState } from '@/types/qmAutomation.types';

export type BulkModalAction = 'bulk-confirm' | 'bulk-objection' | 'bulk-qa-accept' | 'bulk-qa-reject';

// 대항목 정보
export interface CategoryInfo {
  key: string;
  label: string;
  currentStatus: string;
  evaluationStatus?: string;
  states?: EvaluationState[];
}

export interface BulkEvaluationModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: BulkModalSubmitData) => Promise<BulkActionResultItem[]>;
  action: BulkModalAction;
  categories: CategoryInfo[];
  defaultUserId?: string;
  defaultUserName?: string;
}

export interface BulkModalSubmitData {
  action: BulkModalAction;
  actions: BulkActionItem[] | BulkQAFeedbackItem[];
  userId: string;
  userName?: string;
}

// 라벨 매핑
const LABEL_MAP: Record<string, string> = {
  greeting: '인사',
  languageUse: '언어 사용',
  speed: '속도',
  voiceProduction: '음성 표현',
  accuracy: '정확성',
  efficiency: '효율성',
  proactivity: '적극성',
  waitManagement: '대기 관리',
};

const getLabel = (key: string): string => {
  return LABEL_MAP[key] || key;
};

const getActionConfig = (action: BulkModalAction) => {
  switch (action) {
    case 'bulk-confirm':
      return {
        title: '일괄 확인',
        description: '선택한 카테고리의 AI 평가 결과를 일괄 확인합니다.',
        icon: <CheckIcon color="success" />,
        color: 'success' as const,
        buttonText: '일괄 확인',
        requireReason: false,
        actionType: 'confirm' as const,
      };
    case 'bulk-objection':
      return {
        title: '일괄 이의제기',
        description: '선택한 카테고리에 대해 일괄 이의제기합니다. 각 카테고리별 사유를 입력해주세요.',
        icon: <ObjectionIcon color="warning" />,
        color: 'warning' as const,
        buttonText: '일괄 이의제기',
        requireReason: true,
        actionType: 'objection' as const,
      };
    case 'bulk-qa-accept':
      return {
        title: '일괄 이의제기 승인',
        description: '선택한 카테고리의 이의제기를 일괄 승인합니다.',
        icon: <AcceptIcon color="success" />,
        color: 'success' as const,
        buttonText: '일괄 승인',
        requireReason: true,
        actionType: 'accept' as const,
      };
    case 'bulk-qa-reject':
      return {
        title: '일괄 이의제기 거절',
        description: '선택한 카테고리의 이의제기를 일괄 거절합니다.',
        icon: <RejectIcon color="error" />,
        color: 'error' as const,
        buttonText: '일괄 거절',
        requireReason: true,
        actionType: 'reject' as const,
      };
    default:
      return {
        title: '일괄 처리',
        description: '',
        icon: null,
        color: 'primary' as const,
        buttonText: '확인',
        requireReason: false,
        actionType: 'confirm' as const,
      };
  }
};

// 종료 상태 Set
const TERMINAL_STATUSES = new Set([
  'AGENT_CONFIRM_COMPLETED',
  'QA_AGENT_OBJECTION_ACCEPTED',
  'QA_AGENT_OBJECTION_REJECTED',
]);

const BulkEvaluationModal: React.FC<BulkEvaluationModalProps> = ({
  open,
  onClose,
  onSubmit,
  action,
  categories,
  defaultUserId,
  defaultUserName,
}) => {
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [commonReason, setCommonReason] = useState('');
  const [useCommonReason, setUseCommonReason] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BulkActionResultItem[] | null>(null);

  const config = getActionConfig(action);

  // 선택 가능한 카테고리 필터링
  const eligibleCategories = useMemo(() => {
    return categories.filter((cat) => {
      const currentState = cat.states && cat.states.length > 0
        ? cat.states.reduce((latest, current) => current.seq > latest.seq ? current : latest, cat.states[0])
        : undefined;

      // 종료 상태는 선택 불가
      if (currentState && TERMINAL_STATUSES.has(currentState.status)) {
        return false;
      }

      const isGeminiCompleted = currentState?.status === 'GEMINI_EVAL_COMPLETED';
      const isObjectionRequested = currentState?.status === 'AGENT_OBJECTION_REQUESTED';
      const isFail = currentState?.evaluationStatus === 'FAIL';

      switch (action) {
        case 'bulk-confirm':
          return isGeminiCompleted;
        case 'bulk-objection':
          return isGeminiCompleted && isFail;
        case 'bulk-qa-accept':
        case 'bulk-qa-reject':
          return isObjectionRequested;
        default:
          return false;
      }
    });
  }, [categories, action]);

  // 모달이 열릴 때 초기화
  useEffect(() => {
    if (open) {
      setSelectedCategories(new Set(eligibleCategories.map(c => c.key)));
      setReasons({});
      setCommonReason('');
      setUseCommonReason(true);
      setError(null);
      setResults(null);
    }
  }, [open, eligibleCategories]);

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const handleCategoryToggle = (categoryKey: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryKey)) {
        next.delete(categoryKey);
      } else {
        next.add(categoryKey);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedCategories.size === eligibleCategories.length) {
      setSelectedCategories(new Set());
    } else {
      setSelectedCategories(new Set(eligibleCategories.map(c => c.key)));
    }
  };

  const handleReasonChange = (categoryKey: string, value: string) => {
    setReasons((prev) => ({ ...prev, [categoryKey]: value }));
  };

  const handleSubmit = async () => {
    // Validation
    if (selectedCategories.size === 0) {
      setError('최소 1개 이상의 카테고리를 선택해주세요.');
      return;
    }

    if (config.requireReason) {
      if (useCommonReason && !commonReason.trim()) {
        setError('공통 사유를 입력해주세요.');
        return;
      }
      if (!useCommonReason) {
        for (const cat of selectedCategories) {
          if (!reasons[cat]?.trim()) {
            setError(`${getLabel(cat)} 카테고리의 사유를 입력해주세요.`);
            return;
          }
        }
      }
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let actions: BulkActionItem[] | BulkQAFeedbackItem[];

      if (action === 'bulk-confirm' || action === 'bulk-objection') {
        actions = Array.from(selectedCategories).map((cat) => ({
          category: cat,
          action: config.actionType as 'confirm' | 'objection',
          reason: config.requireReason
            ? (useCommonReason ? commonReason.trim() : reasons[cat]?.trim())
            : undefined,
        }));
      } else {
        actions = Array.from(selectedCategories).map((cat) => ({
          category: cat,
          action: config.actionType as 'accept' | 'reject',
          reason: useCommonReason ? commonReason.trim() : reasons[cat]?.trim() || '',
        }));
      }

      const resultItems = await onSubmit({
        action,
        actions,
        userId: defaultUserId || '',
        userName: defaultUserName,
      });

      // 모든 작업이 성공하면 자동으로 모달 닫기
      const allSuccess = resultItems.every(r => r.success);
      if (allSuccess) {
        onClose();
      } else {
        setResults(resultItems);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '처리 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const successCount = results?.filter(r => r.success).length || 0;
  const failureCount = results?.filter(r => !r.success).length || 0;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          {config.icon}
          <Typography variant="h6" component="span">
            {config.title}
          </Typography>
          {selectedCategories.size > 0 && !results && (
            <Chip label={`${selectedCategories.size}개 선택`} size="small" color="primary" />
          )}
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* 설명 */}
          <Alert severity="info" icon={false}>
            <Typography variant="body2">{config.description}</Typography>
          </Alert>

          {/* 결과 표시 */}
          {results ? (
            <Box>
              <Alert
                severity={failureCount === 0 ? 'success' : successCount === 0 ? 'error' : 'warning'}
                sx={{ mb: 2 }}
              >
                <Typography variant="body2">
                  처리 완료: 성공 {successCount}건, 실패 {failureCount}건
                </Typography>
              </Alert>

              <List dense>
                {results.map((result) => (
                  <ListItem key={result.category}>
                    <ListItemIcon>
                      {result.success ? (
                        <CheckIcon color="success" />
                      ) : (
                        <ErrorIcon color="error" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Typography variant="body2" fontWeight={500}>
                            {getLabel(result.category)}
                          </Typography>
                          {result.success && result.newStatus && (
                            <Chip label={result.newStatus} size="small" color="success" variant="outlined" />
                          )}
                        </Stack>
                      }
                      secondary={result.error}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          ) : (
            <>
              {/* 카테고리 선택 불가 안내 */}
              {eligibleCategories.length === 0 ? (
                <Alert severity="warning">
                  <Typography variant="body2">
                    현재 상태에서 {config.title}할 수 있는 카테고리가 없습니다.
                  </Typography>
                </Alert>
              ) : (
                <>
                  {/* 카테고리 선택 */}
                  <Box>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                      <Typography variant="subtitle2" fontWeight={600}>
                        카테고리 선택
                      </Typography>
                      <Button size="small" onClick={handleSelectAll}>
                        {selectedCategories.size === eligibleCategories.length ? '전체 해제' : '전체 선택'}
                      </Button>
                    </Stack>

                    <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Stack direction="row" flexWrap="wrap" gap={1}>
                        {eligibleCategories.map((cat) => (
                          <FormControlLabel
                            key={cat.key}
                            control={
                              <Checkbox
                                checked={selectedCategories.has(cat.key)}
                                onChange={() => handleCategoryToggle(cat.key)}
                                size="small"
                              />
                            }
                            label={
                              <Stack direction="row" alignItems="center" spacing={0.5}>
                                <Typography variant="body2">{cat.label}</Typography>
                                {cat.evaluationStatus && (
                                  <Chip
                                    label={cat.evaluationStatus}
                                    size="small"
                                    color={cat.evaluationStatus === 'PASS' ? 'success' : cat.evaluationStatus === 'FAIL' ? 'error' : 'default'}
                                    sx={{ height: 18, fontSize: '0.7rem' }}
                                  />
                                )}
                              </Stack>
                            }
                            sx={{ mr: 2 }}
                          />
                        ))}
                      </Stack>
                    </Box>
                  </Box>


                  {/* 사유 입력 */}
                  {config.requireReason && selectedCategories.size > 0 && (
                    <>
                      <Divider />
                      <Box>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={useCommonReason}
                              onChange={(e) => setUseCommonReason(e.target.checked)}
                              size="small"
                            />
                          }
                          label="공통 사유 사용"
                        />

                        {useCommonReason ? (
                          <TextField
                            label="공통 사유"
                            value={commonReason}
                            onChange={(e) => setCommonReason(e.target.value)}
                            required
                            multiline
                            rows={3}
                            fullWidth
                            placeholder="모든 선택 항목에 적용될 사유를 입력해주세요..."
                            disabled={isSubmitting}
                            sx={{ mt: 1 }}
                          />
                        ) : (
                          <Stack spacing={2} sx={{ mt: 1 }}>
                            {Array.from(selectedCategories).map((catKey) => {
                              const cat = eligibleCategories.find(c => c.key === catKey);
                              return (
                                <TextField
                                  key={catKey}
                                  label={`${cat?.label || catKey} 사유`}
                                  value={reasons[catKey] || ''}
                                  onChange={(e) => handleReasonChange(catKey, e.target.value)}
                                  required
                                  multiline
                                  rows={2}
                                  fullWidth
                                  placeholder={`${cat?.label || catKey}에 대한 사유를 입력해주세요...`}
                                  disabled={isSubmitting}
                                />
                              );
                            })}
                          </Stack>
                        )}
                      </Box>
                    </>
                  )}
                </>
              )}

              {/* 진행 상태 */}
              {isSubmitting && (
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    처리 중... ({selectedCategories.size}개 카테고리)
                  </Typography>
                  <LinearProgress />
                </Box>
              )}

              {/* 에러 메시지 */}
              {error && (
                <Alert severity="error" onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}
            </>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {results ? (
          <Button variant="contained" onClick={handleClose}>
            닫기
          </Button>
        ) : (
          <>
            <Button onClick={handleClose} disabled={isSubmitting}>
              취소
            </Button>
            <Button
              variant="contained"
              color={config.color}
              onClick={handleSubmit}
              disabled={isSubmitting || eligibleCategories.length === 0 || selectedCategories.size === 0}
              startIcon={isSubmitting ? <CircularProgress size={16} /> : config.icon}
            >
              {isSubmitting ? '처리 중...' : config.buttonText}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default BulkEvaluationModal;
