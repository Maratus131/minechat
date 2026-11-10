import { contextBridge, ipcRenderer } from 'electron';

// Narrow, sender-validated operations only. Never expose arbitrary IPC or the filesystem.
contextBridge.exposeInMainWorld('minechat', Object.freeze({
  getRealtimeUrl: (): Promise<string> => ipcRenderer.invoke('minechat:realtime-url'),
  getSessionPersistence: (): Promise<'encrypted' | 'memory'> => ipcRenderer.invoke('minechat:session-persistence'),
  setNotificationSession: (token: string | null): Promise<boolean> => ipcRenderer.invoke('minechat:notification-session', token),
  notify: (notification: unknown): Promise<boolean> => ipcRenderer.invoke('minechat:notify', notification),
  onNotificationOpen: (callback: (url: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, url: unknown) => { if (typeof url === 'string') callback(url); };
    ipcRenderer.on('minechat:notification-open', listener);
    return () => ipcRenderer.removeListener('minechat:notification-open', listener);
  },
}));
