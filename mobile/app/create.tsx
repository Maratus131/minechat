import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../src/session';
import { errorMessage } from '../src/api';
import { Button, Field, Notice, Title, s } from '../src/ui';

export default function CreateChannel() {
  const { api } = useSession(); const cache = useQueryClient();
  const [username, setUsername] = useState(''); const [title, setTitle] = useState(''); const [description, setDescription] = useState('');
  const create = useMutation({ mutationFn: () => {
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username) || !title.trim()) throw new Error('Введите название и логин из 3–32 латинских букв, цифр или _.');
    return api.createChannel({ username, title: title.trim(), description: description.trim() });
  }, onSuccess: (channel) => {
    void cache.invalidateQueries({ queryKey: ['channels'] });
    router.replace({ pathname: '/chat/[id]', params: { id: channel.id, kind: 'channel', title: channel.title } });
  } });
  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Button title="Назад" onPress={() => router.back()} /><Title>Новый канал</Title>
    <Field label="Логин канала" value={username} onChangeText={setUsername} maxLength={32} autoCapitalize="none" autoCorrect={false} />
    <Field label="Название" value={title} onChangeText={setTitle} maxLength={80} />
    <Field label="Описание" value={description} onChangeText={setDescription} maxLength={500} multiline />
    {create.error && <Notice text={errorMessage(create.error)} />}
    <Button title={create.isPending ? 'Создание…' : 'Создать'} disabled={create.isPending} onPress={() => create.mutate()} />
  </ScrollView></KeyboardAvoidingView>;
}
