import type { ChatApi } from './api';
import { combineAbortSignals } from './abort';
import { parseMessage, type Message } from '../../frontend/src/api/contracts';

export async function consumeEvents(api: ChatApi, signal: AbortSignal, onReady: () => Promise<void>, onMessage: (message: Message) => void,
  onDeleted: (conversationId: string, messageId: number) => void) {
  const idle = new AbortController();
  const combined = combineAbortSignals(signal, idle.signal);
  let watchdog = setTimeout(() => idle.abort(), 65_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    await api.request('/events', { signal: combined.signal, headers: { Accept: 'text/event-stream' } }, async (response) => {
      if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) throw new Error('Сервер не открыл поток сообщений.');
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let event = '';
      let data: string[] = [];
      while (!combined.signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error('Соединение прервано.');
        clearTimeout(watchdog);
        watchdog = setTimeout(() => idle.abort(), 65_000);
        buffer += decoder.decode(chunk.value, { stream: true });
        if (buffer.length > 1_000_000) throw new Error('Некорректный поток сообщений.');
        let newline: number;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newline).replace(/\r$/, '');
          buffer = buffer.slice(newline + 1);
          if (line === '') {
            if (event === 'ready') await onReady();
            else if (event === 'message.created') {
              const value: unknown = JSON.parse(data.join('\n'));
              onMessage(parseMessage(value));
            } else if (event === 'message.deleted') {
              const value: unknown = JSON.parse(data.join('\n'));
              if (!value || typeof value !== 'object' || !('conversationId' in value) || !('messageId' in value)
                || typeof value.conversationId !== 'string' || !/^[\da-f-]{36}$/i.test(value.conversationId)
                || !Number.isSafeInteger(value.messageId)) throw new Error('Некорректное событие удаления сообщения.');
              onDeleted(value.conversationId, value.messageId as number);
            }
            event = '';
            data = [];
          } else if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
        }
      }
    });
  } finally {
    clearTimeout(watchdog);
    await reader?.cancel().catch(() => undefined);
    reader?.releaseLock();
    combined.cleanup();
  }
}

export function waitForReconnect(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}

