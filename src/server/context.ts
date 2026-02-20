// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import type { NodeRecord } from '@git/types';
import {
  deriveTextFromBlocks,
  flattenMessageContent,
  getContentBlocksWithLegacyFallback,
  type MessageContent,
  type ThinkingContentBlock
} from '@/src/shared/thinkingTraces';
import { getStoreConfig } from './storeConfig';
import { buildContextBlocksFromRaw } from '@/src/server/llmContentBlocks';
import { getBranchConfigMap, resolveBranchConfig, type BranchConfig } from '@/src/server/branchConfig';
import { buildDefaultSystemPrompt } from '@/src/server/systemPrompt';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: MessageContent;
}

export interface ChatContext {
  systemPrompt: string;
  messages: ChatMessage[];
}

const DEFAULT_HISTORY_LIMIT = 40;
const DEFAULT_TOKEN_LIMIT = 8000;

function resolveRefName(refId: string | null, refNameById: Map<string, string>, label: string): string {
  if (!refId) {
    console.error('[context] missing ref id for node label', { label });
    // TODO: remove "unknown" fallback once legacy rows are backfilled with ref IDs.
    return 'unknown';
  }
  const refName = refNameById.get(refId);
  if (!refName) {
    console.error('[context] ref id not found for node label', { label, refId });
    // TODO: remove "unknown" fallback once legacy rows are backfilled with ref IDs.
    return 'unknown';
  }
  return refName;
}

function applyRefNames(
  rows: { nodeJson: NodeRecord; createdOnRefId: string | null; mergeFromRefId: string | null }[],
  refNameById: Map<string, string>
): NodeRecord[] {
  return rows.map((row) => {
    const createdOnBranch = resolveRefName(row.createdOnRefId, refNameById, 'createdOnBranch');
    const node = row.nodeJson;
    const mergeFrom =
      node.type === 'merge' ? resolveRefName(row.mergeFromRefId, refNameById, 'mergeFrom') : undefined;
    return {
      ...node,
      createdOnBranch,
      ...(node.type === 'merge' ? { mergeFrom } : {})
    } as NodeRecord;
  });
}

function getMergeUserRole(): Exclude<ChatMessage['role'], 'system'> {
  const raw = (process.env.MERGE_USER ?? 'assistant').trim().toLowerCase();
  if (!raw) return 'assistant';
  if (raw === 'user' || raw === 'assistant') return raw;
  throw new Error('MERGE_USER must be set to "user" or "assistant"');
}

async function getProjectSystemPrompt(projectId: string, defaultPrompt: string): Promise<string> {
  const store = getStoreConfig();
  if (store.mode === 'pg') {
    const { rtGetProjectShadowV1 } = await import('@/src/store/pg/projects');
    const project = await rtGetProjectShadowV1({ projectId });
    return project?.systemPrompt?.trim() ? project.systemPrompt : defaultPrompt;
  }

  const { getProject } = await import('@git/projects');
  const project = await getProject(projectId);
  return project?.systemPrompt?.trim() ? project.systemPrompt : defaultPrompt;
}

interface ContextOptions {
  limit?: number;
  tokenLimit?: number;
  ref?: string;
}

