import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChannelMember, GroupMember, GroupRole, User } from '../../../frontend/src/api/contracts';
import { useSession } from '../../src/session';
import { errorMessage } from '../../src/api';
import { Avatar } from '../../src/Avatar';
import { Button, Field, Label, Notice, s, Title } from '../../src/ui';

const groupRoleName: Record<GroupRole, string> = { OWNER: 'Владелец', ADMIN: 'Администратор', MEMBER: 'Участник', READER: 'Только чтение' };
const channelRoleName = { OWNER: 'Владелец', ADMIN: 'Администратор', SUBSCRIBER: 'Подписчик' };

export default function Members() {
  const params = useLocalSearchParams<{ id: string; kind: string }>();
  const id = params.id || '';
  const isGroup = params.kind === 'group';
  const { api, auth } = useSession();
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const [addRole, setAddRole] = useState<'MEMBER' | 'READER'>('MEMBER');
  const q = search.trim();
  const group = useQuery({ queryKey: ['group', id], enabled: isGroup && !!id, queryFn: ({ signal }) => api.group(id, signal) });
  const channel = useQuery({ queryKey: ['channel', id], enabled: !isGroup && !!id, queryFn: ({ signal }) => api.channel(id, signal) });
  const groupMembers = useInfiniteQuery({ queryKey: ['group-members', id], enabled: isGroup && !!id, initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => api.groupMembers(id, pageParam, signal), getNextPageParam: (last, pages) => last.hasMore ? pages.length : undefined });
  const channelMembers = useInfiniteQuery({ queryKey: ['channel-members', id], enabled: !isGroup && !!id, initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => api.channelMembers(id, pageParam, signal), getNextPageParam: (last, pages) => last.hasMore ? pages.length : undefined });
  const users = useQuery({ queryKey: ['users', q], enabled: isGroup && q.length >= 2, queryFn: ({ signal }) => api.users(q, signal) });
  const role = isGroup ? group.data?.viewerRole : channel.data?.viewerRole;
  const canManage = role === 'OWNER' || isGroup && role === 'ADMIN';
  const members: (GroupMember | ChannelMember)[] = isGroup
    ? groupMembers.data?.pages.flatMap((page) => page.items) ?? []
    : channelMembers.data?.pages.flatMap((page) => page.items) ?? [];
  const memberIds = new Set(members.map((item) => item.user.id));
  async function updated() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: [isGroup ? 'group-members' : 'channel-members', id] }),
      cache.invalidateQueries({ queryKey: [isGroup ? 'group' : 'channel', id] }),
      cache.invalidateQueries({ queryKey: [isGroup ? 'groups' : 'channels'] }),
    ]);
  }
  const add = useMutation({ mutationFn: (userId: string) => api.addGroupMember(id, userId, addRole), onSuccess: () => { setSearch(''); void updated(); } });
  const setGroupRole = useMutation({ mutationFn: ({ userId, next }: { userId: string; next: Exclude<GroupRole, 'OWNER'> }) => api.setGroupRole(id, userId, next), onSuccess: () => { void updated(); } });
  const setChannelRole = useMutation({ mutationFn: ({ userId, next }: { userId: string; next: 'ADMIN' | 'SUBSCRIBER' }) => api.setChannelRole(id, userId, next), onSuccess: () => { void updated(); } });
  const remove = useMutation({ mutationFn: (userId: string) => api.removeGroupMember(id, userId), onSuccess: (_value, userId) => {
    void updated(); if (userId === auth?.user.id) router.replace('/');
  } });
  function groupActions(member: GroupMember) {
    if (!canManage && member.user.id !== auth?.user.id) return;
    const isOwner = role === 'OWNER';
    const options: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [];
    if (member.role !== 'OWNER' && member.user.id !== auth?.user.id && (isOwner || member.role !== 'ADMIN')) {
      if (isOwner && member.role !== 'ADMIN') options.push({ text: 'Сделать администратором', onPress: () => setGroupRole.mutate({ userId: member.user.id, next: 'ADMIN' }) });
      if (member.role !== 'MEMBER') options.push({ text: 'Разрешить писать', onPress: () => setGroupRole.mutate({ userId: member.user.id, next: 'MEMBER' }) });
      if (member.role !== 'READER') options.push({ text: 'Только чтение', onPress: () => setGroupRole.mutate({ userId: member.user.id, next: 'READER' }) });
      options.push({ text: 'Исключить', style: 'destructive', onPress: () => remove.mutate(member.user.id) });
    }
    if (member.user.id === auth?.user.id && member.role !== 'OWNER') options.push({ text: 'Покинуть группу', style: 'destructive', onPress: () => remove.mutate(member.user.id) });
    if (!options.length) return;
    options.push({ text: 'Отмена', style: 'cancel' });
    Alert.alert(member.user.displayName, undefined, options);
  }
  function channelActions(member: ChannelMember) {
    if (role !== 'OWNER' || member.role === 'OWNER') return;
    Alert.alert(member.user.displayName, undefined, [
      { text: member.role === 'ADMIN' ? 'Снять администратора' : 'Сделать администратором', onPress: () => setChannelRole.mutate({ userId: member.user.id, next: member.role === 'ADMIN' ? 'SUBSCRIBER' : 'ADMIN' }) },
      { text: 'Отмена', style: 'cancel' },
    ]);
  }
  if (!id) return <View style={s.content}><Notice text="Не указан чат." /><Button title="Назад" onPress={() => router.back()} /></View>;
  const pending = isGroup ? groupMembers.isPending || group.isPending : channelMembers.isPending || channel.isPending;
  const loadError = isGroup ? groupMembers.error || group.error : channelMembers.error || channel.error;
  const actionError = add.error || setGroupRole.error || setChannelRole.error || remove.error;
  return <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Button title="Назад" onPress={() => router.back()} /><Title>Участники</Title>
    {pending && <Label>Загрузка участников…</Label>}
    {loadError && <><Notice text={errorMessage(loadError)} /><Button title="Повторить" onPress={() => { if (isGroup) { void group.refetch(); void groupMembers.refetch(); } else { void channel.refetch(); void channelMembers.refetch(); } }} /></>}
    {actionError && <Notice text={errorMessage(actionError)} />}
    {isGroup && canManage && <View style={s.content}>
      <Field label="Найти нового участника" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} maxLength={100} />
      <View style={s.row}><View style={s.fill}><Button title={addRole === 'MEMBER' ? '✓ Может писать' : 'Может писать'} onPress={() => setAddRole('MEMBER')} /></View>
        <View style={s.fill}><Button title={addRole === 'READER' ? '✓ Только чтение' : 'Только чтение'} onPress={() => setAddRole('READER')} /></View></View>
      {users.isFetching && <Label>Ищем людей…</Label>}
      {users.error && <Notice text={errorMessage(users.error)} />}
      {users.data?.items.filter((user: User) => user.id !== auth?.user.id && !memberIds.has(user.id)).map((user: User) => <View key={user.id} style={[s.item, s.row]}>
        <Avatar user={user} /><View style={s.fill}><Text style={s.ink}>{user.displayName}</Text><Text style={s.ink}>@{user.username}</Text></View>
        <Button title="Добавить" disabled={add.isPending} onPress={() => add.mutate(user.id)} />
      </View>)}
      {users.data?.hasMore && <Label>Показаны первые 100 человек. Уточните логин.</Label>}
    </View>}
    {members.map((member) => <Pressable key={member.user.id} accessibilityRole="button" accessibilityLabel={`${member.user.displayName}, ${isGroup ? groupRoleName[member.role as GroupRole] : channelRoleName[member.role as keyof typeof channelRoleName]}`}
      onPress={() => isGroup ? groupActions(member as GroupMember) : channelActions(member as ChannelMember)} style={[s.item, s.row]}>
      <Avatar user={member.user} /><View style={s.fill}><Text style={s.ink}>{member.user.displayName}</Text><Text style={s.ink}>@{member.user.username}</Text></View>
      <Text style={s.ink}>{isGroup ? groupRoleName[member.role as GroupRole] : channelRoleName[member.role as keyof typeof channelRoleName]}</Text>
    </Pressable>)}
    {!pending && !loadError && !members.length && <Label>Участников пока нет.</Label>}
    {isGroup && groupMembers.hasNextPage && <Button title="Ещё участники" disabled={groupMembers.isFetchingNextPage} onPress={() => { void groupMembers.fetchNextPage(); }} />}
    {!isGroup && channelMembers.hasNextPage && <Button title="Ещё подписчики" disabled={channelMembers.isFetchingNextPage} onPress={() => { void channelMembers.fetchNextPage(); }} />}
  </ScrollView>;
}
