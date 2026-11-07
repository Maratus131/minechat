import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '../../../frontend/src/api/contracts';
import { useSession } from '../../src/session';
import { errorMessage } from '../../src/api';
import { Avatar } from '../../src/Avatar';
import { Button, Field, Label, Notice, s, Title } from '../../src/ui';

export default function CreateGroup() {
  const { api, auth } = useSession();
  const cache = useQueryClient();
  const [title, setTitle] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<User[]>([]);
  const q = search.trim();
  const users = useQuery({ queryKey: ['users', q], enabled: q.length >= 2, queryFn: ({ signal }) => api.users(q, signal) });
  const create = useMutation({ mutationFn: () => {
    if (!title.trim() || !selected.length) throw new Error('Введите название и выберите хотя бы одного участника.');
    return api.createGroup(title.trim(), selected.map((user) => user.id));
  }, onSuccess: (group) => {
    void cache.invalidateQueries({ queryKey: ['groups'] });
    router.replace({ pathname: '/chat/[id]', params: { id: group.id, kind: 'group', title: group.title } });
  } });
  function toggle(user: User) {
    setSelected((current) => current.some((member) => member.id === user.id) ? current.filter((member) => member.id !== user.id) : [...current, user]);
  }
  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Button title="Назад" onPress={() => router.back()} /><Title>Новая группа</Title>
    <Field label="Название группы" value={title} onChangeText={setTitle} maxLength={80} />
    <Field label="Найти участников по логину" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} maxLength={100} />
    <Label>Выбрано: {selected.length}</Label>
    {selected.length > 0 && <View style={s.content}>{selected.map((user) => <Button key={user.id} title={`${user.displayName} · убрать`} onPress={() => toggle(user)} />)}</View>}
    {q.length === 1 && <Label>Введите ещё один символ для поиска.</Label>}
    {users.isFetching && <Label>Ищем людей…</Label>}
    {users.error && <><Notice text={errorMessage(users.error)} /><Button title="Повторить поиск" onPress={() => { void users.refetch(); }} /></>}
    {users.data?.items.filter((user) => user.id !== auth?.user.id).map((user) => <Pressable key={user.id} accessibilityRole="checkbox"
      accessibilityState={{ checked: selected.some((member) => member.id === user.id) }} onPress={() => toggle(user)} style={[s.item, s.row]}>
      <Avatar user={user} /><View style={s.fill}><Text style={s.ink}>{user.displayName}</Text><Text style={s.ink}>@{user.username}</Text></View>
      <Text style={s.ink}>{selected.some((member) => member.id === user.id) ? '✓' : '+'}</Text>
    </Pressable>)}
    {users.data && users.data.items.length === 0 && <Label>Пользователи не найдены.</Label>}
    {users.data?.hasMore && <Label>Показаны первые 100 человек. Уточните логин.</Label>}
    {create.error && <Notice text={errorMessage(create.error)} />}
    <Button title={create.isPending ? 'Создание…' : 'Создать группу'} disabled={create.isPending || !title.trim() || selected.length === 0} onPress={() => create.mutate()} />
  </ScrollView></KeyboardAvoidingView>;
}
