// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import type { LLMProvider } from './llmProvider';

export type ThinkingAvailability = 'none' | 'summary' | 'full' | 'redacted' | 'partial';

export type ThinkingContentBlock =
  | {
      type: 'thinking';
      thinking: string;
      signature?: string;
    }
  | {
      type: 'thinking_signature';
      signature: string;
    }
  | {
      type: 'text';
      text: string;
    }
  | {
      type: string;
      [key: string]: unknown;
    };

export interface ThinkingTrace {
  provider: LLMProvider | 'unknown';
  availability: ThinkingAvailability;
  content: ThinkingContentBlock[];
  raw?: unknown;
}

export type MessageContent = string | ThinkingContentBlock[];

export function getBlocksFromLegacy(content: string, thinking?: ThinkingTrace): ThinkingContentBlock[] {
  const blocks: ThinkingContentBlock[] = [];
  if (thinking?.content?.length) {
    blocks.push(...thinking.content);
  }
  if (content) {
    blocks.push({ type: 'text', text: content });
  }
  return blocks;
}

export function getContentBlocksWithLegacyFallback(input: {
  type?: string;
  content?: string;
  contentBlocks?: ThinkingContentBlock[];
  thinking?: ThinkingTrace;
}): ThinkingContentBlock[] {
  if (input.type !== 'message') return [];
  if (Array.isArray(input.contentBlocks)) return input.contentBlocks;
  return getBlocksFromLegacy(input.content ?? '', input.thinking);
}

export function hasSignatureBlock(blocks: ThinkingContentBlock[]): boolean {
  return blocks.some((block) => block.type === 'thinking_signature' || (block.type === 'thinking' && Boolean(block.signature)));
}

export function stripThinkingTextIfSignature(blocks: ThinkingContentBlock[]): ThinkingContentBlock[] {
  if (!hasSignatureBlock(blocks)) {
    return blocks;
  }
  const stripped: ThinkingContentBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'thinking') {
      if (block.signature) {
        stripped.push({ type: 'thinking_signature', signature: block.signature });
      }
      continue;
    }
    stripped.push(block);
  }
  return stripped;
}

export function flattenMessageContent(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .map((block) => {
      if (block.type === 'thinking') return typeof block.thinking === 'string' ? block.thinking : '';
      if (block.type === 'thinking_signature') return typeof block.signature === 'string' ? block.signature : '';
      if (block.type === 'text') return typeof block.text === 'string' ? block.text : '';
      return '';
    })
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('\n\n');
}

export function deriveTextFromBlocks(blocks: ThinkingContentBlock[]): string {
  return blocks
    .filter((block) => block.type === 'text')
    .map((block) => (block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('');
}

export function deriveThinkingFromBlocks(blocks: ThinkingContentBlock[]): string {
  return blocks
    .filter((block) => block.type === 'thinking')
    .map((block) => (block.type === 'thinking' && typeof block.thinking === 'string' ? block.thinking : ''))
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('');
}
