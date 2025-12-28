import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import net from 'node:net';
import { readConfig, writeConfig } from './config.js';
import { startNextServer } from './server.js';

let serverProcess = null;

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => {
        if (!port) {
          reject(new Error('Failed to resolve open port'));
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForHealth(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const body = await response.json().catch(() => null);
        if (body && body.ok) return;
      }
    } catch {
      // Ignore until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Timed out waiting for server health');
}

function resolveUiPath(appPath, ...segments) {
  return path.join(appPath, 'desktop', 'ui', ...segments);
}

async function promptForLocalPgUrl(userDataPath) {
  return new Promise((resolve, reject) => {
    const appPath = app.getAppPath();
    let resolved = false;
    const window = new BrowserWindow({
      width: 520,
      height: 320,
      resizable: false,
      minimizable: false,
      maximizable: false,
      show: false,
      webPreferences: {
        preload: path.join(appPath, 'desktop', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    const cleanup = () => {
      ipcMain.removeHandler('config:read');
      ipcMain.removeHandler('config:save');
    };

    ipcMain.handle('config:read', async () => {
      return await readConfig(userDataPath);
    });

    ipcMain.handle('config:save', async (_event, config) => {
      const nextConfig = { ...(await readConfig(userDataPath)), ...config };
      await writeConfig(userDataPath, nextConfig);
      cleanup();
      resolved = true;
      window.close();
      resolve(nextConfig);
    });

    window.on('closed', () => {
      cleanup();
      if (resolved) return;
      reject(new Error('Setup window closed before saving config'));
    });

    window.once('ready-to-show', () => window.show());
    window.loadFile(resolveUiPath(appPath, 'setup.html')).catch(reject);
  });
}

async function ensureConfig(userDataPath) {
  const config = await readConfig(userDataPath);
  if (config.LOCAL_PG_URL) return config;
  return await promptForLocalPgUrl(userDataPath);
}

async function createMainWindow(port) {
  const window = new BrowserWindow({
    width: 1200,
    height: 900,
    show: false,
    webPreferences: {
      contextIsolation: true
    }
  });

  await window.loadURL(`http://127.0.0.1:${port}`);
  window.once('ready-to-show', () => window.show());
  return window;
}

async function startApp() {
  const userDataPath = app.getPath('userData');
  const config = await ensureConfig(userDataPath);
  const port = await findOpenPort();

  const env = {
    RT_PG_ADAPTER: config.RT_PG_ADAPTER ?? 'local',
    RT_STORE: config.RT_STORE ?? 'pg',
    LOCAL_PG_URL: config.LOCAL_PG_URL,
    RESEARCHTREE_PROJECTS_ROOT: config.RESEARCHTREE_PROJECTS_ROOT ?? path.join(userDataPath, 'projects'),
    RT_APP_ORIGIN: `http://127.0.0.1:${port}`
  };

  const appPath = app.getAppPath();
  const { child } = startNextServer({ appPath, port, env });
  serverProcess = child;

  await waitForHealth(`http://127.0.0.1:${port}/api/health`);
  await createMainWindow(port);
}

app.whenReady().then(startApp);

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
