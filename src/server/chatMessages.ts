// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

function formatHighlightBlock(highlight: string): string {
  const fence = '```';
  const escaped = highlight.replaceAll(fence, '\\`\\`\\`');
  return `${fence}text\n${escaped}\n${fence}`;
}

export function buildUserMessage(input: { message?: string | null; question?: string | null; highlight?: string | null }): string {
  const highlight = input.highlight?.trim() ?? '';
  const question = input.question?.trim() ?? '';
  const message = input.message?.trim() ?? '';

  const parts: string[] = [];

  if (highlight) {
    parts.push('Highlighted passage:', formatHighlightBlock(highlight));
  }

  if (question) {
    parts.push('Question:', question);
  }

  if (message && parts.length === 0) {
    return message;
  }

  if (message) {
    parts.push('Additional message:', message);
  }

  return parts.join('\n\n');
}
