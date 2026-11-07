import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import type { User } from '../../api/contracts';
import { ErrorNotice } from '../../shared/ui';
import { useSession } from '../auth/Session';
import { UserAvatar } from '../profile/UserAvatar';
import { refreshConversations } from '../messages/history';
import styles from '../conversations/conversations.module.css';

export function CreateGroup() {
  const { api, user: viewer } = useSession();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [term, setTerm] = useState('');
  const [members, setMembers] = useState<User[]>([]);
  const [validation, setValidation] = useState('');
  const users = useQuery({ queryKey: ['users', term], queryFn: ({ signal }) => api.users(term, signal), enabled: term.trim().length >= 2 });
  const create = useMutation({ mutationFn: () => api.createGroup(title.trim(), members.map((user) => user.id)), onSuccess: (group) => {
    cache.setQueryData(['group', group.id], group);
    void refreshConversations(cache);
    navigate(`/groups/${group.id}`);
  } });
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || title.trim().length > 80) { setValidation('Название группы: от 1 до 80 символов.'); return; }
    if (!members.length) { setValidation('Добавьте хотя бы одного участника.'); return; }
    setValidation(''); create.mutate();
  }
  function toggle(user: User) {
    setMembers((current) => current.some((item) => item.id === user.id) ? current.filter((item) => item.id !== user.id) : [...current, user]);
  }
  return <section className={styles.people} aria-labelledby="create-group-title">
    <header className={styles.peopleHeader}><Link className="button iconButton" to="/chats" aria-label="Назад к чатам">‹</Link><h1 id="create-group-title">Новая группа</h1></header>
    <div className={styles.peopleBody}><form className={styles.channelForm} onSubmit={handleSubmit}>
      <label htmlFor="group-title">Название группы</label><input id="group-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required autoFocus />
      <label htmlFor="group-users">Добавить людей по логину</label><input id="group-users" type="search" value={term} onChange={(event) => setTerm(event.target.value.replace(/^@/, ''))} placeholder="Введите от 2 символов" maxLength={32} autoCapitalize="none" />
      {members.length > 0 && <p className={styles.hint}>Выбраны: {members.map((user) => user.displayName).join(', ')}</p>}
      {users.isPending && term.length >= 2 && <p className={styles.hint} role="status">Ищем людей…</p>}
      {users.isError && <ErrorNotice error={users.error} retry={() => void users.refetch()} />}
      {users.isSuccess && users.data.items.length === 0 && <p className={styles.hint}>Люди не найдены.</p>}
      {users.isSuccess && <ul className={styles.groupChoices}>{users.data.items.filter((user) => user.id !== viewer.id).map((user) => <li key={user.id}><label><input type="checkbox" checked={members.some((item) => item.id === user.id)} onChange={() => toggle(user)} /><UserAvatar user={user} /><span>{user.displayName}<small>@{user.username}</small></span></label></li>)}</ul>}
      {validation && <p role="alert">{validation}</p>}{create.isError && <ErrorNotice error={create.error} />}
      <button className="primary" disabled={create.isPending}>{create.isPending ? 'Создаём…' : 'Создать группу'}</button>
    </form></div>
  </section>;
}
