// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { resolveBranchConfig, resolveBranchCreationConfig } from '@/src/server/branchConfig';

const originalEnv = { ...process.env };

describe('resolveBranchConfig', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENAI_MODEL;
    delete process.env.LLM_ALLOWED_MODELS_OPENAI;
    delete process.env.LLM_ENABLE_OPENAI;
    delete process.env.LLM_ENABLE_GEMINI;
    delete process.env.LLM_ENABLE_ANTHROPIC;
    delete process.env.OPENAI_USE_RESPONSES;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws for unknown provider values', () => {
    expect(() => resolveBranchConfig({ provider: 'openai_chatcompletions', model: 'gpt-5.2' })).toThrow(
      /invalid branch provider/i
    );
  });

  it('normalizes provider casing and whitespace', () => {
    const result = resolveBranchConfig({ provider: ' OPENAI_RESPONSES ', model: 'gpt-5.2' });
    expect(result.provider).toBe('openai_responses');
    expect(result.model).toBe('gpt-5.2');
  });

  it('falls back to default enabled provider when source provider is unavailable', () => {
    process.env.LLM_ENABLED_PROVIDERS = 'openai_responses,gemini';
    process.env.LLM_DEFAULT_PROVIDER = 'openai_responses';
    const result = resolveBranchCreationConfig({
      sourceProvider: 'openai',
      sourceModel: 'gpt-5.2'
    });
    expect(result.sourceProvider).toBeNull();
    expect(result.provider).toBe('openai_responses');
  });

  it('throws when explicitly requesting a disabled provider', () => {
    process.env.LLM_ENABLED_PROVIDERS = 'openai_responses,gemini';
    expect(() =>
      resolveBranchCreationConfig({
        sourceProvider: 'openai_responses',
        requestedProvider: 'openai'
      })
    ).toThrow(/not available/i);
  });
});
