import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PUT } from '@/app/api/profile/route';

const mocks = vi.hoisted(() => ({
  rtGetUserLlmKeyStatusV1: vi.fn(),
  rtSetUserLlmKeyV1: vi.fn()
}));

vi.mock('@/src/store/pg/userLlmKeys', () => ({
  rtGetUserLlmKeyStatusV1: mocks.rtGetUserLlmKeyStatusV1,
  rtSetUserLlmKeyV1: mocks.rtSetUserLlmKeyV1
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
  });

  it('GET returns user email and key status', async () => {
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
});
