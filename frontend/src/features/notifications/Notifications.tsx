import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { ChatApi } from '../../api/client';
import type { Message, Page } from '../../api/contracts';
import { useSession } from '../auth/Session';
import { bindPushWorker, registerWebPush, type PushBinding } from './browserPush';
import { IncomingMessages, notificationRoute } from './policy';
import styles from './notifications.module.css';

interface Preferences { sound: boolean; system: boolean }
interface NotificationContextValue extends Preferences {
  status: string; error: string; busy: boolean;
  setSound: (enabled: boolean) => void;
  setSystem: (enabled: boolean) => Promise<void>;
  preview: () => void;
  incoming: (message: Message, alreadyLoaded?: boolean) => void;
}
const Context = createContext<NotificationContextValue | null>(null);

function readPreferences(userId: string): Preferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`minechat.notifications.${userId}`) || '{}');
    if (value && typeof value === 'object') return {
      sound: !('sound' in value) || value.sound !== false,
      system: 'system' in value && value.system === true,
    };
  } catch { /* Private browsing can disable storage. Defaults still work for this session. */ }
  return { sound: true, system: false };
}

class NotificationSession {
  private readonly controller = new AbortController();
  private readonly audio = new Audio('/assets/levelup.mp3');
  private readonly gate = new IncomingMessages();
  private readonly sessionId = crypto.randomUUID();
  private endpoint: string | null = null;
  private native = false;
  private lastSound = 0;
  private active = true;
  private operation = 0;
  private pendingEnable: AbortController | null = null;
  private readonly notifications = new Set<Notification>();
  private readonly removeDisposeListener: () => void;
  constructor(private readonly api: ChatApi, private readonly userId: string, private readonly expiresAt: number,
    private preferences: Preferences, private readonly status: (status: string, error?: string) => void,
    private readonly open: (url: string) => void) {
    this.audio.preload = 'auto';
    this.audio.volume = 0.65;
    document.addEventListener('pointerdown', this.unlock, { once: true, capture: true });
    document.addEventListener('keydown', this.unlock, { once: true, capture: true });
    navigator.serviceWorker?.addEventListener('message', this.workerMessage);
    this.removeDisposeListener = api.onDispose(() => this.stop(true));
  }
  private binding(): PushBinding { return { userId: this.userId, sessionId: this.sessionId, expiresAt: this.expiresAt, sound: this.preferences.sound, enabled: this.preferences.system }; }
  private valid() { return this.active && Date.now() < this.expiresAt; }
  private unlock = () => {
    document.removeEventListener('pointerdown', this.unlock, true);
    document.removeEventListener('keydown', this.unlock, true);
    this.audio.muted = true;
    void this.audio.play().then(() => { this.audio.pause(); this.audio.currentTime = 0; this.audio.muted = false; })
      .catch(() => { this.audio.muted = false; });
  };
  private workerMessage = (event: MessageEvent) => {
    const data: unknown = event.data;
    if (!data || typeof data !== 'object' || !('type' in data)) return;
    if (data.type === 'minechat:open') {
      if (this.valid() && 'recipientId' in data && data.recipientId === this.userId && 'url' in data
        && typeof data.url === 'string' && notificationRoute(data.url)) this.open(data.url);
      return;
    }
    if (data.type !== 'minechat:state') return;
    event.ports[0]?.postMessage({ active: this.valid() && this.preferences.system && 'recipientId' in data && data.recipientId === this.userId,
      visible: document.visibilityState === 'visible' && document.hasFocus() });
  };
  async start() {
    // A new account must replace an older browser binding even when its notifications are disabled.
    if (!window.minechat) await bindPushWorker(this.binding(), undefined, this.controller.signal);
    if (this.valid() && this.preferences.system) await this.enable(false);
  }
  sound(enabled: boolean) {
    this.preferences = { ...this.preferences, sound: enabled };
    if (this.endpoint) void bindPushWorker(this.binding());
  }
  preview() {
    if (!this.valid()) return;
    try {
      this.audio.muted = false;
      this.audio.currentTime = 0;
      void this.audio.play().catch(() => { if (this.valid()) this.status('', 'Браузер заблокировал звук. Проверьте разрешения сайта и громкость.'); });
    } catch { this.status('', 'Не удалось воспроизвести звук уведомления.'); }
  }
  async enable(requestPermission: boolean) {
    const operation = ++this.operation;
    this.pendingEnable?.abort();
    const pending = new AbortController(); this.pendingEnable = pending;
    const signal = AbortSignal.any([this.controller.signal, pending.signal, AbortSignal.timeout(12_000)]);
    if (window.minechat) {
      this.native = await this.api.authorizeDesktopNotifications() === true;
      if (!this.valid() || operation !== this.operation) return;
      if (!this.native) throw new Error('Системные уведомления недоступны на этом компьютере.');
      this.preferences = { ...this.preferences, system: true };
      if (this.valid()) this.status('Уведомления работают, пока приложение запущено, в том числе в свёрнутом окне.');
      return;
    }
    if (!('Notification' in window)) throw new Error('Этот браузер не поддерживает системные уведомления.');
    let permission = Notification.permission;
    if (permission === 'default' && requestPermission) permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error(permission === 'denied'
      ? 'Уведомления запрещены. Разрешите их в настройках сайта в браузере.' : 'Нажмите «Включить уведомления», чтобы разрешить их в браузере.');
    this.preferences = { ...this.preferences, system: true };
    let endpoint: string | null;
    try { endpoint = await registerWebPush(this.api, signal); }
    catch (error) {
      if (this.valid() && operation === this.operation) this.status('Уведомления доступны, пока вкладка открыта.',
        error instanceof Error ? error.message : 'Не удалось подключить фоновую доставку.');
      return;
    }
    if (!this.valid() || operation !== this.operation) {
      if (endpoint) void this.api.unsubscribeWebPush(endpoint).catch(() => {});
      void bindPushWorker(null, this.sessionId);
      return;
    }
    this.endpoint = endpoint;
    if (endpoint) await bindPushWorker(this.binding(), undefined, signal);
    if (!this.valid() || operation !== this.operation) return;
    this.status(endpoint ? 'Фоновая доставка включена до окончания сеанса. При закрытой вкладке используется системный звук.'
      : 'Уведомления доступны, пока вкладка открыта. Фоновая доставка ещё не настроена на сервере.');
  }
  disable() {
    this.operation++;
    this.pendingEnable?.abort();
    this.preferences = { ...this.preferences, system: false };
    void bindPushWorker(null, this.sessionId);
    if (this.endpoint) { void this.api.unsubscribeWebPush(this.endpoint).catch(() => {}); this.endpoint = null; }
    for (const notification of this.notifications) notification.close();
    this.notifications.clear();
    this.status('Системные уведомления выключены.');
  }
  incoming(message: Message, url: string, alreadyLoaded = false) {
    if (!this.valid() || !this.gate.accept(message, this.userId, alreadyLoaded)) return;
    if (this.preferences.sound && Date.now() - this.lastSound > 800) { this.lastSound = Date.now(); this.preview(); }
    if (!this.preferences.system || (document.visibilityState === 'visible' && document.hasFocus())) return;
    if (window.minechat && this.native) {
      void window.minechat.notify({ recipientId: this.userId, messageId: message.id, conversationId: message.conversationId,
        title: message.sender.displayName, url }).catch(() => this.status('', 'Не удалось показать системное уведомление.'));
    } else if (!this.endpoint && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const notification = new Notification(message.sender.displayName, { body: 'Новое сообщение', tag: `minechat-${message.id}`, silent: true });
        this.notifications.add(notification);
        notification.onclose = () => this.notifications.delete(notification);
        notification.onclick = () => { notification.close(); if (this.valid()) { window.focus(); this.open(url); } };
      } catch { this.status('', 'Браузер не смог показать уведомление. Сообщения продолжают поступать в чат.'); }
    }
  }
  stop(revoke = false) {
    if (!this.active) return;
    this.active = false;
    this.controller.abort();
    if (revoke) this.disable();
    else { for (const notification of this.notifications) notification.close(); this.notifications.clear(); }
    this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load();
    document.removeEventListener('pointerdown', this.unlock, true);
    document.removeEventListener('keydown', this.unlock, true);
    navigator.serviceWorker?.removeEventListener('message', this.workerMessage);
    this.removeDisposeListener();
    if (revoke && window.minechat) void window.minechat.setNotificationSession(null).catch(() => {});
  }
}

