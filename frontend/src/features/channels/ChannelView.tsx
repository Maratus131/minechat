import { Icon } from '../../shared/Icon';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { errorMessage } from '../../api/client';
import { Avatar, ErrorNotice, StatusPanel } from '../../shared/ui';
import { useSession } from '../auth/Session';
import { Composer } from '../messages/Composer';
import { MessageHistory } from '../messages/MessageHistory';
import { recoverHistory, refreshConversations } from '../messages/history';
import { SearchMessages } from '../messages/SearchMessages';
import { useChannel } from './queries';
import { ChannelMembers } from './ChannelMembers';
import styles from '../messages/messages.module.css';

export function ChannelRoute() {
  const { id = '' } = useParams();
  return <ChannelView key={id} id={id} />;
}
function ChannelView({ id }: { id: string }) {
  const { api } = useSession();
  const cache = useQueryClient();
  const channel = useChannel(id);
  const [panel, setPanel] = useState<'chat' | 'search' | 'members'>('chat');
  const [sentVersion, setSentVersion] = useState(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const subscription = useMutation({ mutationFn: async (subscribed: boolean) => {
    request.current = new AbortController();
    return api.subscribe(id, subscribed, request.current.signal);
  }, onSuccess: async (updated) => {
    const signal = request.current?.signal;
    if (!signal || signal.aborted) return;
    cache.setQueryData(['channel', id], updated);
    void refreshConversations(cache);
    if (updated.subscribed) await recoverHistory(cache, api, id, signal);
  } });
  if (channel.isPending) return <section className={styles.chat}><StatusPanel title="Открываем канал…" kind="loading" /></section>;
  if (channel.isError) return <section className={styles.chat}><StatusPanel title="Канал недоступен" kind="error" retry={() => void channel.refetch()}><p>{errorMessage(channel.error)}</p><Link className="button" to="/chats">К чатам</Link></StatusPanel></section>;
  const data = channel.data;
  const owner = data.viewerRole === 'OWNER';
  const canPost = owner || data.viewerRole === 'ADMIN';
  return <section className={styles.chat} aria-label={`Канал ${data.title}`}>
    <header className={styles.chatHeader}>
      <Link className={`button iconButton ${styles.back}`} to="/chats" aria-label="Назад к чатам"><Icon name="back" /></Link>
      <span className={styles.peerAvatar}><Avatar name={data.title} /></span><div className={styles.peerName}><strong>▣ {data.title}</strong><span>@{data.username} · {data.subscriberCount} подписчиков</span></div>
      {canPost && <button className={styles.searchToggle} onClick={() => setPanel(panel === 'members' ? 'chat' : 'members')} aria-label={panel === 'members' ? 'Закрыть участников' : 'Участники канала'} title="Участники канала" aria-pressed={panel === 'members'}><Icon name={panel === 'members' ? 'close' : 'people'} /></button>}
      <button className={styles.searchToggle} onClick={() => setPanel(panel === 'search' ? 'chat' : 'search')} aria-label={panel === 'search' ? 'Закрыть поиск' : 'Поиск в канале'} title="Поиск в канале" aria-pressed={panel === 'search'}><Icon name={panel === 'search' ? 'close' : 'search'} /></button>
    </header>
    <div className={styles.channelInfo}>{data.description && <p>{data.description}</p>}<div className={styles.channelActions}>
      <span>{owner ? 'Ваш канал' : data.viewerRole === 'ADMIN' ? 'Вы администратор' : data.subscribed ? 'Вы подписаны' : 'Открытый канал'}</span>
      {!owner && <button className={data.subscribed ? '' : 'primary'} disabled={subscription.isPending} onClick={() => subscription.mutate(!data.subscribed)}>{subscription.isPending ? 'Сохраняем…' : data.subscribed ? 'Отписаться' : 'Подписаться'}</button>}
    </div>{subscription.isError && <ErrorNotice error={subscription.error} retry={() => subscription.mutate(subscription.variables ?? !data.subscribed)} />}</div>
    {panel === 'members' ? <ChannelMembers channel={data} /> : panel === 'search' ? <SearchMessages id={id} canEditOwn={canPost} canModerate={canPost} canDeleteOwn={false} /> : <MessageHistory id={id} sentVersion={sentVersion} channel canModerate={canPost} canEditOwn={canPost} />}
    {canPost ? <Composer id={id} onSent={() => { setSentVersion((value) => value + 1); setPanel('chat'); }} /> : <div className={styles.readOnly}>Публикации канала. Сообщения отправляют владелец и администраторы.</div>}
  </section>;
}
