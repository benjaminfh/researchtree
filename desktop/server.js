import { spawn } from 'node:child_process';
import path from 'node:path';

export function resolveNextServerPath(appPath) {
  if (process.env.DESKTOP_NEXT_SERVER_PATH) {
    return process.env.DESKTOP_NEXT_SERVER_PATH;
  }
  return path.join(appPath, '.next', 'standalone', 'server.js');
}

export function startNextServer({ appPath, port, env }) {
  const serverPath = resolveNextServerPath(appPath);
  const nodePath = process.execPath;
  const child = spawn(nodePath, [serverPath, '-p', String(port)], {
    env: {
      ...process.env,
      ...env,
      PORT: String(port)
    },
    stdio: 'pipe'
  });

  return { child, serverPath };
}
