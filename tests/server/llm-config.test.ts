// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDeployEnv, getEnabledProviders, getProviderEnvConfig } from '@/src/server/llmConfig';

const originalEnv = { ...process.env };

describe('llmConfig', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.LLM_ENABLE_OPENAI;
    delete process.env.LLM_ENABLE_GEMINI;
    delete process.env.LLM_ENABLE_ANTHROPIC;
    delete process.env.LLM_ALLOWED_MODELS_OPENAI;
    delete process.env.LLM_ALLOWED_MODELS_GEMINI;
    delete process.env.LLM_ALLOWED_MODELS_ANTHROPIC;
    delete process.env.OPENAI_MODEL;
    delete process.env.GEMINI_MODEL;
    delete process.env.ANTHROPIC_MODEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults to openai+gemini enabled, anthropic disabled', () => {
    expect(getDeployEnv()).toBe('dev');
    expect(getEnabledProviders()).toEqual(['openai', 'gemini', 'mock']);
  });

  it('respects provider enable toggles', () => {
    process.env.LLM_ENABLE_OPENAI = 'false';
    process.env.LLM_ENABLE_GEMINI = '0';
    process.env.LLM_ENABLE_ANTHROPIC = 'true';
    expect(getEnabledProviders()).toEqual(['anthropic', 'mock']);
  });

  it('removes mock provider in prod', () => {
    process.env.DEPLOY_ENV = 'prod';
    expect(getDeployEnv()).toBe('prod');
    expect(getEnabledProviders()).toEqual(['openai', 'gemini']);
  });

  it('validates OPENAI_MODEL against allowlist when provided', () => {
    process.env.OPENAI_MODEL = 'gpt-5.2';
    process.env.LLM_ALLOWED_MODELS_OPENAI = 'gpt-5.1';
    expect(() => getProviderEnvConfig('openai')).toThrow(/OPENAI_MODEL must be one of/i);
  });

  it('uses first allowed model when model env is unset', () => {
    process.env.LLM_ALLOWED_MODELS_OPENAI = 'gpt-5.1,gpt-5.2';
    expect(getProviderEnvConfig('openai')).toMatchObject({ defaultModel: 'gpt-5.1' });
  });
});
