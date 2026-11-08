import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from './session';
import { errorMessage, type PickedFile } from './api';
import { discardFile, mediaType, stageFile } from './files';
import { VoiceRecorder } from './VoiceRecorder';
import { AudioMessage } from './AudioMessage';
import { acceptMessage } from './history';
import { Button, colors, Notice } from './ui';
import { IconButton } from './Icon';
import { ActionSheet } from './ActionSheet';
import { SelectedMedia } from './SelectedMedia';

export function Composer({ id }: { id: string }) {
  const { api } = useSession(); const cache = useQueryClient();
  const [text, setText] = useState(''); const [files, setFiles] = useState<PickedFile[]>([]);
  const [pickError, setPickError] = useState(''); const [picking, setPicking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const owned = useRef<PickedFile[]>([]); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; owned.current.forEach((file) => { void discardFile(file.uri); }); }; }, []);
  function updateFiles(next: PickedFile[]) { owned.current = next; setFiles(next); }
  const send = useMutation({ mutationFn: () => {
    if (!text.trim() && !files.length) throw new Error('Введите текст или выберите файл.');
    if (text.length > 4096) throw new Error('Сообщение должно содержать не более 4096 символов.');
    if (text.includes('\0')) throw new Error('Удалите нулевой символ из текста.');
    return api.send(id, text, files);
  }, onSuccess: (message) => { acceptMessage(cache, message); if (mounted.current) { setText(''); files.forEach((file) => { void discardFile(file.uri); }); updateFiles([]); } } });
  async function pick(media: boolean) {
    if (files.length >= 5) { setPickError('К сообщению можно прикрепить до 5 файлов.'); return; }
    setPicking(true); setPickError(''); const staged: PickedFile[] = [];
    try {
      let sources: { uri: string; name: string; mimeType?: string }[];
      if (media) {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) throw new Error('Разрешите доступ к фото и видео в настройках устройства или выберите файл.');
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, selectionLimit: 5 - files.length, quality: 1 });
        if (result.canceled) return;
        sources = result.assets.map((asset) => ({ uri: asset.uri, name: asset.fileName || `media-${Date.now()}.${asset.type === 'video' ? 'mp4' : 'jpg'}`, mimeType: asset.mimeType }));
      } else {
        const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
        if (result.canceled) return;
        sources = result.assets.map((asset) => ({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType }));
      }
      if (sources.length + files.length > 5) throw new Error('Выберите до 5 файлов на сообщение.');
      for (const source of sources) staged.push({ ...await stageFile(source.uri, source.name), mimeType: source.mimeType });
      if (!mounted.current) { staged.forEach((file) => { void discardFile(file.uri); }); return; }
      updateFiles([...files, ...staged]);
    } catch (error) { staged.forEach((file) => { void discardFile(file.uri); }); if (mounted.current) setPickError(errorMessage(error)); }
    finally { if (mounted.current) setPicking(false); }
  }
  const busy = send.isPending || picking || recording;
  return <View style={styles.composer}>
    {!!files.length && <ScrollView horizontal style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">{files.map((file) => {
      const kind = mediaType(file.name);
      const visual = kind === 'image' || kind === 'video';
      const voice = kind === 'audio' && file.name.startsWith('voice-');
      return <View key={file.uri} style={styles.selected}>
        {visual ? <SelectedMedia uri={file.uri} kind={kind} /> : !voice && <Text style={styles.filename}>{file.name}</Text>}
        {kind === 'audio' && !recording && !send.isPending && <AudioMessage uri={file.uri} sizeBytes={file.size} />}
        <Button title={kind === 'image' ? 'Убрать фото' : kind === 'video' ? 'Убрать видео' : 'Убрать'} disabled={busy} onPress={() => { void discardFile(file.uri); updateFiles(files.filter((current) => current.uri !== file.uri)); }} />
      </View>;
    })}</ScrollView>}
    <View style={styles.row}>
      {!recording && <><IconButton icon="attach" label="Прикрепить фото, видео или файл" disabled={busy || files.length >= 5} onPress={() => setAttachmentsOpen(true)} />
        <TextInput accessibilityLabel="Сообщение" placeholder="Сообщение…" placeholderTextColor="#aeb7a3" value={text} onChangeText={setText} multiline maxLength={4096} editable={!busy} style={styles.input} />
      </>}
      <VoiceRecorder disabled={send.isPending || picking || files.length >= 5} onBusyChange={setRecording} onRecorded={(file) => updateFiles([...owned.current, file])} />
      {!recording && <IconButton icon="send" label={send.isPending ? 'Отправка сообщения…' : 'Отправить сообщение'} primary disabled={busy || !text.trim() && !files.length} onPress={() => send.mutate()} />}
    </View>
    {picking && <Text style={styles.hint}>Подготовка вложений…</Text>}
    {!!files.length && <Text style={styles.hint}>Вложений: {files.length} из 5 · до 10 МиБ каждый</Text>}
    {(pickError || send.error) && <Notice text={pickError || errorMessage(send.error)} />}
    <ActionSheet title="Прикрепить" visible={attachmentsOpen} onClose={() => setAttachmentsOpen(false)} actions={[
      { title: 'Фото или видео', onPress: () => { void pick(true); } },
      { title: 'Файл', onPress: () => { void pick(false); } },
    ]} />
  </View>;
}

const styles = StyleSheet.create({
  selected: { gap: 6, paddingRight: 8, maxWidth: 280 },
  filename: { fontFamily: 'RobotoMono_400Regular', color: colors.ink, fontSize: 12, lineHeight: 18 },
  composer: { padding: 8, gap: 8, backgroundColor: colors.panel, borderTopWidth: 2, borderTopColor: '#171e14' },
  row: { flexDirection: 'row', gap: 4, alignItems: 'flex-end' },
  input: { flex: 1, minWidth: 0, minHeight: 48, maxHeight: 120, paddingHorizontal: 10, paddingVertical: 12, color: colors.incoming, backgroundColor: colors.chat, borderWidth: 2, borderColor: '#171e14', fontFamily: 'RobotoMono_400Regular', fontSize: 14 },
  hint: { fontFamily: 'RobotoMono_400Regular', fontSize: 10, color: '#50584a' },
});
