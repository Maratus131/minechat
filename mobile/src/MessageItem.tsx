import { useEffect, useState } from 'react';
import { Alert, AppState, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import type { Attachment, Message } from '../../frontend/src/api/contracts';
import { useSession } from './session';
import { downloadFile, mediaType, shareFile } from './files';
import { errorMessage } from './api';
import { Button, colors, Notice, s } from './ui';
import { Avatar } from './Avatar';
import { AudioMessage } from './AudioMessage';
import { Icon } from './Icon';

function Video({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  const status = useEvent(player, 'statusChange', { status: player.status });
  useEffect(() => { const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') player.pause(); }); return () => subscription.remove(); }, [player]);
  return <>{status.status === 'error' ? <Text style={s.ink}>Видео не воспроизводится. Сохраните его как файл.</Text> : <VideoView accessibilityLabel="Видео" player={player} style={styles.media} nativeControls allowsPictureInPicture={false} />}</>;
}
function FileView({ file }: { file: Attachment }) {
  const { api } = useSession();
  const kind = mediaType(file.filename);
  const voice = kind === 'audio' && file.filename.startsWith('voice-');
  const visual = kind === 'image' || kind === 'video';
  const [failed, setFailed] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'loading'>('idle');
  const [error, setError] = useState('');
  const preview = useQuery({ queryKey: ['attachment', file.id], queryFn: () => downloadFile(api, file), enabled: !!kind, staleTime: Infinity });
  async function share() { setShareState('loading'); setError(''); try { await shareFile(api, file); } catch (failure) { setError(errorMessage(failure)); } finally { setShareState('idle'); } }
  return <View style={styles.file}>
    {kind && preview.isPending && <Text style={s.ink}>Загрузка медиа…</Text>}
    {kind === 'image' && preview.data && !failed && <Image accessibilityLabel="Фото" source={{ uri: preview.data }} resizeMode="contain" style={styles.media} onError={() => setFailed(true)} />}
    {kind === 'video' && preview.data && <Video uri={preview.data} />}
    {kind === 'audio' && preview.data && <AudioMessage uri={preview.data} sizeBytes={file.sizeBytes} />}
    {(failed || preview.error) && <Text style={s.ink}>Превью недоступно. Файл можно сохранить.</Text>}
    {!voice && !visual && <Text style={s.ink}>{file.filename} · {(file.sizeBytes / 1024).toFixed(1)} КиБ</Text>}
    {voice || visual ? <Pressable accessibilityRole="button" accessibilityLabel={voice ? 'Сохранить или поделиться голосовым' : kind === 'image' ? 'Сохранить или поделиться фото' : 'Сохранить или поделиться видео'} accessibilityState={{ disabled: shareState === 'loading' }} disabled={shareState === 'loading'} onPress={() => { void share(); }} style={styles.shareVoice}><Text style={styles.shareVoiceText}>{shareState === 'loading' ? 'Загрузка…' : '↓ Сохранить'}</Text></Pressable> : <Button title={shareState === 'loading' ? 'Загрузка…' : 'Сохранить / поделиться'} disabled={shareState === 'loading'} onPress={() => { void share(); }} />}
    {error && <Notice text={error} />}
  </View>;
}
export function MessageItem({ message, canDelete = false, deleting = false, onDelete }: { message: Message; canDelete?: boolean; deleting?: boolean; onDelete?: () => void }) {
  const { auth } = useSession(); const mine = message.sender.id === auth?.user.id;
  function confirmDelete() {
    if (!canDelete || !onDelete || deleting) return;
    Alert.alert('Удалить сообщение?', 'Его содержимое исчезнет у всех участников.', [
      { text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: onDelete },
    ]);
  }
  return <Pressable accessible={false} onLongPress={canDelete ? confirmDelete : undefined} style={[styles.bubble, mine ? styles.mine : styles.incoming]}>
    <View style={s.row}><Avatar user={message.sender} size={32} /><Text style={styles.name}>{mine ? auth?.user.displayName : message.sender.displayName}</Text></View>
    {message.deleted ? <Text style={s.ink}>Сообщение удалено</Text> : <>
      {!!message.text && <Text selectable style={s.ink}>{message.text}</Text>}
      {message.attachments.map((file) => <FileView key={file.id} file={file} />)}
    </>}
    <View style={styles.metadata}><Text style={styles.time}>{new Date(message.createdAt).toLocaleString('ru-RU')}</Text>
      {canDelete && onDelete && <Pressable accessibilityRole="button" accessibilityLabel={deleting ? 'Удаление сообщения…' : 'Удалить сообщение'} accessibilityState={{ disabled: deleting }} disabled={deleting} onPress={confirmDelete} style={styles.messageAction}><Icon name="more" color="#555c50" /></Pressable>}
    </View>
  </Pressable>;
}
const styles = StyleSheet.create({
  bubble: { padding: 12, gap: 8, marginVertical: 5, marginHorizontal: 10, maxWidth: '92%', borderWidth: 2, borderColor: '#1c2418' },
  mine: { backgroundColor: colors.mine, alignSelf: 'flex-end' }, incoming: { backgroundColor: colors.incoming, alignSelf: 'flex-start' },
  name: { color: '#425c24', fontFamily: 'RobotoMono_400Regular', fontSize: 12 }, time: { fontFamily: 'RobotoMono_400Regular', color: '#555c50', fontSize: 10 },
  metadata: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }, messageAction: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  media: { width: 250, maxWidth: '100%', height: 180, backgroundColor: colors.chat }, file: { gap: 6, maxWidth: '100%' },
  shareVoice: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-end', paddingHorizontal: 8 },
  shareVoiceText: { color: '#425c24', fontFamily: 'RobotoMono_400Regular', fontSize: 10 },
});
