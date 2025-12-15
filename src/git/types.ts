export type NodeType = 'message' | 'state' | 'merge';

export interface BaseNode {
  id: string;
  type: NodeType;
  timestamp: number;
  parent: string | null;
  contextWindow?: string[];
  modelUsed?: string;
  tokensUsed?: number;
}

export interface MessageNode extends BaseNode {
  type: 'message';
  role: 'system' | 'user' | 'assistant';
  content: string;
  interrupted?: boolean;
}

export interface StateNode extends BaseNode {
  type: 'state';
  artefactSnapshot: string;
}

export interface MergeNode extends BaseNode {
  type: 'merge';
  mergeFrom: string;
  mergeSummary: string;
  sourceCommit: string;
  sourceNodeIds: string[];
}

export type NodeRecord = MessageNode | StateNode | MergeNode;

export type MessageNodeInput = Pick<
  MessageNode,
  'type' | 'role' | 'content' | 'interrupted' | 'contextWindow' | 'modelUsed' | 'tokensUsed'
>;

export type StateNodeInput = Pick<StateNode, 'type' | 'artefactSnapshot' | 'contextWindow' | 'modelUsed' | 'tokensUsed'>;

export type MergeNodeInput = Pick<
  MergeNode,
  'type' | 'mergeFrom' | 'mergeSummary' | 'sourceCommit' | 'sourceNodeIds' | 'contextWindow' | 'modelUsed' | 'tokensUsed'
>;

export type NodeInput = MessageNodeInput | StateNodeInput | MergeNodeInput;

export interface ProjectMetadata {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface BranchSummary {
  name: string;
  headCommit: string;
  nodeCount: number;
  isTrunk: boolean;
}
