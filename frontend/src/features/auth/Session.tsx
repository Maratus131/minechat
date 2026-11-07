import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChatApi } from '../../api/client';
import type { AuthResponse, User } from '../../api/contracts';

interface Session { api: ChatApi; user: User; expiresAt: number }
interface AuthContextValue {
  session: Session | null;
  notice: string;
  signIn: (response: AuthResponse) => void;
  signOut: () => void;
  updateUser: (user: User) => void;
}
const AuthContext = createContext<AuthContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState('');
  const active = useRef<Session | null>(null);

  const endSession = useCallback((expired = false) => {
    active.current?.api.dispose();
    active.current = null;
    cache.clear();
    setSession(null);
    setNotice(expired ? 'Сеанс завершён. Войдите снова, чтобы продолжить переписку.' : '');
  }, [cache]);

  function signIn(response: AuthResponse) {
    active.current?.api.dispose();
    cache.clear();
    const next = {
      api: new ChatApi(response.accessToken, () => endSession(true)),
      user: response.user,
      expiresAt: Date.now() + response.expiresIn * 1000,
    };
    active.current = next;
    setNotice('');
    setSession(next);
  }
  function updateUser(user: User) {
    if (!active.current) return;
    const next = { ...active.current, user };
    active.current = next;
    setSession(next);
  }

  useEffect(() => {
    if (!session) return;
    const checkExpiry = () => { if (Date.now() >= session.expiresAt) endSession(true); };
    const timer = window.setTimeout(() => endSession(true), Math.max(0, session.expiresAt - Date.now()));
    window.addEventListener('focus', checkExpiry);
    document.addEventListener('visibilitychange', checkExpiry);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', checkExpiry);
      document.removeEventListener('visibilitychange', checkExpiry);
    };
  }, [session, endSession]);
  useEffect(() => () => { active.current?.api.dispose(); }, []);

  return <AuthContext.Provider value={{ session, notice, signIn, signOut: () => endSession(), updateUser }}>{children}</AuthContext.Provider>;
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
