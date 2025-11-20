/**
 * Flow Definition Service
 *
 * AWS Connect의 Contact Flow 및 Flow Module 정의를 조회하고 파싱하는 서비스
 * describe_contact_flow 및 describe_contact_flow_module API를 사용하여
 * flow definition JSON을 가져오고, 이를 통해 CheckAttribute 등의 블록에 대한
 * 비교값 메타데이터를 추출합니다.
 */

import {
  ConnectClient,
  DescribeContactFlowCommand,
  DescribeContactFlowModuleCommand,
} from '@aws-sdk/client-connect';
import { AWSConfig } from '@/types/contact.types';

/**
 * Flow Definition에서 Action 하나를 나타내는 인터페이스
 */
export interface FlowAction {
  Identifier: string;
  Type: string;
  Parameters?: Record<string, any>;
  Transitions?: {
    NextAction?: string;
    Errors?: Array<{ NextAction?: string; ErrorType?: string }>;
    Conditions?: Array<{
      NextAction?: string;
      Condition?: {
        Operator?: string;
        Operands?: string[];
      };
    }>;
  };
  Metadata?: {
    position?: { x: number; y: number };
  };
}

/**
 * Flow Definition 전체 구조
 */
export interface FlowDefinition {
  Version: string;
  StartAction?: string;
  Actions: FlowAction[];
  Metadata?: {
    entryPointPosition?: { x: number; y: number };
    snapToGrid?: boolean;
    ActionMetadata?: Record<string, any>;
  };
}

/**
 * ARN에서 instance_id와 flow_id/flow_module_id를 추출하는 함수
 */
export function extractIdsFromArn(arn: string): {
  instanceId: string | null;
  entityType: 'contact-flow' | 'flow-module' | null;
  entityId: string | null;
} {
  const match = arn.match(
    /arn:aws:connect:[a-z0-9-]+:\d+:instance\/([a-f0-9-]+)\/(?:(contact-flow|flow-module)\/([a-f0-9-]+))?/
  );

  if (match) {
    return {
      instanceId: match[1],
      entityType: match[2] as 'contact-flow' | 'flow-module' | null,
      entityId: match[3] || null,
    };
  }

  return {
    instanceId: null,
    entityType: null,
    entityId: null,
  };
}

/**
 * Flow Definition Service 클래스
 */
export class FlowDefinitionService {
  private connectClient: ConnectClient;
  private flowCache: Map<string, FlowDefinition> = new Map();

  constructor(config: AWSConfig) {
    const clientConfig: any = {
      region: config.region,
    };

    if (config.credentials) {
      clientConfig.credentials = {
        accessKeyId: config.credentials.accessKeyId,
        secretAccessKey: config.credentials.secretAccessKey,
        sessionToken: config.credentials.sessionToken,
        expiration: config.credentials.expiration
          ? new Date(config.credentials.expiration)
          : undefined,
      };
    }

    this.connectClient = new ConnectClient(clientConfig);
  }

  /**
   * Contact Flow 정의를 가져옵니다
   */
  async getContactFlowDefinition(
    instanceId: string,
    flowId: string
  ): Promise<FlowDefinition | null> {
    const cacheKey = `contact-flow:${instanceId}:${flowId}`;

    // Check cache first
    if (this.flowCache.has(cacheKey)) {
      return this.flowCache.get(cacheKey)!;
    }

    try {
      const command = new DescribeContactFlowCommand({
        InstanceId: instanceId,
        ContactFlowId: flowId,
      });

      const response = await this.connectClient.send(command);

      if (response.ContactFlow?.Content) {
        const content = JSON.parse(response.ContactFlow.Content);
        this.flowCache.set(cacheKey, content);
        return content;
      }

      return null;
    } catch (error: any) {
      if (error.name === 'ExpiredTokenException' || error.message?.includes('expired')) {
        console.error('AWS credentials have expired. Please refresh your credentials in Settings.');
      } else {
        console.error('Error fetching contact flow definition:', error);
      }
      return null;
    }
  }

