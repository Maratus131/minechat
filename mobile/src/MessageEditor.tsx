import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Message } from '../../frontend/src/api/contracts';
import { useSession } from './session';
import { errorMessage } from './api';
import { acceptMessage } from './history';
import { Button, Field, Label, Notice, s } from './ui';

export function MessageEditor({ message, allowed, onClose }: { message: Message; allowed: boolean; onClose: () => void }) {
  const { api } = useSession(); const cache = useQueryClient();
  const [text, setText] = useState(message.text);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const save = useMutation({ mutationFn: () => {
    if (!allowed || message.deleted) throw new Error('Сообщение больше нельзя изменить.');
    if (!text.trim() && !message.attachments.length) throw new Error('Введите текст сообщения.');
    if (text.length > 4096) throw new Error('Сообщение должно содержать не более 4096 символов.');
    if (text.includes('\0')) throw new Error('Удалите нулевой символ из текста.');
    request.current = new AbortController();
    return api.editMessage(message.conversationId, message.id, text, request.current.signal);
  }, onSuccess: (updated) => { acceptMessage(cache, updated); onClose(); } });
  return <Modal visible animationType="none" onRequestClose={() => { if (!save.isPending) onClose(); }}>
    <SafeAreaView style={s.screen} accessibilityViewIsModal>
      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
          <Text accessibilityRole="header" style={s.text}>Изменить сообщение</Text>
          <Field label={message.attachments.length ? 'Подпись к вложениям' : 'Текст сообщения'} value={text} onChangeText={setText} multiline autoFocus maxLength={4096} editable={!save.isPending && allowed && !message.deleted} />
          {!!message.attachments.length && <Label>Вложения сохранятся.</Label>}
          {(!allowed || message.deleted) && <Notice text="Сообщение больше нельзя изменить." />}
          {save.error && <Notice text={errorMessage(save.error)} />}
          <View style={s.row}><Button title={save.isPending ? 'Сохранение…' : 'Сохранить'} disabled={save.isPending || !allowed || message.deleted || !text.trim() && !message.attachments.length} onPress={() => save.mutate()} />
            <Button title="Отмена" disabled={save.isPending} onPress={onClose} /></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
