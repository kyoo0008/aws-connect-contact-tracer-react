import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  IconButton,
  Stack,
  Chip,
  CircularProgress,
  Alert,
  Tooltip,
  Divider,
  Collapse,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Send as SendIcon,
  Delete as DeleteIcon,
  SmartToy as BotIcon,
  Person as PersonIcon,
  ExpandMore as ExpandMoreIcon,
  Settings as SettingsIcon,
  ContentCopy as CopyIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { useMutation } from '@tanstack/react-query';
import { useConfig } from '@/contexts/ConfigContext';
import {
  callGeminiChat,
  ChatMessage,
  ChatFunctionCall,
} from '@/services/geminiService';

const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
];

const DEFAULT_TOOLS = [
  { name: 'get_current_time' },
  { name: 'calculate' },
  { name: 'echo' },
];

interface DisplayMessage {
  role: 'user' | 'model';
  content: string;
  functionCalls?: ChatFunctionCall[];
  meta?: {
    geminiModel: string;
    geminiRegion: string;
    tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
    processingTime: number;
    iterations: number;
  };
}

const QMChat: React.FC = () => {
  const { config } = useConfig();
  const [input, setInput] = useState('');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [systemInstruction, setSystemInstruction] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages]);

  const chatMutation = useMutation({
    mutationFn: ({ userInput, prevMessages }: { userInput: string; prevMessages: ChatMessage[] }) => {
      const userMessage: ChatMessage = { role: 'user', content: userInput };
      const nextMessages = [...prevMessages, userMessage];
      return callGeminiChat(
        {
          messages: nextMessages,
          model,
          systemInstruction: systemInstruction.trim() || undefined,
          tools: DEFAULT_TOOLS,
          maxIterations: 5,
        },
        config
      ).then((res) => ({ res, nextMessages }));
    },
    onMutate: ({ userInput }) => {
      setDisplayMessages((prev) => [...prev, { role: 'user', content: userInput }]);
      setInput('');
    },
    onSuccess: ({ res }) => {
      setMessages(res.messages);
      setDisplayMessages((prev) => [
        ...prev,
        {
          role: 'model',
          content: res.chatResponse,
          functionCalls: res.functionCalls?.length ? res.functionCalls : undefined,
          meta: {
            geminiModel: res.geminiModel,
            geminiRegion: res.geminiRegion,
            tokenUsage: res.tokenUsage,
            processingTime: res.processingTime,
            iterations: res.iterations,
          },
        },
      ]);
    },
  });

  const handleSend = () => {
    const userInput = input.trim();
    if (!userInput || chatMutation.isPending) return;
    chatMutation.mutate({ userInput, prevMessages: messages });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([]);
    setDisplayMessages([]);
    chatMutation.reset();
  };

  const handleCopy = (idx: number, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3, height: 'calc(100vh - 112px)', display: 'flex', flexDirection: 'column' }}>
      <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h5" fontWeight={600}>QM Chat</Typography>
          <Stack direction="row" spacing={1}>
            <Tooltip title="Settings">
              <IconButton onClick={() => setShowSettings(!showSettings)} color={showSettings ? 'primary' : 'default'}>
                <SettingsIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Clear conversation">
              <IconButton onClick={handleClear} disabled={displayMessages.length === 0}>
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>

        {/* Settings Panel */}
        <Collapse in={showSettings}>
          <Box sx={{ px: 3, py: 2, bgcolor: 'grey.50', borderBottom: 1, borderColor: 'divider' }}>
            <Stack spacing={2}>
              <FormControl size="small" sx={{ maxWidth: 300 }}>
                <InputLabel>Model</InputLabel>
                <Select value={model} label="Model" onChange={(e) => setModel(e.target.value)}>
                  {GEMINI_MODELS.map((m) => (
                    <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="System Instruction"
                value={systemInstruction}
                onChange={(e) => setSystemInstruction(e.target.value)}
                placeholder="e.g. 당신은 QM 상담 품질 분석 어시스턴트입니다."
                multiline
                rows={2}
                size="small"
                fullWidth
              />
            </Stack>
          </Box>
        </Collapse>

        {/* Messages */}
        <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2 }}>
          {displayMessages.length === 0 && (
            <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Stack alignItems="center" spacing={1}>
                <BotIcon sx={{ fontSize: 64, color: 'grey.300' }} />
                <Typography color="text.secondary">대화를 시작하세요</Typography>
                <Typography variant="caption" color="text.disabled">
                  Available tools: get_current_time, calculate, echo
                </Typography>
              </Stack>
            </Box>
          )}

          {displayMessages.map((msg, idx) => (
            <Box
              key={idx}
              sx={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                mb: 2,
                alignItems: 'flex-start',
                gap: 1,
              }}
            >
              {msg.role === 'model' && (
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: 0.5 }}>
                  <BotIcon sx={{ fontSize: 18, color: 'white' }} />
                </Box>
              )}

              <Box sx={{ maxWidth: '75%' }}>
                <Paper
                  elevation={0}
                  sx={{
                    px: 2,
                    py: 1.5,
                    bgcolor: msg.role === 'user' ? 'primary.main' : 'grey.100',
                    color: msg.role === 'user' ? 'white' : 'text.primary',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  }}
                >
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
                    {msg.content}
                  </Typography>
                </Paper>

                {/* Function Calls */}
                {msg.functionCalls && msg.functionCalls.length > 0 && (
                  <Accordion elevation={0} sx={{ mt: 0.5, bgcolor: 'transparent', '&:before': { display: 'none' } }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ px: 1, py: 0, minHeight: 'unset', '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                      <Typography variant="caption" color="text.secondary">
                        {msg.functionCalls.length} tool call{msg.functionCalls.length > 1 ? 's' : ''}
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: 1, py: 0.5 }}>
                      {msg.functionCalls.map((fc) => (
                        <Box key={fc.id} sx={{ mb: 1, p: 1, bgcolor: 'grey.50', borderRadius: 1, border: 1, borderColor: 'grey.200' }}>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                            <Chip label={fc.name} size="small" color="secondary" variant="outlined" />
                            <Typography variant="caption" color="text.disabled">iter {fc.iteration}</Typography>
                          </Stack>
                          <Typography variant="caption" component="pre" sx={{ display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'text.secondary', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                            args: {JSON.stringify(fc.args, null, 2)}
                          </Typography>
                          <Typography variant="caption" component="pre" sx={{ display: 'block', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'success.dark', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                            result: {JSON.stringify(fc.result, null, 2)}
                          </Typography>
                        </Box>
                      ))}
                    </AccordionDetails>
                  </Accordion>
                )}

                {/* Meta info */}
                {msg.meta && (
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }} alignItems="center">
                    <Chip label={msg.meta.geminiModel} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                    <Chip label={`${msg.meta.processingTime.toFixed(2)}s`} size="small" variant="outlined" color="info" sx={{ fontSize: '0.65rem', height: 20 }} />
                    <Chip label={`${msg.meta.tokenUsage.totalTokens} tokens`} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                    <Tooltip title={copiedIdx === idx ? 'Copied!' : 'Copy'}>
                      <IconButton size="small" onClick={() => handleCopy(idx, msg.content)} sx={{ width: 20, height: 20 }}>
                        {copiedIdx === idx ? <CheckIcon sx={{ fontSize: 14 }} color="success" /> : <CopyIcon sx={{ fontSize: 14 }} />}
                      </IconButton>
                    </Tooltip>
                  </Stack>
                )}
              </Box>

              {msg.role === 'user' && (
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'secondary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: 0.5 }}>
                  <PersonIcon sx={{ fontSize: 18, color: 'white' }} />
                </Box>
              )}
            </Box>
          ))}

          {chatMutation.isPending && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <BotIcon sx={{ fontSize: 18, color: 'white' }} />
              </Box>
              <Paper elevation={0} sx={{ px: 2, py: 1.5, bgcolor: 'grey.100', borderRadius: '16px 16px 16px 4px' }}>
                <CircularProgress size={16} />
              </Paper>
            </Box>
          )}

          {chatMutation.isError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {chatMutation.error instanceof Error ? chatMutation.error.message : 'An error occurred'}
            </Alert>
          )}

          <div ref={bottomRef} />
        </Box>

        {/* Input */}
        <Divider />
        <Box sx={{ px: 3, py: 2 }}>
          <Stack direction="row" spacing={1} alignItems="flex-end">
            <TextField
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="메시지를 입력하세요... (Shift+Enter로 줄바꿈)"
              multiline
              maxRows={6}
              fullWidth
              size="small"
              disabled={chatMutation.isPending}
            />
            <IconButton
              onClick={handleSend}
              disabled={!input.trim() || chatMutation.isPending}
              color="primary"
              sx={{ width: 40, height: 40, bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' }, '&:disabled': { bgcolor: 'grey.200', color: 'grey.400' } }}
            >
              {chatMutation.isPending ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
            </IconButton>
          </Stack>
          <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
            {messages.length > 0 ? `${messages.length}개 메시지 · ` : ''}Enter로 전송, Shift+Enter로 줄바꿈
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
};

export default QMChat;
