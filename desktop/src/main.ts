import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session } from 'electron';
import { basename, join } from 'node:path';
import { backendOrigin } from './config.js';
import { APP_ORIGIN, APP_SCHEME, createAppHandler, isAppPage, isAppUrl } from './protocol.js';
import { installNotifications } from './notifications.js';

app.setName('Minechat');
app.setAppUserModelId('ru.msrpo.minechat');
app.enableSandbox();
protocol.registerSchemesAsPrivileged([{
  scheme: APP_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

let window: BrowserWindow | null = null;
const lifetime = new AbortController();

function createWindow(): void {
  const current = new BrowserWindow({
    title: 'Minechat', width: 1280, height: 820, minWidth: 420, minHeight: 560,
    backgroundColor: '#252c23', show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      webSecurity: true, allowRunningInsecureContent: false, webviewTag: false,
      navigateOnDragDrop: false, devTools: !app.isPackaged,
    },
  });
  window = current;
  current.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  current.webContents.on('will-navigate', (event, url) => { if (!isAppPage(url)) event.preventDefault(); });
  current.webContents.on('will-redirect', (event) => event.preventDefault());
  current.webContents.on('will-attach-webview', (event) => event.preventDefault());
  current.once('ready-to-show', () => current.show());
  current.on('closed', () => { if (window === current) window = null; });
  void current.loadURL(`${APP_ORIGIN}/`).catch(() => {
    dialog.showErrorBox('Не удалось открыть Minechat', 'Не найдены ресурсы интерфейса. Выполните pnpm build в desktop/ или переустановите приложение.');
    current.close();
  });
}

function installMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { label: 'Файл', submenu: [{ role: 'close', label: 'Закрыть окно' }, { role: 'quit', label: 'Выйти' }] },
    { label: 'Правка', submenu: [
      { role: 'undo', label: 'Отменить' }, { role: 'redo', label: 'Повторить' }, { type: 'separator' },
      { role: 'cut', label: 'Вырезать' }, { role: 'copy', label: 'Копировать' },
      { role: 'paste', label: 'Вставить' }, { role: 'selectAll', label: 'Выделить всё' },
    ] },
    { label: 'Вид', submenu: [
      { role: 'reload', label: 'Перезагрузить (потребуется вход)' },
      { role: 'resetZoom', label: 'Исходный масштаб' }, { role: 'zoomIn', label: 'Увеличить' },
      { role: 'zoomOut', label: 'Уменьшить' }, { role: 'togglefullscreen', label: 'Полный экран' },
    ] },
  ]));
}

async function initialize(): Promise<void> {
  const upstream = await backendOrigin(app.isPackaged ? app.getPath('userData') : app.getAppPath(), app.isPackaged);
  const clearNotifications = installNotifications(upstream, () => window);
  app.on('web-contents-created', (_event, contents) => {
    contents.on('did-start-navigation', (_navigation, _url, isInPlace, isMainFrame) => { if (isMainFrame && !isInPlace) clearNotifications(); });
    contents.on('render-process-gone', clearNotifications);
    contents.on('destroyed', clearNotifications);
  });
  app.on('before-quit', clearNotifications);
  const realtime = new URL('/api/v1/ws', upstream);
  realtime.protocol = realtime.protocol === 'https:' ? 'wss:' : 'ws:';
  ipcMain.handle('minechat:realtime-url', (event) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
      || !isAppPage(event.senderFrame.url)) throw new Error('Источник запроса недоступен.');
    return realtime.href;
  });
  const handler = await createAppHandler(join(app.getAppPath(), 'renderer'), upstream, lifetime.signal);
  const currentSession = session.defaultSession;
  currentSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(permission === 'media' && contents === window?.webContents
      && details.isMainFrame && isAppPage(details.requestingUrl)
      && 'mediaTypes' in details && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio');
  });
  currentSession.setPermissionCheckHandler((contents, permission, origin, details) =>
    permission === 'media' && contents === window?.webContents
      && isAppUrl(origin) && details.isMainFrame
      && !!details.requestingUrl && isAppPage(details.requestingUrl)
      && details.mediaType === 'audio');
  currentSession.webRequest.onBeforeRequest((details, callback) => {
    const realtimeRequest = details.resourceType === 'webSocket' && details.url === realtime.href;
    callback({ cancel: !isAppUrl(details.url) && !details.url.startsWith(`blob:${APP_ORIGIN}/`) && !realtimeRequest });
  });
  currentSession.on('will-download', (event, item, contents) => {
    if (!window || contents !== window.webContents || !isAppPage(contents.getURL())
      || !item.getURL().startsWith(`blob:${APP_ORIGIN}/`)) {
      event.preventDefault(); return;
    }
    const filename = basename(item.getFilename()).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'attachment';
    item.setSaveDialogOptions({ title: 'Сохранить вложение', defaultPath: join(app.getPath('downloads'), filename) });
    item.once('done', (_event, state) => {
      if (state === 'interrupted') dialog.showErrorBox('Не удалось сохранить файл', 'Проверьте свободное место и доступ к папке. Повторите скачивание в сообщении.');
    });
  });
  currentSession.protocol.handle(APP_SCHEME, handler);
  installMenu();
  createWindow();
  app.on('activate', () => { if (!window) createWindow(); });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.show(); window?.focus();
  });
  void app.whenReady().then(initialize).catch((error: unknown) => {
    dialog.showErrorBox('Не удалось запустить Minechat', error instanceof Error ? error.message : 'Проверьте настройки и установку приложения.');
    app.quit();
  });
}
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => lifetime.abort());
