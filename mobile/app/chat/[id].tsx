import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../src/session';
import { acceptMessage, recoverHistory, useHistory } from '../../src/history';
import { errorMessage } from '../../src/api';
import { Button, colors, Label, Notice, s, Title } from '../../src/ui';
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
  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={s.content}><View style={s.row}><Button title="Назад" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />{peer && <Avatar user={peer} />}<View style={s.fill}><Title>{channel.data?.title || group.data?.title || title}</Title></View><Button title={search ? 'Закрыть' : 'Поиск'} onPress={() => setSearch(!search)} /></View>
      {isChannel && channel.isPending && <Label>Загрузка канала…</Label>}
      {isChannel && channel.error && <><Notice text={errorMessage(channel.error)} /><Button title="Повторить" onPress={() => { void channel.refetch(); }} /></>}
      {isGroup && group.isPending && <Label>Загрузка группы…</Label>}
      {isGroup && group.error && <><Notice text={errorMessage(group.error)} /><Button title="Повторить" onPress={() => { void group.refetch(); }} /></>}
      {group.data && <><Label>{group.data.memberCount} участников · {group.data.viewerRole === 'READER' ? 'Только чтение' : 'Можно писать'}</Label>
        <Button title="Участники и роли" onPress={() => router.push({ pathname: '/members/[id]', params: { id, kind: 'group' } })} /></>}
      {channel.data && <><Label>@{channel.data.username} · {channel.data.subscriberCount} подписчиков</Label>{!!channel.data.description && <Text style={s.text} numberOfLines={2}>{channel.data.description}</Text>}
        {(channel.data.viewerRole === 'OWNER' || channel.data.viewerRole === 'ADMIN') &&
          <Button title="Подписчики и роли" onPress={() => router.push({ pathname: '/members/[id]', params: { id, kind: 'channel' } })} />}
        {channel.data.owner.id !== auth?.user.id && <Button title={subscription.isPending ? 'Подождите…' : channel.data.subscribed ? 'Отписаться' : 'Подписаться'} disabled={subscription.isPending} onPress={() => subscription.mutate()} />}</>}
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
