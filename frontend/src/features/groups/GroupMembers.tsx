import { useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { Group, GroupRole } from '../../api/contracts';
import { ErrorNotice } from '../../shared/ui';
import { useSession } from '../auth/Session';
import { UserAvatar } from '../profile/UserAvatar';
import { refreshConversations } from '../messages/history';
import styles from './groups.module.css';

const roleName: Record<GroupRole, string> = { OWNER: 'Владелец', ADMIN: 'Администратор', MEMBER: 'Участник', READER: 'Только чтение' };

export function GroupMembers({ group }: { group: Group }) {
  const { api, user } = useSession();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [role, setRole] = useState<'MEMBER' | 'READER'>('MEMBER');
  const canManage = group.viewerRole === 'OWNER' || group.viewerRole === 'ADMIN';
  const members = useInfiniteQuery({ queryKey: ['group-members', group.id], initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => api.groupMembers(group.id, pageParam, signal),
    getNextPageParam: (last, pages) => last.hasMore ? pages.length : undefined });
  const memberList = members.data?.pages.flatMap((page) => page.items) ?? [];
  const users = useQuery({ queryKey: ['users', term], queryFn: ({ signal }) => api.users(term, signal), enabled: canManage && term.trim().length >= 2 });
  const change = useMutation({ mutationFn: ({ userId, next }: { userId: string; next: Exclude<GroupRole, 'OWNER'> }) => api.setGroupRole(group.id, userId, next),
    onSuccess: () => { void cache.invalidateQueries({ queryKey: ['group-members', group.id] }); void refreshConversations(cache); } });
  const add = useMutation({ mutationFn: (userId: string) => api.addGroupMember(group.id, userId, role),
    onSuccess: () => { setTerm(''); void cache.invalidateQueries({ queryKey: ['group-members', group.id] }); void refreshConversations(cache); } });
  const remove = useMutation({ mutationFn: (userId: string) => api.removeGroupMember(group.id, userId),
    onSuccess: (_, userId) => {
      void cache.invalidateQueries({ queryKey: ['group-members', group.id] });
      void refreshConversations(cache);
      if (userId === user.id) navigate('/chats');
    } });
  return <section className={styles.members} aria-label="Участники группы">
    <h2>Участники · {group.memberCount}</h2>
    {group.viewerRole !== 'OWNER' && <button disabled={remove.isPending} onClick={() => {
      if (window.confirm('Покинуть группу?')) remove.mutate(user.id);
    }}>Покинуть группу</button>}
    {members.isPending && <p role="status">Загрузка участников…</p>}
    {members.isError && <ErrorNotice error={members.error} retry={() => void members.refetch()} />}
    {members.data && <ul>{memberList.map((member) => {
      const own = member.user.id === user.id;
      const manageable = canManage && !own && member.role !== 'OWNER' && (group.viewerRole === 'OWNER' || member.role !== 'ADMIN');
      return <li key={member.user.id}><UserAvatar user={member.user} /><span><strong>{member.user.displayName}</strong><small>@{member.user.username} · {roleName[member.role]}</small></span>
        {manageable && <div className={styles.memberActions}>
          <label className="srOnly" htmlFor={`group-role-${member.user.id}`}>Роль {member.user.displayName}</label>
          <select id={`group-role-${member.user.id}`} value={member.role} disabled={change.isPending || remove.isPending}
            onChange={(event) => change.mutate({ userId: member.user.id, next: event.target.value as Exclude<GroupRole, 'OWNER'> })}>
            {group.viewerRole === 'OWNER' && <option value="ADMIN">Администратор</option>}<option value="MEMBER">Участник</option><option value="READER">Только чтение</option>
          </select><button disabled={remove.isPending || change.isPending} onClick={() => { if (window.confirm(`Удалить ${member.user.displayName} из группы?`)) remove.mutate(member.user.id); }}>Удалить</button>
        </div>}
      </li>;
    })}</ul>}
    {members.hasNextPage && <button disabled={members.isFetchingNextPage} onClick={() => void members.fetchNextPage()}>{members.isFetchingNextPage ? 'Загрузка…' : 'Ещё участники'}</button>}
    {(change.isError || add.isError || remove.isError) && <ErrorNotice error={change.error || add.error || remove.error} />}
    {canManage && <div className={styles.addMember}><label htmlFor="add-group-member">Добавить участника по логину</label><div><input id="add-group-member" type="search" value={term} onChange={(event) => setTerm(event.target.value.replace(/^@/, ''))} placeholder="От 2 символов" maxLength={32} /><select aria-label="Роль нового участника" value={role} onChange={(event) => setRole(event.target.value as 'MEMBER' | 'READER')}><option value="MEMBER">Участник</option><option value="READER">Только чтение</option></select></div>
      {users.isPending && term.length >= 2 && <p role="status">Ищем людей…</p>}
      {users.isError && <ErrorNotice error={users.error} retry={() => void users.refetch()} />}
      {users.isSuccess && users.data.items.length === 0 && <p>Люди не найдены.</p>}
      {users.isSuccess && <ul>{users.data.items.filter((person) => person.id !== user.id && !memberList.some((member) => member.user.id === person.id)).map((person) => <li key={person.id}><UserAvatar user={person} /><span>{person.displayName}<small>@{person.username}</small></span><button disabled={add.isPending} onClick={() => add.mutate(person.id)}>Добавить</button></li>)}</ul>}
    </div>}
  </section>;
}