export function NotificationsProvider({ children }: PropsWithChildren) {
  const { api, user, expiresAt } = useSession();
  const [preferences, setPreferences] = useState(() => readPreferences(user.id));
  const [feedback, setFeedback] = useState({ status: '', error: '' });
  const [busy, setBusy] = useState(false);
  const service = useRef<NotificationSession | null>(null);
  const preferencesRef = useRef(preferences);
  const cache = useQueryClient();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);
  const openNotification = useCallback(async (url: string) => {
    if (!notificationRoute(url) || Date.now() >= expiresAt) return;
    // A just-added group/channel may not be in any list cache yet. Resolve its type on click only.
    const id = url.split('/')[2]!;
    if (!url.startsWith('/chats/') || cache.getQueryData<InfiniteData<Page<{ id: string }>>>(['conversations'])?.pages.some((page) => page.items.some((item) => item.id === id))) {
      navigateRef.current(url); return;
    }
    try { await api.group(id); if (Date.now() < expiresAt) navigateRef.current(`/groups/${id}`); return; } catch { /* Try the other existing conversation type. */ }
    try { await api.channel(id); if (Date.now() < expiresAt) navigateRef.current(`/channels/${id}`); return; } catch { /* Direct conversations have no by-ID endpoint. */ }
    if (Date.now() < expiresAt) navigateRef.current(url);
  }, [api, cache, expiresAt]);
  const incoming = useCallback((message: Message, alreadyLoaded = false) => {
    const id = message.conversationId;
    const group = cache.getQueryData(['group', id]);
    const channel = cache.getQueryData(['channel', id]);
    const groups = cache.getQueryData<InfiniteData<Page<{ id: string }>>>(['groups']);
    const channels = cache.getQueryData<InfiniteData<Page<{ id: string }>>>(['channels']);
    const prefix = group || groups?.pages.some((page) => page.items.some((item) => item.id === id)) ? 'groups'
      : channel || channels?.pages.some((page) => page.items.some((item) => item.id === id)) ? 'channels' : 'chats';
    try { service.current?.incoming(message, `/${prefix}/${id}`, alreadyLoaded); }
    catch { setFeedback({ status: '', error: 'Уведомление недоступно. Сообщение сохранено в переписке.' }); }
  }, [cache]);
  useEffect(() => {
    const current = new NotificationSession(api, user.id, expiresAt, preferencesRef.current,
      (status, error = '') => setFeedback({ status, error }), (url) => { void openNotification(url); });
    service.current = current;
    void current.start().catch((error: unknown) => setFeedback({ status: '', error: error instanceof Error ? error.message : 'Не удалось включить уведомления.' }));
    const unsubscribe = window.minechat?.onNotificationOpen((url) => { void openNotification(url); });
    return () => { service.current = null; current.stop(); unsubscribe?.(); };
  }, [api, user.id, expiresAt, openNotification]);
  function remember(next: Preferences) {
    preferencesRef.current = next;
    setPreferences(next);
    try { localStorage.setItem(`minechat.notifications.${user.id}`, JSON.stringify(next)); } catch { /* Session preferences still apply. */ }
  }
  function setSound(sound: boolean) { remember({ ...preferencesRef.current, sound }); service.current?.sound(sound); }
  async function setSystem(system: boolean) {
    setBusy(true);
    try {
      if (system) await service.current?.enable(true); else service.current?.disable();
      remember({ ...preferencesRef.current, system });
    } catch (error) { setFeedback({ status: '', error: error instanceof Error ? error.message : 'Не удалось включить уведомления.' }); }
    finally { setBusy(false); }
  }
  return <Context.Provider value={{ ...preferences, ...feedback, busy, setSound, setSystem, preview: () => service.current?.preview(), incoming }}>{children}</Context.Provider>;
}

