import type { ChatApi } from '../../api/client';
import type { Message } from '../../api/contracts';
import { consumeRealtime } from '../../api/realtime';

export function consumeEvents(api: ChatApi, signal: AbortSignal, onReady: (connectionSignal: AbortSignal) => Promise<void>, onMessage: (message: Message) => void,
  onDeletion: (conversationId: string, messageId: number) => void, onUpdated: (message: Message) => void = onMessage) {
  return consumeRealtime(() => api.createRealtimeSocket(signal), signal, onReady, onMessage, onDeletion, onUpdated);
}

export function waitForReconnect(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const finish = () => { window.clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = window.setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}
