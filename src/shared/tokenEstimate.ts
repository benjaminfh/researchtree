// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { flattenMessageContent, type MessageContent } from '@/src/shared/thinkingTraces';

export type TokenEstimator = (input: string) => number;

export const estimateTokensFromChars = (chars: number): number => {
  return Math.ceil(chars / 3);
};

export const estimateTokensFromText = (text: string, estimator?: TokenEstimator): number => {
  if (estimator) {
    return estimator(text);
  }
  return estimateTokensFromChars(text.length);
};

export const countCharacters = (content: MessageContent): number => {
  return flattenMessageContent(content).length;
};

export const countCharactersForMessages = (messages: { content: MessageContent }[]): number => {
  return messages.reduce((total, message) => total + countCharacters(message.content), 0);
};
