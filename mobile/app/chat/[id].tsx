import { useEffect, useRef, useState } from 'react';
import { BackHandler, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../src/session';
import { acceptMessage, recoverHistory, useHistory } from '../../src/history';
import { errorMessage } from '../../src/api';
import { Button, colors, Label, Notice, s } from '../../src/ui';
import { IconButton } from '../../src/Icon';
import { ActionSheet, type SheetAction } from '../../src/ActionSheet';
import { MessageItem } from '../../src/MessageItem';
import { Composer } from '../../src/Composer';
import { SearchMessages } from '../../src/SearchMessages';
import { Avatar } from '../../src/Avatar';
import type { User } from '../../../frontend/src/api/contracts';

export default function ChatRoute() {
  const params = useLocalSearchParams<{ id: string; kind: string; title: string; peerId: string; peerAvatarId: string }>();
  if (!params.id || !/^[\da-f-]{36}$/i.test(params.id)) return <View style={s.content}><Notice text="Некорректный адрес переписки." /><Button title="К чатам" onPress={() => router.replace('/')} /></View>;
  const title = params.title || 'Переписка';
  const peer: User | undefined = params.kind === 'direct' && params.peerId ?
    { id: params.peerId, username: '', displayName: title, avatarId: params.peerAvatarId || null } : undefined;
  return <Chat key={params.id} id={params.id} kind={params.kind === 'channel' ? 'channel' : params.kind === 'group' ? 'group' : 'direct'} title={title} peer={peer} />;
}
function Chat({ id, kind, title, peer }: { id: string; kind: 'channel' | 'group' | 'direct'; title: string; peer?: User }) {
  const { api, auth } = useSession(); const cache = useQueryClient();
  const isChannel = kind === 'channel';
  const isGroup = kind === 'group';
  const [search, setSearch] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  useEffect(() => {
    if (!search) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { setSearch(false); return true; });
    return () => listener.remove();
  }, [search]);
  const recoveryRequest = useRef<AbortController | null>(null);
  const [recovery, setRecovery] = useState<{ status: 'idle' | 'syncing' } | { status: 'error'; message: string }>({ status: 'idle' });
  useEffect(() => () => recoveryRequest.current?.abort(), [id]);
  const { history, older } = useHistory(id);
  async function synchronizeSubscription() {
    recoveryRequest.current?.abort();
    const controller = new AbortController(); recoveryRequest.current = controller;
    setRecovery({ status: 'syncing' });
    try { await recoverHistory(cache, api, id, controller.signal); if (!controller.signal.aborted) setRecovery({ status: 'idle' }); }
    catch (error) { if (!controller.signal.aborted) setRecovery({ status: 'error', message: errorMessage(error) }); }
  }
  const channel = useQuery({ queryKey: ['channel', id], enabled: isChannel, queryFn: ({ signal }) => api.channel(id, signal), refetchInterval: 30_000 });
  const group = useQuery({ queryKey: ['group', id], enabled: isGroup, queryFn: ({ signal }) => api.group(id, signal), refetchInterval: 30_000 });
  const subscription = useMutation({ mutationFn: () => api.subscribe(id, !channel.data?.subscribed), onSuccess: async (value) => {
    cache.setQueryData(['channel', id], value);
    void cache.invalidateQueries({ queryKey: ['channels'] });
    void cache.invalidateQueries({ queryKey: ['channel-search'] });
    if (value.subscribed) await synchronizeSubscription();
  } });
  const role = isChannel ? channel.data?.viewerRole : isGroup ? group.data?.viewerRole : undefined;
  const canPublish = kind === 'direct' || isChannel && (role === 'OWNER' || role === 'ADMIN') || isGroup && (role === 'OWNER' || role === 'ADMIN' || role === 'MEMBER');
  const canModerate = role === 'OWNER' || role === 'ADMIN';
  const deletion = useMutation({ mutationFn: (messageId: number) => api.deleteMessage(id, messageId), onSuccess: (message) => {
    acceptMessage(cache, message);
    void cache.invalidateQueries({ queryKey: ['message-search', id] });
  } });
  const messages = [...(history.data?.items ?? [])].reverse();
  const actions: SheetAction[] = [{ title: search ? 'Закрыть поиск' : 'Поиск сообщений', onPress: () => setSearch(!search) }];
  if (group.data || channel.data && canModerate) actions.push({ title: isGroup ? 'Участники и роли' : 'Подписчики и роли', onPress: () => router.push({ pathname: '/members/[id]', params: { id, kind } }) });
  if (channel.data && channel.data.owner.id !== auth?.user.id) actions.push({ title: subscription.isPending ? 'Подождите…' : channel.data.subscribed ? 'Отписаться от канала' : 'Подписаться на канал', disabled: subscription.isPending, onPress: () => subscription.mutate() });
  const subtitle = group.data ? `${group.data.memberCount} участников · ${role === 'READER' ? 'Только чтение' : 'Группа'}` : channel.data ? `${channel.data.subscriberCount} подписчиков · Канал` : isChannel ? 'Канал' : isGroup ? 'Группа' : 'Личный чат';
  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}><IconButton icon="back" label="Назад к чатам" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />{peer && <Avatar user={peer} size={36} />}<View style={styles.headerText}><Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{channel.data?.title || group.data?.title || title}</Text><Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text></View><IconButton icon={search ? 'close' : 'more'} label={search ? 'Закрыть поиск' : 'Действия чата'} onPress={() => search ? setSearch(false) : setActionsOpen(true)} /></View>
    <ActionSheet title={channel.data?.title || group.data?.title || title} visible={actionsOpen} onClose={() => setActionsOpen(false)} actions={actions} description={channel.data ? `@${channel.data.username}${channel.data.description ? `\n${channel.data.description}` : ''}` : undefined} />
    <View>
      {isChannel && channel.isPending && <Label>Загрузка канала…</Label>}
      {isChannel && channel.error && <><Notice text={errorMessage(channel.error)} /><Button title="Повторить" onPress={() => { void channel.refetch(); }} /></>}
      {isGroup && group.isPending && <Label>Загрузка группы…</Label>}
      {isGroup && group.error && <><Notice text={errorMessage(group.error)} /><Button title="Повторить" onPress={() => { void group.refetch(); }} /></>}
      {subscription.error && <Notice text={errorMessage(subscription.error)} />}
      {recovery.status === 'syncing' && <Label>Восстановление публикаций…</Label>}
      {recovery.status === 'error' && <><Notice text={recovery.message} /><Button title="Восстановить историю" onPress={() => { void synchronizeSubscription(); }} /></>}
      {deletion.error && <Notice text={errorMessage(deletion.error)} />}
    </View>
    {search ? <SearchMessages id={id} /> : <>
      {history.isPending && <Label>Загрузка истории…</Label>}
      {history.error && <><Notice text={errorMessage(history.error)} /><Button title="Повторить" onPress={() => { void history.refetch(); }} /></>}
      {older.error && <Notice text={errorMessage(older.error)} />}
      <FlatList style={{ flex: 1, backgroundColor: colors.chat }} inverted data={messages} keyExtractor={(message) => String(message.id)}
        maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 60 }}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" renderItem={({ item }) => <MessageItem message={item}
          canDelete={!item.deleted && (canModerate || kind === 'direct' && item.sender.id === auth?.user.id || isGroup && role === 'MEMBER' && item.sender.id === auth?.user.id)}
          deleting={deletion.isPending} onDelete={() => deletion.mutate(item.id)} />}
        ListEmptyComponent={history.isSuccess ? <View style={s.content}><Label>Сообщений пока нет.</Label></View> : null}
        ListFooterComponent={history.data?.hasMore ? <View style={s.content}><Button title={older.isPending ? 'Загрузка…' : 'Старые сообщения'} disabled={older.isPending} onPress={() => older.mutate()} /></View> : null} />
      {canPublish ? <Composer id={id} /> : <View style={s.content}><Label>{isChannel && (channel.isPending || channel.error) || isGroup && (group.isPending || group.error)
        ? 'Дождитесь загрузки прав чата.' : isGroup ? 'В этой группе у вас доступ только для чтения.' : 'Публиковать в канале могут владельцы и администраторы.'}</Label></View>}
    </>}
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  header: { padding: 8, gap: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.panel, borderBottomWidth: 2, borderBottomColor: '#171e14' },
  headerText: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontFamily: 'RobotoMono_400Regular', color: colors.ink, fontSize: 14, fontWeight: '700' },
  subtitle: { fontFamily: 'RobotoMono_400Regular', color: '#50584a', fontSize: 10 },
});
