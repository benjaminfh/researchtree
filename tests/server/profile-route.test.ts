// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PUT } from '@/app/api/profile/route';

const mocks = vi.hoisted(() => ({
  rtGetUserLlmKeyStatusV1: vi.fn(),
  rtSetUserLlmKeyV1: vi.fn(),
  rtSetUserDefaultProviderV1: vi.fn()
}));

vi.mock('@/src/store/pg/userLlmKeys', () => ({
  rtGetUserLlmKeyStatusV1: mocks.rtGetUserLlmKeyStatusV1,
  rtSetUserLlmKeyV1: mocks.rtSetUserLlmKeyV1,
  rtSetUserDefaultProviderV1: mocks.rtSetUserDefaultProviderV1
}));

const baseUrl = 'http://localhost/api/profile';

function createPutRequest(body: unknown) {
  return new Request(baseUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('/api/profile', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());

    delete process.env.LLM_ENABLE_OPENAI;
    delete process.env.LLM_ENABLE_GEMINI;
    delete process.env.LLM_ENABLE_ANTHROPIC;
    delete process.env.OPENAI_USE_RESPONSES;
    delete process.env.OPENAI_MODEL;
    delete process.env.LLM_ALLOWED_MODELS_OPENAI;
  });

  it('GET returns user email and key status', async () => {
    mocks.rtGetUserLlmKeyStatusV1.mockResolvedValue({
      hasOpenAI: true,
      hasGemini: false,
      hasAnthropic: true,
      defaultProvider: 'gemini',
      systemPrompt: null,
      systemPromptMode: 'append',
      updatedAt: '2025-12-20T00:00:00.000Z'
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe('test@example.com');
    expect(body.defaultProvider).toBe('gemini');
    expect(Array.isArray(body.providerOptions)).toBe(true);
    expect(body.llmTokens).toEqual({
      openai: { configured: true },
      gemini: { configured: false },
      anthropic: { configured: true }
    });
  });

  it('PUT updates only provided keys and normalizes whitespace', async () => {
    mocks.rtSetUserLlmKeyV1.mockResolvedValue(undefined);

    const res = await PUT(createPutRequest({ openaiToken: '  sk-123  ', geminiToken: null }));
    expect(res.status).toBe(200);

    expect(mocks.rtSetUserLlmKeyV1).toHaveBeenCalledTimes(2);
    expect(mocks.rtSetUserLlmKeyV1).toHaveBeenCalledWith({ provider: 'openai', secret: 'sk-123' });
    expect(mocks.rtSetUserLlmKeyV1).toHaveBeenCalledWith({ provider: 'gemini', secret: null });
  });

  it('PUT rejects unknown fields', async () => {
    const res = await PUT(createPutRequest({ openaiToken: 'x', extra: 'nope' }));
    expect(res.status).toBe(400);
  });

  it('PUT saves default provider when enabled', async () => {
    process.env.LLM_ENABLED_PROVIDERS = 'openai_responses,gemini';
    mocks.rtSetUserDefaultProviderV1.mockResolvedValue(undefined);

    const res = await PUT(createPutRequest({ defaultProvider: 'gemini' }));
    expect(res.status).toBe(200);
    expect(mocks.rtSetUserDefaultProviderV1).toHaveBeenCalledWith({ provider: 'gemini' });
  });

  it('PUT rejects disabled default provider', async () => {
    process.env.LLM_ENABLED_PROVIDERS = 'openai_responses';

    const res = await PUT(createPutRequest({ defaultProvider: 'gemini' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body?.error?.details?.requestedProvider).toBe('gemini');
    expect(body?.error?.details?.enabledProviders).toEqual(['openai_responses']);
  });

});
