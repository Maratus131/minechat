import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { ApiError } from '../../api/client';
import type { Conversation, Page } from '../../api/contracts';
import { useSession } from '../auth/Session';

export function useConversations() {
  const { api } = useSession();
  return useInfiniteQuery({
    queryKey: ['conversations'],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => api.conversations(pageParam, signal),
    getNextPageParam: (last, pages) => last.hasMore ? pages.length : undefined,
    staleTime: 30_000,
  });
}

export function useConversation(id: string) {
  const { api } = useSession();
  const cache = useQueryClient();
  return useQuery({
    queryKey: ['conversation', id],
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const cached = cache.getQueryData<InfiniteData<Page<Conversation>>>(['conversations']);
      const existing = cached?.pages.flatMap((page) => page.items).find((item) => item.id === id);
      if (existing) return existing;
      // The API has no conversation-by-id endpoint; resolve a direct route through the user's list.
      for (let page = 0; !signal.aborted; page++) {
        const result = await api.conversations(page, signal);
        const found = result.items.find((item) => item.id === id);
        if (found) return found;
        if (!result.hasMore) break;
      }
      signal.throwIfAborted();
      throw new ApiError(404, 'Диалог недоступен. Вернитесь к списку или найдите собеседника.');
    },
  });
}
