import { ContactLog, AWSConfig } from '@/types/contact.types';
import { getFlowDefinitionService } from '@/services/flowDefinitionService';

/**
 * CheckAttribute 로그에 Flow Definition 데이터를 추가하여 비교값을 enrichment 합니다
 * 최적화: 각 unique flow/module definition은 한 번만 fetch합니다
 */
export const enrichCheckAttributeLogs = async (
  logs: ContactLog[],
  config: AWSConfig
): Promise<ContactLog[]> => {
  const flowDefService = getFlowDefinitionService(config);

  // Step 1: 모든 CheckAttribute 로그에서 unique flow IDs 추출
  const uniqueFlowIds = new Set<string>();
  const checkAttributeLogs: ContactLog[] = [];

  logs.forEach((log) => {
    if (log.ContactFlowModuleType === 'CheckAttribute' && log.Identifier && log.ContactFlowId) {
      uniqueFlowIds.add(log.ContactFlowId);
      checkAttributeLogs.push(log);
    }
  });

  // Step 2: 모든 unique flow definitions을 한 번씩만 fetch (병렬 처리)
  const flowDefinitionPromises = Array.from(uniqueFlowIds).map(async (flowId) => {
    try {
      await flowDefService.getFlowDefinitionByArn(flowId);
    } catch (error: any) {
      // AWS 자격 증명 만료 에러는 warning으로 처리
      if (error.name === 'ExpiredTokenException' || error.message?.includes('expired')) {
        console.warn(`AWS credentials expired. CheckAttribute enrichment skipped for ${flowId}`);
      } else {
        console.error(`Error fetching flow definition for ${flowId}:`, error);
      }
    }
  });

  // 모든 flow definitions이 cache에 로드될 때까지 대기
  await Promise.all(flowDefinitionPromises);

  // Step 3: 이제 cache에서 데이터를 가져와 logs를 enrichment
  const enrichedLogs = logs.map((log) => {
    // CheckAttribute가 아니면 그대로 반환
    if (log.ContactFlowModuleType !== 'CheckAttribute') {
      return log;
    }

    // Identifier와 ContactFlowId가 없으면 enrichment 불가
    if (!log.Identifier || !log.ContactFlowId) {
      return log;
    }

    try {
      // Cache에서 가져오기 (동기적으로 처리 가능 - 이미 cache됨)
      // getComparisonValue는 내부적으로 cache된 flow definition을 사용
      const comparisonValuePromise = flowDefService.getComparisonValue(
        log.ContactFlowId,
        log.Identifier,
        'ComparisonValue',
        false
      );

      const comparisonSecondValuePromise = flowDefService.getComparisonValue(
        log.ContactFlowId,
        log.Identifier,
        'ComparisonValue',
        true
      );

      // 비동기 처리를 위해 Promise 반환
      return Promise.all([comparisonValuePromise, comparisonSecondValuePromise]).then(
        ([comparisonValue, comparisonSecondValue]) => {
          // Parameters에 flow definition 정보 추가
          if (comparisonValue || comparisonSecondValue) {
            return {
              ...log,
              Parameters: {
                ...log.Parameters,
                _comparisonValue: comparisonValue,
                _comparisonSecondValue: comparisonSecondValue,
              },
            };
          }
          return log;
        }
      );
    } catch (error) {
      console.error('Error enriching CheckAttribute log:', error);
      return log;
    }
  });

  // Step 4: 모든 enrichment 완료 대기
  return Promise.all(enrichedLogs);
};

/**
 * CheckAttribute 로그 병합 시 각 파라미터에 enrichment 데이터도 병합합니다
 * 이 함수는 이미 enriched된 로그를 처리한 후 병합할 때 사용됩니다
 */
export const preserveEnrichmentInMerge = (logs: ContactLog[]): any[] => {
  return logs.map(log => ({
    ...log.Parameters,
    Results: log.Results,
    _comparisonValue: log.Parameters?._comparisonValue,
    _comparisonSecondValue: log.Parameters?._comparisonSecondValue,
  }));
};

