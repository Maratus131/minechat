import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Channel } from '../../api/contracts';
import { ErrorNotice } from '../../shared/ui';
import { useSession } from '../auth/Session';
import { UserAvatar } from '../profile/UserAvatar';
import styles from '../groups/groups.module.css';

export function ChannelMembers({ channel }: { channel: Channel }) {
  const { api } = useSession();
  const cache = useQueryClient();
  const members = useInfiniteQuery({ queryKey: ['channel-members', channel.id], initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => api.channelMembers(channel.id, pageParam, signal),
    getNextPageParam: (last, pages) => last.hasMore ? pages.length : undefined });
  const change = useMutation({ mutationFn: ({ userId, role }: { userId: string; role: 'ADMIN' | 'SUBSCRIBER' }) => api.setChannelRole(channel.id, userId, role),
    onSuccess: () => { void cache.invalidateQueries({ queryKey: ['channel-members', channel.id] }); void cache.invalidateQueries({ queryKey: ['channel', channel.id] }); } });
  return <section className={styles.members} aria-label="Участники канала">
    <h2>Подписчики · {channel.subscriberCount}</h2>
    {members.isPending && <p role="status">Загрузка подписчиков…</p>}
    {members.isError && <ErrorNotice error={members.error} retry={() => void members.refetch()} />}
    {change.isError && <ErrorNotice error={change.error} />}
    {members.data && <ul>{members.data.pages.flatMap((page) => page.items).map((member) => <li key={member.user.id}>
      <UserAvatar user={member.user} /><span><strong>{member.user.displayName}</strong><small>@{member.user.username} · {member.role === 'OWNER' ? 'Владелец' : member.role === 'ADMIN' ? 'Администратор' : 'Подписчик'}</small></span>
      {channel.viewerRole === 'OWNER' && member.role !== 'OWNER' && <div className={styles.memberActions}><label className="srOnly" htmlFor={`channel-role-${member.user.id}`}>Роль {member.user.displayName}</label><select id={`channel-role-${member.user.id}`} value={member.role} disabled={change.isPending} onChange={(event) => change.mutate({ userId: member.user.id, role: event.target.value as 'ADMIN' | 'SUBSCRIBER' })}><option value="ADMIN">Администратор</option><option value="SUBSCRIBER">Подписчик</option></select></div>}
    </li>)}</ul>}
    {members.hasNextPage && <button disabled={members.isFetchingNextPage} onClick={() => void members.fetchNextPage()}>{members.isFetchingNextPage ? 'Загрузка…' : 'Ещё подписчики'}</button>}
  </section>;
}
