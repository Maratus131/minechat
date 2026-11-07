import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { colors, s } from './ui';

export function audioTime(seconds: number) {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export function AudioMessage({ uri, sizeBytes }: { uri: string; sizeBytes?: number }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const [error, setError] = useState('');
  const [trackWidth, setTrackWidth] = useState(0);
  const duration = Number.isFinite(status.duration) ? Math.max(0, status.duration) : 0;
  const position = Number.isFinite(status.currentTime) ? Math.max(0, Math.min(status.currentTime, duration)) : 0;
  const progress = duration > 0 ? position / duration : 0;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') player.pause(); });
    return () => subscription.remove();
  }, [player]);
  async function play() {
    setError('');
    try {
      if (status.playing) player.pause();
      else { if (status.didJustFinish || status.currentTime >= status.duration) await player.seekTo(0); player.play(); }
    } catch { setError('Не удалось воспроизвести аудио. Его можно сохранить и открыть другим плеером.'); }
  }
  function seek(seconds: number) {
    if (!status.isLoaded || !duration) return;
    setError('');
    void player.seekTo(Math.max(0, Math.min(duration, seconds))).catch(() => setError('Не удалось перемотать аудио.'));
  }
  return <View style={styles.player}>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? 'Приостановить аудио' : 'Воспроизвести аудио'} accessibilityState={{ disabled: !status.isLoaded }} disabled={!status.isLoaded} onPress={() => { void play(); }} style={({ pressed }) => [styles.play, (!status.isLoaded || pressed) && styles.dim]}>
        <Text accessible={false} style={styles.playIcon}>{status.playing ? 'Ⅱ' : '▶'}</Text>
      </Pressable>
      <View style={styles.details}>
        <Pressable accessibilityRole="adjustable" accessibilityLabel="Позиция воспроизведения" accessibilityState={{ disabled: !status.isLoaded }} accessibilityValue={{ min: 0, max: Math.max(1, Math.ceil(duration)), now: Math.floor(position), text: `${audioTime(position)} из ${audioTime(duration)}` }} accessibilityActions={[{ name: 'increment', label: 'Вперёд на 10 секунд' }, { name: 'decrement', label: 'Назад на 10 секунд' }]} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'increment') seek(position + 10); else if (event.nativeEvent.actionName === 'decrement') seek(position - 10); }} disabled={!status.isLoaded || !duration} onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)} onPress={(event) => { if (trackWidth > 0) seek(event.nativeEvent.locationX / trackWidth * duration); }} style={styles.track}>
          <View pointerEvents="none" accessible={false} style={styles.bars}>{Array.from({ length: 36 }, (_, index) => <View key={index} style={[styles.bar, (index + 0.5) / 36 <= progress && styles.played]} />)}</View>
        </Pressable>
        <Text style={styles.meta}>{status.isLoaded ? `${audioTime(position)} / ${audioTime(duration)}` : 'Загрузка…'}{sizeBytes !== undefined ? ` · ${(sizeBytes / 1024).toFixed(1)} КиБ` : ''}</Text>
      </View>
    </View>
    {!!error && <Text accessibilityRole="alert" style={s.ink}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  player: { width: 250, maxWidth: '100%', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  play: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderWidth: 2, borderColor: '#425c24' },
  playIcon: { color: colors.ink, fontSize: 23, lineHeight: 28 },
  dim: { opacity: 0.5 },
  details: { flex: 1, minWidth: 0 },
  track: { minHeight: 44, justifyContent: 'center' },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 20 },
  bar: { flex: 1, minWidth: 1, height: 12, backgroundColor: '#9aab7c' },
  played: { backgroundColor: '#425c24' },
  meta: { color: '#425c24', fontFamily: 'RobotoMono_400Regular', fontSize: 10, lineHeight: 16 },
});