// 헬퍼 함수: 상세 뷰를 위해 로그를 처리합니다.
// 모듈 로그를 청킹하고 SetAttributes 로그를 병합하는 로직을 통합합니다.
export const processLogsForDetailView = (logs: ContactLog[]): ContactLog[] => {
  if (!logs || logs.length === 0) {
    return [];
  }

  const processed: ContactLog[] = [];
  let attributesGroup: ContactLog[] = [];
  let currentGroupType: string | null = null;
  let getUserInputGroup: ContactLog[] = [];
  let currentGetUserInputIdentifier: string | null = null;
  let invokeExternalGroup: ContactLog[] = [];
  let currentInvokeExternalIdentifier: string | null = null;
  let dialGroup: ContactLog[] = [];
  let currentDialIdentifier: string | null = null;

  const mergeAttributesGroup = () => {
    if (attributesGroup.length === 0) return;

    if (attributesGroup.length === 1) {
      processed.push(attributesGroup[0]);
    } else {
      const baseLog = { ...attributesGroup[0] };
      const isCheckAttribute = baseLog.ContactFlowModuleType === 'CheckAttribute';

      // CheckAttribute의 경우 Parameters에 Results 키를 추가하고 enrichment 데이터 보존
      if (isCheckAttribute) {
        baseLog.Parameters = attributesGroup.map(log => ({
          ...log.Parameters,
          Results: log.Results,
          _comparisonValue: log.Parameters?._comparisonValue,
          _comparisonSecondValue: log.Parameters?._comparisonSecondValue,
        }));
      } else {
        // SetAttributes, SetFlowAttributes의 경우 Parameters만 배열로 저장
        baseLog.Parameters = attributesGroup.map(log => log.Parameters);
      }

      const anyError = attributesGroup.some(
        log =>
          log.Results?.includes('Error') ||
          log.Results?.includes('Failed') ||
          log.ExternalResults?.isSuccess === 'false'
      );

      if (anyError) {
        (baseLog as any)._isGroupError = true;
        baseLog.Results = attributesGroup[attributesGroup.length - 1].Results || "Error in group";
      } else {
        baseLog.Results = attributesGroup[attributesGroup.length - 1].Results;
      }
      baseLog.Timestamp = attributesGroup[attributesGroup.length - 1].Timestamp;
      processed.push(baseLog);
    }
    attributesGroup = [];
    currentGroupType = null;
  };

  const mergeGetUserInputGroup = () => {
    if (getUserInputGroup.length === 0) return;

    if (getUserInputGroup.length === 1) {
      // 단일 로그도 footer 표시를 위해 _footerResults 추가
      const log = { ...getUserInputGroup[0] };
      (log as any)._footerResults = log.Results;
      processed.push(log);
    } else {
      // GetUserInput 로그 병합: 첫 번째 로그의 Parameters를 사용하고, 마지막 로그의 Results를 footer로 표시
      const baseLog = { ...getUserInputGroup[0] };

      // 마지막 로그의 Results 사용 (사용자 입력 결과)
      const finalResults = getUserInputGroup[getUserInputGroup.length - 1].Results;
      baseLog.Results = finalResults;
      baseLog.Timestamp = getUserInputGroup[getUserInputGroup.length - 1].Timestamp;

      // Footer에 표시할 Results를 별도 필드로 저장
      (baseLog as any)._footerResults = finalResults;

      processed.push(baseLog);
    }
    getUserInputGroup = [];
    currentGetUserInputIdentifier = null;
  };

  const mergeInvokeExternalGroup = () => {
    if (invokeExternalGroup.length === 0) return;

    if (invokeExternalGroup.length === 1) {
      // 단일 로그도 footer 표시를 위해 _footerExternalResults 추가
      const log = { ...invokeExternalGroup[0] };
      (log as any)._footerExternalResults = log.ExternalResults;
      processed.push(log);
    } else {
      // InvokeExternalResource 로그 병합: 첫 번째 로그의 Parameters를 사용하고, 마지막 로그의 ExternalResults를 footer로 표시
      const baseLog = { ...invokeExternalGroup[0] };

      // 마지막 로그의 ExternalResults 사용
      const finalExternalResults = invokeExternalGroup[invokeExternalGroup.length - 1].ExternalResults;
      baseLog.ExternalResults = finalExternalResults;
      baseLog.Timestamp = invokeExternalGroup[invokeExternalGroup.length - 1].Timestamp;

      // Footer에 표시할 ExternalResults를 별도 필드로 저장
      (baseLog as any)._footerExternalResults = finalExternalResults;

      // X-Ray Trace ID 보존 (첫 번째 로그에서)
      if (invokeExternalGroup[0].xray_trace_id || (invokeExternalGroup[0] as any).xrayTraceId) {
        baseLog.xray_trace_id = invokeExternalGroup[0].xray_trace_id || (invokeExternalGroup[0] as any).xrayTraceId;
        (baseLog as any).xrayTraceId = baseLog.xray_trace_id;
      }

      processed.push(baseLog);
    }
    invokeExternalGroup = [];
    currentInvokeExternalIdentifier = null;
  };

  const mergeDialGroup = () => {
    if (dialGroup.length === 0) return;

    if (dialGroup.length === 1) {
      processed.push(dialGroup[0]);
    } else {
      // Dial 로그 병합: 첫 번째 로그의 Parameters를 사용하고, 마지막 로그의 Results를 사용
      const baseLog = { ...dialGroup[0] };
      const finalResults = dialGroup[dialGroup.length - 1].Results;

      baseLog.Results = finalResults;
      baseLog.Timestamp = dialGroup[dialGroup.length - 1].Timestamp;

      processed.push(baseLog);
    }
    dialGroup = [];
    currentDialIdentifier = null;
  };

  let i = 0;
  while (i < logs.length) {
    const log = logs[i];
    const isModuleFlow = log.ContactFlowName?.startsWith('MOD_');
    const isInvokeFlowModule = log.ContactFlowModuleType === 'InvokeFlowModule';
    const isReturnFromFlowModule = log.ContactFlowModuleType === 'ReturnFromFlowModule';

    // InvokeFlowModule을 만나면, 다음 MOD_ 로그들을 찾아서 그룹화
    if (isInvokeFlowModule) {
      mergeAttributesGroup();
      mergeGetUserInputGroup();
      mergeInvokeExternalGroup();
      mergeDialGroup();

      // InvokeFlowModule 다음에 오는 MOD_ 로그들 찾기
      let j = i + 1;
      const moduleGroup: ContactLog[] = [];
      let moduleName = 'Unknown Module';

      // 다음 로그가 MOD_로 시작하는지 확인
      if (j < logs.length && logs[j].ContactFlowName?.startsWith('MOD_')) {
        moduleName = logs[j].ContactFlowName || 'Unknown Module';

        // 같은 모듈명을 가진 연속된 로그들 수집
        while (j < logs.length && logs[j].ContactFlowName === moduleName) {
          moduleGroup.push(logs[j]);
          j++;
        }

        // ReturnFromFlowModule 건너뛰기
        if (j < logs.length && logs[j].ContactFlowModuleType === 'ReturnFromFlowModule') {
          j++;
        }

        // 모듈 노드 생성
        const moduleLog = { ...moduleGroup[0] };
        const hasError = moduleGroup.some(
          l =>
            l.Results?.includes('Error') ||
            l.Results?.includes('Failed') ||
            l.ExternalResults?.isSuccess === 'false'
        );
        const timestamps = moduleGroup.map(l => new Date(l.Timestamp).getTime());
        const minTimestamp = new Date(Math.min(...timestamps));
        const maxTimestamp = new Date(Math.max(...timestamps));

        (moduleLog as any)._isModuleNode = true;
        (moduleLog as any)._moduleLogs = moduleGroup;
        (moduleLog as any)._moduleName = moduleName;
        (moduleLog as any)._hasError = hasError;
        (moduleLog as any)._logCount = moduleGroup.length;
        (moduleLog as any)._timeRange = {
          start: minTimestamp.toISOString(),
          end: maxTimestamp.toISOString(),
        };

        processed.push(moduleLog);
        i = j;
      } else {
        // MOD_ 로그가 없으면 InvokeFlowModule만 추가
        processed.push(log);
        i++;
      }
    } else if (isModuleFlow || isReturnFromFlowModule) {
      // MOD_ 로그나 ReturnFromFlowModule은 이미 InvokeFlowModule에서 처리됨
      // 혹시 단독으로 있다면 건너뛰기
      i++;
    } else if (['GetUserInput', 'PlayPrompt', 'StoreUserInput'].includes(log.ContactFlowModuleType)) {
      // GetUserInput 로그 처리: 같은 Identifier를 가진 연속된 로그를 병합
      const identifier = log.Identifier;

      // Identifier가 다르면 이전 그룹을 먼저 병합
      if (currentGetUserInputIdentifier !== null && currentGetUserInputIdentifier !== identifier) {
        mergeGetUserInputGroup();
      }

      // 이전에 다른 그룹이 있었다면 먼저 병합
      mergeAttributesGroup();
      mergeInvokeExternalGroup();
      mergeDialGroup();

      currentGetUserInputIdentifier = identifier || null;
      getUserInputGroup.push(log);
      i++;
    } else if (['InvokeExternalResource', 'InvokeLambdaFunction'].includes(log.ContactFlowModuleType)) {
      // InvokeExternalResource 로그 처리: 같은 Identifier를 가진 연속된 로그를 병합
      const identifier = log.Identifier;

      // Identifier가 다르면 이전 그룹을 먼저 병합
      if (currentInvokeExternalIdentifier !== null && currentInvokeExternalIdentifier !== identifier) {
        mergeInvokeExternalGroup();
      }

      // 이전에 다른 그룹이 있었다면 먼저 병합
      mergeAttributesGroup();
      mergeGetUserInputGroup();
      mergeDialGroup();

      currentInvokeExternalIdentifier = identifier || null;
      invokeExternalGroup.push(log);
      i++;
    } else if (log.ContactFlowModuleType === 'Dial') {
      // Dial 로그 처리: 같은 Identifier를 가진 연속된 로그를 병합
      const identifier = log.Identifier;

      // Identifier가 다르면 이전 그룹을 먼저 병합
      if (currentDialIdentifier !== null && currentDialIdentifier !== identifier) {
        mergeDialGroup();
      }

      // 이전에 다른 그룹이 있었다면 먼저 병합
      mergeAttributesGroup();
      mergeGetUserInputGroup();
      mergeInvokeExternalGroup();

      currentDialIdentifier = identifier || null;
      dialGroup.push(log);
      i++;
    } else if (['SetAttributes', 'SetFlowAttributes', 'CheckAttribute'].includes(log.ContactFlowModuleType)) {
      // 같은 타입의 연속된 로그만 그룹화
      const logType = log.ContactFlowModuleType;

      // 다른 그룹이 있었다면 먼저 병합
      mergeGetUserInputGroup();
      mergeInvokeExternalGroup();
      mergeDialGroup();

      // 타입이 다르면 이전 그룹을 먼저 병합
      if (currentGroupType !== null && currentGroupType !== logType) {
        mergeAttributesGroup();
      }

      currentGroupType = logType;
      attributesGroup.push(log);
      i++;
    } else {
      mergeAttributesGroup();
      mergeGetUserInputGroup();
      mergeInvokeExternalGroup();
      mergeDialGroup();
      processed.push(log);
      i++;
    }
  }

  mergeAttributesGroup();
  mergeGetUserInputGroup();
  mergeInvokeExternalGroup();
  mergeDialGroup();

  return processed;
};