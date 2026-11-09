import type { ChatApi } from './api';
import type { Message } from '../../frontend/src/api/contracts';
import { consumeRealtime } from '../../frontend/src/api/realtime';

export function consumeEvents(api: ChatApi, signal: AbortSignal, onReady: (connectionSignal: AbortSignal) => Promise<void>, onMessage: (message: Message) => void,
  onDeleted: (conversationId: string, messageId: number) => void) {
  return consumeRealtime(() => api.createRealtimeSocket(signal), signal, onReady, onMessage, onDeleted);
}

export function waitForReconnect(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}

