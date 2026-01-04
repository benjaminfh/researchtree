// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/profile/llm-keys/route';

const mocks = vi.hoisted(() => ({
  rtGetUserLlmKeyStatusV1: vi.fn(),
  rtGetUserLlmKeyServerV1: vi.fn()
}));

vi.mock('@/src/store/pg/userLlmKeys', () => ({
  rtGetUserLlmKeyStatusV1: mocks.rtGetUserLlmKeyStatusV1,
  rtGetUserLlmKeyServerV1: mocks.rtGetUserLlmKeyServerV1
}));

describe('/api/profile/llm-keys', () => {
  beforeEach(() => {
    mocks.rtGetUserLlmKeyStatusV1.mockReset();
    mocks.rtGetUserLlmKeyServerV1.mockReset();
  });

  it('returns per-provider readability and configured status', async () => {
    mocks.rtGetUserLlmKeyStatusV1.mockResolvedValue({
      hasOpenAI: true,
      hasGemini: false,
      hasAnthropic: true,
      updatedAt: '2025-12-20T00:00:00.000Z'
    });

    mocks.rtGetUserLlmKeyServerV1.mockImplementation(async ({ provider }: { provider: string }) => {
      if (provider === 'openai') return 'sk-123';
      if (provider === 'gemini') return '   ';
      throw new Error('read error');
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.providers).toEqual({
      openai: { configured: true, readable: true, error: null },
      gemini: { configured: false, readable: false, error: null },
      anthropic: { configured: true, readable: false, error: 'read error' }
    });
    expect(body.updatedAt).toBe('2025-12-20T00:00:00.000Z');
  });
});
