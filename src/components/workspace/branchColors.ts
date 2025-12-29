// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

export const branchPalette = ['#8b5cf6', '#0ea5e9', '#ec4899', '#f97316', '#10b981', '#facc15', '#94a3b8'];
export const trunkColor = '#0f172a';

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

export function buildBranchColorMap(branchNames: string[], trunkName: string) {
  const map: Record<string, string> = {};
  let lastColor: string | null = null;
  const seen = new Set<string>();

  for (const name of branchNames) {
    if (seen.has(name)) continue;
    seen.add(name);
    if (name === trunkName) {
      map[name] = trunkColor;
      lastColor = trunkColor;
      continue;
    }
    let color = branchPalette[pickColorIndex(name)];
    if (lastColor && color === lastColor) {
      let attempts = 0;
      while (attempts < 3 && color === lastColor) {
        attempts += 1;
        color = branchPalette[pickColorIndex(`${name}:${attempts}`)];
      }
    }
    if (lastColor && color === lastColor && branchPalette.length > 1) {
      const lastIndex = branchPalette.indexOf(lastColor);
      const nextIndex = lastIndex >= 0 ? (lastIndex + 1) % branchPalette.length : pickColorIndex(`${name}:fallback`);
      color = branchPalette[nextIndex];
    }
    map[name] = color;
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
