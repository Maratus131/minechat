import { useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Button, s } from './ui';

export function audioTime(seconds: number) {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export function AudioMessage({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const [error, setError] = useState('');
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
  return <View style={{ gap: 6 }}>
    <Text style={s.ink}>Голосовое / аудио · {audioTime(status.currentTime)} / {audioTime(status.duration)}</Text>
    <View style={[s.row, { flexWrap: 'wrap' }]}>
      <Button title={status.playing ? 'Пауза' : 'Слушать'} disabled={!status.isLoaded} onPress={() => { void play(); }} />
      <Button title="−10 с" disabled={!status.isLoaded} onPress={() => { void player.seekTo(Math.max(0, status.currentTime - 10)).catch(() => setError('Не удалось перемотать аудио.')); }} />
      <Button title="+10 с" disabled={!status.isLoaded} onPress={() => { void player.seekTo(Math.min(status.duration, status.currentTime + 10)).catch(() => setError('Не удалось перемотать аудио.')); }} />
    </View>
    {!status.isLoaded && <Text style={s.ink}>Аудио загружается. Если формат не поддерживается, сохраните файл.</Text>}
    {!!error && <Text accessibilityRole="alert" style={s.ink}>{error}</Text>}
  </View>;
}
