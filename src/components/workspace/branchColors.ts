// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

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

export type BranchColorDescriptor = {
  id?: string;
  name: string;
  isTrunk?: boolean;
};

function hashBranchName(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickColorIndex(value: string) {
  return hashBranchName(value) % branchPalette.length;
}

function resolveBranchKey(branch: BranchColorDescriptor) {
  return branch.id?.trim() || branch.name;
}

export function buildBranchColorMap(branches: BranchColorDescriptor[], trunkName: string) {
  const map: Record<string, string> = {};
  let lastColor: string | null = null;
  const seen = new Set<string>();

  for (const branch of branches) {
    const key = resolveBranchKey(branch);
    if (seen.has(key)) continue;
    seen.add(key);
    const isTrunk = branch.isTrunk || branch.name === trunkName;
    if (isTrunk) {
      map[branch.name] = trunkColor;
      if (branch.id) {
        map[branch.id] = trunkColor;
      }
      lastColor = trunkColor;
      continue;
    }
    let color = branchPalette[pickColorIndex(key)];
    if (lastColor && color === lastColor) {
      let attempts = 0;
      while (attempts < 3 && color === lastColor) {
        attempts += 1;
        color = branchPalette[pickColorIndex(`${key}:${attempts}`)];
      }
    }
    if (lastColor && color === lastColor && branchPalette.length > 1) {
      const lastIndex = branchPalette.indexOf(lastColor);
      const nextIndex = lastIndex >= 0 ? (lastIndex + 1) % branchPalette.length : pickColorIndex(`${key}:fallback`);
      color = branchPalette[nextIndex];
    }
    map[branch.name] = color;
    if (branch.id) {
      map[branch.id] = color;
    }
    lastColor = color;
  }

  return map;
}

export function getBranchColor(branchName: string, trunkName: string, branchColors?: Record<string, string>) {
  const mapped = branchColors?.[branchName];
  if (mapped) return mapped;
  if (branchName === trunkName) return trunkColor;
  return branchPalette[pickColorIndex(branchName)];
}
