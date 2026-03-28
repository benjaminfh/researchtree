// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import type { NodeRecord } from '@git/types';
import type { ThinkingContentBlock } from '@/src/shared/thinkingTraces';
import { getContentBlocksWithLegacyFallback } from '@/src/shared/thinkingTraces';

export const EXPORT_CHAT_MAX_MESSAGES = 500;
export const EXPORT_CHAT_MAX_BYTES = 1024 * 1024;

export interface ExportChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ThinkingContentBlock[];
}

export type ExportChatPayloadResult =
  | {
      ok: true;
      payload: string;
      messages: ExportChatMessage[];
      bytes: number;
    }
  | {
      ok: false;
      reason: 'no_messages' | 'record_cap' | 'payload_cap';
      messageCount: number;
      bytes?: number;
    };

function toExportChatMessage(node: NodeRecord): ExportChatMessage | null {
  if (node.type !== 'message') return null;
  if (node.role !== 'system' && node.role !== 'user' && node.role !== 'assistant') return null;
  const blocks = getContentBlocksWithLegacyFallback(node);
  const content = blocks.length > 0 ? blocks : node.content ?? '';
  return {
    role: node.role,
    content
  };
}

export function buildChatExportPayload(nodes: NodeRecord[]): ExportChatPayloadResult {
  const messages = nodes.map(toExportChatMessage).filter((entry): entry is ExportChatMessage => Boolean(entry));

  if (messages.length === 0) {
    return { ok: false, reason: 'no_messages', messageCount: 0 };
  }

  if (messages.length > EXPORT_CHAT_MAX_MESSAGES) {
    return { ok: false, reason: 'record_cap', messageCount: messages.length };
  }

  const payload = JSON.stringify(messages, null, 2);
  const bytes = new TextEncoder().encode(payload).length;
  if (bytes > EXPORT_CHAT_MAX_BYTES) {
    return { ok: false, reason: 'payload_cap', messageCount: messages.length, bytes };
  }

  return {
    ok: true,
    payload,
    messages,
    bytes
  };
}
