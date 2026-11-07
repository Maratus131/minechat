import { useState, type FormEvent } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import { ErrorNotice, StatusPanel } from '../../shared/ui';
import { useSession } from '../auth/Session';
import { MessageItem } from './MessageItem';
import styles from './messages.module.css';

export function SearchMessages({ id }: { id: string }) {
  const { api, user } = useSession();
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const query = useInfiniteQuery({
    queryKey: ['message-search', id, term], initialPageParam: 0, enabled: term.length > 0,
    queryFn: ({ pageParam, signal }) => api.search(id, term, pageParam, signal),
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
    <ol className={styles.messageList}>{messages.map((message) => <li key={message.id}><MessageItem message={message} mine={message.sender.id === user.id} showDate /></li>)}</ol>
    {query.hasNextPage && <button className={styles.searchMore} disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? 'Загрузка…' : 'Ещё результаты'}</button>}
    {messages.length >= 1000 && <p className={styles.searchHint}>Показаны первые 1000 результатов. Уточните запрос.</p>}
    <p className={styles.searchHint}>Поиск только в этом диалоге.<br />Новые сообщения могут появиться в результатах с небольшой задержкой.</p>
  </div>;
}