  /**
   * Contact Flow Module 정의를 가져옵니다
   */
  async getContactFlowModuleDefinition(
    instanceId: string,
    flowModuleId: string
  ): Promise<FlowDefinition | null> {
    const cacheKey = `flow-module:${instanceId}:${flowModuleId}`;

    // Check cache first
    if (this.flowCache.has(cacheKey)) {
      return this.flowCache.get(cacheKey)!;
    }

    try {
      const command = new DescribeContactFlowModuleCommand({
        InstanceId: instanceId,
        ContactFlowModuleId: flowModuleId,
      });

      const response = await this.connectClient.send(command);

      if (response.ContactFlowModule?.Content) {
        const content = JSON.parse(response.ContactFlowModule.Content);
        this.flowCache.set(cacheKey, content);
        return content;
      }

      return null;
    } catch (error: any) {
      if (error.name === 'ExpiredTokenException' || error.message?.includes('expired')) {
        console.error('AWS credentials have expired. Please refresh your credentials in Settings.');
      } else {
        console.error('Error fetching flow module definition:', error);
      }
      return null;
    }
  }

  /**
   * ARN을 통해 Flow Definition을 가져옵니다
   */
  async getFlowDefinitionByArn(arn: string): Promise<FlowDefinition | null> {
    const { instanceId, entityType, entityId } = extractIdsFromArn(arn);

    if (!instanceId || !entityType || !entityId) {
      console.error('Invalid ARN format:', arn);
      return null;
    }

    if (entityType === 'contact-flow') {
      return this.getContactFlowDefinition(instanceId, entityId);
    } else if (entityType === 'flow-module') {
      return this.getContactFlowModuleDefinition(instanceId, entityId);
    }

    return null;
  }

  /**
   * CheckAttribute 블록에서 비교값을 가져옵니다
   *
   * @param flowArn - Contact Flow 또는 Flow Module ARN
   * @param blockId - Block Identifier
   * @param comparisonKeyword - Parameters에서 가져올 키 (예: "ComparisonValue")
   * @param isSecondValue - true면 Transitions의 Operands에서 값을 가져옴
   * @returns 비교값 또는 null
   */
  async getComparisonValue(
    flowArn: string,
    blockId: string,
    comparisonKeyword: string = 'ComparisonValue',
    isSecondValue: boolean = false
  ): Promise<string | null> {
    const flowDefinition = await this.getFlowDefinitionByArn(flowArn);

    if (!flowDefinition) {
      return null;
    }

    const targetBlock = flowDefinition.Actions.find(
      (action) => action.Identifier === blockId
    );

    if (!targetBlock) {
      return null;
    }

    if (!isSecondValue) {
      // Parameters에서 직접 가져오기
      return targetBlock.Parameters?.[comparisonKeyword] || null;
    } else {
      // Transitions의 Conditions에서 Operands 가져오기
      const conditions = targetBlock.Transitions?.Conditions;
      if (conditions && conditions.length > 0) {
        const operands = conditions[0].Condition?.Operands;
        if (operands && operands.length > 0) {
          const targetValue = operands[0];
          // "$"가 포함된 경우만 반환 (동적 값인 경우)
          return targetValue.includes('$') ? targetValue : null;
        }
      }
      return null;
    }
  }

  /**
   * Flow Definition에서 특정 블록의 모든 정보를 가져옵니다
   */
  async getBlockInfo(
    flowArn: string,
    blockId: string
  ): Promise<FlowAction | null> {
    const flowDefinition = await this.getFlowDefinitionByArn(flowArn);

    if (!flowDefinition) {
      return null;
    }

    return (
      flowDefinition.Actions.find((action) => action.Identifier === blockId) ||
      null
    );
  }

  /**
   * 캐시를 초기화합니다
   */
  clearCache(): void {
    this.flowCache.clear();
  }
}

// Export singleton pattern
let flowDefinitionServiceInstance: FlowDefinitionService | null = null;

export const getFlowDefinitionService = (
  config?: AWSConfig
): FlowDefinitionService => {
  if (config) {
    flowDefinitionServiceInstance = new FlowDefinitionService(config);
  }
  if (!flowDefinitionServiceInstance) {
    throw new Error(
      'FlowDefinitionService not initialized. Please provide config.'
    );
  }
  return flowDefinitionServiceInstance;
};

export const resetFlowDefinitionService = () => {
  flowDefinitionServiceInstance = null;
};

export default FlowDefinitionService;
