import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Channel, Conversation, Group, User } from '../../frontend/src/api/contracts';
import { useSession } from '../src/session';
import { errorMessage } from '../src/api';
import { Button, colors, Label, Notice, s } from '../src/ui';
import { Icon, IconButton } from '../src/Icon';
import { ActionSheet } from '../src/ActionSheet';
import { Avatar } from '../src/Avatar';
import { ProfileEditor } from '../src/ProfileEditor';

type Row = { kind: 'user'; value: User } | { kind: 'channel'; value: Channel } | { kind: 'direct'; value: Conversation } | { kind: 'group'; value: Group };
const filters = [{ key: 'all', title: 'Все' }, { key: 'direct', title: 'Личные' }, { key: 'group', title: 'Группы' }, { key: 'channel', title: 'Каналы' }] as const;
function activityTime(value: string) {
  const date = new Date(value);
  return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
export default function Home() {
  const { api, auth } = useSession();
  const cache = useQueryClient();
  const [tab, setTab] = useState<'Люди' | 'Чаты' | 'Профиль'>('Чаты');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof filters)[number]['key']>('all');
  const [creating, setCreating] = useState(false);
  const searchInput = useRef<TextInput>(null);
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
  const uniqueRows = [...new Map(rows.map((row) => [`${row.kind}:${row.value.id}`, row])).values()].filter((row) => searching || filter === 'all' || row.kind === filter);
  const loading = searching ? users.isFetching || foundChannels.isFetching : tab === 'Чаты' && (conversations.isPending || channels.isPending || groups.isPending);
  const errors = searching ? [users.error, foundChannels.error] : [conversations.error, channels.error, groups.error];
  function open(row: Row) {
    if (row.kind === 'user') openDirect.mutate(row.value.id);
    else router.push({ pathname: '/chat/[id]', params: { id: row.value.id, kind: row.kind, title: row.kind === 'direct' ? row.value.peer.displayName : row.value.title,
      peerId: row.kind === 'direct' ? row.value.peer.id : '', peerAvatarId: row.kind === 'direct' ? row.value.peer.avatarId ?? '' : '' } });
  }
  return <View style={s.screen}><View style={styles.header}><View style={s.row}><View style={s.fill}><Text accessibilityRole="header" style={styles.logo}>MINECHAT</Text></View>{tab !== 'Профиль' && <IconButton icon="pencil" label="Создать чат" primary onPress={() => setCreating(true)} />}</View>
    {tab !== 'Профиль' && <View style={styles.search}><Icon name="search" color="#bcc4b2" /><TextInput ref={searchInput} accessibilityLabel="Поиск людей и каналов" placeholder={tab === 'Люди' ? 'Найти человека по логину' : 'Поиск людей и каналов'} placeholderTextColor="#bcc4b2" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} maxLength={200} style={styles.searchInput} />{!!search && <IconButton icon="close" label="Очистить поиск" onPress={() => { setSearch(''); searchInput.current?.focus(); }} />}</View>}
    {tab === 'Чаты' && !q && <View style={styles.filters}>{filters.map((item) => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: filter === item.key }} onPress={() => setFilter(item.key)} style={[styles.filter, filter === item.key && styles.selectedFilter]}><Text style={styles.filterText}>{item.title}</Text></Pressable>)}</View>}
    {q.length === 1 && <Text style={styles.hint}>Введите от 2 символов для поиска.</Text>}
  </View>
  {tab === 'Профиль' ? <ProfileEditor /> : <>
    {loading && <Label>Загрузка…</Label>}
    {errors.filter(Boolean).map((error, index) => <Notice key={index} text={errorMessage(error)} />)}
    {errors.some(Boolean) && <Button title="Повторить загрузку" onPress={() => { if (searching) { void users.refetch(); void foundChannels.refetch(); } else { void conversations.refetch(); void channels.refetch(); void groups.refetch(); } }} />}
    {openDirect.error && <Notice text={errorMessage(openDirect.error)} />}
    <FlatList style={s.fill} data={uniqueRows} keyExtractor={(row) => `${row.kind}:${row.value.id}`} keyboardShouldPersistTaps="handled"
      refreshing={loading && !searching} onRefresh={() => { if (searching) { void users.refetch(); void foundChannels.refetch(); } else { void conversations.refetch(); void channels.refetch(); void groups.refetch(); } }}
      ListEmptyComponent={<View style={styles.empty}><Label>{q.length === 1 || tab === 'Люди' && !searching ? 'Введите от 2 символов для поиска.' : loading ? 'Загрузка…' : searching ? 'Ничего не найдено.' : filter !== 'all' ? `Здесь пока нет ${filter === 'direct' ? 'личных чатов' : filter === 'group' ? 'групп' : 'каналов'}.` : 'Чатов пока нет. Создайте чат или найдите собеседника.'}</Label>{!loading && !searching && tab === 'Чаты' && <Button title="Создать чат" onPress={() => setCreating(true)} />}</View>}
      renderItem={({ item }) => {
        const title = item.kind === 'channel' || item.kind === 'group' ? item.value.title : item.kind === 'direct' ? item.value.peer.displayName : item.value.displayName;
        const subtitle = item.kind === 'user' ? `@${item.value.username}` : item.kind === 'channel' ? `Канал · ${item.value.lastMessageText || `@${item.value.username}`}` : item.kind === 'group' ? `Группа · ${item.value.lastMessageText || 'Пока нет сообщений'}` : item.value.lastMessageText || (item.value.lastMessageId ? 'Вложение' : 'Начните переписку');
        return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}`} accessibilityState={{ disabled: openDirect.isPending }} disabled={openDirect.isPending} onPress={() => open(item)} style={({ pressed }) => [styles.chatRow, pressed && styles.selectedRow]}>
          {item.kind === 'channel' || item.kind === 'group' ? <Text style={s.avatar}>{title.charAt(0).toUpperCase()}</Text> : <Avatar user={item.kind === 'direct' ? item.value.peer : item.value} />}
          <View style={styles.rowContent}><View style={s.row}><Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>{item.kind !== 'user' && <Text style={styles.time}>{activityTime(item.value.lastActivityAt)}</Text>}</View><Text style={styles.preview} numberOfLines={1}>{subtitle}</Text></View></Pressable>;
      }}
      ListFooterComponent={<View style={s.content}>
        {searching && tab !== 'Люди' && foundChannels.hasNextPage && <Button title="Ещё каналы" disabled={foundChannels.isFetchingNextPage} onPress={() => { void foundChannels.fetchNextPage(); }} />}
        {!searching && tab === 'Чаты' && (filter === 'all' || filter === 'direct') && conversations.hasNextPage && <Button title="Ещё диалоги" disabled={conversations.isFetchingNextPage} onPress={() => { void conversations.fetchNextPage(); }} />}
        {!searching && tab === 'Чаты' && (filter === 'all' || filter === 'channel') && channels.hasNextPage && <Button title="Ещё каналы" disabled={channels.isFetchingNextPage} onPress={() => { void channels.fetchNextPage(); }} />}
        {!searching && tab === 'Чаты' && (filter === 'all' || filter === 'group') && groups.hasNextPage && <Button title="Ещё группы" disabled={groups.isFetchingNextPage} onPress={() => { void groups.fetchNextPage(); }} />}
        {searching && users.data?.hasMore && <Label>Показаны первые 100 человек. Уточните логин.</Label>}
      </View>} />
  </>}
  <View style={styles.tabs}>{(['Люди', 'Чаты', 'Профиль'] as const).map((name) => <Pressable key={name} accessibilityRole="tab" accessibilityState={{ selected: tab === name }} onPress={() => setTab(name)} style={[styles.tab, tab === name && styles.activeTab]}><Icon name={name === 'Люди' ? 'people' : name === 'Чаты' ? 'chats' : 'profile'} /><Text style={styles.tabText}>{name}</Text></Pressable>)}</View>
  <ActionSheet title="Создать чат" visible={creating} onClose={() => setCreating(false)} actions={[
    { title: 'Новое сообщение', onPress: () => { setTab('Люди'); setFilter('all'); setSearch(''); requestAnimationFrame(() => searchInput.current?.focus()); } },
    { title: 'Новая группа', onPress: () => router.push('/group/create') },
    { title: 'Новый канал', onPress: () => router.push('/create') },
  ]} />
  </View>;
}

const styles = StyleSheet.create({
  logo: { fontFamily: 'PressStart2P_400Regular', fontSize: 16, lineHeight: 26, color: colors.ink },
  header: { padding: 12, gap: 10, backgroundColor: colors.panel, borderBottomWidth: 2, borderBottomColor: '#171e14' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 10, backgroundColor: colors.chat, borderWidth: 2, borderColor: '#171e14', minHeight: 48 },
  searchInput: { flex: 1, minWidth: 0, fontFamily: 'RobotoMono_400Regular', color: colors.incoming, fontSize: 13, paddingVertical: 10 },
  filters: { flexDirection: 'row', gap: 4 }, filter: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent', paddingHorizontal: 2 },
  selectedFilter: { backgroundColor: colors.mine, borderBottomColor: '#56772c' }, filterText: { fontFamily: 'RobotoMono_400Regular', color: colors.ink, fontSize: 11 },
  hint: { fontFamily: 'RobotoMono_400Regular', fontSize: 11, color: '#50584a' },
  chatRow: { minHeight: 80, padding: 12, gap: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.incoming, borderBottomWidth: 1, borderBottomColor: '#b7bcae' },
  selectedRow: { backgroundColor: colors.mine }, rowContent: { flex: 1, gap: 5, minWidth: 0 },
  rowTitle: { flex: 1, color: colors.ink, fontFamily: 'RobotoMono_400Regular', fontSize: 14, fontWeight: '700' },
  preview: { color: '#59624e', fontFamily: 'RobotoMono_400Regular', fontSize: 12, lineHeight: 18 },
  time: { color: '#59624e', fontFamily: 'RobotoMono_400Regular', fontSize: 10 },
  tabs: { flexDirection: 'row', backgroundColor: colors.panel, borderTopWidth: 2, borderTopColor: '#171e14', paddingHorizontal: 8, paddingTop: 4 },
  tab: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 4, borderTopWidth: 3, borderTopColor: 'transparent' },
  activeTab: { backgroundColor: colors.mine, borderTopColor: colors.accent }, tabText: { fontFamily: 'RobotoMono_400Regular', fontSize: 11, color: colors.ink },
  empty: { padding: 24, gap: 16 },
});
