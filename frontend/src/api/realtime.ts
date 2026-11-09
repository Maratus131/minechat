import { parseRealtimeFrame, type Message } from './contracts';

/** Shared by browser, Electron renderer and React Native; transport auth belongs to ChatApi. */
export async function consumeRealtime(open: () => Promise<WebSocket>, signal: AbortSignal,
  onReady: (connectionSignal: AbortSignal) => Promise<void>, onMessage: (message: Message) => void,
  onDeleted: (conversationId: string, messageId: number) => void): Promise<void> {
  if (signal.aborted) throw new Error('Соединение остановлено.');
  const socket = await open();
  if (signal.aborted) { socket.close(); throw new Error('Соединение остановлено.'); }
  const connection = new AbortController();
  return new Promise<void>((_resolve, reject) => {
    let ended = false;
    let ready = false;
    let queued = 0;
    let queue = Promise.resolve();
    let watchdog: ReturnType<typeof setTimeout>;
    function finish(error: Error) {
      if (ended) return;
      ended = true;
      connection.abort();
      clearTimeout(watchdog);
      signal.removeEventListener('abort', abort);
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
      reject(error);
    }
    function abort() { finish(new Error('Соединение остановлено.')); }
    function resetWatchdog() {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => finish(new Error('Сервер не отвечает.')), 65_000);
    }
    signal.addEventListener('abort', abort, { once: true });
    socket.onerror = () => finish(new Error('Не удалось подключиться к серверу сообщений.'));
    socket.onclose = () => finish(new Error('Соединение прервано.'));
    socket.onmessage = (event) => {
      if (ended) return;
      if (typeof event.data !== 'string' || event.data.length > 1_000_000 || ++queued > 1000) {
        finish(new Error('Некорректный поток сообщений.')); return;
      }
      const text = event.data;
      resetWatchdog();
      queue = queue.then(async () => {
        if (ended || signal.aborted) return;
        const frame = parseRealtimeFrame(JSON.parse(text));
        if (frame.event === 'ready') {
          if (ready) throw new Error('Повторная авторизация соединения.');
          ready = true;
          await onReady(connection.signal);
        } else if (!ready) throw new Error('Соединение ещё не авторизовано.');
        else if (frame.event === 'message.created') onMessage(frame.data);
        else if (frame.event === 'message.deleted') onDeleted(frame.data.conversationId, frame.data.messageId);
      }).catch((error: unknown) => finish(error instanceof Error ? error : new Error('Ошибка потока сообщений.')))
        .finally(() => { queued--; });
    };
    resetWatchdog();
  });
}
