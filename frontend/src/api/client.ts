import { InvalidResponseError, parseAuth, parseChannel, parseChannelMember, parseConversation, parseGroup, parseGroupMember, parseMessage, parsePage, parseProfile, parseUser, type CreateChannel, type Credentials, type GroupRole, type Registration } from './contracts';

const baseUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');

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
  constructor(private readonly token?: string, private readonly onUnauthorized?: () => void) {}
  dispose() { this.lifetime.abort(); }

  async request(path: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers);
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    const signal = options.signal ? AbortSignal.any([options.signal, this.lifetime.signal]) : this.lifetime.signal;
    let response: Response;
    try { response = await fetch(`${baseUrl}${path}`, { ...options, headers, signal }); }
    catch (error) {
      if (signal.aborted) throw error;
      throw new ApiError(0, 'Нет связи с сервером. Проверьте подключение и повторите попытку.');
    }
    if (!response.ok) {
      const error = await responseError(response);
      if (response.status === 401 && this.token && !signal.aborted) this.onUnauthorized?.();
      throw error;
    }
    return response;
  }

  private async json<T>(path: string, parse: (value: unknown) => T, options?: RequestInit): Promise<T> {
    const response = await this.request(path, options);
    let body: unknown;
    try { body = await response.json(); }
    catch (error) {
      if (error instanceof SyntaxError) throw new InvalidResponseError();
      throw error;
    }
    return parse(body);
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
  me(signal?: AbortSignal) { return this.json('/users/me', parseProfile, { signal }); }
  updateProfile(displayName: string, birthDate: string | null, signal?: AbortSignal) {
    return this.json('/users/me', parseProfile, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName, birthDate }), signal });
  }
  uploadAvatar(file: File, signal?: AbortSignal) {
    const body = new FormData();
    body.append('file', file);
    return this.json('/users/me/avatar', parseProfile, { method: 'PUT', body, signal });
  }
  deleteAvatar(signal?: AbortSignal) {
    return this.json('/users/me/avatar', parseProfile, { method: 'DELETE', signal });
  }
  async avatar(userId: string, signal?: AbortSignal) {
    const response = await this.request(`/users/${encodeURIComponent(userId)}/avatar`, { signal });
    return response.blob();
  }
  users(q: string, signal?: AbortSignal) {
    return this.json(`/users?${new URLSearchParams({ q, limit: '100' })}`, parsePage(parseUser), { signal });
  }
  conversations(page = 0, signal?: AbortSignal) {
    return this.json(`/conversations?page=${page}&limit=30`, parsePage(parseConversation), { signal });
  }
  channels(page = 0, signal?: AbortSignal) {
    return this.json(`/channels?page=${page}&limit=30`, parsePage(parseChannel), { signal });
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
  groups(page = 0, signal?: AbortSignal) {
    return this.json(`/groups?page=${page}&limit=30`, parsePage(parseGroup), { signal });
  }
  group(id: string, signal?: AbortSignal) {
    return this.json(`/groups/${encodeURIComponent(id)}`, parseGroup, { signal });
  }
  createGroup(title: string, memberIds: string[], signal?: AbortSignal) {
    return this.json('/groups', parseGroup, this.post({ title, memberIds }, signal));
  }
  groupMembers(id: string, page = 0, signal?: AbortSignal) {
    return this.json(`/groups/${encodeURIComponent(id)}/members?page=${page}&limit=100`, parsePage(parseGroupMember), { signal });
  }
  addGroupMember(id: string, userId: string, role: 'MEMBER' | 'READER') {
    return this.json(`/groups/${encodeURIComponent(id)}/members`, parseGroupMember, this.post({ userId, role }));
  }
  setGroupRole(id: string, userId: string, role: Exclude<GroupRole, 'OWNER'>) {
    return this.json(`/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, parseGroupMember,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
  }
  async removeGroupMember(id: string, userId: string) {
    await this.request(`/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  }
  channelMembers(id: string, page = 0, signal?: AbortSignal) {
    return this.json(`/channels/${encodeURIComponent(id)}/members?page=${page}&limit=100`, parsePage(parseChannelMember), { signal });
  }
  setChannelRole(id: string, userId: string, role: 'ADMIN' | 'SUBSCRIBER') {
    return this.json(`/channels/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, parseChannelMember,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
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
  send(id: string, text: string, files: File[], signal?: AbortSignal) {
    let options: RequestInit;
    if (files.length) {
      const body = new FormData();
      body.append('text', text);
      for (const file of files) body.append('files', file);
      options = { method: 'POST', body, signal };
    } else options = this.post({ text }, signal);
    return this.json(`/conversations/${encodeURIComponent(id)}/messages`, parseMessage, options);
  }
  deleteMessage(id: string, messageId: number) {
    return this.json(`/conversations/${encodeURIComponent(id)}/messages/${messageId}`, parseMessage, { method: 'DELETE' });
  }
  async download(id: string, signal?: AbortSignal) {
    const response = await this.request(`/attachments/${encodeURIComponent(id)}`, { signal });
    return response.blob();
  }
}
