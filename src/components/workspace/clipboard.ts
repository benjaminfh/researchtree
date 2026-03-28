// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

export const copyTextToClipboard = async (text: string): Promise<boolean> => {
  if (typeof navigator === 'undefined') return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // ignore and fall back
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    // ignore
  }
  return false;
};
