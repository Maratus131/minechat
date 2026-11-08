import { Icon } from '../../shared/Icon';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { errorMessage } from '../../api/client';
import { StatusPanel } from '../../shared/ui';
import { UserAvatar } from '../profile/UserAvatar';
import { useSession } from '../auth/Session';
import { useConversation } from '../conversations/queries';
import { MessageHistory } from './MessageHistory';
import { Composer } from './Composer';
import { SearchMessages } from './SearchMessages';
import styles from './messages.module.css';

export function ChatRoute() {
  const { id = '' } = useParams();
  return <ChatView key={id} id={id} />;
}
function ChatView({ id }: { id: string }) {
  const { api } = useSession();
  const dialog = useConversation(id);
  const presence = useQuery({
    queryKey: ['presence', id],
    queryFn: ({ signal }) => api.presence(id, signal),
    enabled: dialog.isSuccess,
    staleTime: 30_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const [searching, setSearching] = useState(false);
  const [sentVersion, setSentVersion] = useState(0);
  if (dialog.isPending) return <section className={styles.chat}><StatusPanel title="Открываем диалог…" kind="loading" /></section>;
  if (dialog.isError) return <section className={styles.chat}><StatusPanel title="Диалог недоступен" kind="error" retry={() => void dialog.refetch()}><p>{errorMessage(dialog.error)}</p><Link className="button" to="/chats">К диалогам</Link></StatusPanel></section>;
  const online = !presence.isError && !presence.isStale && presence.data?.userId === dialog.data.peer.id && presence.data.online;
  return <section className={styles.chat} aria-label={`Диалог с ${dialog.data.peer.displayName}`}>
    <header className={styles.chatHeader}>
      <Link className={`button iconButton ${styles.back}`} to="/chats" aria-label="Назад к диалогам"><Icon name="back" /></Link>
      <span className={styles.peerAvatar}><UserAvatar user={dialog.data.peer} /></span>
      <div className={styles.peerName}><strong>{dialog.data.peer.displayName}</strong><span className={online ? styles.online : undefined}>{online ? 'В сети' : `@${dialog.data.peer.username}`}</span></div>
      <button className={styles.searchToggle} onClick={() => setSearching(!searching)} aria-label={searching ? 'Закрыть поиск' : 'Поиск в чате'} title={searching ? 'Закрыть поиск' : 'Поиск в чате'} aria-pressed={searching}><Icon name={searching ? 'close' : 'search'} /></button>
    </header>
    {searching ? <SearchMessages id={id} /> : <MessageHistory id={id} sentVersion={sentVersion} />}
    <Composer id={id} onSent={() => { setSentVersion((value) => value + 1); setSearching(false); }} />
  </section>;
}