export function useNotifications() {
  const context = useContext(Context);
  if (!context) throw new Error('NotificationsProvider is required');
  return context;
}

export function NotificationSettings() {
  const notifications = useNotifications();
  const section = useRef<HTMLElement>(null);
  const { hash } = useLocation();
  useEffect(() => { if (hash === '#notifications') section.current?.scrollIntoView({ block: 'start' }); }, [hash]);
  return <section ref={section} id="notifications" className={styles.settings} aria-labelledby="notifications-title">
    <h2 id="notifications-title">Уведомления</h2>
    <label><input type="checkbox" checked={notifications.sound} onChange={(event) => notifications.setSound(event.target.checked)} />Звук новых сообщений</label>
    <div className={styles.actions}><button type="button" onClick={notifications.preview}>Послушать звук</button>
      <button type="button" disabled={notifications.busy} aria-pressed={notifications.system} onClick={() => void notifications.setSystem(!notifications.system)}>
        {notifications.busy ? 'Подключение…' : notifications.system ? 'Выключить уведомления' : 'Включить уведомления'}</button></div>
    <p>Звук — для новых входящих сообщений. Собственные сообщения, изменения и загрузка истории без звука.</p>
    <p>В браузере звук включается после нажатия или ввода. Системные уведомления показываются, когда окно не активно. Их отображение также зависит от настроек ОС.</p>
    {notifications.status && <p role="status">{notifications.status}</p>}
    {notifications.error && <p role="alert" className={styles.error}>{notifications.error}</p>}
  </section>;
}
