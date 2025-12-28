const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApi', {
  readConfig: () => ipcRenderer.invoke('config:read'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  getAppName: () => ipcRenderer.invoke('app:getName')
});

window.addEventListener('DOMContentLoaded', () => {
  try {
    console.log('[desktop] preload loaded');
  } catch {
    // no-op
  }
});
