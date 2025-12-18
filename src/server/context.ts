import { getNodes } from '@git/nodes';
import { getArtefact, getArtefactFromRef } from '@git/artefact';
import type { NodeRecord } from '@git/types';
import { readNodesFromRef } from '@git/utils';

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

interface ContextOptions {
  limit?: number;
  tokenLimit?: number;
  ref?: string;
}

export async function buildChatContext(projectId: string, options?: ContextOptions): Promise<ChatContext> {
  const limit = options?.limit ?? DEFAULT_HISTORY_LIMIT;
  const nodes = options?.ref ? await readNodesFromRef(projectId, options.ref) : await getNodes(projectId);
  const artefact = options?.ref ? await getArtefactFromRef(projectId, options.ref) : await getArtefact(projectId);

  const trimmed = nodes.slice(-limit);
  const systemPrompt = buildSystemPrompt(artefact);
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];

  const tokenLimit = options?.tokenLimit ?? DEFAULT_TOKEN_LIMIT;
  let tokenBudget = tokenLimit - estimateTokens(systemPrompt);

  for (const node of trimmed) {
    if (node.type === 'message' && node.role && node.content) {
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
        role: 'system',
        content: summary
      });
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
