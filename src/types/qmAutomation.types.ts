// QM Automation Types based on the API documentation

export type QMStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'AUDIO_ANALYSIS_PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'ERROR';

export interface FunctionCallArgs {
  transcript_authenticated?: boolean;
  transcript_agent_confirmation?: string;
  transcript_from?: string;
  transcript_to?: string;
  transcript_date?: string;
  [key: string]: unknown;
}

export interface FunctionCallResultData {
  functionCallId: string;
  name: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface FunctionCall {
  id: string;
  name: string;
  args: FunctionCallArgs;
  functionCallResult?: FunctionCallResultData;
}

export interface CustomerDissatisfaction {
  detected: boolean;
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  reason: string | null;
  timestamp_range?: string;
}

export interface AgentInterruption {
  detected: boolean;
  instances: Array<{
    timestamp: string;
    description: string;
  }>;
}

export interface AudioAnalyzeResult {
  customer_dissatisfaction?: CustomerDissatisfaction;
  agent_interruption?: AgentInterruption;
  summary?: string;
  body?: string;
}

export interface QMAutomationResult {
  message: string;
  projectId: string;
  serviceAccount: string;
  geminiResponse: string;
  geminiModel: string;
  processingTime: number;
  timestamp: number;
  promptLength: number;
  responseLength: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  functionCalls?: FunctionCall[];
  audioAnalyzeResult?: AudioAnalyzeResult;
  thinkingText?: string;
}

export interface QMAutomationItem {
  pk: string;
  sk: string;
  requestId: string;
  contactId: string;
  agentId?: string;
  connectedToAgentTimestamp?: string;
  connectedToAgentYYYYMM?: string;
  status: QMStatus;
  input?: QMAutomationRequestBody;
  result?: QMAutomationResult;
  error?: string;
  createdAt?: string;
  completedAt?: string;
  ttl?: number;
}

export interface ToolDefinition {
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: {
      type: 'OBJECT';
      properties: Record<string, {
        type: 'STRING' | 'BOOLEAN' | 'NUMBER' | 'ARRAY';
        description: string;
        items?: { type: string };
      }>;
      required: string[];
    };
    enabled?: boolean;
  }>;
}

export interface QMAutomationRequestBody {
  prompt?: string;
  contactId?: string;
  model?: string;
  streaming?: boolean;
  useTools?: boolean;
  useDefaultToolDefinitions?: boolean;
  toolDefinitions?: ToolDefinition[];
  useDefaultPrompt?: boolean;
  useThinking?: boolean;
  thinkingBudget?: number;
  temperature?: number;
  maxOutputTokens?: number;
  useAudioAnalysis?: boolean;
  audioAnalysisPrompt?: string;
  audioPresignedUrl?: string;
  audioOriginalKey?: string;
  useContextCaching?: boolean;
}

export interface QMAutomationResponse {
  requestId: string;
  status: QMStatus;
  message?: string;
  toolFunctionCalls?: FunctionCall[];
}

export interface QMAutomationInput {
  action?: string;
  type?: string;
  contactId?: string;
  model?: string;
  prompt?: string;
  streaming?: boolean;
  useTools?: boolean;
  useThinking?: boolean;
  thinkingBudget?: number;
  temperature?: number;
  maxOutputTokens?: number;
  useAudioAnalysis?: boolean;
  audioAnalysisPrompt?: string;
  audioOriginalKey?: string;
  audioPresignedUrl?: string;
  useContextCaching?: boolean;
  inputTokens?: number;
  toolResult?: {
    functionCalls?: FunctionCall[];
    functionCallResults?: FunctionCallResultData[];
    toolWorkerRequestId?: string;
    processingTime?: number;
    geminiModel?: string;
    toolPrompt?: string;
    thinkingText?: string;
    tokenUsage?: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
  };
}

export interface QMAutomationStatusResponse {
  requestId: string;
  contactId?: string;
  agentId?: string;
  status: QMStatus;
  createdAt?: string;
  completedAt?: string;
  result?: QMAutomationResult;
  input?: QMAutomationInput;
  error?: string;
  connectedToAgentTimestamp?: string;
}

export interface QMAutomationListItem {
  requestId: string;
  contactId: string;
  agentId?: string;
  status: QMStatus;
  createdAt: string;
  completedAt?: string;
  geminiModel?: string;
  totalScore?: number;
  processingTime?: number;
  input?: QMAutomationInput;
  result?: QMAutomationResult;
  connectedToAgentTimestamp?: string;
}

export interface QMAutomationListResponse {
  items: QMAutomationListItem[];
  total: number;
  hasMore: boolean;
}
