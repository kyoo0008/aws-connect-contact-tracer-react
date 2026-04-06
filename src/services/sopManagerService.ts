import type { AWSConfig } from '@/types/contact.types';

const API_BASE = 'http://localhost:8081/api/agent/v1/qm-automation/sop';

const DEFAULT_LANG = 'KO';

// ---- Types ----

export interface SopCategory {
  categoryId: string;
  categoryName: string;
  sk?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SopService {
  serviceId: string;
  serviceName: string;
  sk?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Checklist {
  checklistId: string;
  serviceId: string;
  categoryId: string;
  checklistName: string;
  sk?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ActionItem {
  actionId: string;
  checklistId: string;
  itemName: string;
  lang?: string;
  sk?: string;
  evalOrder?: number;
  apiEndpoint?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

function buildHeaders(config: AWSConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-aws-region': config.region,
    'x-environment': config.environment,
  };
  if (config.credentials) {
    headers['x-aws-credentials'] = JSON.stringify(config.credentials);
  }
  return headers;
}

function extractItems<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.items)) return d.items as T[];
  if (d.data && Array.isArray((d.data as Record<string, unknown>).items)) return (d.data as Record<string, unknown>).items as T[];
  if (Array.isArray(d.data)) return d.data as T[];
  return [];
}

function extractData<T>(data: unknown): T {
  const d = data as Record<string, unknown>;
  return (d.data ?? data) as T;
}

// ---- Categories ----

export async function getCategories(config: AWSConfig): Promise<SopCategory[]> {
  const res = await fetch(`${API_BASE}/categories`, { headers: buildHeaders(config) });
  if (!res.ok) throw new Error(`getCategories failed: ${res.status}`);
  return extractItems<SopCategory>(await res.json());
}

export async function createCategory(config: AWSConfig, body: { categoryName: string; lang: string; isActive?: boolean }): Promise<SopCategory> {
  const res = await fetch(`${API_BASE}/categories`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createCategory failed: ${res.status}`);
  return extractData<SopCategory>(await res.json());
}

export async function updateCategory(config: AWSConfig, categoryId: string, body: { lang: string; categoryName?: string; isActive?: boolean }): Promise<SopCategory> {
  const res = await fetch(`${API_BASE}/categories/${categoryId}`, {
    method: 'PUT',
    headers: buildHeaders(config),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`updateCategory failed: ${res.status}`);
  return extractData<SopCategory>(await res.json());
}

export async function deleteCategory(config: AWSConfig, categoryId: string, lang: string = DEFAULT_LANG): Promise<void> {
  const res = await fetch(`${API_BASE}/categories/${categoryId}?lang=${lang}`, { method: 'DELETE', headers: buildHeaders(config) });
  if (!res.ok) throw new Error(`deleteCategory failed: ${res.status}`);
}

// ---- Services ----

export async function getServices(config: AWSConfig): Promise<SopService[]> {
  const res = await fetch(`${API_BASE}/services`, { headers: buildHeaders(config) });
  if (!res.ok) throw new Error(`getServices failed: ${res.status}`);
  return extractItems<SopService>(await res.json());
}

export async function createService(config: AWSConfig, body: { serviceName: string; lang: string; isActive?: boolean }): Promise<SopService> {
  const res = await fetch(`${API_BASE}/services`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createService failed: ${res.status}`);
  return extractData<SopService>(await res.json());
}

/**
 * 서비스 업데이트 핸들러
 * PUT /api/agent/v1/qm-automation/sop/services/{serviceId}
 * Body:
 *   - lang: string (required) - 현재 lang (레코드 조회용)
 *   - newLang: string (optional) - 변경할 lang. 지정 시 하위 체크리스트/액션아이템/필수엔티티의 lang도 함께 변경
 *   - serviceName: string (optional)
 *   - isActive: boolean (optional)
 */
