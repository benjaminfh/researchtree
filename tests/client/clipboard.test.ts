import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from '@/src/components/workspace/clipboard';

describe('copyTextToClipboard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when navigator clipboard API succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });

    await expect(copyTextToClipboard('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('returns false when fallback execCommand reports failure', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('denied'))
      }
    });
    const execSpy = vi.fn().mockReturnValue(false);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execSpy
    });

    await expect(copyTextToClipboard('hello')).resolves.toBe(false);
    expect(execSpy).toHaveBeenCalledWith('copy');
  });

  it('returns true when fallback execCommand succeeds', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('denied'))
      }
    });
    const execSpy = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execSpy
    });

    await expect(copyTextToClipboard('hello')).resolves.toBe(true);
    expect(execSpy).toHaveBeenCalledWith('copy');
  });
});
