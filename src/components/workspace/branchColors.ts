export const branchPalette = ['#8b5cf6', '#0ea5e9', '#ec4899', '#f97316', '#10b981', '#facc15', '#94a3b8'];
export const trunkColor = '#0f172a';

export function getBranchColor(branchName: string, trunkName: string) {
  if (branchName === trunkName) return trunkColor;
  let hash = 0;
  for (let i = 0; i < branchName.length; i++) {
    hash = (hash * 31 + branchName.charCodeAt(i)) >>> 0;
  }
  return branchPalette[hash % branchPalette.length];
}

