// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const DEFAULT_APP_NAME = 'threds';

export const APP_NAME = (process.env.NEXT_PUBLIC_APP_NAME ?? DEFAULT_APP_NAME).trim() || DEFAULT_APP_NAME;
export const TRUNK_LABEL = (process.env.NEXT_PUBLIC_RT_TRUNK_LABEL ?? 'main').trim() || 'main';

// Used for things like localStorage key prefixes. Defaults to APP_NAME, but can be set explicitly.
export const APP_ID = (process.env.NEXT_PUBLIC_APP_ID ?? APP_NAME).trim() || APP_NAME;
export const APP_SLUG = slugify(APP_ID) || 'threds';
const autoFollowDelay = Number(process.env.NEXT_PUBLIC_AUTO_FOLLOW_RESUME_DELAY_MS ?? 400);
export const AUTO_FOLLOW_RESUME_DELAY_MS = Number.isFinite(autoFollowDelay) ? autoFollowDelay : 400;
const defaultComposerLines = Number(process.env.NEXT_PUBLIC_RT_CHAT_COMPOSER_DEFAULT_LINES ?? 2);
const resolvedComposerLines = Number.isFinite(defaultComposerLines) ? Math.floor(defaultComposerLines) : 2;
export const CHAT_COMPOSER_DEFAULT_LINES = Math.min(9, Math.max(1, resolvedComposerLines));

export function storageKey(suffix: string): string {
  return `${APP_SLUG}:${suffix}`;
}
