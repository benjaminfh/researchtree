// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

export function resolveNextServerPath(appPath) {
  if (process.env.DESKTOP_NEXT_SERVER_PATH) {
    return process.env.DESKTOP_NEXT_SERVER_PATH;
  }
  return path.join(appPath, '.next', 'standalone', 'server.js');
}

function resolveNextDevPath() {
  return require.resolve('next/dist/bin/next');
}

export function startNextServer({ appPath, port, env }) {
  const nodePath = process.execPath;
  const isDev = process.env.DESKTOP_NEXT_DEV === '1';
  const serverPath = isDev ? resolveNextDevPath() : resolveNextServerPath(appPath);
  const args = isDev ? [serverPath, 'dev', '-p', String(port)] : [serverPath, '-p', String(port)];
  const child = spawn(nodePath, args, {
    env: {
      ...process.env,
      ...env,
      PORT: String(port),
      NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED ?? '1'
    },
    stdio: isDev ? 'inherit' : 'pipe'
  });

  return { child, serverPath };
}
