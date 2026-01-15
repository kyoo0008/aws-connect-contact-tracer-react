# QM Automation Error Handling Enhancement

## 개요
Lambda에서 반환하는 에러 응답(400 Bad Request, 500 Internal Server Error)을 프론트엔드에서 적절하게 처리하고 사용자에게 표시하도록 개선했습니다.

## 변경 사항

### 1. Backend (server.js)
**파일**: `/Users/ke-aicc/workspace/test/aicc-tracer/server.js`

Lambda 응답 처리 로직을 개선하여 에러 상태 코드(>= 400)를 올바르게 감지하고 프론트엔드로 전달합니다.

```javascript
// Lambda 응답에서 statusCode 추출
const statusCode = result.statusCode || 200;

// 에러 응답 처리 (statusCode >= 400)
if (statusCode >= 400) {
  return res.status(statusCode).json({ 
    error: responseData.error || responseData.message || 'Request failed',
    message: responseData.error || responseData.message || 'Unknown error',
    statusCode: statusCode
  });
}
```

**주요 개선점**:
- Lambda의 `AlbResponse.fail(400, message)` 또는 `AlbResponse.fail(500, message)` 응답을 정확히 파싱
- 상태 코드와 에러 메시지를 프론트엔드로 전달
- 일관된 에러 응답 형식 제공

### 2. Frontend Service (qmAutomationService.ts)
**파일**: `/Users/ke-aicc/workspace/test/aicc-tracer/src/services/qmAutomationService.ts`

모든 API 호출 함수에서 에러 응답을 상세하게 파싱하고 사용자 친화적인 메시지로 변환합니다.

```typescript
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
```

**적용된 함수**:
- `requestQMAutomation()` - QM 분석 요청
- `getQMAutomationStatus()` - 상태 조회
- `getQMAutomationListByContactId()` - Contact ID별 목록 조회
- `getQMAutomationListAll()` - 전체 목록 조회
- `getQMAutomationListSearch()` - 기간별 검색
- `getQMAutomationListByMonth()` - 월별 조회
- `getQMAutomationListByAgent()` - 상담사별 조회

### 3. UI Components

#### QMAutomationList.tsx
**파일**: `/Users/ke-aicc/workspace/test/aicc-tracer/src/pages/QMAutomationList.tsx`

새 QM 분석 요청 다이얼로그에 에러 알림 추가:

```tsx
{/* Error Alert */}
{createQMMutation.isError && (
  <Alert severity="error" sx={{ mb: 2 }}>
    <Typography variant="subtitle2" fontWeight={600}>
      QM 분석 요청 실패
    </Typography>
    <Typography variant="body2">
      {(createQMMutation.error as Error)?.message || '알 수 없는 오류가 발생했습니다.'}
    </Typography>
  </Alert>
)}
```

**주요 개선점**:
- 사용자가 QM 분석을 요청할 때 발생하는 에러를 다이얼로그 내에서 즉시 확인 가능
- 에러 메시지가 명확하게 표시됨

#### QMAutomationDetail.tsx
**파일**: `/Users/ke-aicc/workspace/test/aicc-tracer/src/pages/QMAutomationDetail.tsx`

상세 페이지의 에러 표시 개선:

```tsx
{qmDetail && (qmDetail.status === 'FAILED' || qmDetail.status === 'ERROR') && (
  <Alert severity="error" sx={{ mb: 2 }}>
    <Typography variant="subtitle1" fontWeight={600} gutterBottom>
      QM 분석 실패
    </Typography>
    <Typography variant="body2" sx={{ mb: 1 }}>
      {qmDetail.error || '알 수 없는 오류가 발생했습니다.'}
    </Typography>
    {qmDetail.result?.errorDetails && (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, fontFamily: 'monospace' }}>
        상세 정보: {JSON.stringify(qmDetail.result.errorDetails, null, 2)}
      </Typography>
    )}
  </Alert>
)}
```

**주요 개선점**:
- 실패한 QM 분석의 에러 메시지를 명확하게 표시
- 추가 에러 상세 정보가 있는 경우 함께 표시

### 4. Type Definitions
**파일**: `/Users/ke-aicc/workspace/test/aicc-tracer/src/types/qmAutomation.types.ts`

`QMAutomationResult` 인터페이스에 `errorDetails` 속성 추가:

```typescript
export interface QMAutomationResult {
  // ... 기존 속성들
  errorDetails?: any; // 에러 상세 정보 (Lambda 에러 응답)
}
```

## Lambda 에러 응답 예시

### Bad Request (400)
```typescript
export function handleError(error: unknown): ALBResult {
  if (error instanceof BadRequestError) {
    logger.error(`[handleError] Bad Request: ${error.message}`);
    return AlbResponse.fail(400, error.message);
  }
  // ...
}
```

**프론트엔드 표시**:
```
잘못된 요청: [Lambda에서 반환한 에러 메시지]
```

### Internal Server Error (500)
```typescript
const errorMessage = error instanceof Error ? error.message : 'Unknown error';
logger.error(`[handleError] Internal error: ${errorMessage}`);
return AlbResponse.fail(500, errorMessage);
```

**프론트엔드 표시**:
```
서버 오류: [Lambda에서 반환한 에러 메시지]
```

### Invalid JSON (400)
```typescript
if (error instanceof SyntaxError) {
  logger.error(`[handleError] Invalid JSON: ${error.message}`);
  return AlbResponse.fail(400, 'Invalid JSON in request body');
}
```

**프론트엔드 표시**:
```
잘못된 요청: Invalid JSON in request body
```

## 테스트 시나리오

### 1. 잘못된 Contact ID로 QM 분석 요청
- **입력**: 존재하지 않는 Contact ID
- **예상 결과**: "잘못된 요청: Contact not found" 또는 유사한 메시지 표시

### 2. 필수 파라미터 누락
- **입력**: Contact ID 없이 요청
- **예상 결과**: "잘못된 요청: contactId is required" 메시지 표시

### 3. Lambda 내부 오류
- **입력**: Lambda 실행 중 예외 발생
- **예상 결과**: "서버 오류: [에러 메시지]" 표시

### 4. 네트워크 오류
- **입력**: 서버 연결 실패
- **예상 결과**: "Failed to fetch" 또는 네트워크 관련 에러 메시지 표시

## 사용자 경험 개선

1. **명확한 에러 메시지**: Lambda에서 반환한 정확한 에러 메시지를 사용자에게 전달
2. **상태 코드 기반 분류**: 400번대(클라이언트 오류), 500번대(서버 오류)를 구분하여 표시
3. **즉각적인 피드백**: 다이얼로그 내에서 에러를 즉시 확인 가능
4. **상세 정보 제공**: 필요한 경우 추가 에러 상세 정보 표시

## 향후 개선 사항

1. **에러 코드 체계화**: 특정 에러 타입별로 고유 코드 부여
2. **재시도 로직**: 일시적 오류에 대한 자동 재시도 기능
3. **에러 로깅**: 프론트엔드 에러를 서버로 전송하여 모니터링
4. **다국어 지원**: 에러 메시지 다국어 처리
