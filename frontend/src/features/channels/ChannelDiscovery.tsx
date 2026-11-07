import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import type { CreateChannel as ChannelInput } from '../../api/contracts';
import { ErrorNotice } from '../../shared/ui';
import { useSession } from '../auth/Session';
import { refreshConversations } from '../messages/history';
import styles from '../conversations/conversations.module.css';
export function CreateChannel() {
  const { api } = useSession();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [input, setInput] = useState<ChannelInput>({ username: '', title: '', description: '' });
  const [validation, setValidation] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const mutation = useMutation({ mutationFn: async (value: ChannelInput) => {
    request.current = new AbortController();
    return api.createChannel(value, request.current.signal);
  }, onSuccess: (channel) => {
    if (request.current?.signal.aborted) return;
    cache.setQueryData(['channel', channel.id], channel);
    void refreshConversations(cache);
    navigate(`/channels/${channel.id}`);
  } });
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;
    const value = { username: input.username.trim().toLowerCase(), title: input.title.trim(), description: input.description.trim() };
    if (!/^[a-z0-9_]{3,32}$/.test(value.username)) { setValidation('Логин: от 3 до 32 латинских букв, цифр или подчёркиваний.'); return; }
    if (!value.title || value.title.length > 80 || value.description.length > 500) { setValidation('Укажите название до 80 символов и описание до 500 символов.'); return; }
    setValidation(''); mutation.mutate(value);
  }
  return <section className={styles.people} aria-labelledby="create-channel-title"><header className={styles.peopleHeader}><Link className="button iconButton" to="/chats" aria-label="Назад к чатам">‹</Link><h1 id="create-channel-title">Создать канал</h1></header>
    <div className={styles.peopleBody}><p className={styles.hint}>Публикации доступны всем пользователям. Писать в канал можете только вы.</p>
      <form className={styles.channelForm} onSubmit={handleSubmit}>
        <label htmlFor="channel-title">Название</label><input id="channel-title" value={input.title} onChange={(event) => setInput({ ...input, title: event.target.value })} required maxLength={80} readOnly={mutation.isPending} autoFocus />
        <label htmlFor="channel-username">Логин канала</label><input id="channel-username" value={input.username} onChange={(event) => setInput({ ...input, username: event.target.value })} required minLength={3} maxLength={32} autoCapitalize="none" spellCheck={false} readOnly={mutation.isPending} aria-describedby="channel-username-hint" />
        <p className={styles.hint} id="channel-username-hint">3–32 латинские буквы, цифры или подчёркивания.</p>
        <label htmlFor="channel-description">Описание <span className={styles.hint}>(необязательно)</span></label><textarea id="channel-description" value={input.description} onChange={(event) => setInput({ ...input, description: event.target.value })} maxLength={500} rows={4} readOnly={mutation.isPending} />
        {validation && <p role="alert">{validation}</p>}{mutation.isError && <ErrorNotice error={mutation.error} />}
        <button className="primary" disabled={mutation.isPending}>{mutation.isPending ? 'Создаём…' : 'Создать канал'}</button>
      </form>
    </div></section>;
}

