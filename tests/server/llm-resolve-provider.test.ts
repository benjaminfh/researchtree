// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveLLMProvider, resolveOpenAIProviderSelection } from '@/src/server/llm';

const originalEnv = { ...process.env };

describe('resolveLLMProvider', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DEPLOY_ENV;
    delete process.env.LLM_ENABLED_PROVIDERS;
    delete process.env.LLM_DEFAULT_PROVIDER;
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

  it('does not allow mock in prod', () => {
    process.env.DEPLOY_ENV = 'prod';
    process.env.LLM_ENABLED_PROVIDERS = 'openai_responses,gemini';
    process.env.LLM_DEFAULT_PROVIDER = 'openai_responses';
    expect(() => resolveLLMProvider('mock' as any)).toThrow(/not available/i);
  });

  it('rejects explicit openai when only responses is enabled', () => {
    process.env.LLM_ENABLED_PROVIDERS = 'openai_responses,gemini,mock';
    expect(() => resolveOpenAIProviderSelection('openai')).toThrow(/not available/i);
  });

  it('keeps explicit openai when chat-completions is enabled', () => {
    process.env.LLM_ENABLED_PROVIDERS = 'openai,openai_responses,gemini,mock';
    expect(resolveOpenAIProviderSelection('openai')).toBe('openai');
  });
});
