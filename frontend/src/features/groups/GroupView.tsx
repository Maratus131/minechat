import { Icon } from '../../shared/Icon';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { errorMessage } from '../../api/client';
import { Avatar, StatusPanel } from '../../shared/ui';
import { Composer } from '../messages/Composer';
import { MessageHistory } from '../messages/MessageHistory';
import { SearchMessages } from '../messages/SearchMessages';
import { useGroup } from './queries';
import { GroupMembers } from './GroupMembers';
import styles from '../messages/messages.module.css';

export function GroupRoute() {
  const { id = '' } = useParams();
  return <GroupView key={id} id={id} />;
}
function GroupView({ id }: { id: string }) {
  const group = useGroup(id);
  const [panel, setPanel] = useState<'chat' | 'search' | 'members'>('chat');
  const [sentVersion, setSentVersion] = useState(0);
  if (group.isPending) return <section className={styles.chat}><StatusPanel title="Открываем группу…" kind="loading" /></section>;
  if (group.isError) return <section className={styles.chat}><StatusPanel title="Группа недоступна" kind="error" retry={() => void group.refetch()}>{errorMessage(group.error)}<Link className="button" to="/chats">К чатам</Link></StatusPanel></section>;
  const data = group.data;
  return <section className={styles.chat} aria-label={`Группа ${data.title}`}>
    <header className={styles.chatHeader}>
      <Link className={`button iconButton ${styles.back}`} to="/chats" aria-label="Назад к чатам"><Icon name="back" /></Link>
      <span className={styles.peerAvatar}><Avatar name={data.title} /></span>
      <div className={styles.peerName}><strong>▥ {data.title}</strong><span>{data.memberCount} участников</span></div>
      <button className={styles.searchToggle} onClick={() => setPanel(panel === 'members' ? 'chat' : 'members')} aria-label={panel === 'members' ? 'Закрыть участников' : 'Участники группы'} title="Участники группы" aria-pressed={panel === 'members'}><Icon name={panel === 'members' ? 'close' : 'people'} /></button>
      <button className={styles.searchToggle} onClick={() => setPanel(panel === 'search' ? 'chat' : 'search')} aria-label={panel === 'search' ? 'Закрыть поиск' : 'Поиск в группе'} title="Поиск в группе" aria-pressed={panel === 'search'}><Icon name={panel === 'search' ? 'close' : 'search'} /></button>
    </header>
    {panel === 'members' ? <GroupMembers group={data} /> : panel === 'search' ? <SearchMessages id={id} /> : <MessageHistory id={id} sentVersion={sentVersion} canModerate={data.viewerRole === 'OWNER' || data.viewerRole === 'ADMIN'} canDeleteOwn={data.viewerRole !== 'READER'} />}
    {data.viewerRole === 'READER' ? <div className={styles.readOnly}>Вы можете читать сообщения этой группы.</div> : <Composer id={id} onSent={() => { setSentVersion((value) => value + 1); setPanel('chat'); }} />}
  </section>;
}
