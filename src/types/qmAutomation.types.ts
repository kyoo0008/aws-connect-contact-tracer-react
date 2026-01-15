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
  errorDetails?: any; // 에러 상세 정보 (Lambda 에러 응답)
  evaluationResult?: EvaluationResult; // QM 평가 상세 결과
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

// Evaluation Result Types for QM Analysis (동적 구조 지원)

// 대항목 상태 타입
export type EvaluationStatusType =
  | 'GEMINI_EVAL_COMPLETED'        // AI QM 평가 완료
  | 'AGENT_OBJECTION_REQUESTED'    // 상담원 이의제기 요청됨
  | 'QA_AGENT_OBJECTION_ACCEPTED'  // QA가 상담원 이의제기 수용
  | 'QA_AGENT_OBJECTION_REJECTED'; // QA가 상담원 이의제기 거절

// 대항목 상태 정보
export interface EvaluationState {
  seq: number;
  status: EvaluationStatusType;
  status_reason: string;
}

// 기본 이벤트 타입 - 다양한 필드를 유연하게 지원
export interface EvaluationEvent {
  timestamp?: string;
  timestamp_start?: string;
  timestamp_end?: string;
  type?: string;
  detected_sentence?: string;
  correction?: string;
  analysis?: string;
  content_context?: string;
  apology_used?: boolean;
  judgment?: string;
  category?: string;
  customer_reaction?: string;
  agent_response_quality?: string;
  [key: string]: unknown; // 추가 필드 허용
}

// 대항목 데이터 구조 (소항목 + states)
export interface EvaluationSectionData {
  states?: EvaluationState[];
  [key: string]: unknown; // 소항목들
}

// 동적 평가 결과 타입 - 대항목/소항목이 변경되어도 유연하게 대응
export interface EvaluationResult {
  details: Record<string, EvaluationSectionData>; // 대항목 > 소항목 + states 동적 구조
  summary: Record<string, string>; // 요약 정보 (점수, 결과 등)
}
