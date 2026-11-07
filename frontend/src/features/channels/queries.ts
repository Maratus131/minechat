import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSession } from '../auth/Session';

export function useChannels() {
  const { api } = useSession();
  return useInfiniteQuery({ queryKey: ['channels'], initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => api.channels(pageParam, signal),
    getNextPageParam: (last, pages) => last.hasMore ? pages.length : undefined, staleTime: 30_000 });
}
export function useChannel(id: string) {
  const { api } = useSession();
  return useQuery({ queryKey: ['channel', id], queryFn: ({ signal }) => api.channel(id, signal), refetchInterval: 30_000 });
}
