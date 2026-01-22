import React, { useState, useEffect } from 'react';
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
} from '@mui/material';
import {
  CheckCircle as CheckIcon,
  Gavel as ObjectionIcon,
  ThumbUp as AcceptIcon,
  ThumbDown as RejectIcon,
} from '@mui/icons-material';
import { EvaluationCategory } from '@/services/qmAutomationService';

export type ModalAction = 'confirm' | 'objection' | 'qa-accept' | 'qa-reject';

export interface EvaluationStateModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ModalSubmitData) => Promise<void>;
  action: ModalAction;
  category: EvaluationCategory;
  categoryLabel: string;
  currentStatus: string;
  evaluationStatus?: string;
  defaultUserId?: string;
  defaultUserName?: string;
}

export interface ModalSubmitData {
  action: ModalAction;
  category: EvaluationCategory;
  reason: string;
  userId: string;
  userName?: string;
}

const getActionConfig = (action: ModalAction) => {
  switch (action) {
    case 'confirm':
      return {
        title: '평가 확인',
        description: 'AI 평가 결과를 확인합니다.',
        icon: <CheckIcon color="success" />,
        color: 'success' as const,
        buttonText: '확인',
        requireReason: false,
      };
    case 'objection':
      return {
        title: '이의제기',
        description: 'AI 평가 결과에 대해 이의를 제기합니다. QA 검토 후 승인/거절됩니다.',
        icon: <ObjectionIcon color="warning" />,
        color: 'warning' as const,
        buttonText: '이의제기',
        requireReason: true,
      };
    case 'qa-accept':
      return {
        title: '이의제기 승인',
        description: '상담사의 이의제기를 승인합니다. FAIL에서 PASS로 변경됩니다.',
        icon: <AcceptIcon color="success" />,
        color: 'success' as const,
        buttonText: '승인',
        requireReason: true,
      };
    case 'qa-reject':
      return {
        title: '이의제기 거절',
        description: '상담사의 이의제기를 거절합니다. FAIL 상태가 유지됩니다.',
        icon: <RejectIcon color="error" />,
        color: 'error' as const,
        buttonText: '거절',
        requireReason: true,
      };
    default:
      return {
        title: '상태 변경',
        description: '',
        icon: null,
        color: 'primary' as const,
        buttonText: '확인',
        requireReason: false,
      };
  }
};

const EvaluationStateModal: React.FC<EvaluationStateModalProps> = ({
  open,
  onClose,
  onSubmit,
  action,
  category,
  categoryLabel,
  currentStatus,
  evaluationStatus,
  defaultUserId,
  defaultUserName,
}) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = getActionConfig(action);

  // 모달이 열릴 때 기본값 설정
  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  const handleClose = () => {
    if (isSubmitting) return;
    setReason('');
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    // Validation
    if (config.requireReason && !reason.trim()) {
      setError('사유를 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        action,
        category,
        reason: reason.trim(),
        userId: defaultUserId || '',
        userName: defaultUserName,
      });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '처리 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          {config.icon}
          <Typography variant="h6" component="span">
            {config.title}
          </Typography>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* 설명 */}
          <Alert severity="info" icon={false}>
            <Typography variant="body2">{config.description}</Typography>
          </Alert>

          {/* 카테고리 정보 */}
          <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
            <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
              <Typography variant="body2" color="text.secondary">
                카테고리:
              </Typography>
              <Chip label={categoryLabel} size="small" />
              <Typography variant="body2" color="text.secondary">
                현재 상태:
              </Typography>
              <Chip label={currentStatus} size="small" variant="outlined" />
              {evaluationStatus && (
                <>
                  <Typography variant="body2" color="text.secondary">
                    평가 결과:
                  </Typography>
                  <Chip
                    label={evaluationStatus}
                    size="small"
                    color={evaluationStatus === 'PASS' ? 'success' : evaluationStatus === 'FAIL' ? 'error' : 'default'}
                  />
                </>
              )}
            </Stack>
          </Box>


          {/* 사유 입력 */}
          {config.requireReason && (
            <TextField
              label="사유"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              multiline
              rows={4}
              fullWidth
              placeholder={
                action === 'objection'
                  ? '이의제기 사유를 상세히 작성해주세요...'
                  : action === 'qa-accept'
                    ? '승인 사유를 작성해주세요...'
                    : '거절 사유를 작성해주세요...'
              }
              disabled={isSubmitting}
            />
          )}

          {/* 에러 메시지 */}
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={isSubmitting}>
          취소
        </Button>
        <Button
          variant="contained"
          color={config.color}
          onClick={handleSubmit}
          disabled={isSubmitting}
          startIcon={isSubmitting ? <CircularProgress size={16} /> : config.icon}
        >
          {isSubmitting ? '처리 중...' : config.buttonText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EvaluationStateModal;