export async function updateService(
  config: AWSConfig,
  serviceId: string,
  body: { lang: string; newLang?: string; serviceName?: string; isActive?: boolean }
): Promise<SopService> {
  const res = await fetch(`${API_BASE}/services/${serviceId}`, {
    method: 'PUT',
    headers: buildHeaders(config),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`updateService failed: ${res.status}`);
  return extractData<SopService>(await res.json());
}

export async function deleteService(config: AWSConfig, serviceId: string, lang: string = DEFAULT_LANG): Promise<void> {
  const res = await fetch(`${API_BASE}/services/${serviceId}?lang=${lang}`, { method: 'DELETE', headers: buildHeaders(config) });
  if (!res.ok) throw new Error(`deleteService failed: ${res.status}`);
}

/**
 * 서비스 언어 마이그레이션
 * POST /api/agent/v1/qm-automation/sop/services/{serviceId}/migrate-lang
 * Body:
 *   - currentLang: string - 현재 lang
 *   - newLang: string - 변경할 lang
 *
 * 처리 순서:
 * 1. 서비스에 속한 모든 체크리스트 조회
 * 2. 각 체크리스트의 모든 액션아이템 → 새 lang SK로 재생성 후 구 레코드 삭제
 * 3. 각 체크리스트의 모든 필수엔티티 → 새 lang SK로 재생성 후 구 레코드 삭제
 * 4. 체크리스트 레코드 (SK + GSI1SK/GSI2SK 포함) → 재생성 후 구 레코드 삭제
 * 5. 서비스 레코드 → 재생성 후 구 레코드 삭제
 */
export async function migrateLang(config: AWSConfig, serviceId: string, currentLang: string, newLang: string): Promise<void> {
  const res = await fetch(`${API_BASE}/services/${serviceId}/migrate-lang`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify({ currentLang, newLang }),
  });
  if (!res.ok) throw new Error(`migrateLang failed: ${res.status}`);
}

// ---- Checklists ----

export async function getChecklists(config: AWSConfig, serviceId: string, lang: string): Promise<Checklist[]> {
  const res = await fetch(`${API_BASE}/services/${serviceId}/checklists?lang=${lang}`, { headers: buildHeaders(config) });
  if (!res.ok) throw new Error(`getChecklists failed: ${res.status}`);
  return extractItems<Checklist>(await res.json());
}

/**
 * 서비스의 모든 체크리스트 조회 (lang 무관)
 * GET /api/agent/v1/qm-automation/sop/services/{serviceId}/checklists/all
 * 마이그레이션 시 모든 체크리스트를 조회할 때 사용
 */
export async function listChecklistsByService(config: AWSConfig, serviceId: string): Promise<Checklist[]> {
  const res = await fetch(`${API_BASE}/services/${serviceId}/checklists/all`, { headers: buildHeaders(config) });
  if (!res.ok) throw new Error(`listChecklistsByService failed: ${res.status}`);
  return extractItems<Checklist>(await res.json());
}

export async function createChecklist(config: AWSConfig, body: { checklistName: string; serviceId: string; categoryId: string; lang: string; isActive?: boolean }): Promise<Checklist> {
  const res = await fetch(`${API_BASE}/checklists`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createChecklist failed: ${res.status}`);
  return extractData<Checklist>(await res.json());
}

export async function updateChecklist(config: AWSConfig, checklistId: string, body: { lang: string; checklistName?: string; serviceId?: string; categoryId?: string; isActive?: boolean }): Promise<Checklist> {
  const res = await fetch(`${API_BASE}/checklists/${checklistId}`, {
    method: 'PUT',
    headers: buildHeaders(config),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`updateChecklist failed: ${res.status}`);
  return extractData<Checklist>(await res.json());
}

export async function deleteChecklist(config: AWSConfig, checklistId: string, lang: string = DEFAULT_LANG): Promise<void> {
  const res = await fetch(`${API_BASE}/checklists/${checklistId}?lang=${lang}`, { method: 'DELETE', headers: buildHeaders(config) });
  if (!res.ok) throw new Error(`deleteChecklist failed: ${res.status}`);
}

// ---- Action Items ----

export async function getActionItems(config: AWSConfig, checklistId: string, lang?: string): Promise<ActionItem[]> {
  const query = lang ? `?lang=${lang}` : '';
  const res = await fetch(`${API_BASE}/checklists/${checklistId}/action-items${query}`, { headers: buildHeaders(config) });
  if (!res.ok) throw new Error(`getActionItems failed: ${res.status}`);
  return extractItems<ActionItem>(await res.json());
}

export async function createActionItem(config: AWSConfig, checklistId: string, body: { itemName: string; lang: string; evalOrder: number; apiEndpoint?: string; isActive?: boolean }): Promise<ActionItem> {
  const res = await fetch(`${API_BASE}/checklists/${checklistId}/action-items`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createActionItem failed: ${res.status}`);
  return extractData<ActionItem>(await res.json());
}

