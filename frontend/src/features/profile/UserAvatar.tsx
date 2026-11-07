import { useEffect, useState } from 'react';
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
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!avatar.data) return;
    const url = URL.createObjectURL(avatar.data);
    setImage({ blob: avatar.data, url });
    return () => URL.revokeObjectURL(url);
  }, [avatar.data]);
  return <Avatar name={user.displayName} imageUrl={image && image.blob === avatar.data ? image.url : null} />;
}
