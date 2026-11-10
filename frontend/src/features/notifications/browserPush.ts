import type { ChatApi } from '../../api/client';

export interface PushBinding { userId: string; sessionId: string; expiresAt: number; sound: boolean; enabled: boolean }

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(new Error('Не удалось подключить фоновую доставку вовремя. Повторите попытку.')); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    operation.then((value) => { signal.removeEventListener('abort', abort); resolve(value); }, (error) => { signal.removeEventListener('abort', abort); reject(error); });
  });
}

export async function bindPushWorker(binding: PushBinding | null, expectedSessionId?: string, signal?: AbortSignal) {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const worker = registration?.active;
  if (!worker || signal?.aborted) return;
  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => { channel.port1.close(); resolve(); }, 1500);
    channel.port1.onmessage = () => { window.clearTimeout(timer); channel.port1.close(); resolve(); };
    worker.postMessage({ type: 'minechat:binding', binding, expectedSessionId }, [channel.port2]);
  });
}

export async function registerWebPush(api: ChatApi, signal: AbortSignal): Promise<string | null> {
  const { webPushPublicKey } = await api.notificationConfig(signal);
  if (!webPushPublicKey) return null;
  if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Фоновые уведомления доступны в поддерживаемом браузере через HTTPS.');
  }
  await abortable(navigator.serviceWorker.register('/notifications-sw.js', { scope: '/' }), signal);
  const registration = await abortable(navigator.serviceWorker.ready, signal);
  signal.throwIfAborted();
  const bytes = Uint8Array.from(atob(webPushPublicKey.replace(/-/g, '+').replace(/_/g, '/')), (character) => character.charCodeAt(0));
  let subscription = await abortable(registration.pushManager.getSubscription(), signal);
  if (!subscription) subscription = await abortable(registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes }), signal);
  signal.throwIfAborted();
  await api.subscribeWebPush(subscription, signal);
  signal.throwIfAborted();
  return subscription.endpoint;
}
