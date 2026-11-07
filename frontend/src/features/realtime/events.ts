import type { ChatApi } from '../../api/client';
import { parseMessage, parseMessageDeleted, type Message } from '../../api/contracts';

export async function consumeEvents(api: ChatApi, signal: AbortSignal, onReady: () => Promise<void>, onMessage: (message: Message) => void,
  onDeletion: (conversationId: string, messageId: number) => void) {
  const idle = new AbortController();
  const combined = AbortSignal.any([signal, idle.signal]);
  let watchdog = window.setTimeout(() => idle.abort(), 65_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await api.request('/events', { signal: combined, headers: { Accept: 'text/event-stream' } });
    if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) throw new Error('Сервер не открыл поток сообщений.');
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let event = '';
    let data: string[] = [];
    while (!combined.aborted) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error('Соединение прервано.');
      window.clearTimeout(watchdog);
      watchdog = window.setTimeout(() => idle.abort(), 65_000);
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
            const deletion = parseMessageDeleted(value);
            onDeletion(deletion.conversationId, deletion.messageId);
          }
          event = '';
          data = [];
        } else if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
    }
  } finally {
    window.clearTimeout(watchdog);
    await reader?.cancel().catch(() => undefined);
    reader?.releaseLock();
  }
}

export function waitForReconnect(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const finish = () => { window.clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = window.setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}
