import { Position } from 'react-flow-renderer';
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
const SKIP_MODULE_TYPES = ['null'];
const CONSOLIDATE_MODULE_TYPES = ['SetAttributes', 'SetFlowAttributes'];

export class FlowBuilderService {
  private logs: ContactLog[];
  private nodes: Map<string, ContactFlowNode>;
  private edges: ContactFlowEdge[];
  private nodePositions: Map<string, NodePosition>;
  private layoutOptions: LayoutOptions;
  private filterModules: boolean;

  constructor(logs: ContactLog[], options?: Partial<LayoutOptions> & { filterModules?: boolean }) {
    this.filterModules = options?.filterModules ?? true;
    this.logs = this.preprocessLogs(logs);
    console.log(logs)

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
   * Check if a log is from a Module (has MOD_ in ContactFlowName and ModuleExecutionStack)
   */
  private isModuleFlow(log: ContactLog): boolean {
    return log.ContactFlowName?.includes('MOD_') &&
           Array.isArray(log.ModuleExecutionStack) &&
           log.ModuleExecutionStack.length > 0;
  }

  /**
   * Preprocess logs (filter, sort, etc.)
   * Filters out Module flows (MOD_) from main flow view
   */
  private preprocessLogs(logs: ContactLog[]): ContactLog[] {
    return logs
      .filter(log => {
        // Skip specific module types
        if (SKIP_MODULE_TYPES.includes(log.ContactFlowModuleType)) {
          return false;
        }
        // Filter out Module flows (MOD_) from main view if filterModules is true
        if (this.filterModules && this.isModuleFlow(log)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => new Date(a.Timestamp).getTime() - new Date(b.Timestamp).getTime());
  }

  /**
   * Generate unique node IDs for logs based on ContactFlowName
   * Groups consecutive logs by ContactFlowName for time-based chunking
   */
  private generateNodeIds(): void {
    const flowCounts = new Map<string, number>();
    let lastFlowName: string | null = null;
    let lastNodeId: string | null = null;

    for (const log of this.logs) {
      const flowName = log.ContactFlowName;

      // Group consecutive logs with same ContactFlowName into same node
      if (flowName === lastFlowName && lastNodeId) {
        log.node_id = lastNodeId;
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
   * Groups logs by node_id for time-based chunking
   */
  private createNodes(): void {
    // Group logs by node_id
    const logsByNodeId = new Map<string, ContactLog[]>();

    for (const log of this.logs) {
      const nodeId = log.node_id!;
      if (!logsByNodeId.has(nodeId)) {
        logsByNodeId.set(nodeId, []);
      }
      logsByNodeId.get(nodeId)!.push(log);
    }

    // Create one node per group with sequence number
    let sequenceNumber = 1;
    for (const [nodeId, logs] of logsByNodeId.entries()) {
      // Use first log for node metadata, but store all logs
      const firstLog = logs[0];
      const hasError = logs.some(log => this.detectError(log));
      const node = this.createNodeFromLogs(firstLog, logs, hasError, sequenceNumber);
      this.nodes.set(node.id, node);
      sequenceNumber++;
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
   * Create a single node from grouped logs (time-based chunking)
   * In main flow view, use ContactFlowName as label
   * Stores all chunked logs in the node data
   */
  private createNodeFromLogs(firstLog: ContactLog, allLogs: ContactLog[], isError: boolean, sequenceNumber: number): ContactFlowNode {
    // const moduleType = this.defineModuleType(firstLog);
    const moduleType = 'FlowModule'; // 아이콘 통일

    // Use ContactFlowName as label for main flow nodes
    const nodeLabel = firstLog.ContactFlowName;

    // Calculate time range for this node
    const timestamps = allLogs.map(log => new Date(log.Timestamp).getTime());
    const minTimestamp = new Date(Math.min(...timestamps));
    const maxTimestamp = new Date(Math.max(...timestamps));

    return {
      id: firstLog.node_id || `node_${Date.now()}_${Math.random()}`,
      type: 'custom',
      data: {
        label: nodeLabel,
        moduleType,
        parameters: firstLog.Parameters,
        results: firstLog.Results,
        error: isError,
        timestamp: firstLog.Timestamp,
        duration: this.calculateDuration(firstLog),
        // Store all logs for this flow node (time-chunked)
        chunkedLogs: allLogs,
        timeRange: {
          start: minTimestamp.toISOString(),
          end: maxTimestamp.toISOString(),
        },
        logCount: sequenceNumber, // Use sequence number instead of log count for display
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
   * Create edges between nodes with proper handle IDs
   * Sequential flow from left to right, wrapping to next row
   */
  private createEdges(): void {
    const nodeArray = Array.from(this.nodes.values());

    for (let i = 0; i < nodeArray.length - 1; i++) {
      const source = nodeArray[i];
      const target = nodeArray[i + 1];

      // Get source and target handle IDs based on positions
      const sourceHandleId = this.getHandleId('source', source.data.sourcePosition || Position.Right);
      const targetHandleId = this.getHandleId('target', target.data.targetPosition || Position.Left);

      this.edges.push({
        id: `${source.id}_${target.id}`,
        source: source.id,
        target: target.id,
        sourceHandle: sourceHandleId,
        targetHandle: targetHandleId,
        type: 'smoothstep',
        animated: false,
        style: {
          stroke: source.data.error ? '#F44336' : '#B0B0B0',
          strokeWidth: 2,
        },
        label: `${i + 1}`,
      });
    }
  }

  /**
   * Get handle ID based on type and position
   */
  private getHandleId(type: 'source' | 'target', position: Position): string {
    const positionMap: Record<Position, string> = {
      [Position.Top]: 'top',
      [Position.Bottom]: 'bottom',
      [Position.Left]: 'left',
      [Position.Right]: 'right',
    };
    return `${type}-${positionMap[position]}`;
  }

  /**
   * Calculate layout positions in a "ㄹ" (rieul) pattern
   * - Row 0: left to right
   * - Row 1: right to left
   * - Row 2: left to right
   * - And so on...
   */
  private calculateLayout(): void {
    const nodeArray = Array.from(this.nodes.values());

    // Grid layout with 5 columns
    const columns = 5;
    const nodeWidth = 280;
    const nodeHeight = 180;
    const horizontalGap = 40;
    const verticalGap = 80;

    for (let i = 0; i < nodeArray.length; i++) {
      const node = nodeArray[i];
      const row = Math.floor(i / columns);
      const isEvenRow = row % 2 === 0;

      // For even rows (0, 2, 4...): normal left-to-right
      // For odd rows (1, 3, 5...): reversed right-to-left
      let column: number;
      if (isEvenRow) {
        column = i % columns;
      } else {
        column = columns - 1 - (i % columns);
      }

      const x = column * (nodeWidth + horizontalGap);
      const y = row * (nodeHeight + verticalGap);

      this.nodePositions.set(node.id, { x, y });

      // Determine handle positions based on flow direction
      const hasNextNode = i < nodeArray.length - 1;
      const isLastInRow = (i + 1) % columns === 0;
      const isFirstInRow = i % columns === 0;

      if (hasNextNode) {
        if (isLastInRow) {
          // Transition to next row
          node.data.sourcePosition = Position.Bottom;
        } else {
          // Continue in same row
          if (isEvenRow) {
            // Even row: flow left to right
            node.data.sourcePosition = Position.Right;
          } else {
            // Odd row: flow right to left
            node.data.sourcePosition = Position.Left;
          }
        }
      }

      // Target position (where this node receives from)
      if (i === 0) {
        // First node
        node.data.targetPosition = Position.Left;
      } else if (isFirstInRow && row > 0) {
        // First node in row (receiving from previous row)
        node.data.targetPosition = Position.Top;
      } else {
        // Receiving from same row
        if (isEvenRow) {
          // Even row: receive from left
          node.data.targetPosition = Position.Left;
        } else {
          // Odd row: receive from right
          node.data.targetPosition = Position.Right;
        }
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
