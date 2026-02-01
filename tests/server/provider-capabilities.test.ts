// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getProviderTokenLimit, __resetProviderCapabilitiesCache } from '@/src/server/providerCapabilities';

const retrieve = vi.fn();
const getModel = vi.fn();

vi.mock('openai', () => ({
  default: class {
    models = { retrieve };
    constructor() {}
  }
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    models = { getModel };
    constructor() {}
  }
}));

describe('provider capabilities', () => {
  beforeEach(() => {
    retrieve.mockReset();
    getModel.mockReset();
    __resetProviderCapabilitiesCache();
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    process.env.OPENAI_MODEL = 'gpt-5.2';
    process.env.GEMINI_MODEL = 'gemini-3-pro-preview';
  });

  it('uses OpenAI metadata when API key present', async () => {
    process.env.OPENAI_API_KEY = 'key';
    retrieve.mockResolvedValue({ context_length: 32000 });

    const limit = await getProviderTokenLimit('openai', 'gpt-test');

    expect(retrieve).toHaveBeenCalledWith('gpt-test');
    expect(limit).toBe(16000);
  });

  it('falls back to default when OpenAI metadata unavailable', async () => {
    const limit = await getProviderTokenLimit('openai', 'gpt-test');
    expect(limit).toBe(64000); // 128k * 0.5
  });

  it('uses Gemini metadata when API key present', async () => {
    process.env.GEMINI_API_KEY = 'key';
    getModel.mockResolvedValue({ inputTokenLimit: 200000 });

    const limit = await getProviderTokenLimit('gemini', 'gemini-test');

    expect(getModel).toHaveBeenCalledWith('models/gemini-test');
    expect(limit).toBe(100000);
  });

  it('falls back to default when Gemini metadata missing', async () => {
    const limit = await getProviderTokenLimit('gemini', 'gemini-test');
    expect(limit).toBe(100000); // 200k * 0.5
  });
});
