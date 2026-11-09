import { useState, type FormEvent } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import { ErrorNotice, StatusPanel } from '../../shared/ui';
import { useSession } from '../auth/Session';
import { MessageItem } from './MessageItem';
import { acceptMessage, historyKey, mergeMessages, type History } from './history';
import type { Message, Page } from '../../api/contracts';
import styles from './messages.module.css';

export function SearchMessages({ id, canEditOwn = true, canModerate = false, canDeleteOwn = true }: { id: string; canEditOwn?: boolean; canModerate?: boolean; canDeleteOwn?: boolean }) {
  const { api, user } = useSession();
  const cache = useQueryClient();
  const deletion = useMutation({ mutationFn: (messageId: number) => api.deleteMessage(id, messageId), onSuccess: (message) => {
    acceptMessage(cache, message);
    void cache.invalidateQueries({ queryKey: ['message-search', id] });
  } });
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const query = useInfiniteQuery({
    queryKey: ['message-search', id, term], initialPageParam: 0, enabled: term.length > 0,
    queryFn: async ({ pageParam, signal }) => {
      const page = await api.search(id, term, pageParam, signal);
      const previous = cache.getQueryData<InfiniteData<Page<Message>>>(['message-search', id, term]);
      const history = cache.getQueryData<History>(historyKey(id));
      // Search indexing can lag behind REST/WS edits. Keep the freshest known content.
      const latest = new Map(mergeMessages(page.items, previous?.pages.flatMap((item) => item.items) ?? [], history?.items ?? []).map((item) => [item.id, item]));
      return { ...page, items: page.items.map((item) => latest.get(item.id)!) };
    },
    getNextPageParam: (page, pages) => page.hasMore && pages.length < 50 ? pages.length : undefined,
    retry: false,
  });
  const messages = [...new Map(query.data?.pages.flatMap((page) => page.items).map((message) => [message.id, message])).values()];
  function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    if (term === text.trim()) void query.refetch();
    else setTerm(text.trim());
  }
  return <div className={styles.search}>
    <form className={styles.searchForm} onSubmit={handleSearch}><label htmlFor="message-search" className="srOnly">Текст для поиска в диалоге</label>
      <input id="message-search" placeholder="Поиск в этом диалоге" value={text} onChange={(event) => setText(event.target.value)} maxLength={200} autoFocus />
      <button disabled={!text.trim() || query.isFetching} type="submit">Найти</button>
    </form>
    {term && query.isPending && <StatusPanel title="Поиск сообщений…" kind="loading" />}
    {query.isError && !query.data && <StatusPanel title="Поиск недоступен" kind="error" retry={() => void query.refetch()}>{errorMessage(query.error)}<p>Переписка продолжает работать.</p></StatusPanel>}
    {query.isError && query.data && <ErrorNotice error={query.error} retry={() => void query.fetchNextPage()} />}
    {query.isSuccess && <p className={styles.searchHint} role="status">Найдено: {messages.length}{query.hasNextPage ? '+' : ''}</p>}
    {query.isSuccess && messages.length === 0 && <StatusPanel title="Сообщения не найдены">Попробуйте другие слова или повторите поиск позже.</StatusPanel>}
    {deletion.isError && <ErrorNotice error={deletion.error} />}
    <ol className={styles.messageList}>{messages.map((message) => <li key={message.id}><MessageItem message={message} mine={message.sender.id === user.id} showDate
      onEdit={!message.deleted && canEditOwn && message.sender.id === user.id ? async (text, signal) => { const updated = await api.editMessage(id, message.id, text, signal); signal.throwIfAborted(); acceptMessage(cache, updated); } : undefined}
      deleting={deletion.isPending && deletion.variables === message.id}
      onDelete={!message.deleted && (canModerate || (canDeleteOwn && message.sender.id === user.id)) ? () => { if (window.confirm('Удалить сообщение для всех?')) deletion.mutate(message.id); } : undefined} /></li>)}</ol>
    {query.hasNextPage && <button className={styles.searchMore} disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? 'Загрузка…' : 'Ещё результаты'}</button>}
    {messages.length >= 1000 && <p className={styles.searchHint}>Показаны первые 1000 результатов. Уточните запрос.</p>}
    <p className={styles.searchHint}>Поиск только в этом диалоге.<br />Новые сообщения могут появиться в результатах с небольшой задержкой.</p>
  </div>;
}
