import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { ChatApi } from '../../api/client';
import type { Message, Page } from '../../api/contracts';
import { useSession } from '../auth/Session';

export const historyKey = (id: string) => ['history', id] as const;
export interface History extends Page<Message> { syncedThrough: number }
export function mergeMessages(...batches: Message[][]): Message[] {
  return [...new Map(batches.flat().map((item) => [item.id, item])).values()].sort((a, b) => a.id - b.id);
}

export async function refreshConversations(cache: QueryClient) {
  const queries = ['conversations', 'groups', 'channels'].map((name) => ({ key: [name], query: cache.getQueryCache().find({ queryKey: [name] }) }));
  // Invalidation alone can reuse an initial snapshot that predates this event.
  await Promise.all(queries.map(async ({ query }) => {
    if (query && !query.state.data && query.promise) await query.promise.catch(() => undefined);
  }));
  if (queries.some(({ key, query }) => query && cache.getQueryCache().find({ queryKey: key }) !== query)) return;
  await Promise.all([
    cache.invalidateQueries({ queryKey: ['conversations'] }),
    cache.invalidateQueries({ queryKey: ['groups'] }),
    cache.invalidateQueries({ queryKey: ['group'] }),
    cache.invalidateQueries({ queryKey: ['channels'] }),
    cache.invalidateQueries({ queryKey: ['channel'] }),
    cache.invalidateQueries({ queryKey: ['channel-search'] }),
  ]);
}

export function acceptDeletion(cache: QueryClient, conversationId: string, messageId: number) {
  const key = historyKey(conversationId);
  const apply = () => cache.setQueryData<History>(key, (existing) => existing ? {
    ...existing,
    items: existing.items.map((message) => message.id === messageId
      ? { ...message, text: '', attachments: [], deleted: true } : message),
  } : undefined);
  if (cache.getQueryData(key)) apply();
  else {
    const query = cache.getQueryCache().find({ queryKey: key });
    void query?.promise?.then(() => {
      if (cache.getQueryCache().find({ queryKey: key }) === query) apply();
    }).catch(() => undefined);
  }
  void cache.invalidateQueries({ queryKey: ['message-search', conversationId] });
  void refreshConversations(cache);
}

export function historyOptions(cache: QueryClient, api: ChatApi, id: string) {
  return {
    queryKey: historyKey(id),
    staleTime: Infinity,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<History> => {
      const page = await api.history(id, {}, signal);
      const existing = cache.getQueryData<History>(historyKey(id));
      return { items: mergeMessages(page.items, existing?.items ?? []), hasMore: existing?.hasMore ?? page.hasMore,
        syncedThrough: existing?.syncedThrough ?? Math.max(0, ...page.items.map((message) => message.id)) };
    },
  };
}

export function acceptMessage(cache: QueryClient, message: Message) {
  const key = historyKey(message.conversationId);
  const append = () => cache.setQueryData<History>(key, (existing) => existing
    ? { ...existing, items: mergeMessages(existing.items, [message]) } : undefined);
  // A message can arrive while the initial REST snapshot is still in flight.
  if (cache.getQueryData(key)) append();
  else {
    const query = cache.getQueryCache().find({ queryKey: key });
    void query?.promise?.then(() => {
      if (cache.getQueryCache().find({ queryKey: key }) === query) append();
    }).catch(() => undefined);
  }
  void refreshConversations(cache);
}

export async function recoverHistory(cache: QueryClient, api: ChatApi, id: string, signal: AbortSignal) {
    signal.throwIfAborted();
    // Await an in-flight initial history before choosing the catch-up cursor.
    const data = await cache.fetchQuery(historyOptions(cache, api, id));
    signal.throwIfAborted();
    // Local sends/SSE may be newer than missed messages, so use REST coverage, not the largest visible ID.
    let afterId = data.syncedThrough;
    while (!signal.aborted) {
      const page = await api.history(id, { afterId }, signal);
      signal.throwIfAborted();
      const next = page.items.at(-1)?.id;
      cache.setQueryData<History>(historyKey(id), (current) => current
        ? { ...current, items: mergeMessages(current.items, page.items), syncedThrough: next ?? afterId } : undefined);
      if (!page.hasMore) break;
      if (next === undefined || next <= afterId) throw new Error('Не удалось восстановить историю. Повторяем подключение.');
      afterId = next;
    }
}

export async function recoverHistories(cache: QueryClient, api: ChatApi, signal: AbortSignal) {
  const histories = cache.getQueryCache().findAll({ queryKey: ['history'] });
  await Promise.all(histories.map(async (query) => {
    const id = query.queryKey[1];
    if (typeof id === 'string') await recoverHistory(cache, api, id, signal);
  }));
  signal.throwIfAborted();
  await refreshConversations(cache);
}

export function useHistory(id: string) {
  const { api } = useSession();
  const cache = useQueryClient();
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), [id]);
  const history = useQuery(historyOptions(cache, api, id));
  const older = useMutation({
    mutationFn: async () => {
      const existing = cache.getQueryData<History>(historyKey(id));
      const beforeId = existing?.items[0]?.id;
      if (!beforeId || !existing?.hasMore) return;
      request.current = new AbortController();
      const page = await api.history(id, { beforeId }, request.current.signal);
      request.current.signal.throwIfAborted();
      cache.setQueryData<History>(historyKey(id), (current) => current
        ? { ...current, items: mergeMessages(page.items, current.items), hasMore: page.hasMore } : undefined);
    },
  });
  return { history, older };
}
