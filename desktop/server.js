import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { utilityProcess } from 'electron';

const require = createRequire(import.meta.url);

export function resolveNextServerPath(appPath, env = {}) {
  const envOverride = env.DESKTOP_NEXT_SERVER_PATH ?? process.env.DESKTOP_NEXT_SERVER_PATH;
  if (envOverride) {
    return envOverride;
  }
  const resourceCandidates = [
    path.join(process.resourcesPath, 'standalone', 'server.js'),
    path.join(process.resourcesPath, '.next', 'standalone', 'server.js')
  ];
  for (const candidate of resourceCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(appPath, '.next', 'standalone', 'server.js');
}

function resolveNextDevPath() {
  return require.resolve('next/dist/bin/next');
}

export function startNextServer({ appPath, port, env }) {
  const nodePath = process.execPath;
  const isDev = process.env.DESKTOP_NEXT_DEV === '1';
  const serverPath = isDev ? resolveNextDevPath() : resolveNextServerPath(appPath, env);
  const args = isDev ? [serverPath, 'dev', '-p', String(port)] : [serverPath, '-p', String(port)];
  let logPath = null;
  if (!isDev) {
    const userDataPath = env?.RT_USER_DATA_PATH ?? process.env.RT_USER_DATA_PATH;
    if (userDataPath) {
      logPath = path.join(userDataPath, 'desktop-server.log');
    }
  }
  const child = isDev
    ? spawn(nodePath, args, {
        env: {
          ...process.env,
          ...env,
          ELECTRON_RUN_AS_NODE: '1',
          PORT: String(port),
          NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED ?? '1'
        },
        stdio: 'inherit'
      })
    : utilityProcess.fork(serverPath, ['-p', String(port)], {
        env: {
          ...process.env,
          ...env,
          PORT: String(port),
          NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED ?? '1'
        },
        stdio: 'pipe'
      });

  if (!isDev && logPath) {
    const logDir = path.dirname(logPath);
    fs.promises
      .mkdir(logDir, { recursive: true })
      .then(() =>
        fs.promises.appendFile(
          logPath,
          `\n[desktop] starting Next server\n` +
            `serverPath=${serverPath}\n` +
            `port=${port}\n` +
            `pid=${child.pid ?? 'unknown'}\n`
        )
      )
      .catch(() => {});
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    if (child.stdout) {
      child.stdout.pipe(logStream);
    }
    if (child.stderr) {
      child.stderr.pipe(logStream);
    }
    child.on('exit', (code, signal) => {
      logStream.write(`\n[desktop] Next server exit code=${code} signal=${signal ?? 'none'}\n`);
    });
  }

  return { child, serverPath };
}
