// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

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

function getMergeUserRole(): Exclude<ChatMessage['role'], 'system'> {
  const raw = (process.env.MERGE_USER ?? 'assistant').trim().toLowerCase();
  if (!raw) return 'assistant';
  if (raw === 'user' || raw === 'assistant') return raw;
  throw new Error('MERGE_USER must be set to "user" or "assistant"');
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

  if (store.mode === 'pg') {
    const refName = resolvedRef ?? 'main';
    const { rtGetHistoryShadowV1 } = await import('@/src/store/pg/reads');
    const rows = await rtGetHistoryShadowV1({ projectId, refName, limit, includeRawResponse: true });
    nodes = rows.map((r) => r.nodeJson).filter(Boolean) as NodeRecord[];
  } else {
    const { getNodes } = await import('@git/nodes');
    const { readNodesFromRef } = await import('@git/utils');
    nodes = resolvedRef ? await readNodesFromRef(projectId, resolvedRef) : await getNodes(projectId);
  }

  const trimmed = nodes.slice(-limit);
  const refName = resolvedRef ?? 'main';
  const branchConfigMap = await getBranchConfigMap(projectId);
  const currentConfig = branchConfigMap[refName] ?? resolveBranchConfig();
  if (!branchConfigMap[refName]) {
    branchConfigMap[refName] = currentConfig;
  }
  const useCanonicalByIndex = buildCanonicalMask(trimmed, branchConfigMap, currentConfig);
  const systemPrompt = buildSystemPrompt({ canvasToolsEnabled });
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
      const summary = `Merge summary from ${node.mergeFrom}: ${node.mergeSummary ?? ''}`.trim();
      const cost = estimateTokens(summary);
      if (tokenBudget - cost < 0) {
        continue;
      }
      tokenBudget -= cost;
      messages.push({
        role: mergeUserRole,
        content: summary
      });

      if (node.mergedAssistantContent?.trim()) {
        const payloadCost = estimateTokens(node.mergedAssistantContent);
        if (tokenBudget - payloadCost < 0) {
          continue;
        }
        tokenBudget -= payloadCost;
        messages.push({
          role: 'assistant',
          content: node.mergedAssistantContent
        });
      }
    }
  }

  return {
    systemPrompt,
    messages
  };
}

function buildSystemPrompt({ canvasToolsEnabled }: { canvasToolsEnabled: boolean }): string {
  const base = [
    'You are an insightful, encouraging assistant who combines meticulous clarity with genuine enthusiasm and gentle humor.',
    'Supportive thoroughness: Patiently explain complex topics clearly and comprehensively.',
    'Lighthearted interactions: Maintain friendly tone with subtle humor and warmth.',
    'Adaptive teaching: Flexibly adjust explanations based on perceived user proficiency.',
    'Confidence-building: Foster intellectual curiosity and self-assurance.',
    'Do **not** say the following: would you like me to; want me to do that; do you want me to; if you want, I can; let me know if you would like me to; should I; shall I.',
    'Ask at most one necessary clarifying question at the start, not the end.',
    'If the next step is obvious, do it. Example of bad: I can write playful examples. would you like me to? Example of good: Here are three playful examples:..'
  ];

  const canvasSection = canvasToolsEnabled
    ? [
        'Canvas tools are available: canvas_grep, canvas_read_lines, canvas_read_all, canvas_apply_patch.',
        'Canvas tools require: locate -> inspect -> edit. Never retype target text from memory.',
        'Line indices are 1-based. Patches must be unified diff format and apply cleanly.'
      ]
    : [
        'Canvas tools may not be available in this conversation. If tools are absent, respond using provided context without referencing tool-only actions.'
      ];

  const sharedCanvasState = ['Some user messages are hidden canvas updates; treat them as authoritative canvas changes.'];

  return [...base, ...canvasSection, ...sharedCanvasState].join('\n');
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
