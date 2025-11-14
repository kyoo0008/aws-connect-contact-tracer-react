import { 
  ContactLog, 
  ContactFlowNode, 
  ContactFlowEdge, 
  ContactFlowData,
  ModuleType,
  LambdaLog,
  TranscriptEntry
} from '@/types/contact.types';

export interface NodePosition {
  x: number;
  y: number;
}

export interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  horizontalSpacing: number;
  verticalSpacing: number;
  direction: 'LR' | 'TB' | 'RL' | 'BT';
}

const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  nodeWidth: 180,
  nodeHeight: 80,
  horizontalSpacing: 100,
  verticalSpacing: 80,
  direction: 'LR',
};

// Module type to Korean name mapping
const MODULE_NAME_MAP: Record<string, string> = {
  'SetLoggingBehavior': '로깅 동작 설정',
  'SetAttributes': '속성 설정',
  'SetFlowAttributes': '플로우 속성 설정',
  'PlayPrompt': '프롬프트 재생',
  'GetUserInput': '사용자 입력 받기',
  'StoreUserInput': '사용자 입력 저장',
  'InvokeExternalResource': '외부 리소스 호출',
  'InvokeLambdaFunction': 'Lambda 함수 호출',
  'CheckAttribute': '속성 확인',
  'Transfer': '전환',
  'TransferToQueue': '대기열로 전환',
  'TransferToFlow': '플로우로 전환',
  'Disconnect': '연결 끊기',
  'Wait': '대기',
  'Loop': '반복',
  'SetContactFlow': '컨택 플로우 설정',
  'SetWhisperFlow': '위스퍼 플로우 설정',
  'SetHoldFlow': '대기 플로우 설정',
  'SetCustomerQueueFlow': '고객 대기열 플로우 설정',
  'SetEventHook': '이벤트 훅 설정',
  'GetCustomerProfile': '고객 프로필 조회',
  'AssociateContactToCustomerProfile': '고객 프로필 연결',
  'TagContact': '태그 지정',
  'InvokeFlowModule': '플로우 모듈 호출',
  'ReturnFromFlowModule': '플로우 모듈 반환',
  'Resume': '재개',
  'Dial': '다이얼',
};

// Error keywords for detection
const ERROR_KEYWORDS = [
  'Error',
  'Failed',
  'Timeout',
  'Exception',
  'Invalid',
  'not found',
  'NotDone',
  'MultipleFound',
];

// Module types to skip or consolidate
const SKIP_MODULE_TYPES = ['InvokeFlowModule'];
const CONSOLIDATE_MODULE_TYPES = ['SetAttributes', 'SetFlowAttributes'];

export class FlowBuilderService {
  private logs: ContactLog[];
  private nodes: Map<string, ContactFlowNode>;
  private edges: ContactFlowEdge[];
  private nodePositions: Map<string, NodePosition>;
  private layoutOptions: LayoutOptions;

  constructor(logs: ContactLog[], options?: Partial<LayoutOptions>) {
    this.logs = this.preprocessLogs(logs);
    this.nodes = new Map();
    this.edges = [];
    this.nodePositions = new Map();
    this.layoutOptions = { ...DEFAULT_LAYOUT_OPTIONS, ...options };
  }

  /**
   * Build the complete flow diagram
   */
  public buildFlow(): ContactFlowData {
    this.generateNodeIds();
    this.createNodes();
    this.createEdges();
    this.calculateLayout();
    this.applyPositions();

    return {
      nodes: Array.from(this.nodes.values()),
      edges: this.edges,
      logs: this.logs,
    };
  }

  /**
   * Add Lambda logs to the flow
   */
  public addLambdaLogs(lambdaLogs: Record<string, LambdaLog[]>): void {
    for (const [functionName, logs] of Object.entries(lambdaLogs)) {
      const relatedNodes = Array.from(this.nodes.values()).filter(
        node => node.data.moduleType === 'InvokeExternalResource' &&
                this.extractFunctionName(node.data.parameters?.FunctionArn) === functionName
      );

      for (const node of relatedNodes) {
        const nodeLogs = logs.filter(log => 
          Math.abs(new Date(log.timestamp).getTime() - new Date(node.data.timestamp!).getTime()) < 5000
        );
        
        if (nodeLogs.length > 0) {
          node.data.parameters = {
            ...node.data.parameters,
            lambdaLogs: nodeLogs,
          };
        }
      }
    }
  }

  /**
   * Add transcript to the flow
   */
  public addTranscript(transcript: TranscriptEntry[]): void {
    // Create transcript nodes for visualization
    let lastNodeId: string | null = null;
    let yOffset = 0;

    for (const entry of transcript) {
      const nodeId = `transcript_${entry.Id}`;
      const node: ContactFlowNode = {
        id: nodeId,
        type: 'transcript',
        data: {
          label: entry.Content.substring(0, 50) + (entry.Content.length > 50 ? '...' : ''),
          moduleType: 'Transcript',
          parameters: {
            participantRole: entry.ParticipantRole,
            content: entry.Content,
            sentiment: entry.Sentiment,
            time: entry.AbsoluteTime,
          },
        },
        position: {
          x: this.layoutOptions.nodeWidth * 2,
          y: yOffset,
        },
        style: {
          background: entry.ParticipantRole === 'AGENT' ? '#E3F2FD' : '#FFF3E0',
          border: '1px solid #90A4AE',
        },
      };

      this.nodes.set(nodeId, node);
      
      if (lastNodeId) {
        this.edges.push({
          id: `${lastNodeId}_${nodeId}`,
          source: lastNodeId,
          target: nodeId,
          type: 'smoothstep',
          animated: false,
        });
      }
      
      lastNodeId = nodeId;
      yOffset += this.layoutOptions.verticalSpacing;
    }
  }

