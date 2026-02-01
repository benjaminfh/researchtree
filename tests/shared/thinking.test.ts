// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import {
  toGemini3ThinkingLevel,
  toGemini25ThinkingBudget,
  GEMINI_THINKING_BUDGET_SPECIALS,
  translateThinkingForProvider
} from '@/src/shared/thinking';

describe('thinking (Gemini helpers)', () => {
  it('maps ThinkingSetting to Gemini 3 thinking level', () => {
    expect(toGemini3ThinkingLevel('off')).toBe(null);
    expect(toGemini3ThinkingLevel('low')).toBe('low');
    expect(toGemini3ThinkingLevel('medium')).toBe('medium');
    expect(toGemini3ThinkingLevel('high')).toBe('high');
  });

  it('maps ThinkingSetting to Gemini 2.5 thinking budget', () => {
    expect(toGemini25ThinkingBudget('off')).toBe(GEMINI_THINKING_BUDGET_SPECIALS.off);
    expect(toGemini25ThinkingBudget('low')).toBe(1024);
    expect(toGemini25ThinkingBudget('medium')).toBe(4096);
    expect(toGemini25ThinkingBudget('high')).toBe(8192);
  });

  it('includes both Gemini thinking configs in translateThinkingForProvider', () => {
    expect(translateThinkingForProvider('gemini', 'low')).toMatchObject({
      provider: 'gemini',
      setting: 'low',
      gemini3ThinkingLevel: 'low',
      gemini25ThinkingBudget: 1024
    });
  });
});
