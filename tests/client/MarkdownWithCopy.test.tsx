// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/src/components/workspace/clipboard', () => ({
  copyTextToClipboard: vi.fn().mockResolvedValue(undefined)
}));

import { copyTextToClipboard } from '@/src/components/workspace/clipboard';
import { MarkdownWithCopy } from '@/src/components/workspace/MarkdownWithCopy';

const copyTextToClipboardMock = vi.mocked(copyTextToClipboard);

describe('MarkdownWithCopy', () => {
  beforeEach(() => {
    copyTextToClipboardMock.mockClear();
  });

  it('renders a copy control for each fenced code block', async () => {
    const user = userEvent.setup();
    render(
      <div className="prose prose-sm prose-slate">
        <MarkdownWithCopy
          content={`Here is some text.\n\n\`\`\`js\nconsole.log('alpha');\n\`\`\`\n\n\`\`\`ts\nconst beta = 2;\n\`\`\``}
        />
      </div>
    );

    const buttons = screen.getAllByRole('button', { name: /copy code block/i });
    expect(buttons).toHaveLength(2);

    await user.click(buttons[0]!);
    expect(copyTextToClipboardMock).toHaveBeenCalledWith("console.log('alpha');");
    expect(buttons[0]).toHaveTextContent(/copied/i);
    expect(buttons[1]).toHaveTextContent(/copy/i);

    await user.click(buttons[1]!);
    expect(copyTextToClipboardMock).toHaveBeenCalledWith('const beta = 2;');
  });
});