  /**
   * Preprocess logs (filter, sort, etc.)
   */
  private preprocessLogs(logs: ContactLog[]): ContactLog[] {
    return logs
      .filter(log => !SKIP_MODULE_TYPES.includes(log.ContactFlowModuleType))
      .sort((a, b) => new Date(a.Timestamp).getTime() - new Date(b.Timestamp).getTime());
  }

  /**
   * Generate unique node IDs for logs
   */
  private generateNodeIds(): void {
    const flowCounts = new Map<string, number>();
    let lastFlowName: string | null = null;
    let lastNodeId: string | null = null;

    for (const log of this.logs) {
      const flowName = log.ContactFlowName;
      
      // Handle module flows (MOD_)
      if (lastFlowName && (flowName.startsWith('MOD_') || flowName === lastFlowName)) {
        log.node_id = lastNodeId!;
      } else {
        const count = (flowCounts.get(flowName) || 0) + 1;
        flowCounts.set(flowName, count);
        lastNodeId = `${flowName}_${count}`;
        log.node_id = lastNodeId;
        lastFlowName = flowName;
      }
    }
  }

  /**
   * Create nodes from logs
   */
  private createNodes(): void {
    const consolidatedLogs = this.consolidateLogs();
    
    for (const log of consolidatedLogs) {
      const isError = this.detectError(log);
      const node = this.createNode(log, isError);
      this.nodes.set(node.id, node);
    }
  }

  /**
   * Consolidate consecutive logs of same type
   */
  private consolidateLogs(): ContactLog[] {
    const consolidated: ContactLog[] = [];
    let currentGroup: ContactLog[] = [];
    let currentType: string | null = null;

    for (const log of this.logs) {
      if (CONSOLIDATE_MODULE_TYPES.includes(log.ContactFlowModuleType)) {
        if (log.ContactFlowModuleType === currentType) {
          currentGroup.push(log);
        } else {
          if (currentGroup.length > 0) {
            consolidated.push(this.mergeLogGroup(currentGroup));
          }
          currentGroup = [log];
          currentType = log.ContactFlowModuleType;
        }
      } else {
        if (currentGroup.length > 0) {
          consolidated.push(this.mergeLogGroup(currentGroup));
          currentGroup = [];
          currentType = null;
        }
        consolidated.push(log);
      }
    }

    if (currentGroup.length > 0) {
      consolidated.push(this.mergeLogGroup(currentGroup));
    }

    return consolidated;
  }

  /**
   * Merge a group of logs into one
   */
  private mergeLogGroup(logs: ContactLog[]): ContactLog {
    const merged = { ...logs[0] };
    
    if (logs.length > 1) {
      merged.Parameters = logs.map(log => log.Parameters).filter(Boolean);
      merged.Results = logs.map(log => log.Results).filter(Boolean).join(', ');
    }
    
    return merged;
  }

  /**
   * Create a single node from a log
   */
  private createNode(log: ContactLog, isError: boolean): ContactFlowNode {
    const moduleType = this.defineModuleType(log);
    const { nodeText, nodeFooter } = this.getNodeContent(log);
    
    return {
      id: log.node_id || `node_${Date.now()}_${Math.random()}`,
      type: 'custom',
      data: {
        label: MODULE_NAME_MAP[moduleType] || moduleType,
        moduleType,
        parameters: log.Parameters,
        results: nodeFooter || log.Results,
        error: isError,
        timestamp: log.Timestamp,
        duration: this.calculateDuration(log),
      },
      position: { x: 0, y: 0 }, // Will be calculated later
      style: {
        background: isError ? '#FFEBEE' : '#F5F5F5',
        border: isError ? '2px solid #F44336' : '1px solid #E0E0E0',
        borderRadius: '8px',
        padding: '10px',
      },
    };
  }

  /**
   * Define the actual module type
   */
  private defineModuleType(log: ContactLog): string {
    const moduleType = log.ContactFlowModuleType;
    
    if (moduleType === 'SetContactFlow') {
      const flowType = log.Parameters?.Type;
      switch (flowType) {
        case 'CustomerHold':
        case 'AgentHold':
          return 'SetHoldFlow';
        case 'CustomerWhisper':
        case 'AgentWhisper':
          return 'SetWhisperFlow';
        case 'CustomerQueue':
          return 'SetCustomerQueueFlow';
        case 'DefaultAgentUI':
          return 'SetEventHook';
        default:
          return moduleType;
      }
    }
    
    return moduleType;
  }

