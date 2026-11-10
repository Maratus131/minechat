import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState } from 'react-native';
import type { AuthResponse, Credentials, Registration, User } from '../../frontend/src/api/contracts';
import { ApiError, ChatApi, type DeviceAuthResponse } from './api';
import { clearFiles } from './files';
import { deviceSessionStore } from './secureSession';
import type { StoredDeviceSession } from './deviceSessionStore';

interface ActiveSession { auth: AuthResponse; expiresAt: number; api: ChatApi }
interface Session {
  auth: AuthResponse | null;
  api: ChatApi;
  status: 'loading' | 'ready' | 'error';
  notice: string;
  signIn: (credentials: Credentials | Registration, register: boolean) => Promise<void>;
  logout: () => void;
  retry: () => void;
  updateUser: (user: User) => void;
}
const Context = createContext<Session | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [cache] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }));
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [status, setStatus] = useState<Session['status']>('loading');
  const [notice, setNotice] = useState('');
  const active = useRef<ActiveSession | null>(null);
  const anonymous = useRef(new ChatApi());
  const saved = useRef<StoredDeviceSession | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const operation = useRef<AbortController | null>(null);
  const refreshWork = useRef<{ generation: number; promise: Promise<void> } | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshHandler = useRef<() => Promise<void>>(async () => undefined);

  function current(ticket: number) { return mounted.current && generation.current === ticket; }
  function stopRequests() {
    operation.current?.abort(); operation.current = null;
    clearTimeout(retryTimer.current);
    refreshWork.current = null;
  }
  function clearActive() {
    active.current?.api.dispose(); active.current = null;
    anonymous.current.dispose(); anonymous.current = new ChatApi();
    cache.clear(); void clearFiles(); setSession(null);
  }
  async function revoke(refreshToken: string) {
    const api = new ChatApi();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try { await api.logoutDevice(refreshToken, controller.signal); }
    finally { clearTimeout(timeout); api.dispose(); }
  }
  async function endSession(expired = false) {
    const ticket = ++generation.current;
    const token = saved.current?.refreshToken;
    saved.current = null;
    stopRequests(); clearActive(); setStatus('ready');
    setNotice(expired ? 'Сохранённый вход завершён. Войдите снова.' : '');
    const removal = deviceSessionStore.clear();
    const revocation = token ? revoke(token).catch(() => undefined) : Promise.resolve();
    try { await removal; }
    catch { if (current(ticket)) setNotice('Не удалось очистить сохранённый вход на устройстве. Проверьте подключение и повторите выход.'); }
    await revocation;
  }
  function accept(next: DeviceAuthResponse) {
    const previous = active.current;
    let nextApi: ChatApi;
    if (previous && previous.auth.user.id === next.user.id && !previous.api.disposed) {
      nextApi = previous.api;
      nextApi.replaceAccessToken(next.accessToken);
    } else {
      previous?.api.dispose();
      if (previous) { cache.clear(); void clearFiles(); }
      nextApi = new ChatApi(next.accessToken, () => {
        if (active.current?.api === nextApi) void refreshHandler.current();
      });
    }
    const auth: AuthResponse = { accessToken: next.accessToken, tokenType: next.tokenType, expiresIn: next.expiresIn, user: next.user };
    const nextSession = { auth, expiresAt: Date.now() + next.expiresIn * 1000, api: nextApi };
    active.current = nextSession;
    setSession(nextSession); setStatus('ready');
  }
  async function persist(value: StoredDeviceSession, ticket: number) {
    if (!current(ticket)) return;
    try { await deviceSessionStore.save(value); }
    catch { if (current(ticket)) setNotice('Защищённое хранилище недоступно. После закрытия приложения потребуется войти снова.'); }
  }

  function refresh(): Promise<void> {
    const ticket = generation.current;
    if (refreshWork.current?.generation === ticket) return refreshWork.current.promise;
    const previous = saved.current;
    if (!previous) return Promise.resolve();
    if (previous.expiresAt <= Date.now()) return endSession(true);
    const controller = new AbortController(); operation.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    if (!active.current) setStatus('loading');
    const api = new ChatApi(); // Refresh never sends an expired access token.
    const promise = (async () => {
      try {
        const next = await api.refreshDevice(previous.refreshToken, controller.signal);
        if (!current(ticket)) return;
        const value = { refreshToken: next.refreshToken, expiresAt: Math.min(previous.expiresAt, Date.now() + next.refreshExpiresIn * 1000) };
        saved.current = value;
        setNotice('');
        await persist(value, ticket);
        if (current(ticket)) accept(next);
      } catch (error) {
        if (!current(ticket)) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) { await endSession(true); return; }
        setStatus(active.current ? 'ready' : 'error');
        setNotice('Не удалось восстановить вход. Проверьте подключение и повторите попытку. Сохранённый вход не удалён.');
        clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => { if (current(ticket) && AppState.currentState === 'active') void refreshHandler.current(); }, 30_000);
      } finally {
        clearTimeout(timeout); api.dispose();
        if (operation.current === controller) operation.current = null;
        if (refreshWork.current?.generation === ticket) refreshWork.current = null;
      }
    })();
    refreshWork.current = { generation: ticket, promise };
    return promise;
  }
  refreshHandler.current = refresh;

  async function signIn(credentials: Credentials | Registration, register: boolean) {
    const ticket = ++generation.current;
    stopRequests(); setNotice('');
    const api = new ChatApi();
    const controller = new AbortController(); operation.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const next = register && 'displayName' in credentials
        ? await api.deviceRegister(credentials, controller.signal) : await api.deviceLogin(credentials, controller.signal);
      if (!current(ticket)) { void revoke(next.refreshToken).catch(() => undefined); return; }
      const value = { refreshToken: next.refreshToken, expiresAt: Date.now() + next.refreshExpiresIn * 1000 };
      saved.current = value;
      await persist(value, ticket);
      if (!current(ticket)) return;
      cache.clear(); void clearFiles(); accept(next);
    } finally {
      clearTimeout(timeout); api.dispose();
      if (operation.current === controller) operation.current = null;
    }
  }
  function updateUser(user: User) {
    if (!active.current) return;
    const next = { ...active.current, auth: { ...active.current.auth, user } };
    active.current = next; setSession(next);
  }

  useEffect(() => {
    mounted.current = true;
    const ticket = ++generation.current;
    void (async () => {
      try {
        const stored = await deviceSessionStore.read();
        if (!current(ticket)) return;
        saved.current = stored;
        if (stored) await refreshHandler.current(); else setStatus('ready');
      } catch {
        if (current(ticket)) {
          setStatus('ready');
          setNotice('Защищённое хранилище недоступно. Вход будет действовать только до закрытия приложения.');
        }
      }
    })();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && saved.current && (!active.current || active.current.expiresAt - Date.now() < 60_000)) void refreshHandler.current();
    });
    return () => {
      mounted.current = false; generation.current++;
      stopRequests(); active.current?.api.dispose(); anonymous.current.dispose(); subscription.remove();
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => { if (AppState.currentState === 'active') void refreshHandler.current(); }, Math.max(0, session.expiresAt - Date.now() - 60_000));
    const expiry = setTimeout(() => {
      if (active.current && active.current.expiresAt <= Date.now() && AppState.currentState === 'active') void refreshHandler.current();
    }, Math.max(0, session.expiresAt - Date.now()));
    return () => { clearTimeout(timer); clearTimeout(expiry); };
  }, [session?.expiresAt]);

  return <QueryClientProvider client={cache}><Context.Provider value={{ auth: session?.auth ?? null, api: session?.api ?? anonymous.current,
    status, notice, signIn, logout: () => { void endSession(); }, retry: () => { void refresh(); }, updateUser }}>{children}</Context.Provider></QueryClientProvider>;
}
export function useSession() { const session = useContext(Context); if (!session) throw new Error('Сеанс недоступен.'); return session; }
