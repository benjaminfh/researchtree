function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export const APP_NAME = (process.env.NEXT_PUBLIC_APP_NAME ?? 'ResearchTree').trim() || 'ResearchTree';

// Used for things like localStorage key prefixes. Defaults to APP_NAME, but can be set explicitly.
export const APP_ID = (process.env.NEXT_PUBLIC_APP_ID ?? APP_NAME).trim() || APP_NAME;
export const APP_SLUG = slugify(APP_ID) || 'researchtree';

export function storageKey(suffix: string): string {
  return `${APP_SLUG}:${suffix}`;
}
