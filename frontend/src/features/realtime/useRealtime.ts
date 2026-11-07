import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '../auth/Session';
import { acceptDeletion, acceptMessage, recoverHistories } from '../messages/history';
import { consumeEvents, waitForReconnect } from './events';

export type Connection = 'connecting' | 'syncing' | 'live' | 'reconnecting';
export function useRealtime() {
  const { api } = useSession();
  const cache = useQueryClient();
  const [connection, setConnection] = useState<Connection>('connecting');
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    async function connect() {
      let attempt = 0;
      while (!signal.aborted) {
        let liveSince = 0;
        try {
          await consumeEvents(api, signal, async () => {
            if (signal.aborted) return;
            setConnection('syncing');
            await recoverHistories(cache, api, signal);
            if (!signal.aborted) { setConnection('live'); liveSince = Date.now(); }
          }, (message) => { if (!signal.aborted) acceptMessage(cache, message); },
          (conversationId, messageId) => { if (!signal.aborted) acceptDeletion(cache, conversationId, messageId); });
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
  }, [api, cache]);
  return connection;
}
