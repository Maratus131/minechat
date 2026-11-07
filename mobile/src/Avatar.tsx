import { useState } from 'react';
import { Image, StyleSheet, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { User } from '../../frontend/src/api/contracts';
import { downloadAvatar } from './files';
import { useSession } from './session';
import { colors, s } from './ui';

export function Avatar({ user, size = 44 }: { user: User; size?: number }) {
  const { api, auth } = useSession();
  const current = auth?.user.id === user.id ? auth.user : user;
  const avatarId = current.avatarId;
  const [failedId, setFailedId] = useState<string | null>(null);
  const image = useQuery({
    queryKey: ['avatar', current.id, avatarId],
    queryFn: () => downloadAvatar(api, current),
    enabled: !!avatarId,
    staleTime: Infinity,
  });
  if (avatarId && image.data && !image.error && failedId !== avatarId) {
    return <Image accessibilityLabel={`Аватар: ${current.displayName}`} source={{ uri: image.data }}
      onError={() => setFailedId(avatarId)} style={[styles.image, { width: size, height: size }]} />;
  }
  return <Text accessibilityLabel={`Аватар: ${current.displayName}`} style={[s.avatar, { width: size, height: size, lineHeight: size - 6 }]}>
    {Array.from(current.displayName.trim()).slice(0, 2).join('').toLocaleUpperCase('ru')}
  </Text>;
}

const styles = StyleSheet.create({
  image: { borderWidth: 3, borderTopColor: '#f1f1eb', borderLeftColor: '#f1f1eb', borderRightColor: '#4c622d', borderBottomColor: '#4c622d', backgroundColor: colors.accent },
});
