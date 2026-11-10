import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '../auth/Session';
import { acceptDeletion, acceptMessage, recoverHistories, historyKey, type History } from '../messages/history';
import { consumeEvents, waitForReconnect } from './events';
import { useNotifications } from '../notifications/Notifications';

export type Connection = 'connecting' | 'syncing' | 'live' | 'reconnecting';
export function useRealtime() {
  const { api, expiresAt } = useSession();
  const cache = useQueryClient();
  const { incoming } = useNotifications();
  const [connection, setConnection] = useState<Connection>('connecting');
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    async function connect() {
      let attempt = 0;
      while (!signal.aborted) {
        let liveSince = 0;
        try {
          await consumeEvents(api, signal, async (connectionSignal) => {
            if (connectionSignal.aborted) return;
            setConnection('syncing');
            await recoverHistories(cache, api, connectionSignal);
            if (!connectionSignal.aborted) { setConnection('live'); liveSince = Date.now(); }
          }, (message) => {
            if (signal.aborted) return;
            const alreadyLoaded = cache.getQueryData<History>(historyKey(message.conversationId))?.items.some((item) => item.id === message.id) === true;
            acceptMessage(cache, message);
            incoming(message, alreadyLoaded);
          },
          (conversationId, messageId) => { if (!signal.aborted) acceptDeletion(cache, conversationId, messageId); },
          (message) => { if (!signal.aborted) acceptMessage(cache, message); });
        } catch {
          if (signal.aborted) break;
          setConnection('reconnecting');
        }
        if (Date.now() - liveSince > 30_000 && liveSince !== 0) attempt = 0;
        await waitForReconnect(Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)), signal);
      }
    }
    void connect();
    return () => controller.abort();
  }, [api, expiresAt, cache, incoming]);
  return connection;
}
