import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSession } from '../auth/Session';

export function useGroups() {
  const { api } = useSession();
  return useInfiniteQuery({ queryKey: ['groups'], initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => api.groups(pageParam, signal),
    getNextPageParam: (last, pages) => last.hasMore ? pages.length : undefined, staleTime: 30_000, refetchInterval: 30_000 });
}
export function useGroup(id: string) {
  const { api } = useSession();
  return useQuery({ queryKey: ['group', id], queryFn: ({ signal }) => api.group(id, signal), refetchInterval: 30_000 });
}
