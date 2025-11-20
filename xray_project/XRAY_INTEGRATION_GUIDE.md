# AWS Connect Contact Flow X-Ray Integration Guide

이 문서는 Python `connect-contact-tracer`의 X-Ray 트레이스 로직을 React 프로젝트에 통합하는 방법을 설명합니다.

## 📋 목차

1. [개요](#개요)
2. [Python 코드 분석](#python-코드-분석)
3. [React 통합 단계](#react-통합-단계)
4. [파일 구조](#파일-구조)
5. [사용 방법](#사용-방법)

## 🎯 개요

### Python connect-contact-tracer의 X-Ray 처리 흐름

```python
# 1. X-Ray Trace ID 추출
xray_trace_id = log.get("xray_trace_id")

# 2. AWS X-Ray batch-get-traces 호출
cmd = ["aws", "xray", "batch-get-traces", "--trace-ids", trace_id]
result = subprocess.run(cmd, capture_output=True, text=True)

# 3. Document 파싱
traces = [
    json.loads(segment["Document"])
    for trace in data.get("Traces", [])
    for segment in trace.get("Segments", [])
]

# 4. Subsegment 재귀 처리
def process_subsegments(xray_dot, json_data):
    for data in json_data.get("subsegments", []):
        if data.get("name") not in ["Overhead", "Lambda"]:
            xray_dot = get_segment_node(xray_dot, data, json_data.get("id"))

# 5. Lambda 로그 연결
associated_lambda_logs = [
    l for l in function_logs 
    if l.get("xray_trace_id") == xray_trace_id
]

# 6. Graphviz DOT 노드 생성
xray_dot.node(node_id, label=..., shape="plaintext", URL=...)
```

### React 프로젝트 통합 목표

Python의 위 로직을 React에서 구현:
- `BatchGetTracesCommand`를 사용한 상세 트레이스 조회
- Document 파싱 및 subsegment 재귀 처리
- Lambda CloudWatch Logs 연결
- React Flow를 사용한 시각화

## 🔍 Python 코드 분석

### 핵심 함수들

#### 1. `get_xray_trace()` - X-Ray 트레이스 조회

```python
def get_xray_trace(trace_id, region):
    cmd = [
        "aws", "xray", "batch-get-traces",
        "--trace-ids", trace_id,
        "--region", region,
        "--output", "json"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    data = json.loads(result.stdout)
    
    # Segment Document 파싱
    traces = [
        json.loads(segment["Document"])
        for trace in data.get("Traces", [])
        for segment in trace.get("Segments", [])
    ]
    
    # JSON 파일로 저장
    with open(f"./virtual_env/batch_xray_{trace_id}.json", "w") as f:
        json.dump(traces, f, indent=2)
    
    return traces
```

**React 구현:**
```typescript
async getXRayTraceEnhanced(traceId: string): Promise<any> {
  const command = new BatchGetTracesCommand({
    TraceIds: [traceId],
  });
  const response = await this.xrayClient.send(command);
  
  const segments = this.parseXRayTraceSegments(response.Traces[0]);
  return { traceId, segments, ... };
}
```

#### 2. `process_subsegments()` - Subsegment 재귀 처리

```python
def process_subsegments(xray_dot, json_data):
    for data in json_data.get("subsegments", []):
        for subdata in data.get("subsegments", []):
            if subdata.get("name") not in ["Overhead", "Lambda"]:
                xray_dot = get_segment_node(xray_dot, subdata, json_data.get("id"))
    return xray_dot
```

**React 구현:**
```typescript
private parseXRaySubsegments(subsegments: any[]): any[] {
  const skipTypes = ['Overhead', 'Dwell Time', 'Invocation', 'Attempt', 'Lambda'];
  
  return subsegments
    .filter(sub => !skipTypes.includes(sub.name))
    .map(sub => ({
      id: sub.id,
      name: sub.name,
      // ... parse fields
      subsegments: sub.subsegments 
        ? this.parseXRaySubsegments(sub.subsegments) 
        : [],
    }));
}
```

#### 3. `build_xray_dot()` - X-Ray DOT 그래프 빌드

```python
def build_xray_dot(dot, nodes, error_count, xray_trace_id, connect_region, 
                   function_logs, log, module_stack, contact_id):
    # 1. X-Ray 트레이스 가져오기
    xray_trace = get_xray_trace(xray_trace_id, connect_region)
    
    # 2. Lambda 로그 필터링
    associated_lambda_logs = [
        l for l in function_logs 
        if l.get("xray_trace_id") == xray_trace_id
    ]
    
    # 3. X-Ray 노드 빌드
    xray_trace_file = build_xray_nodes(
        xray_trace_id, 
        associated_lambda_logs, 
        module_stack, 
        contact_id
    )
    
    # 4. 통계 계산
    levels = [l.get("level", "INFO") for l in associated_lambda_logs]
    l_error_count = levels.count("ERROR")
    l_warn_count = levels.count("WARN")
    
    # 5. 노드 생성
    color = 'tomato' if l_error_count > 0 or l_warn_count > 0 else 'lightgray'
    dot.node(node_id, label=..., color=color, URL=xray_trace_file)
    
    return dot, nodes, error_count
```

**React 구현:**
```typescript
buildXRayFlowNodes(traceData: XRayTraceData): { nodes: any[]; edges: any[] } {
  const nodes: any[] = [];
  const edges: any[] = [];
  
  // Process segments
  traceData.segments.forEach((segment) => {
    nodes.push({
      id: segment.id,
      type: 'xraySegment',
      data: { label: segment.name, segmentData: segment, ... },
    });
    
    // Process subsegments
    if (segment.subsegments) {
      this.processSubsegmentsForFlow(segment.subsegments, ...);
    }
  });
  
  // Add Lambda logs
  traceData.lambdaLogs.forEach((log) => {
    nodes.push({ id: logId, type: 'lambdaLog', ... });
  });
  
  return { nodes, edges };
}
```

## 🚀 React 통합 단계

### Step 1: AWS Connect Service에 X-Ray 메서드 추가

**파일:** `src/services/awsConnectService.ts`

```typescript
// awsConnectService.xray.patch.ts의 내용을 추가

import { 
  XRayClient, 
  BatchGetTracesCommand,
} from '@aws-sdk/client-xray';

export class AWSConnectService {
  private xrayClient: XRayClient;
  
  constructor(config: AWSConfig) {
    // ... 기존 코드 ...
    this.xrayClient = new XRayClient(clientConfig);
  }
  
  // 🆕 추가: Enhanced X-Ray trace method
  async getXRayTraceEnhanced(traceId: string): Promise<any> {
    // awsConnectService.xray.patch.ts의 구현 복사
  }
  
  // 🆕 추가: Parse X-Ray segments
  private parseXRayTraceSegments(trace: any): any[] {
    // awsConnectService.xray.patch.ts의 구현 복사
  }
  
  // 🆕 추가: Parse subsegments recursively
  private parseXRaySubsegments(subsegments: any[]): any[] {
    // awsConnectService.xray.patch.ts의 구현 복사
  }
  
  // 🆕 추가: Get all X-Ray traces for contact
  async getContactXRayTraces(
    contactId: string,
    contactLogs: any[],
    lambdaLogs?: Record<string, any[]>
  ): Promise<Map<string, any>> {
    // awsConnectService.xray.patch.ts의 구현 복사
  }
}
```

### Step 2: XRayTraceViewer 업데이트

**파일:** `src/pages/XRayTraceViewer.tsx`

```typescript
// XRayTraceViewer.enhanced.tsx의 내용으로 교체

const { data: xrayData, isLoading, error } = useQuery({
  queryKey: ['xrayTrace', xrayTraceId],
  queryFn: async () => {
    const service = getAWSConnectService(config);
    // 🆕 Enhanced method 사용
    return await service.getXRayTraceEnhanced(xrayTraceId);
  },
  enabled: isConfigured && !!xrayTraceId,
});

// 🆕 Build React Flow nodes
useEffect(() => {
  if (!xrayData) return;
  const flowData = buildXRayFlowData(xrayData);
  setNodes(flowData.nodes);
  setEdges(flowData.edges);
}, [xrayData]);
```

### Step 3: ContactFlowViewer에 X-Ray 통합

**파일:** `src/pages/ContactFlowViewer.tsx`

```typescript
// ContactFlowViewer.xray.integration.tsx의 로직 추가

const { data: queryData } = useQuery({
  queryKey: ['contact-flow', contactId],
  queryFn: async () => {
    // ... 기존 로직 ...
    
    // 🆕 Lambda 로그 가져오기
    const lambdaLogs = await service.getLambdaLogs?.(
      contactId, 
      startTime, 
      endTime
    ) || {};
    
    // 🆕 X-Ray 트레이스 가져오기
    const xrayTraces = await service.getContactXRayTraces(
      contactId,
      contactLogs,
      lambdaLogs
    );
    
    // 🆕 X-Ray 노드를 플로우에 추가
    flowBuilder.addXRayNodes(xrayTraces);
    
    return { flowData, xrayTraces, ... };
  },
});

// 🆕 X-Ray 노드 클릭 핸들러
const handleNodeClick = useCallback((event, node) => {
  if (node.data.moduleType === 'xray') {
    navigate(`/xray-trace?traceId=${node.data.parameters.traceId}`);
  }
}, [navigate]);
```

### Step 4: FlowBuilderService에 X-Ray 노드 추가 메서드

**파일:** `src/services/flowBuilderService.ts`

```typescript
export class FlowBuilderService {
  // ... 기존 코드 ...
  
  /**
   * 🆕 X-Ray 트레이스 노드를 플로우에 추가
   */
  addXRayNodes(xrayTraces: Map<string, any>): void {
    const logsWithXRay = this.logs.filter(log => 
      log.xray_trace_id || log.xrayTraceId
    );
    
    logsWithXRay.forEach(log => {
      const traceId = log.xray_trace_id || log.xrayTraceId;
      const traceData = xrayTraces.get(traceId);
      if (!traceData) return;
      
      const nodeId = `xray_${traceId}`;
      const lambdaLogStats = this.getXRayLambdaLogStats(traceData.lambdaLogs);
      
      // X-Ray 노드 생성
      this.nodes.push({
        id: nodeId,
        type: 'custom',
        data: {
          label: 'X-Ray Trace',
          moduleType: 'xray',
          parameters: {
            traceId,
            duration: traceData.duration,
            operationsSummary: this.getXRayTraceSummary(traceData),
            lambdaLogStats,
          },
          error: lambdaLogStats.hasIssues,
          xrayTraceData: traceData,
        },
        position: { x: 0, y: 0 },
      });
      
      // Lambda 노드와 연결
      const lambdaNodeId = this.findLambdaNodeForLog(log);
      if (lambdaNodeId) {
        this.edges.push({
          id: `${lambdaNodeId}-${nodeId}`,
          source: lambdaNodeId,
          target: nodeId,
          label: 'X-Ray',
        });
      }
    });
  }
  
  private getXRayLambdaLogStats(lambdaLogs: any[]) {
    // ContactFlowViewer.xray.integration.tsx 참고
  }
  
  private getXRayTraceSummary(traceData: any): string {
    // ContactFlowViewer.xray.integration.tsx 참고
  }
}
```

### Step 5: CustomNode 컴포넌트에 X-Ray 노드 스타일 추가

**파일:** `src/components/FlowNodes/CustomNode.tsx`

```typescript
const CustomNode: React.FC<{ data: any }> = ({ data }) => {
  // 🆕 X-Ray 노드 렌더링
  if (data.moduleType === 'xray') {
    return (
      <Box
        sx={{
          p: 2,
          border: data.error ? '2px solid #f44336' : '2px solid #4caf50',
          borderRadius: 2,
          background: data.error ? '#ffebee' : '#e8f5e9',
          minWidth: 200,
          cursor: 'pointer',
        }}
      >
        <Stack spacing={1}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BugReportIcon color={data.error ? 'error' : 'success'} />
            <Typography variant="subtitle2" fontWeight="bold">
              X-Ray Trace
            </Typography>
            <IconButton size="small" sx={{ ml: 'auto' }}>
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Box>
          
          {data.parameters?.lambdaLogStats?.summary && (
            <Typography variant="caption" color="error">
              {data.parameters.lambdaLogStats.summary}
            </Typography>
          )}
          
          {data.parameters?.operationsSummary && (
            <Typography variant="caption" sx={{ whiteSpace: 'pre-line' }}>
              {data.parameters.operationsSummary}
            </Typography>
          )}
        </Stack>
      </Box>
    );
  }
  
  // 기존 노드 렌더링...
};
```

## 📁 파일 구조

```
src/
├── services/
│   ├── awsConnectService.ts          # 🔧 X-Ray 메서드 추가
│   │   ├── getXRayTraceEnhanced()
│   │   ├── parseXRayTraceSegments()
│   │   ├── parseXRaySubsegments()
│   │   └── getContactXRayTraces()
│   │
│   └── flowBuilderService.ts         # 🔧 X-Ray 노드 추가 메서드
│       └── addXRayNodes()
│
├── pages/
│   ├── XRayTraceViewer.tsx           # 🔧 Enhanced 버전으로 교체
│   │   └── buildXRayFlowData()
│   │
│   └── ContactFlowViewer.tsx         # 🔧 X-Ray 통합 추가
│       └── handleNodeClick()
│
├── components/
│   └── FlowNodes/
│       └── CustomNode.tsx            # 🔧 X-Ray 노드 스타일 추가
│
└── types/
    └── contact.types.ts              # 🔧 X-Ray 타입 추가 (필요시)
```

## 🎨 사용 방법

### 1. Contact Flow에서 X-Ray 트레이스 보기

```typescript
// Contact Flow Viewer에서 Lambda 노드 클릭 시
// X-Ray 트레이스 ID가 있으면 X-Ray 노드가 표시됩니다.

// X-Ray 노드를 클릭하면 상세 트레이스 페이지로 이동:
navigate(`/xray-trace?traceId=${traceId}&contactId=${contactId}`);
```

### 2. X-Ray Trace Viewer 직접 접근

```typescript
// URL로 직접 접근:
// /xray-trace?traceId=1-67890abc-def12345&contactId=12345678

// 또는 프로그래밍 방식:
const service = getAWSConnectService(config);
const traceData = await service.getXRayTraceEnhanced(traceId);
```

### 3. X-Ray 데이터 구조

```typescript
interface XRayTraceData {
  traceId: string;
  segments: XRaySegmentData[];      // 메인 세그먼트들
  lambdaLogs: LambdaLogWithXRay[];  // 연관된 Lambda 로그
  duration: number;                  // 전체 트레이스 소요시간
  hasError: boolean;                 // 에러 발생 여부
  hasFault: boolean;                 // 장애 발생 여부
}

interface XRaySegmentData {
  id: string;
  name: string;                      // 서비스 이름 (e.g., Lambda 함수명)
  start_time: number;
  end_time: number;
  duration: number;
  parent_id?: string;
  origin?: string;                   // e.g., "AWS::Lambda::Function"
  error?: boolean;
  fault?: boolean;
  aws?: {
    operation?: string;              // e.g., "Query", "PutItem"
    resource_names?: string[];       // e.g., ["MyDynamoDBTable"]
  };
  http?: {
    request?: { method?: string; url?: string; };
    response?: { status?: number; };
  };
  subsegments?: XRaySubsegment[];   // 재귀 구조
}
```

## 🔑 주요 차이점: Python vs React

| 측면 | Python | React |
|------|--------|-------|
| **X-Ray 조회** | `aws xray batch-get-traces` CLI | `BatchGetTracesCommand` SDK |
| **Document 파싱** | `json.loads(segment["Document"])` | `JSON.parse(segment.Document)` |
| **시각화** | Graphviz DOT | React Flow |
| **노드 생성** | `xray_dot.node()` | `nodes.push({ type: 'xraySegment' })` |
| **엣지 생성** | `xray_dot.edge()` | `edges.push({ source, target })` |
| **재귀 처리** | Python 재귀 함수 | TypeScript 재귀 메서드 |
| **로그 필터링** | List comprehension | `Array.filter()` |
| **저장** | DOT 파일 | React State |

## ⚠️ 주의사항

1. **AWS SDK 버전**: `@aws-sdk/client-xray` v3 사용 필요
2. **권한**: X-Ray 읽기 권한 (`xray:BatchGetTraces`) 필요
3. **성능**: 많은 트레이스 조회 시 병렬 처리 고려
4. **에러 처리**: 트레이스가 없는 경우 graceful handling
5. **Subsegment 필터링**: 'Overhead', 'Lambda' 등 불필요한 subsegment 제외

## 🐛 디버깅 팁

### X-Ray 트레이스가 표시되지 않을 때

```typescript
// 1. Contact 로그에 X-Ray Trace ID가 있는지 확인
console.log('Contact logs with X-Ray:', 
  contactLogs.filter(log => log.xray_trace_id)
);

// 2. BatchGetTraces 응답 확인
const response = await xrayClient.send(new BatchGetTracesCommand({
  TraceIds: [traceId],
}));
console.log('X-Ray response:', response);

// 3. Segment Document 파싱 확인
const doc = JSON.parse(response.Traces[0].Segments[0].Document);
console.log('Parsed document:', doc);
```

### Lambda 로그가 연결되지 않을 때

```typescript
// Lambda 로그의 X-Ray Trace ID 필드 확인
console.log('Lambda logs:', lambdaLogs);
console.log('X-Ray field names:', 
  Object.keys(lambdaLogs[0]).filter(k => k.toLowerCase().includes('xray'))
);

// 필터링 로직 확인
const filtered = lambdaLogs.filter(log => 
  log.xray_trace_id === traceId || log.xrayTraceId === traceId
);
console.log('Filtered Lambda logs:', filtered);
```

## 📚 참고 자료

- Python 코드: `aws-connect-contact-tracer/utils.py` - `get_xray_trace()`
- Python 코드: `aws-connect-contact-tracer/dot_builder.py` - `build_xray_dot()`
- AWS SDK: [@aws-sdk/client-xray](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-xray/)
- React Flow: [https://reactflow.dev/](https://reactflow.dev/)

## ✅ 체크리스트

통합 완료 체크리스트:

- [ ] `awsConnectService.ts`에 X-Ray 메서드 추가
- [ ] `XRayTraceViewer.tsx` enhanced 버전으로 교체
- [ ] `ContactFlowViewer.tsx`에 X-Ray 데이터 로딩 추가
- [ ] `flowBuilderService.ts`에 `addXRayNodes()` 메서드 추가
- [ ] `CustomNode.tsx`에 X-Ray 노드 스타일 추가
- [ ] X-Ray 권한 설정 확인
- [ ] 테스트: X-Ray Trace ID가 있는 Contact으로 테스트
- [ ] 테스트: X-Ray Trace Viewer 단독 페이지 테스트
- [ ] 에러 처리 추가
- [ ] Lambda 로그 연결 확인

## 🎉 완료!

이제 Python `connect-contact-tracer`의 X-Ray 트레이스 기능이 React 프로젝트에 완전히 통합되었습니다!

Contact Flow Viewer에서 Lambda 호출 시 X-Ray 트레이스를 확인하고, 
상세한 AWS 서비스 호출 내역과 Lambda CloudWatch 로그를 시각화할 수 있습니다.
