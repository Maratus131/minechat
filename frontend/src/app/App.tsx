import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useMatch, useNavigate, useSearchParams } from 'react-router';
import { StatusPanel } from '../shared/ui';
import { UserAvatar } from '../features/profile/UserAvatar';
import { ProfilePage } from '../features/profile/ProfilePage';
import { AuthPage } from '../features/auth/AuthPage';
import { useAuth, useSession } from '../features/auth/Session';
import { Sidebar, type ChatFilter } from '../features/conversations/Sidebar';
import { GlobalSearch } from '../features/conversations/GlobalSearch';
import { ChatRoute } from '../features/messages/ChatView';
import { useRealtime } from '../features/realtime/useRealtime';
import { ChannelRoute } from '../features/channels/ChannelView';
import { CreateChannel } from '../features/channels/ChannelDiscovery';
import { CreateGroup } from '../features/groups/CreateGroup';
import { GroupRoute } from '../features/groups/GroupView';
import { NavigationMenu } from './NavigationMenu';
import styles from './App.module.css';

function RequireSession() {
  const { session } = useAuth();
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}

function ChatLayout() {
  const { user } = useSession();
  const connection = useRealtime();
  const chatMatch = useMatch('/chats/:id');
  const channelMatch = useMatch('/channels/:id');
  const groupMatch = useMatch('/groups/:id');
  const people = !!useMatch('/people');
  const profile = !!useMatch('/profile');
  const creating = !!useMatch('/channels/new') || !!useMatch('/groups/new');
  const id = chatMatch?.params.id || (!creating ? channelMatch?.params.id || groupMatch?.params.id : undefined);
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const text = params.get('q') || '';
  const searching = !!text || params.has('search');
  const input = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<ChatFilter>('all');
  const searchRequested = params.has('search');
  useEffect(() => { if (searchRequested) input.current?.focus(); }, [searchRequested, location.pathname]);
  function handleFilter(value: ChatFilter) {
    setFilter(value);
    if (people || profile || creating) navigate(`/chats${location.search}`);
  }
  const hasDetail = !!id || creating || profile;
  const suffix = location.search;
  const status = connection === 'reconnecting' ? 'Связь прервана. Восстанавливаем сообщения…'
    : connection === 'syncing' ? 'Синхронизация сообщений…' : 'Подключение…';
  function handleSearch(value: string) {
    const next = new URLSearchParams(params);
    next.delete('search');
    if (value) next.set('q', value); else next.delete('q');
    setParams(next, { replace: true });
  }
  return <div className={`${styles.app} ${hasDetail ? styles.withDetail : ''} ${id || creating ? styles.conversationScreen : ''}`}>
    <nav className={styles.rail} aria-label="Разделы чатов">
      <NavigationMenu />
      <div className={styles.categories}>{([{ value: 'all', label: 'Все', icon: '▤' }, { value: 'personal', label: 'Личные', icon: '▢' }, { value: 'groups', label: 'Группы', icon: '▥' }, { value: 'channels', label: 'Каналы', icon: '▣' }] as const).map((item) => <button key={item.value} aria-pressed={filter === item.value} onClick={() => handleFilter(item.value)}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}</div>
      <Link className={styles.railProfile} to="/profile" aria-label={`Профиль: ${user.displayName}`}><UserAvatar user={user} /><span>Профиль</span></Link>
    </nav>
    {hasDetail && connection !== 'live' && <div className={styles.detailConnection} role="status">{status}</div>}
    <main className={styles.workspace}>
      <aside className={styles.sidebar} aria-label={people ? 'Люди и поиск' : 'Чаты и поиск'}>
        <header className={styles.listHeader}>
          <div className={styles.mobileMenu}><NavigationMenu /></div>
          <div className={styles.searchField}><label className="srOnly" htmlFor="global-search">Найти людей и каналы</label><input ref={input} id="global-search" type="search" maxLength={101} value={text} onChange={(event) => handleSearch(event.target.value)} placeholder="Поиск людей и каналов" autoCapitalize="none" spellCheck={false} autoFocus={params.has('search')} />{searching && <button aria-label="Закрыть поиск" onClick={() => { handleSearch(''); input.current?.focus(); }}>×</button>}</div>
        </header>
        {connection !== 'live' && <div className={styles.connection} role="status">{status}</div>}
        {!people && <div className={styles.mobileFilters} role="group" aria-label="Категории чатов">{([{ value: 'all', label: 'Все' }, { value: 'personal', label: 'Личные' }, { value: 'groups', label: 'Группы' }, { value: 'channels', label: 'Каналы' }] as const).map((item) => <button key={item.value} aria-pressed={filter === item.value} onClick={() => handleFilter(item.value)}>{item.label}</button>)}</div>}
        {searching ? <div className={styles.searchResults}><GlobalSearch text={text} suffix={suffix} /></div> : <Sidebar filter={filter} people={people} suffix={suffix} />}
      </aside>
      <div className={styles.detail}><Outlet /></div>
    </main>
    <nav className={styles.bottomTabs} aria-label="Основная навигация"><NavLink to="/people"><span aria-hidden="true">♙</span>Люди</NavLink><NavLink to="/chats"><span aria-hidden="true">▤</span>Чаты</NavLink><NavLink to="/profile"><span aria-hidden="true">▢</span>Профиль</NavLink></nav>
  </div>;
}

function EmptyChat() {
  return <section className={styles.emptyChat}><StatusPanel title="Выберите чат">Откройте переписку, группу или канал в списке слева. Найдите людей и каналы через поиск.</StatusPanel></section>;
}

export function App() {
  return <Routes>
    <Route path="/login" element={<AuthPage key="login" />} />
    <Route path="/register" element={<AuthPage key="register" register />} />
    <Route element={<RequireSession />}><Route element={<ChatLayout />}>
      <Route path="/chats" element={<EmptyChat />} />
      <Route path="/chats/:id" element={<ChatRoute />} />
      <Route path="/people" element={<EmptyChat />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/channels/find" element={<Navigate to="/chats?search=1" replace />} />
      <Route path="/channels/new" element={<CreateChannel />} />
      <Route path="/channels/:id" element={<ChannelRoute />} />
      <Route path="/groups/new" element={<CreateGroup />} />
      <Route path="/groups/:id" element={<GroupRoute />} />
    </Route></Route>
    <Route path="*" element={<Navigate to="/chats" replace />} />
  </Routes>;
}


