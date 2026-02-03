import React, { useState, useRef } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Alert,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Chip,
  IconButton,
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';
import {
  Send as SendIcon,
  AttachFile as AttachFileIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
  Check as CheckIcon,
  Image as ImageIcon,
  PictureAsPdf as PdfIcon,
  InsertDriveFile as FileIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { useMutation } from '@tanstack/react-query';
import { useConfig } from '@/contexts/ConfigContext';
import {
  callGeminiPrompt,
  fileToBase64,
  getFileMimeType,
  GeminiFile,
  GeminiPromptResponse,
} from '@/services/geminiService';

const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  // { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  // { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  // { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
];

interface AttachedFile {
  file: File;
  preview?: string;
}

const GeminiPlayground: React.FC = () => {
  const { config } = useConfig();
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [response, setResponse] = useState<GeminiPromptResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const geminiMutation = useMutation({
    mutationFn: async () => {
      // 파일들을 Base64로 변환
      const files: GeminiFile[] = await Promise.all(
        attachedFiles.map(async ({ file }) => ({
          mimeType: getFileMimeType(file),
          data: await fileToBase64(file),
        }))
      );

      return callGeminiPrompt(
        {
          prompt,
          model,
          files: files.length > 0 ? files : undefined,
        },
        config
      );
    },
    onSuccess: (data) => {
      setResponse(data);
    },
  });

  const addFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const newFiles: AttachedFile[] = files.map((file) => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }));
    setAttachedFiles((prev) => [...prev, ...newFiles]);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    addFiles(files);

    // 입력 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);

    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      addFiles(files);
    }
  };

  const handleRemoveFile = (index: number) => {
    setAttachedFiles((prev) => {
      const newFiles = [...prev];
      if (newFiles[index].preview) {
        URL.revokeObjectURL(newFiles[index].preview!);
      }
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const handleSubmit = () => {
    if (!prompt.trim()) return;
    geminiMutation.mutate();
  };

  const handleCopyResponse = () => {
    if (response?.geminiResponse) {
      navigator.clipboard.writeText(response.geminiResponse);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClear = () => {
    setPrompt('');
    setResponse(null);
    attachedFiles.forEach((f) => {
      if (f.preview) URL.revokeObjectURL(f.preview);
    });
    setAttachedFiles([]);
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon />;
    if (mimeType === 'application/pdf') return <PdfIcon />;
    return <FileIcon />;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5" fontWeight={600}>
            Gemini Playground
          </Typography>
          <Button
            variant="outlined"
            startIcon={<ClearIcon />}
            onClick={handleClear}
            size="small"
          >
            Clear
          </Button>
        </Box>

        {/* 입력 영역 */}
        <Stack spacing={3}>
          {/* 모델 선택 */}
          <FormControl fullWidth size="small">
            <InputLabel>Model</InputLabel>
            <Select
              value={model}
              label="Model"
              onChange={(e) => setModel(e.target.value)}
            >
              {GEMINI_MODELS.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* 프롬프트 입력 */}
          <TextField
            label="Prompt"
            multiline
            rows={6}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter your prompt here..."
            fullWidth
          />

          {/* 첨부파일 영역 */}
          <Box>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              accept="image/*,application/pdf,.txt,.csv,.json"
              style={{ display: 'none' }}
            />

            {/* 드래그 앤 드롭 영역 */}
            <Box
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              sx={{
                border: '2px dashed',
                borderColor: isDragOver ? 'primary.main' : 'grey.300',
                borderRadius: 2,
                p: 3,
                textAlign: 'center',
                cursor: 'pointer',
                bgcolor: isDragOver ? 'primary.50' : 'grey.50',
                transition: 'all 0.2s ease',
                '&:hover': {
                  borderColor: 'primary.main',
                  bgcolor: 'primary.50',
                },
              }}
            >
              <AttachFileIcon
                sx={{
                  fontSize: 40,
                  color: isDragOver ? 'primary.main' : 'grey.400',
                  mb: 1,
                }}
              />
              <Typography variant="body2" color="text.secondary">
                Drag & drop files here or click to browse
              </Typography>
              <Typography variant="caption" color="text.disabled">
                Supports: Images, PDF, TXT, CSV, JSON
              </Typography>
            </Box>

            {attachedFiles.length > 0 && (
              <List dense sx={{ mt: 2 }}>
                {attachedFiles.map((af, index) => (
                  <ListItem
                    key={`${af.file.name}-${af.file.size}-${af.file.lastModified}`}
                    secondaryAction={
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={() => handleRemoveFile(index)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    }
                    sx={{
                      bgcolor: 'grey.50',
                      borderRadius: 1,
                      mb: 0.5,
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      {af.preview ? (
                        <Box
                          component="img"
                          src={af.preview}
                          sx={{
                            width: 32,
                            height: 32,
                            objectFit: 'cover',
                            borderRadius: 0.5,
                          }}
                        />
                      ) : (
                        getFileIcon(af.file.type)
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={af.file.name}
                      secondary={formatFileSize(af.file.size)}
                      primaryTypographyProps={{ variant: 'body2' }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Box>

          {/* 전송 버튼 */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              startIcon={geminiMutation.isPending ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
              onClick={handleSubmit}
              disabled={!prompt.trim() || geminiMutation.isPending}
              size="large"
            >
              {geminiMutation.isPending ? 'Processing...' : 'Send'}
            </Button>
          </Box>

          {/* 에러 메시지 */}
          {geminiMutation.isError && (
            <Alert severity="error">
              {geminiMutation.error instanceof Error
                ? geminiMutation.error.message
                : 'An error occurred'}
            </Alert>
          )}
        </Stack>

        {/* 결과 영역 */}
        {response && (
          <>
            <Divider sx={{ my: 3 }} />

            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" fontWeight={600}>
                Response
              </Typography>
              <Tooltip title={copied ? 'Copied!' : 'Copy response'}>
                <IconButton onClick={handleCopyResponse} size="small">
                  {copied ? <CheckIcon color="success" /> : <CopyIcon />}
                </IconButton>
              </Tooltip>
            </Box>

            {/* 메타데이터 */}
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
              <Chip
                label={`Model: ${response.geminiModel}`}
                size="small"
                variant="outlined"
              />
              <Chip
                label={`Region: ${response.geminiRegion}`}
                size="small"
                variant="outlined"
              />
              <Chip
                label={`Time: ${response.processingTime.toFixed(2)}s`}
                size="small"
                variant="outlined"
                color="info"
              />
              <Chip
                label={`Input: ${response.inputTokens} tokens`}
                size="small"
                variant="outlined"
              />
              <Chip
                label={`Output: ${response.outputTokens} tokens`}
                size="small"
                variant="outlined"
              />
              <Chip
                label={`Total: ${response.totalTokens} tokens`}
                size="small"
                variant="outlined"
                color="primary"
              />
            </Stack>

            {/* 응답 내용 */}
            <Card variant="outlined">
              <CardContent>
                <Typography
                  component="pre"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'inherit',
                    fontSize: '0.875rem',
                    lineHeight: 1.6,
                    m: 0,
                  }}
                >
                  {response.geminiResponse}
                </Typography>
              </CardContent>
            </Card>
          </>
        )}
      </Paper>
    </Container>
  );
};

export default GeminiPlayground;
