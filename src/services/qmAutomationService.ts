/**
 * QM Automation Service
 *
 * QM Automation API와 통신하는 서비스
 * 로컬 server.js API를 통해 DynamoDB gemini-response 테이블에서 데이터 조회
 */

import {
  QMAutomationRequestBody,
  QMAutomationResponse,
  QMAutomationStatusResponse,
  QMAutomationListItem,
  QMStatus,
  BulkAgentActionRequest,
  BulkAgentActionResponse,
  BulkQAFeedbackRequest,
  QMAutomationSearchResponse,
} from '@/types/qmAutomation.types';
import { AWSConfig } from '@/types/contact.types';

// API Base URL - 환경에 따라 변경 가능
const getApiBaseUrl = (environment: string): string => {
  // switch (environment) {
  //   case 'dev':
  //     return 'https://dev-api.example.com';
  //   case 'stg':
  //     return 'https://stg-api.example.com';
  //   case 'prd':
  //     return 'https://api.example.com';
  //   default:
  //     return 'http://localhost:8081';
  // }
  return 'http://localhost:8081';
};

/**
 * 이메일 형식 검증
 */
function isEmailFormat(value: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * UUID v4 형식 검증
 */
function isUuidV4(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * 백엔드 API를 통해 이메일로 사용자 ID(UUID) 조회
 * 백엔드에서 AWS Connect SearchUsers API를 호출
 */
async function searchUserIdByEmail(
  email: string,
  config: AWSConfig
): Promise<string | null> {
  try {
    const apiBaseUrl = getApiBaseUrl(config.environment);

    const response = await fetch(
      `${apiBaseUrl}/api/agent/v1/connect/search-user?username=${encodeURIComponent(email)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-aws-region': config.region,
          'x-environment': config.environment,
          'x-instance-id': config.instanceId,
          ...(config.credentials && {
            'x-aws-credentials': JSON.stringify(config.credentials),
          }),
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`User not found for email: ${email}`);
        return null;
      }
      const errorData = await response.json().catch(() => ({ error: 'Unknown error', message: 'Unknown error' }));
      const errorMessage = errorData.message || errorData.error || `사용자 검색 실패: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();

    // 백엔드에서 { userId: "uuid-here" } 형태로 반환
    if (data.userId) {
      return data.userId;
    }

    console.warn(`User not found for email: ${email}`);
    return null;
  } catch (error) {
    console.error('Error searching user by email:', error);
    throw new Error(`사용자 검색 실패: ${(error as Error).message}`);
  }
}

/**
 * QM Automation 분석 요청
 */
export async function requestQMAutomation(
  requestBody: QMAutomationRequestBody,
  config: AWSConfig
): Promise<QMAutomationResponse> {
  const apiBaseUrl = getApiBaseUrl(config.environment);

  // qaAgentUserId가 이메일 형식이면 UUID로 변환
  let processedRequestBody = { ...requestBody };

  // if (requestBody.qaAgentUserId) {
  //   const qaAgentUserId = requestBody.qaAgentUserId.trim();

  //   // 이미 UUID v4 형식이면 그대로 사용
  //   if (isUuidV4(qaAgentUserId)) {
  //     processedRequestBody.qaAgentUserId = qaAgentUserId;
  //   }
  //   // 이메일 형식이면 AWS Connect API로 UUID 조회
  //   else if (isEmailFormat(qaAgentUserId)) {
  //     const userId = await searchUserIdByEmail(qaAgentUserId, config);
  //     if (userId) {
  //       processedRequestBody.qaAgentUserId = userId;
  //     } else {
  //       throw new Error(`QA 담당자를 찾을 수 없습니다: ${qaAgentUserId}`);
  //     }
  //   }
  //   // 그 외의 경우는 에러
  //   else {
  //     throw new Error(`유효하지 않은 QA Agent User ID 형식입니다. 이메일 또는 UUID를 입력해주세요: ${qaAgentUserId}`);
  //   }
  // }

  const response = await fetch(`${apiBaseUrl}/api/agent/v1/qm-automation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-aws-region': config.region,
      'x-environment': config.environment,
      ...(config.credentials && {
        'x-aws-credentials': JSON.stringify(config.credentials),
      }),
    },
    body: JSON.stringify(processedRequestBody),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error', message: 'Unknown error' }));

    // Lambda에서 반환된 상세 에러 메시지 추출
    const errorMessage = errorData.message || errorData.error || `Failed to request QM automation: ${response.status}`;

    // 상태 코드에 따른 사용자 친화적 메시지
    let userFriendlyMessage = errorMessage;
    if (response.status === 400) {
      userFriendlyMessage = `잘못된 요청: ${errorMessage}`;
    } else if (response.status === 500) {
      userFriendlyMessage = `서버 오류: ${errorMessage}`;
    }

    throw new Error(userFriendlyMessage);
  }

  return response.json();
}

/**
 * QM Automation 상태 조회
 */
export async function getQMAutomationStatus(
  requestId: string,
  config: AWSConfig
): Promise<QMAutomationStatusResponse> {
  const apiBaseUrl = getApiBaseUrl(config.environment);

  const response = await fetch(
    `${apiBaseUrl}/api/agent/v1/qm-automation/status?requestId=${encodeURIComponent(requestId)}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-aws-region': config.region,
        'x-environment': config.environment,
        ...(config.credentials && {
          'x-aws-credentials': JSON.stringify(config.credentials),
        }),
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error', message: 'Unknown error' }));
    const errorMessage = errorData.message || errorData.error || `Failed to get QM automation status: ${response.status}`;
    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * Contact ID로 QM Automation 목록 조회 (서버 API 사용)
 * server.js의 /api/agent/v1/qm-automation/list 엔드포인트 호출
 */
export async function getQMAutomationListByContactId(
  contactId: string,
  config: AWSConfig
): Promise<QMAutomationListItem[]> {
  const apiBaseUrl = getApiBaseUrl(config.environment);

  try {
    const response = await fetch(
      `${apiBaseUrl}/api/agent/v1/qm-automation/list?contactId=${encodeURIComponent(contactId)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-aws-region': config.region,
          'x-environment': config.environment,
          ...(config.credentials && {
            'x-aws-credentials': JSON.stringify(config.credentials),
          }),
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      const errorData = await response.json().catch(() => ({ error: 'Unknown error', message: 'Unknown error' }));
      const errorMessage = errorData.message || errorData.error || `Failed to get QM automation list: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error fetching QM Automation list:', error);
    throw error;
  }
}

/**
 * QM Automation 전체 목록 조회 (Scan & Sort by SK desc)
 */
export async function getQMAutomationListAll(
  config: AWSConfig,
  limit: number = 20
): Promise<QMAutomationListItem[]> {
  const apiBaseUrl = getApiBaseUrl(config.environment);

  try {
    const response = await fetch(
      `${apiBaseUrl}/api/agent/v1/qm-automation/scan?limit=${limit}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-aws-region': config.region,
          'x-environment': config.environment,
          ...(config.credentials && {
            'x-aws-credentials': JSON.stringify(config.credentials),
          }),
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      const errorData = await response.json().catch(() => ({ error: 'Unknown error', message: 'Unknown error' }));
      const errorMessage = errorData.message || errorData.error || `Failed to scan QM automation list: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error scanning QM Automation list:', error);
    throw error;
  }
}

/**
 * QM Automation 검색 필터 인터페이스
 */
export interface QMAutomationSearchFilters {
  startMonth?: string;  // YYYYMM format
  endMonth?: string;    // YYYYMM format
  startDate?: string;  // YYYYMMDD format
  endDate?: string;    // YYYYMMDD format
  qmStartDate?: string;  // YYYYMMDD format
  qmEndDate?: string;    // YYYYMMDD format
  agentId?: string;
  agentUserName?: string;
  agentCenter?: string;
  agentConfirmYN?: 'Y' | 'N';
  qaFeedbackYN?: 'Y' | 'N';
  qmEvaluationStatus?: string;
  contactId?: string;
  qaAgentUserName?: string;
  limit?: number;
  page?: number;
  pageSize?: number;
  orderBy?: string;
  order?: 'asc' | 'desc';
}

/**
 * QM Automation 다중 필터 검색 (GET /api/agent/v1/qm-automation/search)
 */
export async function getQMAutomationListSearch(
  config: AWSConfig,
  filters: QMAutomationSearchFilters
): Promise<QMAutomationSearchResponse> {
  const apiBaseUrl = getApiBaseUrl(config.environment);

  try {
    // Build query string from filters
    const params = new URLSearchParams();
    if (filters.startMonth) params.append('startMonth', filters.startMonth);
    if (filters.endMonth) params.append('endMonth', filters.endMonth);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.qmStartDate) params.append('qmStartDate', filters.qmStartDate);
    if (filters.qmEndDate) params.append('qmEndDate', filters.qmEndDate);
    if (filters.agentId) params.append('agentId', filters.agentId);
    if (filters.agentUserName) params.append('agentUserName', filters.agentUserName);
    if (filters.agentCenter) params.append('agentCenter', filters.agentCenter);
    if (filters.agentConfirmYN) params.append('agentConfirmYN', filters.agentConfirmYN);
    if (filters.qaFeedbackYN) params.append('qaFeedbackYN', filters.qaFeedbackYN);
    if (filters.qmEvaluationStatus) params.append('qmEvaluationStatus', filters.qmEvaluationStatus);
    if (filters.qaAgentUserName) params.append('qaAgentUserName', filters.qaAgentUserName);
    if (filters.contactId) params.append('contactId', filters.contactId);
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.pageSize) params.append('pageSize', filters.pageSize.toString());
    if (filters.orderBy) params.append('orderBy', filters.orderBy);
    if (filters.order) params.append('order', filters.order);

    const queryString = params.toString();
    const url = queryString
      ? `${apiBaseUrl}/api/agent/v1/qm-automation/search?${queryString}`
      : `${apiBaseUrl}/api/agent/v1/qm-automation/search`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-aws-region': config.region,
        'x-environment': config.environment,
        ...(config.credentials && {
          'x-aws-credentials': JSON.stringify(config.credentials),
        }),
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error', message: 'Unknown error' }));
      const errorMessage = errorData.message || errorData.error || `Failed to search QM automation list: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error searching QM Automation list:', error);
    throw error;
  }
}

/**
 * 월별 QM Automation 목록 조회 (GSI1 활용)
 */
export async function getQMAutomationListByMonth(
  yearMonth: string, // YYYYMM format
  config: AWSConfig,
  limit?: number
): Promise<QMAutomationListItem[]> {
  const apiBaseUrl = getApiBaseUrl(config.environment);

  try {
    const params = new URLSearchParams({
      month: yearMonth,
    });
    if (limit) {
      params.append('limit', limit.toString());
    }

    const response = await fetch(
      `${apiBaseUrl}/api/agent/v1/qm-automation/statistics?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-aws-region': config.region,
          'x-environment': config.environment,
          ...(config.credentials && {
            'x-aws-credentials': JSON.stringify(config.credentials),
          }),
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      const errorData = await response.json().catch(() => ({ error: 'Unknown error', message: 'Unknown error' }));
      const errorMessage = errorData.message || errorData.error || `Failed to get QM automation statistics: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.items || data;
  } catch (error) {
    console.warn('QM Automation statistics API not available:', error);
    return [];
  }
}

/**
 * 상담사별 QM Automation 목록 조회 (GSI2 활용)
 */
export async function getQMAutomationListByAgent(
  agentId: string,
  config: AWSConfig,
  limit?: number
): Promise<QMAutomationListItem[]> {
  const apiBaseUrl = getApiBaseUrl(config.environment);

  try {
    const params = new URLSearchParams();
    if (limit) {
      params.append('limit', limit.toString());
    }

    const response = await fetch(
      `${apiBaseUrl}/api/agent/v1/qm-automation/agent/${encodeURIComponent(agentId)}/history?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-aws-region': config.region,
          'x-environment': config.environment,
          ...(config.credentials && {
            'x-aws-credentials': JSON.stringify(config.credentials),
          }),
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      const errorData = await response.json().catch(() => ({ error: 'Unknown error', message: 'Unknown error' }));
      const errorMessage = errorData.message || errorData.error || `Failed to get agent QM history: ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.items || data;
  } catch (error) {
    console.warn('QM Automation agent history API not available:', error);
    return [];
  }
}

/**
 * QM Automation 상태를 한글로 변환
 */
export function getStatusLabel(status: QMStatus): string {
  switch (status) {
    case 'PENDING':
      return '대기 중';
    case 'PROCESSING':
      return '처리 중';
    case 'AUDIO_ANALYSIS_PROCESSING':
      return '오디오 분석 중';
    case 'COMPLETED':
      return '완료';
    case 'FAILED':
    case 'ERROR':
      return '실패';
    default:
      return status;
  }
}

/**
 * QM Automation 상태 색상 반환
 */
export function getStatusColor(status: QMStatus): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' {
  switch (status) {
    case 'PENDING':
      return 'default';
    case 'PROCESSING':
    case 'AUDIO_ANALYSIS_PROCESSING':
      return 'info';
    case 'COMPLETED':
      return 'success';
    case 'FAILED':
    case 'ERROR':
      return 'error';
    default:
      return 'default';
  }
}

/**
 * QM 평가 상태(qmEvaluationStatus) 타입
 */
export type QMEvaluationStatus =
  | 'GEMINI_EVAL_PROCESSING'
  | 'GEMINI_EVAL_FAILED'
  | 'GEMINI_EVAL_COMPLETED'
  | 'QA_FEEDBACK_PROCESSING'
  | 'AGENT_CHECK_PROCESSING'
  | 'AGENT_CONFIRM_COMPLETED'
  | 'AGENT_OBJECTION_REQUESTED'
  | 'QA_AGENT_OBJECTION_ACCEPTED'
  | 'QA_AGENT_OBJECTION_REJECTED';

/**
 * QM 평가 상태를 한글로 변환
 */
export function getQMEvaluationStatusLabel(status?: string): string {
  switch (status) {
    case 'GEMINI_EVAL_PROCESSING':
      return 'AI QM 평가 진행 중';
    case 'GEMINI_EVAL_COMPLETED':
      return 'AI 평가 완료';
    case 'GEMINI_EVAL_FAILED':
      return 'AI QM 평가 실패';
    case 'AGENT_CONFIRM_COMPLETED':
      return '상담사 확인 완료';
    case 'AGENT_OBJECTION_REQUESTED':
      return '상담원 이의 제기';
    case 'QA_AGENT_OBJECTION_ACCEPTED':
      return 'QA 이의제기 수용';
    case 'QA_AGENT_OBJECTION_REJECTED':
      return 'QA 이의제기 거절';
    case 'AGENT_CHECK_PROCESSING':
      return '상담원 확인 작업 중';
    case 'QA_FEEDBACK_PROCESSING':
      return 'QA 피드백 작성 중';
    default:
      return status || '-';
  }
}

/**
 * QM 평가 상태 색상 반환
 */
export function getQMEvaluationStatusColor(status?: string): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' {
  switch (status) {
    case 'GEMINI_EVAL_PROCESSING':
      return 'info';
    case 'GEMINI_EVAL_COMPLETED':
      return 'success';
    case 'GEMINI_EVAL_FAILED':
      return 'error';
    case 'AGENT_CONFIRM_COMPLETED':
      return 'success';
    case 'AGENT_OBJECTION_REQUESTED':
      return 'warning';
    case 'QA_AGENT_OBJECTION_ACCEPTED':
      return 'success';
    case 'QA_AGENT_OBJECTION_REJECTED':
      return 'error';
    case 'AGENT_CHECK_PROCESSING':
      return 'info';
    case 'QA_FEEDBACK_PROCESSING':
      return 'info';
    default:
      return 'default';
  }
}

/**
 * QM 평가 점수 추출 (geminiResponse에서 파싱)
 */
export function extractScoreFromResponse(geminiResponse: string): number | null {
  // 패턴: "100점 만점에 XX점" 또는 "총점: XX점"
  const patterns = [
    /(\d+)점\s*만점에\s*(\d+)점/,
    /총점[:\s]*(\d+)점/,
    /점수[:\s]*(\d+)점/,
    /(\d+)\s*\/\s*100/,
  ];

  for (const pattern of patterns) {
    const match = geminiResponse.match(pattern);
    if (match) {
      // 첫 번째 패턴의 경우 두 번째 그룹이 실제 점수
      if (pattern === patterns[0] && match[2]) {
        return parseInt(match[2], 10);
      }
      // 나머지 패턴은 첫 번째 그룹이 점수
      return parseInt(match[1], 10);
    }
  }

  return null;
}

/**
 * Polling을 통한 QM Automation 완료 대기
 */
export async function pollQMAutomationUntilComplete(
  requestId: string,
  config: AWSConfig,
  options: {
    maxAttempts?: number;
    intervalMs?: number;
    onStatusChange?: (status: QMStatus) => void;
  } = {}
): Promise<QMAutomationStatusResponse> {
  const { maxAttempts = 100, intervalMs = 3000, onStatusChange } = options;

  let attempts = 0;
  let lastStatus: QMStatus | null = null;

  while (attempts < maxAttempts) {
    const response = await getQMAutomationStatus(requestId, config);

    if (response.status !== lastStatus) {
      lastStatus = response.status;
      onStatusChange?.(response.status);
    }

    if (response.status === 'COMPLETED' || response.status === 'FAILED' || response.status === 'ERROR') {
      return response;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    attempts++;
  }

  throw new Error('QM Automation polling timeout');
}

// ============================================
// QM 평가 상태 변경 API (이의제기, 확인, QA 피드백)
// ============================================

/**
 * 평가 카테고리 타입
 */
export type EvaluationCategory =
  | 'accuracy'
  | 'efficiency'
  | 'greeting'
  | 'languageUse'
  | 'proactivity'
  | 'speed'
  | 'voiceProduction'
  | 'waitManagement';

/**
 * 상담사 확인 요청
 */
export interface AgentConfirmRequest {
  requestId: string;
  category: EvaluationCategory;
  userId: string;
  userName?: string;
}

/**
 * 상담사 이의제기 요청
 */
export interface AgentObjectionRequest {
  requestId: string;
  category: EvaluationCategory;
  reason: string;
  userId: string;
  userName?: string;
}

/**
 * QA 피드백 요청
 */
export interface QAFeedbackRequest {
  requestId: string;
  category: EvaluationCategory;
  action: 'accept' | 'reject';
  reason: string;
  userId: string;
  userName?: string;
}

/**
 * 상태 변경 응답
 */
export interface EvaluationStateUpdateResponse {
  success: boolean;
  message: string;
  updatedState?: {
    category: EvaluationCategory;
    currentStatus: string;
    evaluationStatus: string;
    qmEvaluationStatus: string;
    agentConfirmYN: 'Y' | 'N';
    qaFeedbackYN: 'Y' | 'N';
  };
}

/**
 * 상담사 확인 API
 * POST /api/agent/v1/qm-automation/confirm
 */
export async function submitAgentConfirm(
  request: AgentConfirmRequest,
  config: AWSConfig
): Promise<EvaluationStateUpdateResponse> {
  const apiBaseUrl = getApiBaseUrl(config.environment);

  const response = await fetch(`${apiBaseUrl}/api/agent/v1/qm-automation/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-aws-region': config.region,
      'x-environment': config.environment,
      ...(config.credentials && {
        'x-aws-credentials': JSON.stringify(config.credentials),
      }),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error', message: 'Unknown error' }));
    const errorMessage = errorData.message || errorData.error || `확인 처리 실패: ${response.status}`;
    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * 상담사 이의제기 API
 * POST /api/agent/v1/qm-automation/objection
 */
export async function submitAgentObjection(
  request: AgentObjectionRequest,
  config: AWSConfig
): Promise<EvaluationStateUpdateResponse> {
  const apiBaseUrl = getApiBaseUrl(config.environment);

  const response = await fetch(`${apiBaseUrl}/api/agent/v1/qm-automation/objection`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-aws-region': config.region,
      'x-environment': config.environment,
      ...(config.credentials && {
        'x-aws-credentials': JSON.stringify(config.credentials),
      }),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error', message: 'Unknown error' }));
    const errorMessage = errorData.message || errorData.error || `이의제기 처리 실패: ${response.status}`;
    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * QA 피드백 API (이의제기 승인/거절)
 * POST /api/agent/v1/qm-automation/qa-feedback
 */
export async function submitQAFeedback(
  request: QAFeedbackRequest,
  config: AWSConfig
): Promise<EvaluationStateUpdateResponse> {
  const apiBaseUrl = getApiBaseUrl(config.environment);

  const response = await fetch(`${apiBaseUrl}/api/agent/v1/qm-automation/qa-feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-aws-region': config.region,
      'x-environment': config.environment,
      ...(config.credentials && {
        'x-aws-credentials': JSON.stringify(config.credentials),
      }),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error', message: 'Unknown error' }));
    const errorMessage = errorData.message || errorData.error || `QA 피드백 처리 실패: ${response.status}`;
    throw new Error(errorMessage);
  }

  return response.json();
}

// ============================================
// 벌크 액션 API
// ============================================

/**
 * 벌크 상담사 액션 API (확인/이의제기 일괄 처리)
 * POST /api/agent/v1/qm-automation/agent-bulk-action
 */
export async function submitBulkAgentAction(
  request: BulkAgentActionRequest,
  config: AWSConfig
): Promise<BulkAgentActionResponse> {
  const apiBaseUrl = getApiBaseUrl(config.environment);

  const response = await fetch(`${apiBaseUrl}/api/agent/v1/qm-automation/agent-bulk-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-aws-region': config.region,
      'x-environment': config.environment,
      ...(config.credentials && {
        'x-aws-credentials': JSON.stringify(config.credentials),
      }),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error', message: 'Unknown error' }));
    const errorMessage = errorData.message || errorData.error || `벌크 처리 실패: ${response.status}`;
    throw new Error(errorMessage);
  }

  return response.json();
}

/**
 * 벌크 QA 피드백 API (이의제기 승인/거절 일괄 처리)
 * POST /api/agent/v1/qm-automation/qa-bulk-feedback
 */
export async function submitBulkQAFeedback(
  request: BulkQAFeedbackRequest,
  config: AWSConfig
): Promise<BulkAgentActionResponse> {
  const apiBaseUrl = getApiBaseUrl(config.environment);

  const response = await fetch(`${apiBaseUrl}/api/agent/v1/qm-automation/qa-bulk-feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-aws-region': config.region,
      'x-environment': config.environment,
      ...(config.credentials && {
        'x-aws-credentials': JSON.stringify(config.credentials),
      }),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error', message: 'Unknown error' }));
    const errorMessage = errorData.message || errorData.error || `벌크 QA 피드백 처리 실패: ${response.status}`;
    throw new Error(errorMessage);
  }

  return response.json();
}
