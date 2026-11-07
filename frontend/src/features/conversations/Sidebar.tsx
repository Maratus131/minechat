import { Link, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, ErrorNotice, formatTime } from '../../shared/ui';
import { UserAvatar } from '../profile/UserAvatar';
import { useChannels } from '../channels/queries';
import { useGroups } from '../groups/queries';
import { useConversations } from './queries';
import styles from './conversations.module.css';

export type ChatFilter = 'all' | 'personal' | 'groups' | 'channels';
export function Sidebar({ filter, people = false, suffix = '' }: { filter: ChatFilter; people?: boolean; suffix?: string }) {
  const location = useLocation();
  const cache = useQueryClient();
  const personal = useConversations();
  const channels = useChannels();
  const groups = useGroups();
  const dialogs = [...new Map(personal.data?.pages.flatMap((page) => page.items).map((item) => [item.id, item])).values()];
  const feeds = [...new Map(channels.data?.pages.flatMap((page) => page.items).map((item) => [item.id, item])).values()];
  const rooms = [...new Map(groups.data?.pages.flatMap((page) => page.items).map((item) => [item.id, item])).values()];
  const items = [
    ...(filter !== 'all' && filter !== 'personal' && !people ? [] : dialogs.map((item) => ({ ...item, type: 'personal' as const, name: item.peer.displayName, path: `/chats/${item.id}`, username: item.peer.username }))),
    ...(!people && (filter === 'all' || filter === 'groups') ? rooms.map((item) => ({ ...item, type: 'group' as const, name: item.title, path: `/groups/${item.id}`, username: '' })) : []),
    ...(!people && (filter === 'all' || filter === 'channels') ? feeds.map((item) => ({ ...item, type: 'channel' as const, name: item.title, path: `/channels/${item.id}`, username: item.username })) : []),
  ].sort((a, b) => people ? a.name.localeCompare(b.name, 'ru') : Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt) || a.id.localeCompare(b.id));
  const queries = people || filter === 'personal' ? [personal] : filter === 'groups' ? [groups] : filter === 'channels' ? [channels] : [personal, groups, channels];
  const pending = queries.some((query) => query.isPending);
  return <div className={styles.listArea}>
    <h1 className={styles.sectionTitle}>{people ? 'Собеседники' : filter === 'personal' ? 'Личные' : filter === 'groups' ? 'Группы' : filter === 'channels' ? 'Каналы' : 'Все чаты'}</h1>
    {people && <p className={styles.emptyList}>Люди из ваших переписок. Найдите новых собеседников через поиск выше.</p>}
    {pending && <p className={styles.emptyList} role="status">Загрузка…</p>}
    {(people || filter === 'all' || filter === 'personal') && personal.isError && <ErrorNotice error={personal.error} retry={() => void personal.refetch()} />}
    {!people && filter !== 'personal' && filter !== 'groups' && channels.isError && <ErrorNotice error={channels.error} retry={() => void channels.refetch()} />}
    {!people && filter !== 'personal' && filter !== 'channels' && groups.isError && <ErrorNotice error={groups.error} retry={() => void groups.refetch()} />}
    {!pending && !items.length && !queries.some((query) => query.isError) && <p className={styles.emptyList}>{people ? 'Здесь появятся ваши собеседники.' : filter === 'channels' ? 'Подписок пока нет. Найдите канал через поиск.' : filter === 'groups' ? 'Групп пока нет. Создайте группу через меню.' : 'Пока пусто. Найдите собеседника или создайте группу.'}</p>}
    <ul className={styles.list}>{items.map((item) => <li key={`${item.type}-${item.id}`}><Link to={`${item.path}${suffix}`} aria-current={location.pathname === item.path ? 'page' : undefined}
      onClick={() => cache.setQueryData([item.type === 'personal' ? 'conversation' : item.type, item.id], item)} className={styles.dialog}>
      {item.type === 'personal' ? <UserAvatar user={item.peer} /> : <Avatar name={item.name} />}<span className={styles.dialogText}><span className={styles.rowHeading}><strong>{item.type === 'channel' && <span aria-label="Канал">▣ </span>}{item.type === 'group' && <span aria-label="Группа">▥ </span>}{item.name}</strong>{!people && item.lastMessageId && <time dateTime={item.lastActivityAt}>{formatTime(item.lastActivityAt)}</time>}</span><span className={styles.preview}>{people ? `@${item.username}` : item.lastMessageId ? item.lastMessageText || 'Вложение' : item.type === 'channel' ? 'Публикаций пока нет' : 'Начните переписку'}</span></span>
    </Link></li>)}</ul>
    {queries.some((query) => query.hasNextPage) && <button className={styles.more} disabled={queries.some((query) => query.isFetchingNextPage)} onClick={() => { for (const query of queries) if (query.hasNextPage) void query.fetchNextPage(); }}>{queries.some((query) => query.isFetchingNextPage) ? 'Загрузка…' : people ? 'Ещё собеседники' : 'Ещё чаты'}</button>}
  </div>;
}

