// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { getPgStoreAdapter } from '@/src/store/pg/adapter';
import type { UserSystemPromptMode } from '@/src/server/systemPrompt';

function formatRpcError(error: any): string {
  const message = typeof error?.message === 'string' ? error.message : 'RPC failed';
  const code = typeof error?.code === 'string' ? error.code : null;
  const details = typeof error?.details === 'string' ? error.details : null;
  const hint = typeof error?.hint === 'string' ? error.hint : null;
  return [code ? `[${code}]` : null, message, details ? `details=${details}` : null, hint ? `hint=${hint}` : null]
    .filter(Boolean)
    .join(' ');
}

export async function rtSetUserSystemPromptV1(input: { mode: UserSystemPromptMode; prompt: string | null }): Promise<void> {
  const { rpc } = getPgStoreAdapter();
  const { error } = await rpc('rt_set_user_system_prompt_v1', {
    p_mode: input.mode,
    p_prompt: input.prompt
  });
  if (error) {
    throw new Error(formatRpcError(error));
  }
}

export async function rtGetUserSystemPromptV1(): Promise<{ mode: UserSystemPromptMode; prompt: string | null }> {
  const { rpc } = getPgStoreAdapter();
  const { data, error } = await rpc('rt_get_user_system_prompt_v1');
  if (error) {
    throw new Error(formatRpcError(error));
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    mode: row?.mode === 'replace' ? 'replace' : 'append',
    prompt: row?.prompt ? String(row.prompt) : null
  };
}
