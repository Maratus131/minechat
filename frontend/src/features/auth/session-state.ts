import type { AuthResponse, User } from '../../api/contracts';

export interface RestoredSession { auth: AuthResponse; expiresAt: number }
export interface SessionState { session: RestoredSession | null; phase: 'restoring' | 'ready' | 'unavailable'; notice: string }
interface SessionTransport { refresh: (signal: AbortSignal) => Promise<AuthResponse>; logout: (signal: AbortSignal) => Promise<void> }
interface SessionEnvironment {
  now: () => number;
  loggedOut: () => boolean;
  markLoggedOut: () => void;
  markLoggedIn: () => void;
  changed: (state: SessionState) => void;
}

/** Coordinates restoration only; failed application commands are never replayed. No credentials are persisted here. */
export class PersistentSession {
  state: SessionState = { session: null, phase: 'restoring', notice: '' };
  private transport: SessionTransport;
  private environment: SessionEnvironment;
  private generation = 0;
  private controller: AbortController | null = null;
  private pending: Promise<void> | null = null;
  private logoutPending: Promise<void> = Promise.resolve();
  private stopped = false;
  constructor(transport: SessionTransport, environment: SessionEnvironment) { this.transport = transport; this.environment = environment; }
  private publish(state: SessionState) { this.state = state; this.environment.changed(state); }
  private cancel() { this.generation++; this.controller?.abort(); this.controller = null; this.pending = null; }
  async restore(): Promise<void> {
    if (this.stopped) return;
    if (this.environment.loggedOut()) { this.publish({ session: null, phase: 'ready', notice: '' }); return; }
    if (this.pending) return this.pending;
    const generation = this.generation;
    const controller = new AbortController(); this.controller = controller;
    if (!this.state.session) this.publish({ session: null, phase: 'restoring', notice: '' });
    const pending = this.transport.refresh(controller.signal).then((auth) => {
      if (this.stopped || controller.signal.aborted || generation !== this.generation || this.environment.loggedOut()) return;
      this.publish({ session: { auth, expiresAt: this.environment.now() + auth.expiresIn * 1000 }, phase: 'ready', notice: '' });
    }).catch((error: unknown) => {
      if (this.stopped || controller.signal.aborted || generation !== this.generation) return;
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 401) {
        this.publish({ session: null, phase: 'ready', notice: this.state.session ? 'Срок сохранённого входа закончился. Войдите снова.' : '' });
        return;
      }
      const session = this.state.session && this.state.session.expiresAt > this.environment.now() ? this.state.session : null;
      this.publish({ session, phase: session ? 'ready' : 'unavailable',
        notice: 'Не удалось восстановить соединение с сервером. Сохранённый вход не удалён.' });
    }).finally(() => { if (this.pending === pending) { this.pending = null; this.controller = null; } });
    this.pending = pending;
    return pending;
  }
  accept(auth: AuthResponse) {
    if (this.stopped) return;
    this.cancel(); this.environment.markLoggedIn();
    this.publish({ session: { auth, expiresAt: this.environment.now() + auth.expiresIn * 1000 }, phase: 'ready', notice: '' });
  }
  beforeLogin() { this.cancel(); return this.logoutPending; }
  accountChanged() { this.cancel(); return this.restore(); }
  updateUser(user: User) {
    if (!this.state.session) return;
    this.publish({ ...this.state, session: { ...this.state.session, auth: { ...this.state.session.auth, user } } });
  }
  logout(remote = true): Promise<void> {
    if (this.stopped) return Promise.resolve();
    this.cancel();
    if (remote) this.environment.markLoggedOut();
    this.publish({ session: null, phase: 'ready', notice: '' });
    if (!remote) return Promise.resolve();
    const generation = this.generation;
    this.logoutPending = this.transport.logout(AbortSignal.timeout(5000)).catch(() => {
      if (!this.stopped && generation === this.generation && this.environment.loggedOut()) {
        this.publish({ session: null, phase: 'ready', notice: 'Вы вышли на этом устройстве. Сервер недоступен; сохранённый вход заблокирован до следующего входа.' });
      }
    });
    return this.logoutPending;
  }
  stop() { this.stopped = true; this.cancel(); }
}
