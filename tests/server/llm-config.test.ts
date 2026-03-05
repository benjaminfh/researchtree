// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDeployEnv, getEnabledProviders, getProviderEnvConfig } from '@/src/server/llmConfig';

const originalEnv = { ...process.env };

describe('llmConfig', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.LLM_ENABLED_PROVIDERS;
    delete process.env.LLM_ALLOWED_MODELS_OPENAI_CHATCOMPLETIONS;
    delete process.env.LLM_ALLOWED_MODELS_OPENAI_RESPONSES;
    delete process.env.LLM_ALLOWED_MODELS_GEMINI;
    delete process.env.LLM_ALLOWED_MODELS_ANTHROPIC;
    delete process.env.OPENAI_CHATCOMPLETIONS_MODEL;
    delete process.env.OPENAI_RESPONSES_MODEL;
    delete process.env.GEMINI_MODEL;
    delete process.env.ANTHROPIC_MODEL;
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

  it('defaults to openai_responses+gemini enabled, anthropic disabled', () => {
    expect(getDeployEnv()).toBe('dev');
    expect(getEnabledProviders()).toEqual(['openai_responses', 'gemini', 'mock']);
  });

  it('respects explicit provider allowlist', () => {
    process.env.LLM_ENABLED_PROVIDERS = 'anthropic,mock';
    expect(getEnabledProviders()).toEqual(['anthropic', 'mock']);
  });

  it('removes mock provider in prod', () => {
    process.env.DEPLOY_ENV = 'prod';
    expect(getDeployEnv()).toBe('prod');
    expect(getEnabledProviders()).toEqual(['openai_responses', 'gemini']);
  });

  it('throws when prod allowlist includes mock', () => {
    process.env.DEPLOY_ENV = 'prod';
    process.env.LLM_ENABLED_PROVIDERS = 'openai_responses,mock';
    expect(() => getEnabledProviders()).toThrow(/cannot include mock in prod/i);
  });

  it('validates OPENAI_CHATCOMPLETIONS_MODEL against allowlist when provided', () => {
    process.env.OPENAI_CHATCOMPLETIONS_MODEL = 'gpt-5.2';
    process.env.LLM_ALLOWED_MODELS_OPENAI_CHATCOMPLETIONS = 'gpt-5.1';
    expect(() => getProviderEnvConfig('openai')).toThrow(/OPENAI_CHATCOMPLETIONS_MODEL must be one of/i);
  });

  it('uses first allowed model when model env is unset', () => {
    process.env.LLM_ALLOWED_MODELS_OPENAI_CHATCOMPLETIONS = 'gpt-5.1,gpt-5.2';
    expect(getProviderEnvConfig('openai')).toMatchObject({ defaultModel: 'gpt-5.1' });
  });

  it('uses dedicated responses env vars for openai_responses', () => {
    process.env.LLM_ALLOWED_MODELS_OPENAI_RESPONSES = 'gpt-5.1,gpt-5.2';
    process.env.OPENAI_RESPONSES_MODEL = 'gpt-5.1';
    expect(getProviderEnvConfig('openai_responses')).toMatchObject({ defaultModel: 'gpt-5.1' });
  });

  it('validates OPENAI_RESPONSES_MODEL against responses allowlist', () => {
    process.env.LLM_ALLOWED_MODELS_OPENAI_RESPONSES = 'gpt-5.1';
    process.env.OPENAI_RESPONSES_MODEL = 'gpt-5.2';
    expect(() => getProviderEnvConfig('openai_responses')).toThrow(/OPENAI_RESPONSES_MODEL must be one of/i);
  });

  it('throws when legacy OpenAI env vars are configured', () => {
    process.env.OPENAI_MODEL = 'gpt-5.2';
    expect(() => getEnabledProviders()).toThrow(/Legacy OpenAI env vars are no longer supported/i);
  });

  it('throws when legacy provider toggles are configured', () => {
    process.env.OPENAI_USE_RESPONSES = 'true';
    expect(() => getEnabledProviders()).toThrow(/Legacy provider toggle env vars are no longer supported/i);
  });


  it('accepts gemini-3.1-pro-preview when present in Gemini allowlist', () => {
    process.env.GEMINI_MODEL = 'gemini-3.1-pro-preview';
    process.env.LLM_ALLOWED_MODELS_GEMINI = 'gemini-3.1-pro-preview,gemini-2.5-pro';
    expect(getProviderEnvConfig('gemini')).toMatchObject({ defaultModel: 'gemini-3.1-pro-preview' });
  });

  it('surfaces a capabilities-first error when allowlist contains an unknown model', () => {
    process.env.LLM_ALLOWED_MODELS_GEMINI = 'gemini-9-foo';
    expect(() => getProviderEnvConfig('gemini')).toThrow(/src\/shared\/llmCapabilities\.ts/);
  });
});
