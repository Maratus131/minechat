import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { errorMessage } from '../../api/client';
import { StatusPanel } from '../../shared/ui';
import { UserAvatar } from '../profile/UserAvatar';
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
  const dialog = useConversation(id);
  const [searching, setSearching] = useState(false);
  const [sentVersion, setSentVersion] = useState(0);
  if (dialog.isPending) return <section className={styles.chat}><StatusPanel title="Открываем диалог…" kind="loading" /></section>;
  if (dialog.isError) return <section className={styles.chat}><StatusPanel title="Диалог недоступен" kind="error" retry={() => void dialog.refetch()}><p>{errorMessage(dialog.error)}</p><Link className="button" to="/chats">К диалогам</Link></StatusPanel></section>;
  return <section className={styles.chat} aria-label={`Диалог с ${dialog.data.peer.displayName}`}>
    <header className={styles.chatHeader}>
      <Link className={`button iconButton ${styles.back}`} to="/chats" aria-label="Назад к диалогам">‹</Link>
      <span className={styles.peerAvatar}><UserAvatar user={dialog.data.peer} /></span>
      <div className={styles.peerName}><strong>{dialog.data.peer.displayName}</strong><span>@{dialog.data.peer.username}</span></div>
      <button className={styles.searchToggle} onClick={() => setSearching(!searching)} aria-pressed={searching}>{searching ? 'Чат' : <><span className={styles.searchDesktop}>Поиск в чате</span><span className={styles.searchMobile}>Поиск</span></>}</button>
    </header>
    {searching ? <SearchMessages id={id} /> : <MessageHistory id={id} sentVersion={sentVersion} />}
    <Composer id={id} onSent={() => { setSentVersion((value) => value + 1); setSearching(false); }} />
  </section>;
}
