import { ipcMain, Notification, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { isAppPage } from './protocol.js';
import { notificationClaims, parseNotification } from './notification-policy.js';

export function installNotifications(upstream: string, getWindow: () => BrowserWindow | null) {
  let session: { userId: string; expiresAt: number } | null = null;
  let revision = 0;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const shown = new Map<number, Notification>();
  const seen = new Set<number>();
  function clear() {
    revision++; session = null; clearTimeout(expiry);
    for (const notification of shown.values()) notification.close();
    shown.clear(); seen.clear();
  }
  function allowed(event: IpcMainInvokeEvent) {
    const window = getWindow();
    return !!window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame
      && isAppPage(event.senderFrame.url);
  }
  ipcMain.handle('minechat:notification-session', async (event, token: unknown) => {
    if (!allowed(event)) throw new Error('Источник запроса недоступен.');
    clear();
    if (token === null) return false;
    const claims = notificationClaims(token);
    if (!claims) return false;
    const attempt = revision;
    // Cryptographic validity, enabled user and JWT issuer/type are checked by the actual backend.
    const response = await fetch(new URL('/api/v1/users/me', upstream), {
      headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) { await response.body?.cancel(); return false; }
    const profile: unknown = await response.json();
    if (!allowed(event) || revision !== attempt || !profile || typeof profile !== 'object' || !('id' in profile)
      || profile.id !== claims.userId || claims.expiresAt <= Date.now()) return false;
    session = claims;
    expiry = setTimeout(clear, Math.min(2_147_483_647, claims.expiresAt - Date.now()));
    return Notification.isSupported();
  });
  ipcMain.handle('minechat:notify', (event, value: unknown) => {
    if (!allowed(event) || !session || session.expiresAt <= Date.now() || !Notification.isSupported()) return false;
    const payload = parseNotification(value, session.userId);
    const window = getWindow();
    if (!payload || !window || window.isFocused() || seen.has(payload.messageId)) return false;
    seen.add(payload.messageId);
    if (seen.size > 2000) seen.delete(seen.values().next().value!);
    const userId = session.userId;
    const notification = new Notification({ title: payload.title, body: 'Новое сообщение', silent: true });
    shown.set(payload.messageId, notification);
    notification.once('click', () => {
      if (!session || session.userId !== userId || session.expiresAt <= Date.now()) return;
      const target = getWindow();
      if (!target || target.isDestroyed()) return;
      if (target.isMinimized()) target.restore();
      target.show(); target.focus();
      target.webContents.send('minechat:notification-open', payload.url);
    });
    notification.once('close', () => shown.delete(payload.messageId));
    notification.once('failed', () => shown.delete(payload.messageId));
    notification.show();
    return true;
  });
  return clear;
}
