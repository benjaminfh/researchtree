import type { NodeRecord } from '@git/types';
import { getStoreConfig } from './storeConfig';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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
  const resolvedRef = options?.ref?.trim() || null;

  let nodes: NodeRecord[];
  let artefact: string;

  if (store.mode === 'pg') {
    const refName = resolvedRef ?? 'main';
    const { rtGetHistoryShadowV1, rtGetCanvasShadowV1 } = await import('@/src/store/pg/reads');
    const rows = await rtGetHistoryShadowV1({ projectId, refName, limit });
    nodes = rows.map((r) => r.nodeJson).filter(Boolean) as NodeRecord[];
    const canvas = await rtGetCanvasShadowV1({ projectId, refName });
    artefact = canvas.content ?? '';
  } else {
    const { getNodes } = await import('@git/nodes');
    const { getArtefact, getArtefactFromRef } = await import('@git/artefact');
    const { readNodesFromRef } = await import('@git/utils');
    nodes = resolvedRef ? await readNodesFromRef(projectId, resolvedRef) : await getNodes(projectId);
    artefact = resolvedRef ? await getArtefactFromRef(projectId, resolvedRef) : await getArtefact(projectId);
  }

  const trimmed = nodes.slice(-limit);
  const systemPrompt = buildSystemPrompt(artefact);
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];
  const mergeUserRole = getMergeUserRole();

  const tokenLimit = options?.tokenLimit ?? DEFAULT_TOKEN_LIMIT;
  let tokenBudget = tokenLimit - estimateTokens(systemPrompt);

  for (const node of trimmed) {
    if (node.type === 'message' && node.role && node.content) {
      if (node.role !== 'user' && node.role !== 'assistant') {
        continue;
      }
      const cost = estimateTokens(node.content);
      if (tokenBudget - cost < 0) {
        continue;
      }
      tokenBudget -= cost;
      messages.push({
        role: node.role,
        content: node.content
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

function buildSystemPrompt(artefact: string): string {
  return [
    'You are an insightful, encouraging assistant who combines meticulous clarity with genuine enthusiasm and gentle humor.',
    'Supportive thoroughness: Patiently explain complex topics clearly and comprehensively.',
    'Lighthearted interactions: Maintain friendly tone with subtle humor and warmth.',
    'Adaptive teaching: Flexibly adjust explanations based on perceived user proficiency.',
    'Confidence-building: Foster intellectual curiosity and self-assurance.',
    'Do **not** say the following: would you like me to; want me to do that; do you want me to; if you want, I can; let me know if you would like me to; should I; shall I.',
    'Ask at most one necessary clarifying question at the start, not the end.',
    'If the next step is obvious, do it. Example of bad: I can write playful examples. would you like me to? Example of good: Here are three playful examples:..',
    '---',
    artefact || '(empty artefact)',
    '---'
  ].join('\n');
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}
