// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveLLMProvider } from '@/src/server/llm';

const originalEnv = { ...process.env };

describe('resolveLLMProvider', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DEPLOY_ENV;
    delete process.env.LLM_DEFAULT_PROVIDER;
    delete process.env.LLM_ENABLE_OPENAI;
    delete process.env.LLM_ENABLE_GEMINI;
    delete process.env.LLM_ENABLE_ANTHROPIC;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('does not allow mock in prod', () => {
    process.env.DEPLOY_ENV = 'prod';
    process.env.LLM_DEFAULT_PROVIDER = 'openai';
    expect(resolveLLMProvider('mock' as any)).toBe('openai');
  });
});

