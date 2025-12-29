function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const DEFAULT_APP_NAME = 'threds';

export const APP_NAME = (process.env.NEXT_PUBLIC_APP_NAME ?? DEFAULT_APP_NAME).trim() || DEFAULT_APP_NAME;

// Used for things like localStorage key prefixes. Defaults to APP_NAME, but can be set explicitly.
export const APP_ID = (process.env.NEXT_PUBLIC_APP_ID ?? APP_NAME).trim() || APP_NAME;
export const APP_SLUG = slugify(APP_ID) || 'threds';

export function storageKey(suffix: string): string {
  return `${APP_SLUG}:${suffix}`;
}
