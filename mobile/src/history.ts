import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { ChatApi } from './api';
import type { Message, Page } from '../../frontend/src/api/contracts';
import { useSession } from './session';
import { throwIfAborted } from './abort';

export const historyKey = (id: string) => ['history', id] as const;
export interface History extends Page<Message> { syncedThrough: number }
export function mergeMessages(...batches: Message[][]): Message[] {
  return [...new Map(batches.flat().map((item) => [item.id, item])).values()].sort((a, b) => a.id - b.id);
}

export async function refreshConversations(cache: QueryClient) {
  const queries = ['conversations', 'channels', 'groups'].map((name) => ({ key: [name], query: cache.getQueryCache().find({ queryKey: [name] }) }));
  // Invalidation alone can reuse an initial snapshot that predates this event.
  await Promise.all(queries.map(async ({ query }) => {
    if (query && !query.state.data && query.promise) await query.promise.catch(() => undefined);
  }));
  if (queries.some(({ key, query }) => query && cache.getQueryCache().find({ queryKey: key }) !== query)) return;
  await Promise.all([
    cache.invalidateQueries({ queryKey: ['conversations'] }),
    cache.invalidateQueries({ queryKey: ['channels'] }),
    cache.invalidateQueries({ queryKey: ['groups'] }),
    cache.invalidateQueries({ queryKey: ['group'] }),
    cache.invalidateQueries({ queryKey: ['channel'] }),
    cache.invalidateQueries({ queryKey: ['channel-search'] }),
  ]);
}

export function historyOptions(cache: QueryClient, api: ChatApi, id: string) {
  return {
    queryKey: historyKey(id),
    staleTime: Infinity,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<History> => {
      const page = await api.history(id, {}, signal);
      const existing = cache.getQueryData<History>(historyKey(id));
      return { items: mergeMessages(existing?.items ?? [], page.items), hasMore: existing?.hasMore ?? page.hasMore,
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

export function acceptDeletion(cache: QueryClient, conversationId: string, messageId: number) {
  cache.setQueryData<History>(historyKey(conversationId), (current) => current ? {
    ...current,
    items: current.items.map((message) => message.id === messageId ? { ...message, text: '', attachments: [], deleted: true } : message),
  } : undefined);
  void cache.invalidateQueries({ queryKey: ['message-search', conversationId] });
  void cache.invalidateQueries({ queryKey: historyKey(conversationId) });
  void refreshConversations(cache);
}

export async function recoverHistory(cache: QueryClient, api: ChatApi, id: string, signal: AbortSignal) {
    throwIfAborted(signal);
    // Await an in-flight initial history before choosing the catch-up cursor.
    const data = await cache.fetchQuery(historyOptions(cache, api, id));
    throwIfAborted(signal);
    // Refresh the visible page too: a deletion made while offline has no new message ID.
    const latest = await api.history(id, {}, signal);
    throwIfAborted(signal);
    cache.setQueryData<History>(historyKey(id), (current) => current
      ? { ...current, items: mergeMessages(current.items, latest.items) } : undefined);
    // Local sends/realtime events may be newer than missed messages, so use REST coverage, not the largest visible ID.
    let afterId = data.syncedThrough;
    while (!signal.aborted) {
      const page = await api.history(id, { afterId }, signal);
      throwIfAborted(signal);
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
  throwIfAborted(signal);
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
      throwIfAborted(request.current.signal);
      cache.setQueryData<History>(historyKey(id), (current) => current
        ? { ...current, items: mergeMessages(page.items, current.items), hasMore: page.hasMore } : undefined);
    },
  });
  return { history, older };
}