  /**
   * Get node content (text and footer)
   */
  private getNodeContent(log: ContactLog): { nodeText: string; nodeFooter: string } {
    const moduleType = log.ContactFlowModuleType;
    const params = log.Parameters || {};
    let nodeText = '';
    let nodeFooter = '';

    switch (moduleType) {
      case 'CheckAttribute':
        const op = params.ComparisonMethod;
        const value = params.Value;
        const secondValue = params.SecondValue;
        const operatorSymbol = this.getOperatorSymbol(op);
        nodeText = `${value} ${operatorSymbol} ${secondValue}`;
        nodeFooter = `Results: ${log.Results}`;
        break;

      case 'InvokeExternalResource':
      case 'InvokeLambdaFunction':
        if (params.Parameters) {
          const functionParams = Object.entries(params.Parameters)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
          nodeText = functionParams;
        }
        if (log.ExternalResults) {
          const success = log.ExternalResults.isSuccess === 'true';
          nodeFooter = success ? 'Success ✅' : 'Failed ❌';
        } else {
          nodeFooter = log.Results || '';
        }
        break;

      case 'PlayPrompt':
      case 'GetUserInput':
      case 'StoreUserInput':
        nodeText = params.Text || params.PromptLocation || '';
        nodeFooter = log.Results ? `Results: ${log.Results}` : '';
        break;

      case 'SetAttributes':
      case 'SetFlowAttributes':
        if (Array.isArray(params)) {
          nodeText = params.map(p => `${p.Key}: ${p.Value}`).join('\n');
        } else {
          nodeText = Object.entries(params)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
        }
        break;

      case 'TagContact':
        if (params.Tags) {
          nodeText = Object.entries(params.Tags)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
        }
        break;

      default:
        nodeText = JSON.stringify(params, null, 2);
        nodeFooter = log.Results || '';
    }

    // Truncate long text
    nodeText = this.truncateText(nodeText, 200);
    nodeFooter = this.truncateText(nodeFooter, 100);

    return { nodeText, nodeFooter };
  }

  /**
   * Create edges between nodes
   */
  private createEdges(): void {
    const nodeArray = Array.from(this.nodes.values());
    
    for (let i = 0; i < nodeArray.length - 1; i++) {
      const source = nodeArray[i];
      const target = nodeArray[i + 1];
      
      this.edges.push({
        id: `${source.id}_${target.id}`,
        source: source.id,
        target: target.id,
        type: 'smoothstep',
        animated: source.data.moduleType === 'CheckAttribute',
        style: source.data.error ? { stroke: '#F44336' } : {},
      });
    }
  }

  /**
   * Calculate layout positions
   */
  private calculateLayout(): void {
    const nodeArray = Array.from(this.nodes.values());
    const { nodeWidth, nodeHeight, horizontalSpacing, verticalSpacing, direction } = this.layoutOptions;
    
    // Simple grid layout
    const columns = 5;
    let currentX = 0;
    let currentY = 0;
    let column = 0;

    for (const node of nodeArray) {
      if (direction === 'LR') {
        currentX = column * (nodeWidth + horizontalSpacing);
        currentY = Math.floor(nodeArray.indexOf(node) / columns) * (nodeHeight + verticalSpacing);
      } else {
        currentX = Math.floor(nodeArray.indexOf(node) / columns) * (nodeWidth + horizontalSpacing);
        currentY = column * (nodeHeight + verticalSpacing);
      }

      this.nodePositions.set(node.id, { x: currentX, y: currentY });
      
      column++;
      if (column >= columns) {
        column = 0;
      }
    }
  }

  /**
   * Apply calculated positions to nodes
   */
  private applyPositions(): void {
    for (const [nodeId, position] of this.nodePositions.entries()) {
      const node = this.nodes.get(nodeId);
      if (node) {
        node.position = position;
      }
    }
  }

  /**
   * Detect if log contains error
   */
  private detectError(log: ContactLog): boolean {
    const results = log.Results || '';
    const externalResults = JSON.stringify(log.ExternalResults || {});
    
    return ERROR_KEYWORDS.some(keyword => 
      results.includes(keyword) || externalResults.includes(keyword)
    );
  }

  /**
   * Get operator symbol
   */
  private getOperatorSymbol(operator: string): string {
    const symbols: Record<string, string> = {
      'Contains': '⊃',
      'Equals': '=',
      'GreaterThan': '>',
      'GreaterThanOrEqualTo': '≥',
      'LessThan': '<',
      'LessThanOrEqualTo': '≤',
      'StartsWith': 'SW',
    };
    return symbols[operator] || operator;
  }

  /**
   * Extract function name from ARN
   */
  private extractFunctionName(arn?: string): string {
    if (!arn) return '';
    const parts = arn.split(':');
    return parts[parts.length - 1];
  }

  /**
   * Calculate duration for a module
   */
  private calculateDuration(log: ContactLog): number {
    // This would need to be calculated based on the next log's timestamp
    // For now, return 0
    return 0;
  }

  /**
   * Truncate text to specified length
   */
  private truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
}

export default FlowBuilderService;
