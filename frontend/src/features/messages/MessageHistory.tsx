import { useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import { ErrorNotice, StatusPanel, formatDate } from '../../shared/ui';
import { useSession } from '../auth/Session';
import { acceptMessage, useHistory } from './history';
import { MessageItem } from './MessageItem';
import styles from './messages.module.css';

export function MessageHistory({ id, sentVersion, channel = false, canModerate = false, canDeleteOwn = true }: { id: string; sentVersion: number; channel?: boolean; canModerate?: boolean; canDeleteOwn?: boolean }) {
  const { api, user } = useSession();
  const cache = useQueryClient();
  const { history, older } = useHistory(id);
  const deletion = useMutation({ mutationFn: (messageId: number) => api.deleteMessage(id, messageId), onSuccess: (message) => {
    acceptMessage(cache, message);
    void cache.invalidateQueries({ queryKey: ['message-search', id] });
  } });
  const viewport = useRef<HTMLDivElement>(null);
  const bottom = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const anchor = useRef<{ id: string; offset: number; firstId: number } | null>(null);
  const lastSent = useRef(sentVersion);
  const messages = history.data?.items;
  const list = useRef<HTMLOListElement>(null);

  useLayoutEffect(() => {
    const element = viewport.current;
    const content = list.current;
    if (!element || !content) return;
    const observer = new ResizeObserver(() => {
      // Stay at the latest post when lazy media finishes loading. Native scroll
      // anchoring preserves the visible message while reading older history.
      if (bottom.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || !messages?.length) return;
    const saved = anchor.current;
    if (saved && messages[0]!.id < saved.firstId) {
      const row = element.querySelector<HTMLElement>(`[data-message-id="${saved.id}"]`);
      if (row) element.scrollTop += row.getBoundingClientRect().top - element.getBoundingClientRect().top - saved.offset;
      anchor.current = null;
    } else if (bottom.current || lastSent.current !== sentVersion) {
      element.scrollTop = element.scrollHeight;
      lastSent.current = sentVersion;
    }
  }, [messages, sentVersion]);

  function handleScroll() {
    const element = viewport.current;
    if (!element) return;
    const isBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 70;
    bottom.current = isBottom;
    setAtBottom(isBottom);
  }
  async function handleOlder() {
    const element = viewport.current;
    if (!element || older.isPending || !messages?.length) return;
    const rect = element.getBoundingClientRect();
    const row = [...element.querySelectorAll<HTMLElement>('[data-message-id]')].find((item) => item.getBoundingClientRect().bottom >= rect.top);
    if (row?.dataset.messageId) anchor.current = { id: row.dataset.messageId, offset: row.getBoundingClientRect().top - rect.top, firstId: messages[0]!.id };
    try { await older.mutateAsync(); } catch { anchor.current = null; }
  }
  return <div className={styles.historyWrap}>
    <div ref={viewport} onScroll={handleScroll} className={styles.history} aria-label="История сообщений" tabIndex={0}>
      {history.isPending && <StatusPanel title="Загрузка сообщений…" kind="loading" />}
      {history.isError && !history.data && <StatusPanel title="История не загрузилась" kind="error" retry={() => void history.refetch()}>{errorMessage(history.error)}</StatusPanel>}
      {history.data && history.isError && <ErrorNotice error={history.error} retry={() => void history.refetch()} />}
      {history.data?.hasMore && <button className={styles.older} disabled={older.isPending} onClick={() => void handleOlder()}>{older.isPending ? 'Загрузка…' : 'Ранние сообщения'}</button>}
      {older.isError && <ErrorNotice error={older.error} retry={() => void handleOlder()} />}
      {deletion.isError && <ErrorNotice error={deletion.error} />}
      {messages?.length === 0 && <StatusPanel title={channel ? 'Публикаций пока нет' : 'Начните переписку'}>{channel ? 'Новые публикации появятся здесь.' : 'Напишите первое сообщение или прикрепите файл.'}</StatusPanel>}
      <ol ref={list} className={`${styles.messageList} ${channel ? styles.channelPosts : ''}`}>{messages?.map((message, index) => {
        const previous = messages[index - 1];
        const date = formatDate(message.createdAt);
        const canDelete = !message.deleted && (canModerate || (canDeleteOwn && !channel && message.sender.id === user.id));
        return <li key={message.id} data-message-id={message.id}>{(!previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString()) && <div className={styles.date}>{date}</div>}<MessageItem message={message} mine={!channel && message.sender.id === user.id} deleting={deletion.isPending && deletion.variables === message.id} onDelete={canDelete ? () => { if (window.confirm('Удалить сообщение для всех?')) deletion.mutate(message.id); } : undefined} /></li>;
      })}</ol>
    </div>
    {!atBottom && !!messages?.length && <button className={styles.toBottom} onClick={() => { if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight; }}>К новым сообщениям ↓</button>}
  </div>;
}
