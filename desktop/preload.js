import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopApi', {
  readConfig: () => ipcRenderer.invoke('config:read'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config)
});
