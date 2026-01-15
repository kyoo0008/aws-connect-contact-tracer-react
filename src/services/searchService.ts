/**
 * Advanced Search Service
 *
 * Backend API를 통해 다양한 검색 기능을 제공합니다.
 */

import { AWSConfig } from '@/types/contact.types';

const API_BASE_URL = 'http://localhost:8081';

export interface SearchContact {
  contactId: string;
  channel?: string;
  initiationMethod?: string;
  initiationTimestamp?: string;
  disconnectTimestamp?: string;
  timestamp?: string;
  service?: string;
}

export interface SearchResult {
  contacts: SearchContact[];
  agentUsername?: string;
}

/**
 * Customer 검색 (Phone, Profile ID, Skypass Number)
 */
export async function searchCustomer(
  searchValue: string,
  searchType: 'phone' | 'profileId' | 'skypass',
  config: AWSConfig
): Promise<SearchResult> {
  const response = await fetch(`${API_BASE_URL}/api/search/customer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      searchValue,
      searchType,
      credentials: config.credentials,
      region: config.region,
      environment: config.environment,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to search customer');
  }

  return response.json();
}

/**
 * Agent 검색 (UUID, Email, Name)
 */
export async function searchAgent(
  searchValue: string,
  searchType: 'uuid' | 'email' | 'name',
  config: AWSConfig
): Promise<SearchResult> {
  const response = await fetch(`${API_BASE_URL}/api/search/agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      searchValue,
      searchType,
      credentials: config.credentials,
      region: config.region,
      instanceId: config.instanceId,
      environment: config.environment,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to search agent');
  }

  return response.json();
}

/**
 * Contact Flow 이름으로 검색
 */
export async function searchContactFlow(
  flowName: string,
  config: AWSConfig,
  instanceAlias: string
): Promise<SearchResult> {
  const response = await fetch(`${API_BASE_URL}/api/search/contact-flow`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      flowName,
      credentials: config.credentials,
      region: config.region,
      instanceAlias,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to search contact flow');
  }

  return response.json();
}

/**
 * DNIS로 검색
 */
export async function searchDNIS(
  dnis: string,
  config: AWSConfig,
  instanceAlias: string
): Promise<SearchResult> {
  const response = await fetch(`${API_BASE_URL}/api/search/dnis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dnis,
      credentials: config.credentials,
      region: config.region,
      instanceAlias,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to search DNIS');
  }

  return response.json();
}

/**
 * Lambda Error 검색
 */
export async function searchLambdaError(
  config: AWSConfig
): Promise<SearchResult> {
  const response = await fetch(`${API_BASE_URL}/api/search/lambda-error`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      credentials: config.credentials,
      region: config.region,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to search lambda errors');
  }

  return response.json();
}

/**
 * 검색 값에서 검색 타입 감지
 */
export function detectSearchType(searchValue: string, searchCategory: string): string {
  if (searchCategory === 'Customer') {
    // E.164 phone number
    if (/^\+[1-9][0-9]{7,14}$/.test(searchValue)) {
      return 'phone';
    }
    // 32-char profile ID
    if (/^[a-zA-Z0-9]{32}$/.test(searchValue)) {
      return 'profileId';
    }
    // 12-char skypass number
    if (/^[a-zA-Z0-9]{12}$/.test(searchValue)) {
      return 'skypass';
    }
  } else if (searchCategory === 'Agent') {
    // UUID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(searchValue)) {
      return 'uuid';
    }
    // Email
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(searchValue)) {
      return 'email';
    }
    // Name
    return 'name';
  }

  return 'unknown';
}
