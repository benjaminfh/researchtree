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
    expect(buttons[0]).toHaveAccessibleName(/code copied/i);
    expect(buttons[1]).toHaveAccessibleName(/copy code block/i);

    await user.click(buttons[1]!);
    expect(copyTextToClipboardMock).toHaveBeenCalledWith('const beta = 2;');
  });

  it('wraps markdown tables in a horizontal overflow container', () => {
    render(
      <div className="prose prose-sm prose-slate">
        <MarkdownWithCopy
          content={`| Name | Notes |
| --- | --- |
| alpha | this is a fairly long value that should stay inside chat |
| beta | another long value |
`}
        />
      </div>
    );

    const table = screen.getByRole('table');
    const scrollContainer = table.parentElement;
    expect(scrollContainer).not.toBeNull();
    expect(scrollContainer).toHaveClass('max-w-full', 'overflow-x-auto');
    expect(table).toHaveClass('w-max', 'min-w-full');
  });
});
