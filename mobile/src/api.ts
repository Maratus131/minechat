import { combineAbortSignals } from './abort';
export interface PickedFile { uri: string; name: string; size: number; mimeType?: string }
import { InvalidResponseError, object, parseAuth, parseChannel, parseChannelMember, parseConversation, parseGroup, parseGroupMember, parseMessage, parsePage, parsePresence, parseProfile, parseUser, type AuthResponse, type CreateChannel, type Credentials, type GroupRole, type Registration } from '../../frontend/src/api/contracts';

export interface DeviceAuthResponse extends AuthResponse { refreshToken: string; refreshExpiresIn: number }
export function parseDeviceAuth(value: unknown): DeviceAuthResponse {
  const item = object(value);
  const auth = parseAuth(value);
  if (typeof item.refreshToken !== 'string' || !item.refreshToken || item.refreshToken.length > 4096
    || typeof item.refreshExpiresIn !== 'number' || !Number.isSafeInteger(item.refreshExpiresIn) || item.refreshExpiresIn <= 0
    || auth.expiresIn <= 0) throw new InvalidResponseError();
  return { ...auth, refreshToken: item.refreshToken, refreshExpiresIn: item.refreshExpiresIn };
}

export const baseUrl = (process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8080/api/v1').replace(/\/$/, '');
export function assertApiUrl() {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' && (!__DEV__ || url.protocol !== 'http:')) throw new Error('Укажите HTTPS-адрес API в EXPO_PUBLIC_API_URL. HTTP разрешён только в development-сборке.');
  if (url.username || url.password || url.search || url.hash) throw new Error('Адрес API не должен содержать пароль, параметры или фрагмент.');
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Не удалось выполнить запрос. Повторите попытку.';
}

async function responseError(response: Response): Promise<ApiError> {
  let detail: unknown;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'detail' in body) detail = body.detail;
  } catch { /* A proxy can return a non-JSON error. */ }
  const fallback: Record<number, string> = {
    400: 'Проверьте введённые данные.', 401: 'Войдите снова: сеанс завершён.',
    403: 'Недостаточно прав для этого действия.', 404: 'Диалог или файл недоступен.',
    409: 'Этот логин уже занят.', 413: 'Файл слишком большой. Максимум 10 МиБ.',
    429: 'Слишком много запросов. Попробуйте немного позже.',
    503: 'Сервис временно недоступен. Повторите попытку.',
  };
  return new ApiError(response.status, typeof detail === 'string' ? detail : fallback[response.status] || 'Не удалось выполнить запрос. Повторите попытку.');
}

export class ChatApi {
  private readonly lifetime = new AbortController();
  constructor(private accessToken?: string, private readonly onUnauthorized?: () => void) {}
  get token() { return this.accessToken; }
  replaceAccessToken(token: string) { this.accessToken = token; }
  dispose() { this.lifetime.abort(); }
  get disposed() { return this.lifetime.signal.aborted; }
  expire() { this.onUnauthorized?.(); }
  async createRealtimeSocket(signal: AbortSignal): Promise<WebSocket> {
    assertApiUrl();
    if (!this.token || signal.aborted || this.disposed) throw new Error('Сеанс завершён.');
    const url = new URL(`${baseUrl}/ws`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url.href);
    const close = () => socket.close();
    signal.addEventListener('abort', close, { once: true });
    this.lifetime.signal.addEventListener('abort', close, { once: true });
    socket.addEventListener('close', () => {
      signal.removeEventListener('abort', close);
      this.lifetime.signal.removeEventListener('abort', close);
    }, { once: true });
    socket.addEventListener('open', () => {
      if (signal.aborted || this.disposed) { socket.close(); return; }
      socket.send(JSON.stringify({ type: 'auth', token: this.token }));
    }, { once: true });
    return socket;
  }

