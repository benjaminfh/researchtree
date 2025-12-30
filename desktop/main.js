// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { app, BrowserWindow, ipcMain, dialog, screen } from 'electron';
import path from 'node:path';
import net from 'node:net';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { readConfig, writeConfig } from './config.js';
import { startNextServer } from './server.js';

let serverProcess = null;
let appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'threds';
let mainWindow = null;
let setupWindow = null;
let isStarting = false;
const DEFAULT_LOCAL_PG_URL = 'postgresql://localhost:5432/postgres';

async function loadEnvFile(envPath, options = {}) {
  const skipKeys = options.skipKeys ?? new Set();
  try {
    const raw = await fs.readFile(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (skipKeys.has(key)) {
        continue;
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

async function loadLocalEnv(appPath) {
  await loadEnvFile(path.join(appPath, '.env.desktop'));
  const skipSupabaseKeys = new Set([
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
  ]);
  await loadEnvFile(path.join(appPath, '.env.local'), { skipKeys: skipSupabaseKeys });
}

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
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      const body = await response.json().catch(() => null);
      if (response.ok && body && body.ok) return;
      if (body && body.error) {
        lastError = body.error;
        console.warn('[desktop] health check error', body.error);
      }
    } catch {
      // Ignore until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (lastError) {
    throw new Error(`Timed out waiting for server health: ${lastError}`);
  }
  throw new Error('Timed out waiting for server health');
}

function resolveUiPath(appPath, ...segments) {
  return path.join(appPath, 'desktop', 'ui', ...segments);
}

async function promptForLocalPgUrl(userDataPath) {
  return new Promise((resolve, reject) => {
    const appPath = app.getAppPath();
    const preloadPath = path.join(appPath, 'desktop', 'preload.cjs');
    let resolved = false;
    setupWindow = new BrowserWindow({
      width: 520,
      height: 320,
      resizable: false,
      minimizable: false,
      maximizable: false,
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    setupWindow.webContents.on('did-fail-load', (_event, code, description) => {
      console.error('[desktop] setup window failed to load', code, description);
    });

    const cleanup = () => {
      ipcMain.removeHandler('config:read');
      ipcMain.removeHandler('config:save');
      ipcMain.removeHandler('app:getName');
    };

    ipcMain.handle('config:read', async () => {
      return await readConfig(userDataPath);
    });

    ipcMain.handle('app:getName', async () => appName);

    ipcMain.handle('config:save', async (_event, config) => {
      const nextConfig = { ...(await readConfig(userDataPath)), ...config };
      await writeConfig(userDataPath, nextConfig);
      cleanup();
      resolved = true;
      setupWindow.close();
      resolve(nextConfig);
    });

    setupWindow.on('closed', () => {
      cleanup();
      setupWindow = null;
      if (resolved) return;
      reject(new Error('Setup window closed before saving config'));
    });

    setupWindow.once('ready-to-show', () => {
      setupWindow.show();
      setupWindow.focus();
      setupWindow.webContents.focus();
    });
    setupWindow.loadFile(resolveUiPath(appPath, 'setup.html')).catch(reject);
  });
}

async function ensureConfig(userDataPath) {
  const config = await readConfig(userDataPath);
  if (config.LOCAL_PG_URL) return config;
  return await promptForLocalPgUrl(userDataPath);
}

async function ensureConfigWithDefault(userDataPath) {
  const config = await readConfig(userDataPath);
  if (config.LOCAL_PG_URL) {
    return { config, usedDefault: false };
  }
  return { config: { ...config, LOCAL_PG_URL: DEFAULT_LOCAL_PG_URL }, usedDefault: true };
}

async function createMainWindow(port) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width,
    height,
    show: false,
    webPreferences: {
      contextIsolation: true
    }
  });

  let didShow = false;
  const showWindow = () => {
    if (!mainWindow || didShow) return;
    didShow = true;
    mainWindow.show();
    mainWindow.focus();
  };

  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    console.error('[desktop] main window failed to load', code, description);
  });
  mainWindow.webContents.on('did-finish-load', () => {
    console.info('[desktop] main window finished load');
    showWindow();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const targetUrl = `http://127.0.0.1:${port}`;
  console.info('[desktop] loading main window', targetUrl);
  await mainWindow.loadURL(targetUrl);
  mainWindow.once('ready-to-show', () => {
    console.info('[desktop] main window ready to show');
    showWindow();
  });
  setTimeout(() => {
    if (!didShow) {
      console.warn('[desktop] main window show fallback');
      showWindow();
    }
  }, 1500);
  return mainWindow;
}

async function startApp() {
  isStarting = true;
  const userDataPath = app.getPath('userData');
  const appPath = app.getAppPath();
  await loadLocalEnv(appPath);
  appName = (process.env.NEXT_PUBLIC_APP_NAME ?? appName).trim() || appName;
  const { config: initialConfig, usedDefault } = await ensureConfigWithDefault(userDataPath);
  const resourceMigrations = path.join(process.resourcesPath, 'migrations');
  const resourceStandaloneServer = path.join(process.resourcesPath, 'standalone', 'server.js');
  const appMigrations = path.join(appPath, 'supabase', 'migrations');
  const migrationsDir =
    app.isPackaged && fsSync.existsSync(resourceMigrations) ? resourceMigrations : appMigrations;

  const runWithConfig = async (config) => {
    const port = await findOpenPort();
    const pgUser = process.env.USER ?? process.env.USERNAME ?? process.env.LOGNAME ?? null;
    const env = {
      RT_DESKTOP: '1',
      RT_PG_ADAPTER: config.RT_PG_ADAPTER ?? 'local',
      RT_STORE: config.RT_STORE ?? 'pg',
      LOCAL_PG_URL: config.LOCAL_PG_URL,
      ...(pgUser ? { PGUSER: pgUser } : {}),
      PGDATABASE: 'threds',
      RT_USER_DATA_PATH: userDataPath,
      RT_MIGRATIONS_DIR: migrationsDir,
      ...(app.isPackaged && fsSync.existsSync(resourceStandaloneServer)
        ? { DESKTOP_NEXT_SERVER_PATH: resourceStandaloneServer }
        : {}),
      RESEARCHTREE_PROJECTS_ROOT: config.RESEARCHTREE_PROJECTS_ROOT ?? path.join(userDataPath, 'projects'),
      RT_APP_ORIGIN: `http://127.0.0.1:${port}`
    };

    const { child } = startNextServer({ appPath, port, env });
    serverProcess = child;
    await waitForHealth(`http://127.0.0.1:${port}/api/health`);
    await createMainWindow(port);
    return { port };
  };

  try {
    await runWithConfig(initialConfig);
    if (usedDefault) {
      await writeConfig(userDataPath, initialConfig);
    }
  } catch (error) {
    if (usedDefault) {
      if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
      }
      const config = await promptForLocalPgUrl(userDataPath);
      await runWithConfig(config);
    } else {
      throw error;
    }
  } finally {
    isStarting = false;
  }
}

app.whenReady().then(() => {
  startApp().catch(async (error) => {
    const message = error instanceof Error ? error.message : 'Desktop app failed to start';
    console.error('[desktop] start failure', error);
    await dialog.showErrorBox(`${appName} failed to start`, message);
    app.quit();
  });
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

app.on('window-all-closed', () => {
  if (isStarting) return;
  app.quit();
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});
