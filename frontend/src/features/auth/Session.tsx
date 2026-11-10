import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChatApi } from '../../api/client';
import type { AuthResponse, User } from '../../api/contracts';
import { StatusPanel } from '../../shared/ui';
import { PersistentSession, type SessionState } from './session-state';

interface Session { api: ChatApi; user: User; expiresAt: number }
interface AuthContextValue {
  session: Session | null;
  notice: string;
  signIn: (response: AuthResponse) => void;
  prepareSignIn: () => Promise<void>;
  signOut: () => void;
  updateUser: (user: User) => void;
}
const AuthContext = createContext<AuthContextValue | null>(null);
const logoutKey = 'minechat.auth.logged-out';
const changeKey = 'minechat.auth.change';

export function SessionProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [restoration, setRestoration] = useState<SessionState>({ session: null, phase: 'restoring', notice: '' });
  const [persistenceNotice, setPersistenceNotice] = useState('');
  const active = useRef<{ value: Session; token: string } | null>(null);
  const controller = useRef<PersistentSession | null>(null);

  useEffect(() => {
    let stopped = false;
    let localLoggedOut = false;
    const anonymous = new ChatApi();
    function announce(type: 'login' | 'logout') {
      try { localStorage.setItem(changeKey, JSON.stringify({ type, id: crypto.randomUUID() })); } catch { /* No credential is stored. */ }
    }
    const current = new PersistentSession({
      refresh: (signal) => anonymous.refresh(AbortSignal.any([signal, AbortSignal.timeout(10_000)])),
      logout: (signal) => anonymous.logout(signal),
    }, {
      now: Date.now,
      loggedOut: () => { try { return localStorage.getItem(logoutKey) === '1'; } catch { return localLoggedOut; } },
      markLoggedOut: () => { localLoggedOut = true; try { localStorage.setItem(logoutKey, '1'); } catch { /* Marker still applies in this process. */ } announce('logout'); },
      markLoggedIn: () => { localLoggedOut = false; try { localStorage.removeItem(logoutKey); } catch { /* No credential is persisted here. */ } announce('login'); },
      changed: (state) => {
        if (stopped) return;
        const previous = active.current;
        if (state.session) {
          const { auth, expiresAt } = state.session;
          let api = previous?.value.api;
          if (previous && previous.value.user.id === auth.user.id) {
            api!.replaceAccessToken(auth.accessToken);
          } else {
            previous?.value.api.dispose();
            if (previous) cache.clear();
            api = new ChatApi(auth.accessToken, () => { void current.restore(); });
          }
          const next = { api: api!, user: auth.user, expiresAt };
          active.current = { value: next, token: auth.accessToken };
          setSession(next);
          if (window.minechat) void window.minechat.getSessionPersistence().then((mode) => {
            if (!stopped) setPersistenceNotice(mode === 'memory' ? 'Защищённое хранилище недоступно. Вход сохранён только до закрытия приложения.' : '');
          }).catch(() => { if (!stopped) setPersistenceNotice('Не удалось проверить сохранение входа на этом устройстве.'); });
        } else {
          previous?.value.api.dispose(); active.current = null;
          if (previous) cache.clear();
          setSession(null); setPersistenceNotice('');
        }
        setRestoration(state);
      },
    });
    controller.current = current;
    void current.restore();
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== changeKey || !event.newValue) return;
      try {
        const eventData: unknown = JSON.parse(event.newValue);
        if (!eventData || typeof eventData !== 'object' || !('type' in eventData)) return;
        if (eventData.type === 'logout') void current.logout(false);
        else if (eventData.type === 'login') void current.accountChanged();
      } catch { /* Ignore malformed non-secret coordination values. */ }
    };
    window.addEventListener('storage', storageChanged);
    const online = () => { void current.restore(); };
    window.addEventListener('online', online);
    return () => {
      stopped = true; current.stop(); anonymous.dispose();
      active.current?.value.api.dispose('refresh'); active.current = null;
      window.removeEventListener('storage', storageChanged);
      window.removeEventListener('online', online);
      if (controller.current === current) controller.current = null;
    };
  }, [cache]);

  useEffect(() => {
    if (!session) return;
    const renew = () => { if (document.visibilityState === 'visible' && Date.now() >= session.expiresAt - 60_000) void controller.current?.restore(); };
    const remaining = session.expiresAt - Date.now();
    const timer = window.setTimeout(() => { void controller.current?.restore(); }, remaining > 60_000 ? remaining - 60_000 : 15_000);
    const expiry = window.setTimeout(() => { void controller.current?.restore(); }, Math.max(1000, session.expiresAt - Date.now()));
    window.addEventListener('focus', renew); window.addEventListener('online', renew);
    document.addEventListener('visibilitychange', renew);
    return () => { window.clearTimeout(timer); window.clearTimeout(expiry); window.removeEventListener('focus', renew);
      window.removeEventListener('online', renew); document.removeEventListener('visibilitychange', renew); };
  }, [session]);
  useEffect(() => {
    if (!restoration.notice || restoration.phase === 'restoring') return;
    if (restoration.phase === 'ready' && !session) return;
    const timer = window.setTimeout(() => { void controller.current?.restore(); }, 15_000);
    return () => window.clearTimeout(timer);
  }, [restoration, session]);

  const signIn = useCallback((response: AuthResponse) => controller.current?.accept(response), []);
  const prepareSignIn = useCallback(async () => { await controller.current?.beforeLogin(); }, []);
  const signOut = useCallback(() => { void controller.current?.logout(); }, []);
  const updateUser = useCallback((user: User) => controller.current?.updateUser(user), []);
  const notice = [restoration.notice, persistenceNotice].filter(Boolean).join(' ');

  return <AuthContext.Provider value={{ session, notice, signIn, prepareSignIn, signOut, updateUser }}>
    {!session && restoration.phase === 'restoring' ? <StatusPanel title="Восстанавливаем вход…" kind="loading">Подключаемся к вашему аккаунту.</StatusPanel>
      : !session && restoration.phase === 'unavailable' ? <StatusPanel title="Сервер недоступен" kind="error" retry={() => { void controller.current?.restore(); }}>
        <p>{restoration.notice}</p><button onClick={signOut}>Выйти из аккаунта</button></StatusPanel> : children}
  </AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('SessionProvider is required');
  return value;
}
export function useSession() {
  const { session } = useAuth();
  if (!session) throw new Error('Authentication is required');
  return session;
}
