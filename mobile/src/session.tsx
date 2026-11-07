import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState } from 'react-native';
import type { AuthResponse, User } from '../../frontend/src/api/contracts';
import { ChatApi } from './api';
import { clearFiles } from './files';

interface Session { auth: AuthResponse | null; api: ChatApi; login: (auth: AuthResponse) => void; logout: () => void; updateUser: (user: User) => void }
const Context = createContext<Session | null>(null);
export function SessionProvider({ children }: PropsWithChildren) {
  const [cache] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }));
  const [auth, setAuth] = useState<(AuthResponse & { expiresAt: number }) | null>(null);
  const [api, setApi] = useState(() => new ChatApi());
  function logout() {
    api.dispose(); cache.clear(); void clearFiles(); setAuth(null); setApi(new ChatApi());
  }
  function login(next: AuthResponse) { api.dispose(); cache.clear(); setAuth({ ...next, expiresAt: Date.now() + next.expiresIn * 1000 }); setApi(new ChatApi(next.accessToken, () => { cache.clear(); void clearFiles(); setAuth(null); setApi(new ChatApi()); })); }
  function updateUser(user: User) { setAuth((current) => current ? { ...current, user } : null); }
  useEffect(() => () => api.dispose(), [api]);
  useEffect(() => {
    if (!auth) return;
    const timer = setTimeout(logout, Math.max(0, auth.expiresAt - Date.now()));
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active' && Date.now() >= auth.expiresAt) logout(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [auth, api]);
  return <QueryClientProvider client={cache}><Context.Provider value={{ auth, api, login, logout, updateUser }}>{children}</Context.Provider></QueryClientProvider>;
}
export function useSession() { const session = useContext(Context); if (!session) throw new Error('Сеанс недоступен.'); return session; }
