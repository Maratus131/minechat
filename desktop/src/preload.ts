import { contextBridge, ipcRenderer } from 'electron';

// The renderer can read only the configured realtime endpoint, never arbitrary IPC or credentials.
contextBridge.exposeInMainWorld('minechat', Object.freeze({
  getRealtimeUrl: (): Promise<string> => ipcRenderer.invoke('minechat:realtime-url'),
}));
