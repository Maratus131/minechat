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
import { ActionSheet, type SheetAction } from './ActionSheet';
import { MessageEditor } from './MessageEditor';

function Video({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  const status = useEvent(player, 'statusChange', { status: player.status });
  useEffect(() => { const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') player.pause(); }); return () => subscription.remove(); }, [player]);
  return <>{status.status === 'error' ? <Text style={s.ink}>Видео не воспроизводится. Сохраните его как файл.</Text> : <VideoView accessibilityLabel="Видео" player={player} style={styles.media} nativeControls allowsPictureInPicture={false} />}</>;
}
function FileView({ file, onPhotoMenu, photoLabel }: { file: Attachment; onPhotoMenu: () => void; photoLabel: string }) {
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
    {kind === 'image' && <Pressable accessibilityRole="imagebutton" accessibilityLabel={photoLabel} accessibilityHint="Долгое нажатие открывает действия с фото" onLongPress={onPhotoMenu} accessibilityActions={[{ name: 'longpress', label: 'Действия с фото' }]} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') onPhotoMenu(); }}>
      {preview.data && !failed ? <Image accessible={false} source={{ uri: preview.data }} resizeMode="contain" style={styles.media} onError={() => setFailed(true)} /> : <Text style={s.ink}>{photoLabel}</Text>}
    </Pressable>}
    {kind === 'video' && preview.data && <Video uri={preview.data} />}
    {kind === 'audio' && preview.data && <AudioMessage uri={preview.data} sizeBytes={file.sizeBytes} />}
    {(failed || preview.error) && <Text style={s.ink}>Превью недоступно. Файл можно сохранить.</Text>}
    {!voice && !visual && <Text style={s.ink}>{file.filename} · {(file.sizeBytes / 1024).toFixed(1)} КиБ</Text>}
    {kind === 'image' ? null : voice || visual ? <Pressable accessibilityRole="button" accessibilityLabel={voice ? 'Сохранить или поделиться голосовым' : 'Сохранить или поделиться видео'} accessibilityState={{ disabled: shareState === 'loading' }} disabled={shareState === 'loading'} onPress={() => { void share(); }} style={styles.shareVoice}><Text style={styles.shareVoiceText}>{shareState === 'loading' ? 'Загрузка…' : '↓ Сохранить'}</Text></Pressable> : <Button title={shareState === 'loading' ? 'Загрузка…' : 'Сохранить / поделиться'} disabled={shareState === 'loading'} onPress={() => { void share(); }} />}
    {error && <Notice text={error} />}
  </View>;
}
export function MessageItem({ message, canDelete = false, deleting = false, onDelete, canEdit = false }: { message: Message; canDelete?: boolean; deleting?: boolean; onDelete?: () => void; canEdit?: boolean }) {
  const { auth, api } = useSession(); const mine = message.sender.id === auth?.user.id;
  const [menu, setMenu] = useState<{ photo?: Attachment } | null>(null);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState('');
  const photos = message.deleted ? [] : message.attachments.filter((file) => mediaType(file.filename) === 'image');
  function confirmDelete() {
    if (!canDelete || !onDelete || deleting || message.deleted) return;
    Alert.alert('Удалить сообщение?', 'Его содержимое исчезнет у всех участников.', [
      { text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: onDelete },
    ]);
  }
  async function savePhoto(file: Attachment) {
    setSharing(true); setShareError('');
    try { await shareFile(api, file); } catch (error) { setShareError(errorMessage(error)); } finally { setSharing(false); }
  }
  const actions: SheetAction[] = [];
  if (!message.deleted) {
    if (canEdit && mine) actions.push({ title: 'Изменить', onPress: () => setEditing(true) });
    const selectedPhotos = menu?.photo ? photos.filter((photo) => photo.id === menu.photo?.id) : photos;
    selectedPhotos.forEach((file) => actions.push({ title: selectedPhotos.length === 1 ? 'Сохранить / поделиться фото' : `Сохранить фото ${photos.indexOf(file) + 1}`, disabled: sharing, onPress: () => { void savePhoto(file); } }));
    if (canDelete && onDelete) actions.push({ title: 'Удалить', destructive: true, disabled: deleting, onPress: confirmDelete });
  }
  const hasActions = !message.deleted && (canEdit && mine || canDelete && !!onDelete || photos.length > 0);
  function openMenu() { if (hasActions) setMenu({}); }
  return <View>
    <Pressable accessible={false} onLongPress={hasActions ? openMenu : undefined} style={[styles.bubble, mine ? styles.mine : styles.incoming]}>
      <Pressable accessible accessibilityLabel={`${message.sender.displayName}: ${message.deleted ? 'Сообщение удалено' : message.text || 'Сообщение с вложениями'}`} accessibilityHint={hasActions ? 'Долгое нажатие открывает действия с сообщением' : undefined}
        accessibilityActions={hasActions ? [{ name: 'longpress', label: 'Действия с сообщением' }] : undefined} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'longpress') openMenu(); }} onLongPress={hasActions ? openMenu : undefined}>
        <View style={s.row}><Avatar user={message.sender} size={32} /><Text style={styles.name}>{mine ? auth?.user.displayName : message.sender.displayName}</Text></View>
        {message.deleted ? <Text style={s.ink}>Сообщение удалено</Text> : !!message.text && <Text selectable={!hasActions} style={s.ink}>{message.text}</Text>}
      </Pressable>
      {!message.deleted && message.attachments.map((file) => <FileView key={file.id} file={file} photoLabel={photos.length > 1 ? `Фото ${photos.indexOf(file) + 1} из ${photos.length}` : 'Фото'} onPhotoMenu={() => setMenu({ photo: file })} />)}
      <View style={styles.metadata}><Text style={styles.time}>{new Date(message.createdAt).toLocaleString('ru-RU')}{message.editedAt ? ' · изменено' : ''}</Text></View>
      {sharing && <Text style={s.ink}>Подготовка фото…</Text>}
      {!!shareError && <Notice text={shareError} />}
    </Pressable>
    <ActionSheet title={menu?.photo ? photos.length > 1 ? `Фото ${photos.findIndex((photo) => photo.id === menu.photo?.id) + 1} из ${photos.length}` : 'Фото' : 'Сообщение'} visible={menu !== null} onClose={() => setMenu(null)} actions={actions} />
    {editing && <MessageEditor message={message} allowed={canEdit && mine} onClose={() => setEditing(false)} />}
  </View>;
}
const styles = StyleSheet.create({
  bubble: { padding: 12, gap: 8, marginVertical: 5, marginHorizontal: 10, maxWidth: '92%', borderWidth: 2, borderColor: '#1c2418' },
  mine: { backgroundColor: colors.mine, alignSelf: 'flex-end' }, incoming: { backgroundColor: colors.incoming, alignSelf: 'flex-start' },
  name: { color: '#425c24', fontFamily: 'RobotoMono_400Regular', fontSize: 12 }, time: { fontFamily: 'RobotoMono_400Regular', color: '#555c50', fontSize: 10 },
  metadata: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  media: { width: 250, maxWidth: '100%', height: 180, backgroundColor: colors.chat }, file: { gap: 6, maxWidth: '100%' },
  shareVoice: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-end', paddingHorizontal: 8 },
  shareVoiceText: { color: '#425c24', fontFamily: 'RobotoMono_400Regular', fontSize: 10 },
});
