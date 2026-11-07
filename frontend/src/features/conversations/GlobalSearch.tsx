import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { Avatar, ErrorNotice } from '../../shared/ui';
import { useSession } from '../auth/Session';
import { UserAvatar } from '../profile/UserAvatar';
import { refreshConversations } from '../messages/history';
import styles from './conversations.module.css';

export function GlobalSearch({ text, suffix }: { text: string; suffix: string }) {
  const { api } = useSession();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const normalized = text.trim().replace(/^@/, '').trim();
  const [term, setTerm] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(normalized), 250);
    return () => window.clearTimeout(timer);
  }, [normalized]);
  useEffect(() => () => request.current?.abort(), []);
  const ready = term === normalized && term.length >= 2 && term.length <= 100;
  const users = useQuery({ queryKey: ['users', normalized], queryFn: ({ signal }) => api.users(normalized, signal), enabled: ready && term.length <= 32 });
  const channels = useInfiniteQuery({ queryKey: ['channel-search', normalized], initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => api.findChannels(normalized, pageParam, signal),
    getNextPageParam: (last, pages) => last.hasMore ? pages.length : undefined, enabled: ready });
  const open = useMutation({ mutationFn: (userId: string) => {
    request.current = new AbortController();
    return api.openConversation(userId, request.current.signal);
  }, onSuccess: (dialog) => {
    if (request.current?.signal.aborted) return;
    cache.setQueryData(['conversation', dialog.id], dialog);
    void refreshConversations(cache);
    navigate(`/chats/${dialog.id}${suffix}`);
  } });
  if (normalized.length < 2) return <p className={styles.emptyList}>Введите от 2 символов. Ищите людей по началу логина, каналы по названию или @логину.</p>;
  if (normalized.length > 100) return <p className={styles.emptyList}>Сократите запрос до 100 символов.</p>;
  if (!ready) return <p className={styles.emptyList} role="status">Ищем…</p>;
  const feeds = [...new Map(channels.data?.pages.flatMap((page) => page.items).map((channel) => [channel.id, channel])).values()];
  return <div className={styles.results}>
    {open.isError && <ErrorNotice error={open.error} />}
    <section aria-labelledby="search-users-title"><h2 id="search-users-title" className={styles.sectionTitle}>Люди</h2>
      {term.length > 32 ? <p className={styles.emptyList}>Логин содержит не больше 32 символов.</p> : <>
        {users.isPending && <p className={styles.emptyList} role="status">Ищем людей…</p>}
        {users.isError && <ErrorNotice error={users.error} retry={() => void users.refetch()} />}
        {users.isSuccess && !users.data.items.length && <p className={styles.emptyList}>Люди не найдены.</p>}
        <ul className={styles.list}>{users.data?.items.map((person) => <li key={person.id}><button className={styles.dialog} disabled={open.isPending} onClick={() => open.mutate(person.id)}>
          <UserAvatar user={person} /><span className={styles.dialogText}><strong>{person.displayName}</strong><span className={styles.preview}>{open.isPending && open.variables === person.id ? 'Открываем…' : `@${person.username}`}</span></span>
        </button></li>)}</ul>
        {users.data?.hasMore && <p className={styles.emptyList}>Уточните логин, чтобы увидеть остальных людей.</p>}
      </>}
    </section>
    <section aria-labelledby="search-channels-title"><h2 id="search-channels-title" className={styles.sectionTitle}>Каналы</h2>
      {channels.isPending && <p className={styles.emptyList} role="status">Ищем каналы…</p>}
      {channels.isError && <ErrorNotice error={channels.error} retry={() => void channels.refetch()} />}
      {channels.isSuccess && !feeds.length && <p className={styles.emptyList}>Каналы не найдены.</p>}
      <ul className={styles.list}>{feeds.map((channel) => <li key={channel.id}><Link className={styles.dialog} to={`/channels/${channel.id}${suffix}`} onClick={() => cache.setQueryData(['channel', channel.id], channel)}>
        <Avatar name={channel.title} /><span className={styles.dialogText}><strong>▣ {channel.title}</strong><span className={styles.preview}>@{channel.username}</span></span>
      </Link></li>)}</ul>
      {channels.hasNextPage && <button className={styles.more} disabled={channels.isFetchingNextPage} onClick={() => void channels.fetchNextPage()}>{channels.isFetchingNextPage ? 'Загрузка…' : 'Ещё каналы'}</button>}
    </section>
  </div>;
}

