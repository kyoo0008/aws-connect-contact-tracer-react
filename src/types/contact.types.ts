import { Position } from 'react-flow-renderer';

// AWS Connect Contact Flow Types

export interface ContactLog {
  ContactId: string;
  ContactFlowId: string;
  ContactFlowName: string;
  ContactFlowModuleType: string;
  Timestamp: string;
  Parameters?: Record<string, any>;
  Results?: string;
  ExternalResults?: Record<string, any>;
  Identifier?: string;
  node_id?: string;
  InitiationTimestamp?: string;
  DisconnectTimestamp?: string;
  Channel?: string;
  QueueName?: string;
  AgentName?: string;
  Duration?: number;
  xray_trace_id?: string;
  ModuleExecutionStack?: string[];
}

export interface LambdaLog {
  timestamp: string;
  ContactId: string;
  service: string;
  message?: string;
  level?: string;
  error?: any;
  request?: any;
  response?: any;
  duration?: number;
  xrayTraceId?: string;
  xray_trace_id?: string; // 호환성을 위한 snake_case 버전
  logStream?: string;
  logGroup?: string;
  parameters?: any; // Parameter matching을 위한 필드
  event?: any; // Event matching을 위한 필드
}

export interface ContactFlowNode {
  id: string;
  type: string;
  data: {
    label: string;
    moduleType: string;
    parameters?: Record<string, any>;
    results?: string;
    error?: boolean;
    timestamp?: string;
    duration?: number;
    chunkedLogs?: ContactLog[];
    timeRange?: {
      start: string;
      end: string;
    };
    logCount?: number;
    sourcePosition?: Position;
    targetPosition?: Position;
  };
  position: {
    x: number;
    y: number;
  };
  style?: Record<string, any>;
}

export interface ContactFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  type?: string;
  animated?: boolean;
  style?: Record<string, any>;
}

export interface ContactFlowData {
  nodes: ContactFlowNode[];
  edges: ContactFlowEdge[];
  logs: ContactLog[];
  lambdaLogs?: Record<string, LambdaLog[]>;
  transcript?: TranscriptEntry[];
}

export interface TranscriptEntry {
  Id: string;
  ParticipantId: string;
  ParticipantRole: 'AGENT' | 'CUSTOMER' | 'SYSTEM';
  Content: string;
  ContentType: string;
  DisplayName?: string;
  AbsoluteTime?: string;
  Sentiment?: string;
  IssuesDetected?: any[];
}

export interface ContactDetails {
  contactId: string;
  instanceId: string;
  initiationTimestamp: string;
  disconnectTimestamp?: string;
  channel: string;
  queueName?: string;
  agentName?: string;
  duration?: number;
  attributes?: Record<string, any>;
  tags?: Record<string, string>;
  recordings?: Recording[];
  contactFlowName?: string;
}

export interface Recording {
  recordingId: string;
  location: string;
  startTime: string;
  stopTime: string;
  type: 'AUDIO' | 'SCREEN' | 'BOTH';
  status: 'AVAILABLE' | 'PROCESSING' | 'DELETED';
}

export interface FlowModule {
  id: string;
  name: string;
  type: string;
  description?: string;
  parameters?: Record<string, any>;
  actions?: FlowAction[];
  metadata?: Record<string, any>;
}

export interface FlowAction {
  id: string;
  type: string;
  parameters: Record<string, any>;
  transitions?: Record<string, string>;
  errors?: string[];
}

export interface SearchCriteria {
  contactId?: string;
  instanceId?: string;
  startTime?: Date;
  endTime?: Date;
  channel?: string[];
  queueName?: string;
  agentName?: string;
  phoneNumber?: string;
  flowName?: string;
}

export interface AWSConfig {
  region: string;
  instanceId: string;
  environment: 'dev' | 'stg' | 'prd' | 'test';
  logGroupName: string;
  s3BucketPrefix: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    expiration?: string;
  };
  profile?: string; // AWS SSO profile name (for backend API)
}

export interface FlowStatistics {
  totalContacts: number;
  averageDuration: number;
  errorRate: number;
  abandonRate: number;
  transferRate: number;
  moduleUsage: Record<string, number>;
  timeDistribution: TimeDistribution[];
}

export interface TimeDistribution {
  timestamp: string;
  count: number;
  errors: number;
  duration: number;
}

export type ModuleType =
  | 'SetLoggingBehavior'
  | 'SetAttributes'
  | 'SetFlowAttributes'
  | 'PlayPrompt'
  | 'GetUserInput'
  | 'StoreUserInput'
  | 'InvokeExternalResource'
  | 'InvokeLambdaFunction'
  | 'CheckAttribute'
  | 'Transfer'
  | 'TransferToQueue'
  | 'TransferToFlow'
  | 'Disconnect'
  | 'Wait'
  | 'Loop'
  | 'SetContactFlow'
  | 'SetWhisperFlow'
  | 'SetHoldFlow'
  | 'SetCustomerQueueFlow'
  | 'SetEventHook'
  | 'GetCustomerProfile'
  | 'AssociateContactToCustomerProfile'
  | 'TagContact'
  | 'InvokeFlowModule'
  | 'ReturnFromFlowModule'
  | 'Resume'
  | 'Dial';

export interface FlowError {
  timestamp: string;
  moduleType: string;
  blockId?: string;
  error: string;
  details?: any;
  contactId: string;
}

export interface FlowMetrics {
  successRate: number;
  averageHandleTime: number;
  customerSatisfaction?: number;
  firstCallResolution?: number;
  agentUtilization?: number;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
