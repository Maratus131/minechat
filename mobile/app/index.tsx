import { useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Channel, Conversation, Group, User } from '../../frontend/src/api/contracts';
import { useSession } from '../src/session';
import { errorMessage } from '../src/api';
import { Button, Field, Label, Notice, Title, s } from '../src/ui';
import { Avatar } from '../src/Avatar';
import { ProfileEditor } from '../src/ProfileEditor';

type Row = { kind: 'user'; value: User } | { kind: 'channel'; value: Channel } | { kind: 'direct'; value: Conversation } | { kind: 'group'; value: Group };
export default function Home() {
  const { api, auth, logout } = useSession();
  const cache = useQueryClient();
  const [tab, setTab] = useState<'Люди' | 'Чаты' | 'Профиль'>('Чаты');
  const [search, setSearch] = useState('');
  const q = search.trim();
  const searching = q.length >= 2;
  const conversations = useInfiniteQuery({ queryKey: ['conversations'], initialPageParam: 0, queryFn: ({ pageParam, signal }) => api.conversations(pageParam, signal), getNextPageParam: (last, pages) => last.hasMore ? pages.length : undefined });
  const channels = useInfiniteQuery({ queryKey: ['channels'], initialPageParam: 0, queryFn: ({ pageParam, signal }) => api.channels(pageParam, signal), getNextPageParam: (last, pages) => last.hasMore ? pages.length : undefined });
  const groups = useInfiniteQuery({ queryKey: ['groups'], initialPageParam: 0, queryFn: ({ pageParam, signal }) => api.groups(pageParam, signal), getNextPageParam: (last, pages) => last.hasMore ? pages.length : undefined, refetchInterval: 30_000 });
  const users = useQuery({ queryKey: ['users', q], enabled: searching, queryFn: ({ signal }) => api.users(q, signal) });
  const foundChannels = useInfiniteQuery({ queryKey: ['channel-search', q], enabled: searching, initialPageParam: 0, queryFn: ({ pageParam, signal }) => api.findChannels(q, pageParam, signal), getNextPageParam: (last, pages) => last.hasMore ? pages.length : undefined });
  const openDirect = useMutation({ mutationFn: (id: string) => api.openConversation(id), onSuccess: (conversation) => {
    void cache.invalidateQueries({ queryKey: ['conversations'] });
    router.push({ pathname: '/chat/[id]', params: { id: conversation.id, kind: 'direct', title: conversation.peer.displayName, peerId: conversation.peer.id, peerAvatarId: conversation.peer.avatarId ?? '' } });
  } });
  const rows: Row[] = searching
    ? [...(users.data?.items.filter((user) => user.id !== auth?.user.id).map((value): Row => ({ kind: 'user', value })) ?? []), ...(tab !== 'Люди' ? foundChannels.data?.pages.flatMap((page) => page.items).map((value): Row => ({ kind: 'channel', value })) ?? [] : [])]
    : tab === 'Люди' ? [] : [
      ...(conversations.data?.pages.flatMap((page) => page.items).map((value): Row => ({ kind: 'direct', value })) ?? []),
      ...(channels.data?.pages.flatMap((page) => page.items).map((value): Row => ({ kind: 'channel', value })) ?? []),
      ...(groups.data?.pages.flatMap((page) => page.items).map((value): Row => ({ kind: 'group', value })) ?? []),
    ].sort((a, b) => ('lastActivityAt' in b.value ? Date.parse(b.value.lastActivityAt) : 0) - ('lastActivityAt' in a.value ? Date.parse(a.value.lastActivityAt) : 0));
  const uniqueRows = [...new Map(rows.map((row) => [`${row.kind}:${row.value.id}`, row])).values()];
  const loading = searching ? users.isFetching || foundChannels.isFetching : tab === 'Чаты' && (conversations.isPending || channels.isPending || groups.isPending);
  const errors = searching ? [users.error, foundChannels.error] : [conversations.error, channels.error, groups.error];
  function menu() { Alert.alert('Меню', undefined, [
    { text: 'Новая группа', onPress: () => router.push('/group/create') }, { text: 'Новый канал', onPress: () => router.push('/create') }, { text: 'Профиль', onPress: () => setTab('Профиль') },
    { text: 'Выйти', onPress: logout }, { text: 'Отмена', style: 'cancel' },
  ]); }
  function open(row: Row) {
    if (row.kind === 'user') openDirect.mutate(row.value.id);
    else router.push({ pathname: '/chat/[id]', params: { id: row.value.id, kind: row.kind, title: row.kind === 'direct' ? row.value.peer.displayName : row.value.title,
      peerId: row.kind === 'direct' ? row.value.peer.id : '', peerAvatarId: row.kind === 'direct' ? row.value.peer.avatarId ?? '' : '' } });
  }
  return <View style={s.screen}><View style={s.content}><View style={s.row}><View style={s.fill}><Title>MINECHAT</Title></View><Button title="Меню" onPress={menu} /></View>
    {tab !== 'Профиль' && <Field label="Поиск людей и каналов" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} maxLength={200} />}
  </View>
  {tab === 'Профиль' ? <ProfileEditor /> : <>
    {loading && <Label>Загрузка…</Label>}
    {errors.filter(Boolean).map((error, index) => <Notice key={index} text={errorMessage(error)} />)}
    {errors.some(Boolean) && <Button title="Повторить загрузку" onPress={() => { if (searching) { void users.refetch(); void foundChannels.refetch(); } else { void conversations.refetch(); void channels.refetch(); void groups.refetch(); } }} />}
    {openDirect.error && <Notice text={errorMessage(openDirect.error)} />}
    <FlatList style={s.fill} data={uniqueRows} keyExtractor={(row) => `${row.kind}:${row.value.id}`} keyboardShouldPersistTaps="handled"
      refreshing={loading && !searching} onRefresh={() => { if (searching) { void users.refetch(); void foundChannels.refetch(); } else { void conversations.refetch(); void channels.refetch(); void groups.refetch(); } }}
      ListEmptyComponent={<View style={s.content}><Label>{q.length === 1 || tab === 'Люди' && !searching ? 'Введите от 2 символов для поиска.' : loading ? 'Загрузка…' : searching ? 'Ничего не найдено.' : 'Чатов пока нет. Найдите человека или публичный канал.'}</Label></View>}
      renderItem={({ item }) => {
        const title = item.kind === 'channel' || item.kind === 'group' ? item.value.title : item.kind === 'direct' ? item.value.peer.displayName : item.value.displayName;
        const subtitle = item.kind === 'user' ? `@${item.value.username}` : item.kind === 'channel' ? `Канал · @${item.value.username}` : item.kind === 'group' ? `Группа · ${item.value.lastMessageText || 'Пока нет сообщений'}` : item.value.lastMessageText || 'Начните переписку';
        return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: openDirect.isPending }} disabled={openDirect.isPending} onPress={() => open(item)} style={[s.item, s.row]}>
          {item.kind === 'channel' || item.kind === 'group' ? <Text style={s.avatar}>{title.charAt(0).toUpperCase()}</Text> : <Avatar user={item.kind === 'direct' ? item.value.peer : item.value} />}
          <View style={s.fill}><Text style={s.ink}>{title}</Text><Text style={s.ink} numberOfLines={1}>{subtitle}</Text></View></Pressable>;
      }}
      ListFooterComponent={<View style={s.content}>
        {searching && tab !== 'Люди' && foundChannels.hasNextPage && <Button title="Ещё каналы" disabled={foundChannels.isFetchingNextPage} onPress={() => { void foundChannels.fetchNextPage(); }} />}
        {!searching && tab === 'Чаты' && conversations.hasNextPage && <Button title="Ещё диалоги" disabled={conversations.isFetchingNextPage} onPress={() => { void conversations.fetchNextPage(); }} />}
        {!searching && tab === 'Чаты' && channels.hasNextPage && <Button title="Ещё каналы" disabled={channels.isFetchingNextPage} onPress={() => { void channels.fetchNextPage(); }} />}
        {!searching && tab === 'Чаты' && groups.hasNextPage && <Button title="Ещё группы" disabled={groups.isFetchingNextPage} onPress={() => { void groups.fetchNextPage(); }} />}
        {searching && users.data?.hasMore && <Label>Показаны первые 100 человек. Уточните логин.</Label>}
      </View>} />
  </>}
  <View style={[s.row, s.content]}>{(['Люди', 'Чаты', 'Профиль'] as const).map((name) => <View key={name} style={s.fill}><Button title={`${tab === name ? '▪ ' : ''}${name}`} onPress={() => setTab(name)} /></View>)}</View>
  </View>;
}
