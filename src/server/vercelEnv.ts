// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

function parseEnvFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isCodexDev(): boolean {
  return parseEnvFlag(process.env.CODEX_DEV);
}

export function isPreviewDeployment(): boolean {
  if (isCodexDev()) return true;
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (!vercelEnv) return false;
  return vercelEnv === 'preview' || vercelEnv === 'development';
}
