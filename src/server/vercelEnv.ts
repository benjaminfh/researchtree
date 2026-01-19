// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

export function isPreviewDeployment(): boolean {
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (!vercelEnv) return false;
  return vercelEnv === 'preview' || vercelEnv === 'development';
}
