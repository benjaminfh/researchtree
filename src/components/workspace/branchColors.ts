// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

export const branchPalette = [
  '#4f94ff',
  '#5bc0ee',
  '#7ad0c9',
  '#8fcb7f',
  '#c4b86e',
  '#e0b15c',
  '#f2a254',
  '#f08a5b',
  '#ec6a6a',
  '#dd6fb1',
  '#c979e6',
  '#a785ff',
  '#7aa1ff',
  '#5f9ec8',
  '#7a8da8'
];
export const trunkColor = '#0f172a';

function hashBranchId(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickColorIndex(value: string) {
  return hashBranchId(value) % branchPalette.length;
}

export function buildBranchColorMap(branchIds: string[], trunkId: string) {
  const map: Record<string, string> = {};
  let lastColor: string | null = null;
  const seen = new Set<string>();

  for (const id of branchIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (id === trunkId) {
      map[id] = trunkColor;
      lastColor = trunkColor;
      continue;
    }
    let color = branchPalette[pickColorIndex(id)];
    if (lastColor && color === lastColor) {
      let attempts = 0;
      while (attempts < 3 && color === lastColor) {
        attempts += 1;
        color = branchPalette[pickColorIndex(`${id}:${attempts}`)];
      }
    }
    if (lastColor && color === lastColor && branchPalette.length > 1) {
      const lastIndex = branchPalette.indexOf(lastColor);
      const nextIndex = lastIndex >= 0 ? (lastIndex + 1) % branchPalette.length : pickColorIndex(`${id}:fallback`);
      color = branchPalette[nextIndex];
    }
    map[id] = color;
    lastColor = color;
  }

  return map;
}

export function getBranchColor(branchId: string, trunkId: string, branchColors?: Record<string, string>) {
  const mapped = branchColors?.[branchId];
  if (mapped) return mapped;
  if (branchId === trunkId) return trunkColor;
  return branchPalette[pickColorIndex(branchId)];
}
