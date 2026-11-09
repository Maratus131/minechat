import { useQuery } from '@tanstack/react-query';
import type { User } from '../../api/contracts';
import { Avatar } from '../../shared/ui';
import { useSession } from '../auth/Session';

export function UserAvatar({ user }: { user: User }) {
  const { api } = useSession();
  const avatar = useQuery({
    queryKey: ['avatar', user.id, user.avatarId],
    queryFn: ({ signal }) => api.avatar(user.id, signal),
    enabled: user.avatarId !== null,
    staleTime: Infinity,
    retry: false,
  });
  return <Avatar name={user.displayName} imageBlob={avatar.data} />;
}
