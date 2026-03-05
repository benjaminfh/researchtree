// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getEnabledProviders: vi.fn(),
  rtGetUserDefaultProviderV1: vi.fn(),
  rtGetUserLlmKeyStatusV1: vi.fn(),
  rtSetUserLlmKeyV1: vi.fn(),
  rtSetUserDefaultProviderV1: vi.fn()
}));

vi.mock('@/src/server/llmConfig', () => ({
  getEnabledProviders: mocks.getEnabledProviders
}));

vi.mock('@/src/store/pg/userLlmKeys', () => ({
  rtGetUserDefaultProviderV1: mocks.rtGetUserDefaultProviderV1,
  rtGetUserLlmKeyStatusV1: mocks.rtGetUserLlmKeyStatusV1,
  rtSetUserLlmKeyV1: mocks.rtSetUserLlmKeyV1,
  rtSetUserDefaultProviderV1: mocks.rtSetUserDefaultProviderV1
}));

import { GET, PUT } from '@/app/api/profile/route';

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
    mocks.getEnabledProviders.mockReturnValue(['openai', 'gemini']);
  });

  it('GET returns user email and key status', async () => {
    mocks.rtGetUserDefaultProviderV1.mockResolvedValue('openai');
    mocks.rtGetUserLlmKeyStatusV1.mockResolvedValue({
      hasOpenAI: true,
      hasGemini: false,
      hasAnthropic: true,
      updatedAt: '2025-12-20T00:00:00.000Z'
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe('test@example.com');
    expect(body.llmTokens).toEqual({
      openai: { configured: true },
      gemini: { configured: false },
      anthropic: { configured: true }
    });
    expect(body.enabledDefaultProviders).toEqual(['openai', 'gemini']);
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

  it('PUT rejects disabled default provider values', async () => {
    const res = await PUT(createPutRequest({ defaultProvider: 'mock' }));
    expect(res.status).toBe(400);
    expect(mocks.rtSetUserDefaultProviderV1).not.toHaveBeenCalled();
  });
});
