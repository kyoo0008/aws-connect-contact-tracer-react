import { ContactLog, AWSConfig } from '@/types/contact.types';
import { getFlowDefinitionService } from '@/services/flowDefinitionService';

/**
 * CheckAttribute 로그에 Flow Definition 데이터를 추가하여 비교값을 enrichment 합니다
 */
export const enrichCheckAttributeLogs = async (
  logs: ContactLog[],
  config: AWSConfig
): Promise<ContactLog[]> => {
  const flowDefService = getFlowDefinitionService(config);
  const enrichedLogs = await Promise.all(
    logs.map(async (log) => {
      // CheckAttribute가 아니면 그대로 반환
      if (log.ContactFlowModuleType !== 'CheckAttribute') {
        return log;
      }

      // Identifier와 ContactFlowId가 없으면 enrichment 불가
      if (!log.Identifier || !log.ContactFlowId) {
        return log;
      }

      try {
        // Flow definition에서 비교값 가져오기
        const comparisonValue = await flowDefService.getComparisonValue(
          log.ContactFlowId,
          log.Identifier,
          'ComparisonValue',
          false
        );

        const comparisonSecondValue = await flowDefService.getComparisonValue(
          log.ContactFlowId,
          log.Identifier,
          'ComparisonValue',
          true
        );

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
      } catch (error) {
        console.error('Error enriching CheckAttribute log:', error);
        return log;
      }
    })
  );

  return enrichedLogs;
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

  let i = 0;
  while (i < logs.length) {
    const log = logs[i];
    const isModuleFlow = log.ContactFlowName?.startsWith('MOD_');
    const isInvokeFlowModule = log.ContactFlowModuleType === 'InvokeFlowModule';
    const isReturnFromFlowModule = log.ContactFlowModuleType === 'ReturnFromFlowModule';

    // InvokeFlowModule을 만나면, 다음 MOD_ 로그들을 찾아서 그룹화
    if (isInvokeFlowModule) {
      mergeAttributesGroup();

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
    } else if (['SetAttributes', 'SetFlowAttributes', 'CheckAttribute'].includes(log.ContactFlowModuleType)) {
      // 같은 타입의 연속된 로그만 그룹화
      const logType = log.ContactFlowModuleType;

      // 타입이 다르면 이전 그룹을 먼저 병합
      if (currentGroupType !== null && currentGroupType !== logType) {
        mergeAttributesGroup();
      }

      currentGroupType = logType;
      attributesGroup.push(log);
      i++;
    } else {
      mergeAttributesGroup();
      processed.push(log);
      i++;
    }
  }

  mergeAttributesGroup();

  return processed;
};