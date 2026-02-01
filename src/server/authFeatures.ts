// Copyright (c) 2025 Benjamin F. Hall
// SPDX-License-Identifier: MIT

function parseEnvFlag(value: string | undefined): boolean | null {
  if (value == null) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (['0', 'false', 'off', 'no'].includes(normalized)) return false;
  if (['1', 'true', 'on', 'yes'].includes(normalized)) return true;
  return null;
}

export function isGithubAuthEnabled(): boolean {
  const serverFlag = parseEnvFlag(process.env.RT_GITHUB_AUTH);
  if (serverFlag != null) return serverFlag;
  return false;
}