export async function buildChatContext(projectId: string, options?: ContextOptions): Promise<ChatContext> {
  const limit = options?.limit ?? DEFAULT_HISTORY_LIMIT;
  const store = getStoreConfig();
  const canvasToolsEnabled = store.mode === 'pg' && process.env.RT_CANVAS_TOOLS === 'true';
  const resolvedRef = options?.ref?.trim() || null;

  let nodes: NodeRecord[];
  let resolvedRefName = resolvedRef;
  let resolvedRefId: string | null = null;

  if (store.mode === 'pg') {
    const { rtGetHistoryShadowV2, rtListRefsShadowV2 } = await import('@/src/store/pg/reads');
    const { rtGetCurrentRefShadowV2 } = await import('@/src/store/pg/prefs');
    const branches = await rtListRefsShadowV2({ projectId });
    const refNameById = new Map(branches.map((branch) => [branch.id, branch.name]));
    if (resolvedRef) {
      const match = branches.find((branch) => branch.name === resolvedRef);
      if (!match?.id) {
        throw new Error(`Ref ${resolvedRef} not found`);
      }
      resolvedRefId = match.id;
      resolvedRefName = match.name;
    } else {
      const current = await rtGetCurrentRefShadowV2({ projectId, defaultRefName: 'main' });
      resolvedRefId = current.refId;
      resolvedRefName = current.refName;
    }
    if (!resolvedRefId) {
      throw new Error('Ref id not resolved');
    }
    const rows = await rtGetHistoryShadowV2({
      projectId,
      refId: resolvedRefId,
      limit,
      includeRawResponse: true
    });
    nodes = applyRefNames(rows.filter((row) => Boolean(row.nodeJson)) as any, refNameById);
  } else {
    const { getNodes } = await import('@git/nodes');
    const { readNodesFromRef } = await import('@git/utils');
    nodes = resolvedRef ? await readNodesFromRef(projectId, resolvedRef) : await getNodes(projectId);
  }

  const trimmed = nodes.slice(-limit);
  const refName = resolvedRefName ?? 'main';
  const branchConfigMap = await getBranchConfigMap(projectId);
  const currentConfig = branchConfigMap[refName] ?? resolveBranchConfig();
  if (!branchConfigMap[refName]) {
    branchConfigMap[refName] = currentConfig;
  }
  const useCanonicalByIndex = buildCanonicalMask(trimmed, branchConfigMap, currentConfig);
  const defaultPrompt = buildDefaultSystemPrompt(canvasToolsEnabled);
  const systemPrompt = await getProjectSystemPrompt(projectId, defaultPrompt);
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];
  const mergeUserRole = getMergeUserRole();

  const tokenLimit = options?.tokenLimit ?? DEFAULT_TOKEN_LIMIT;
  let tokenBudget = tokenLimit - estimateTokens(systemPrompt);

  for (let i = 0; i < trimmed.length; i += 1) {
    const node = trimmed[i]!;
    if (node.type === 'message' && node.role && node.content) {
      if (node.role !== 'user' && node.role !== 'assistant') {
        continue;
      }
      let content: MessageContent;
      if (node.role === 'assistant') {
        content = useCanonicalByIndex[i]
          ? buildLegacyContextContent(node)
          : buildRawContextContent(node, currentConfig);
      } else {
        content = node.content;
      }
      const cost = estimateTokens(content);
      if (tokenBudget - cost < 0) {
        continue;
      }
      tokenBudget -= cost;
      const payload =
        typeof content === 'string'
          ? content
          : content.length > 0
            ? content
            : node.content;
      messages.push({
        role: node.role,
        content: payload
      });
    } else if (node.type === 'merge') {
      continue;
    }
  }

  return {
    systemPrompt,
    messages
  };
}

function estimateTokens(content: MessageContent): number {
  const flattened = flattenMessageContent(content);
  return Math.ceil(flattened.length / 4);
}

function buildCanonicalMask(
  nodes: NodeRecord[],
  branchConfigMap: Record<string, BranchConfig>,
  currentConfig: BranchConfig
): boolean[] {
  const mask = new Array(nodes.length).fill(false);
  let breakFound = false;
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    if (!breakFound) {
      const createdOn = nodes[i]?.createdOnBranch;
      const nodeConfig = createdOn ? branchConfigMap[createdOn] : undefined;
      const sameModel =
        nodeConfig &&
        nodeConfig.provider === currentConfig.provider &&
        nodeConfig.model === currentConfig.model;
      if (!sameModel) {
        breakFound = true;
      }
    }
    mask[i] = breakFound;
  }
  return mask;
}

function buildLegacyContextContent(node: NodeRecord): MessageContent {
  if (node.type !== 'message') return '';
  const blocks = getContentBlocksWithLegacyFallback(node);
  const text = deriveTextFromBlocks(blocks);
  return text || node.content || '';
}

function buildRawContextContent(node: NodeRecord, config: BranchConfig): MessageContent {
  if (node.type !== 'message') return '';
  const fallbackBlocks: ThinkingContentBlock[] = getContentBlocksWithLegacyFallback(node);
  const fallbackText = node.content ?? '';
  const blocks = buildContextBlocksFromRaw({
    provider: config.provider,
    rawResponse: node.rawResponse ?? null,
    fallbackText,
    fallbackBlocks
  });
  return blocks.length > 0 ? blocks : fallbackText;
}