  async request<T>(path: string, options: RequestInit, consume: (response: Response) => Promise<T>): Promise<T> {
    assertApiUrl();
    const headers = new Headers(options.headers);
    const deviceAuthentication = path.startsWith('/auth/device/');
    if (this.token && !deviceAuthentication) headers.set('Authorization', `Bearer ${this.token}`);
    const combined = options.signal ? combineAbortSignals(options.signal, this.lifetime.signal) : undefined;
    const signal = combined?.signal ?? this.lifetime.signal;
    try {
      let response: Response;
      try { response = await fetch(`${baseUrl}${path}`, { ...options, headers, signal }); }
      catch (error) {
        if (signal.aborted) throw error;
        throw new ApiError(0, 'Нет связи с сервером. Проверьте подключение и повторите попытку.');
      }
      if (!response.ok) {
        const error = await responseError(response);
        if (response.status === 401 && this.token && !deviceAuthentication && !signal.aborted) this.expire();
        throw error;
      }
      return await consume(response);
    } finally {
      combined?.cleanup();
    }
  }

  private async json<T>(path: string, parse: (value: unknown) => T, options?: RequestInit): Promise<T> {
    return this.request(path, options ?? {}, async (response) => {
      let body: unknown;
      try { body = await response.json(); }
      catch (error) {
        if (error instanceof SyntaxError) throw new InvalidResponseError();
        throw error;
      }
      return parse(body);
    });
  }
  private post(body: unknown, signal?: AbortSignal): RequestInit {
    return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal };
  }
  login(credentials: Credentials, signal?: AbortSignal) {
    return this.json('/auth/login', parseAuth, this.post(credentials, signal));
  }
  register(registration: Registration, signal?: AbortSignal) {
    return this.json('/auth/register', parseAuth, this.post(registration, signal));
  }
  deviceLogin(credentials: Credentials, signal?: AbortSignal) {
    return this.json('/auth/device/login', parseDeviceAuth, this.post(credentials, signal));
  }
  deviceRegister(registration: Registration, signal?: AbortSignal) {
    return this.json('/auth/device/register', parseDeviceAuth, this.post(registration, signal));
  }
  refreshDevice(refreshToken: string, signal?: AbortSignal) {
    return this.json('/auth/device/refresh', parseDeviceAuth, this.post({ refreshToken }, signal));
  }
  logoutDevice(refreshToken: string, signal?: AbortSignal) {
    return this.request('/auth/device/logout', this.post({ refreshToken }, signal), async () => undefined);
  }
  me(signal?: AbortSignal) { return this.json('/users/me', parseProfile, { signal }); }
  updateProfile(displayName: string, birthDate: string | null) {
    return this.json('/users/me', parseProfile, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName, birthDate }) });
  }
  setAvatar(file: PickedFile) {
    const body = new FormData();
    body.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'image/jpeg' } as unknown as Blob);
    return this.json('/users/me/avatar', parseProfile, { method: 'PUT', body });
  }
  removeAvatar() { return this.json('/users/me/avatar', parseProfile, { method: 'DELETE' }); }
  users(q: string, signal?: AbortSignal) {
    return this.json(`/users?${new URLSearchParams({ q, limit: '100' })}`, parsePage(parseUser), { signal });
  }
  conversations(page = 0, signal?: AbortSignal) {
    return this.json(`/conversations?page=${page}&limit=30`, parsePage(parseConversation), { signal });
  }
  presence(id: string, signal?: AbortSignal) {
    return this.json(`/conversations/${encodeURIComponent(id)}/presence`, parsePresence, { signal });
  }
  channels(page = 0, signal?: AbortSignal) {
    return this.json(`/channels?page=${page}&limit=30`, parsePage(parseChannel), { signal });
  }
  groups(page = 0, signal?: AbortSignal) {
    return this.json(`/groups?page=${page}&limit=30`, parsePage(parseGroup), { signal });
  }
  group(id: string, signal?: AbortSignal) { return this.json(`/groups/${encodeURIComponent(id)}`, parseGroup, { signal }); }
  createGroup(title: string, memberIds: string[]) { return this.json('/groups', parseGroup, this.post({ title, memberIds })); }
  groupMembers(id: string, page = 0, signal?: AbortSignal) {
    return this.json(`/groups/${encodeURIComponent(id)}/members?page=${page}&limit=50`, parsePage(parseGroupMember), { signal });
  }
  addGroupMember(id: string, userId: string, role: 'MEMBER' | 'READER') {
    return this.json(`/groups/${encodeURIComponent(id)}/members`, parseGroupMember, this.post({ userId, role }));
  }
  setGroupRole(id: string, userId: string, role: Exclude<GroupRole, 'OWNER'>) {
    return this.json(`/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, parseGroupMember,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
  }
  removeGroupMember(id: string, userId: string) {
    return this.request(`/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }, async () => undefined);
  }
  channelMembers(id: string, page = 0, signal?: AbortSignal) {
    return this.json(`/channels/${encodeURIComponent(id)}/members?page=${page}&limit=50`, parsePage(parseChannelMember), { signal });
  }
  setChannelRole(id: string, userId: string, role: 'ADMIN' | 'SUBSCRIBER') {
    return this.json(`/channels/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, parseChannelMember,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
  }
  channel(id: string, signal?: AbortSignal) {
    return this.json(`/channels/${encodeURIComponent(id)}`, parseChannel, { signal });
  }
  findChannels(q: string, page = 0, signal?: AbortSignal) {
    return this.json(`/channels/search?${new URLSearchParams({ q, page: String(page), limit: '30' })}`, parsePage(parseChannel), { signal });
  }
  createChannel(input: CreateChannel, signal?: AbortSignal) {
    return this.json('/channels', parseChannel, this.post(input, signal));
  }
  subscribe(id: string, subscribed: boolean, signal?: AbortSignal) {
    return this.json(`/channels/${encodeURIComponent(id)}/subscription`, parseChannel, { method: subscribed ? 'POST' : 'DELETE', signal });
  }
  openConversation(userId: string, signal?: AbortSignal) {
    return this.json('/conversations', parseConversation, this.post({ userId }, signal));
  }
  history(id: string, cursor: { beforeId?: number; afterId?: number } = {}, signal?: AbortSignal) {
    const query = new URLSearchParams({ limit: '50' });
    if (cursor.beforeId !== undefined) query.set('beforeId', String(cursor.beforeId));
    if (cursor.afterId !== undefined) query.set('afterId', String(cursor.afterId));
    return this.json(`/conversations/${encodeURIComponent(id)}/messages?${query}`, parsePage(parseMessage), { signal });
  }
  search(id: string, q: string, page: number, signal?: AbortSignal) {
    const query = new URLSearchParams({ q, page: String(page), limit: '20' });
    return this.json(`/conversations/${encodeURIComponent(id)}/messages/search?${query}`, parsePage(parseMessage), { signal });
  }
  send(id: string, text: string, files: PickedFile[], signal?: AbortSignal) {
    let options: RequestInit;
    if (files.length) {
      const body = new FormData();
      body.append('text', text);
      for (const file of files) body.append('files', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as unknown as Blob);
      options = { method: 'POST', body, signal };
    } else options = this.post({ text }, signal);
    return this.json(`/conversations/${encodeURIComponent(id)}/messages`, parseMessage, options);
  }
  deleteMessage(conversationId: string, messageId: number) {
    return this.json(`/conversations/${encodeURIComponent(conversationId)}/messages/${messageId}`, parseMessage, { method: 'DELETE' });
  }
  editMessage(conversationId: string, messageId: number, text: string, signal?: AbortSignal) {
    return this.json(`/conversations/${encodeURIComponent(conversationId)}/messages/${messageId}`, parseMessage,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal });
  }
  async download(id: string, signal?: AbortSignal) {
    return this.request(`/attachments/${encodeURIComponent(id)}`, { signal }, (response) => response.blob());
  }
}

