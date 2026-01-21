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
 * QM Automation 분석 요청
 */
export async function requestQMAutomation(
  requestBody: QMAutomationRequestBody,
  config: AWSConfig
): Promise<QMAutomationResponse> {
  const apiBaseUrl = getApiBaseUrl(config.environment);

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
    body: JSON.stringify(requestBody),
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
  agentId?: string;
  agentUserName?: string;
  agentCenter?: string;
  agentConfirmYN?: 'Y' | 'N';
  qaFeedbackYN?: 'Y' | 'N';
  qmEvaluationStatus?: string;
  contactId?: string;
  limit?: number;
}

/**
 * QM Automation 다중 필터 검색 (GET /api/agent/v1/qm-automation/search)
 */
export async function getQMAutomationListSearch(
  config: AWSConfig,
  filters: QMAutomationSearchFilters
): Promise<QMAutomationListItem[]> {
  const apiBaseUrl = getApiBaseUrl(config.environment);

  try {
    // Build query string from filters
    const params = new URLSearchParams();
    if (filters.startMonth) params.append('startMonth', filters.startMonth);
    if (filters.endMonth) params.append('endMonth', filters.endMonth);
    if (filters.agentId) params.append('agentId', filters.agentId);
    if (filters.agentUserName) params.append('agentUserName', filters.agentUserName);
    if (filters.agentCenter) params.append('agentCenter', filters.agentCenter);
    if (filters.agentConfirmYN) params.append('agentConfirmYN', filters.agentConfirmYN);
    if (filters.qaFeedbackYN) params.append('qaFeedbackYN', filters.qaFeedbackYN);
    if (filters.qmEvaluationStatus) params.append('qmEvaluationStatus', filters.qmEvaluationStatus);
    if (filters.contactId) params.append('contactId', filters.contactId);
    if (filters.limit) params.append('limit', filters.limit.toString());

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
    return data.items || [];
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
