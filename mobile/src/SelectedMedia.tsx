import { useEffect, useState } from 'react';
import { AppState, Image, StyleSheet, Text } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { colors, s } from './ui';

function SelectedVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  const status = useEvent(player, 'statusChange', { status: player.status });
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => { if (state !== 'active') player.pause(); });
    return () => listener.remove();
  }, [player]);
  return status.status === 'error' ? <Text style={s.ink}>Видео выбрано</Text> : <VideoView accessibilityLabel="Выбранное видео" player={player} nativeControls allowsPictureInPicture={false} style={styles.preview} />;
}

export function SelectedMedia({ uri, kind }: { uri: string; kind: 'image' | 'video' }) {
  const [failed, setFailed] = useState(false);
  if (kind === 'video') return <SelectedVideo uri={uri} />;
  return failed ? <Text style={s.ink}>Фото выбрано</Text> : <Image accessibilityLabel="Выбранное фото" source={{ uri }} resizeMode="contain" style={styles.preview} onError={() => setFailed(true)} />;
}

const styles = StyleSheet.create({ preview: { width: 160, height: 110, backgroundColor: colors.chat } });
