import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from './session';
import { consumeEvents, waitForReconnect } from './events';
import { acceptDeletion, acceptMessage, historyKey, recoverHistories, type History } from './history';
import { useNotificationSound } from './NotificationSound';

export function useRealtime() {
  const { api, auth } = useSession();
  const cache = useQueryClient();
  const { incoming } = useNotificationSound();
  const sound = useRef(incoming); sound.current = incoming;
  const [connection, setConnection] = useState('Подключение…');
  useEffect(() => {
    if (!auth) return;
    let active: AbortController | undefined;
    function start() {
      active?.abort();
      const controller = new AbortController(); active = controller;
      const signal = controller.signal;
      void (async () => {
        let attempt = 0;
        while (!signal.aborted) {
          try {
            setConnection('Подключение…');
            await consumeEvents(api, signal, async (connectionSignal) => {
              if (connectionSignal.aborted) return;
              setConnection('Восстановление истории…');
              await recoverHistories(cache, api, connectionSignal);
              if (!connectionSignal.aborted) { setConnection('Подключено'); attempt = 0; }
            }, (message) => {
              if (signal.aborted) return;
              const alreadyLoaded = cache.getQueryData<History>(historyKey(message.conversationId))?.items.some((item) => item.id === message.id) ?? false;
              sound.current(message, alreadyLoaded);
              acceptMessage(cache, message);
            }, (conversationId, messageId) => { if (!signal.aborted) acceptDeletion(cache, conversationId, messageId); },
            (message) => { if (!signal.aborted) acceptMessage(cache, message); });
          } catch { if (signal.aborted) return; setConnection('Связь потеряна. Переподключение…'); }
          await waitForReconnect(Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)), signal);
        }
      })();
    }
    if (AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') start(); else { active?.abort(); setConnection('Приостановлено'); }
    });
    return () => { active?.abort(); subscription.remove(); };
  }, [api, cache, auth]);
  return connection;
}