export async function updateActionItem(config: AWSConfig, checklistId: string, actionId: string, body: { lang: string; evalOrder: number; itemName?: string; apiEndpoint?: string; isActive?: boolean }): Promise<ActionItem> {
  const res = await fetch(`${API_BASE}/checklists/${checklistId}/action-items/${actionId}`, {
    method: 'PUT',
    headers: buildHeaders(config),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`updateActionItem failed: ${res.status}`);
  return extractData<ActionItem>(await res.json());
}

export async function deleteActionItem(config: AWSConfig, checklistId: string, actionId: string, lang: string, evalOrder: number): Promise<void> {
  const res = await fetch(`${API_BASE}/checklists/${checklistId}/action-items/${actionId}?lang=${lang}&evalOrder=${evalOrder}`, { method: 'DELETE', headers: buildHeaders(config) });
  if (!res.ok) throw new Error(`deleteActionItem failed: ${res.status}`);
}

// ---- Required Entities ----

export interface RequiredEntity {
  reqId: string;
  checklistId: string;
  entityName: string;
  inductionPrompt?: string;
  lang?: string;
  sk?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export async function getRequiredEntities(config: AWSConfig, checklistId: string, lang?: string): Promise<RequiredEntity[]> {
  const query = lang ? `?lang=${lang}` : '';
  const res = await fetch(`${API_BASE}/checklists/${checklistId}/required-entities${query}`, { headers: buildHeaders(config) });
  if (!res.ok) throw new Error(`getRequiredEntities failed: ${res.status}`);
  return extractItems<RequiredEntity>(await res.json());
}

export async function createRequiredEntity(config: AWSConfig, checklistId: string, body: { entityName: string; lang: string; inductionPrompt?: string; isActive?: boolean }): Promise<RequiredEntity> {
  const res = await fetch(`${API_BASE}/checklists/${checklistId}/required-entities`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createRequiredEntity failed: ${res.status}`);
  return extractData<RequiredEntity>(await res.json());
}

export async function updateRequiredEntity(config: AWSConfig, checklistId: string, reqId: string, body: { lang: string; entityName?: string; inductionPrompt?: string; isActive?: boolean }): Promise<RequiredEntity> {
  const res = await fetch(`${API_BASE}/checklists/${checklistId}/required-entities/${reqId}`, {
    method: 'PUT',
    headers: buildHeaders(config),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`updateRequiredEntity failed: ${res.status}`);
  return extractData<RequiredEntity>(await res.json());
}

export async function deleteRequiredEntity(config: AWSConfig, checklistId: string, reqId: string, lang: string): Promise<void> {
  const res = await fetch(`${API_BASE}/checklists/${checklistId}/required-entities/${reqId}?lang=${lang}`, { method: 'DELETE', headers: buildHeaders(config) });
  if (!res.ok) throw new Error(`deleteRequiredEntity failed: ${res.status}`);
}

// ---- Replace Operations (for migrations) ----

/**
 * 조건 없이 서비스 레코드를 교체 (마이그레이션용)
 * POST /api/agent/v1/qm-automation/sop/services/replace
 * DynamoDB SK 변경이 필요한 경우 delete → recreate 순서로 처리
 */
export async function replaceService(config: AWSConfig, service: SopService): Promise<SopService> {
  const res = await fetch(`${API_BASE}/services/replace`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify(service),
  });
  if (!res.ok) throw new Error(`replaceService failed: ${res.status}`);
  return extractData<SopService>(await res.json());
}

/**
 * 조건 없이 체크리스트 레코드를 교체 (마이그레이션용)
 * POST /api/agent/v1/qm-automation/sop/checklists/replace
 * SK + GSI1SK/GSI2SK 포함하여 재생성
 */
export async function replaceChecklist(config: AWSConfig, checklist: Checklist): Promise<Checklist> {
  const res = await fetch(`${API_BASE}/checklists/replace`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify(checklist),
  });
  if (!res.ok) throw new Error(`replaceChecklist failed: ${res.status}`);
  return extractData<Checklist>(await res.json());
}

/**
 * 조건 없이 액션아이템 레코드를 교체 (마이그레이션용)
 * POST /api/agent/v1/qm-automation/sop/action-items/replace
 */
export async function replaceActionItem(config: AWSConfig, actionItem: ActionItem): Promise<ActionItem> {
  const res = await fetch(`${API_BASE}/action-items/replace`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify(actionItem),
  });
  if (!res.ok) throw new Error(`replaceActionItem failed: ${res.status}`);
  return extractData<ActionItem>(await res.json());
}

/**
 * 조건 없이 필수엔티티 레코드를 교체 (마이그레이션용)
 * POST /api/agent/v1/qm-automation/sop/required-entities/replace
 */
export async function replaceRequiredEntity(config: AWSConfig, entity: RequiredEntity): Promise<RequiredEntity> {
  const res = await fetch(`${API_BASE}/required-entities/replace`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify(entity),
  });
  if (!res.ok) throw new Error(`replaceRequiredEntity failed: ${res.status}`);
  return extractData<RequiredEntity>(await res.json());
}
