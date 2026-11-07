export interface User { id: string; username: string; displayName: string; avatarId: string | null }
export interface Profile extends User { birthDate: string | null }
export interface Attachment { id: string; messageId: number; filename: string; sizeBytes: number }
export interface Message {
  id: number;
  conversationId: string;
  sender: User;
  text: string;
  createdAt: string;
  attachments: Attachment[];
  deleted: boolean;
}
export interface Conversation {
  id: string;
  peer: User;
  lastMessageId: number | null;
  lastMessageText: string | null;
  lastActivityAt: string;
}
export interface Channel {
  id: string; username: string; title: string; description: string; owner: User;
  subscribed: boolean; subscriberCount: number; lastMessageId: number | null;
  lastMessageText: string | null; lastActivityAt: string;
  viewerRole: 'OWNER' | 'ADMIN' | 'SUBSCRIBER' | null;
}
export type GroupRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'READER';
export interface Group {
  id: string; title: string; owner: User; viewerRole: GroupRole; memberCount: number;
  lastMessageId: number | null; lastMessageText: string | null; lastActivityAt: string;
}
export interface GroupMember { user: User; role: GroupRole }
export interface ChannelMember { user: User; role: 'OWNER' | 'ADMIN' | 'SUBSCRIBER' }
export interface CreateChannel { username: string; title: string; description: string }
export interface Page<T> { items: T[]; hasMore: boolean }
export interface AuthResponse { accessToken: string; tokenType: string; expiresIn: number; user: User }
export interface Credentials { username: string; password: string }
export interface Registration extends Credentials { displayName: string }

export class InvalidResponseError extends Error {
  constructor() { super('Сервер вернул некорректный ответ. Повторите запрос.'); }
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidResponseError();
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new InvalidResponseError();
  return value;
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new InvalidResponseError();
  return value;
}
function uuid(value: unknown): string {
  const result = string(value);
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(result)) throw new InvalidResponseError();
  return result;
}
function date(value: unknown): string {
  const result = string(value);
  if (!Number.isFinite(Date.parse(result))) throw new InvalidResponseError();
  return result;
}
function oneOf<T extends string>(value: unknown, options: readonly T[]): T {
  if (typeof value !== 'string' || !options.includes(value as T)) throw new InvalidResponseError();
  return value as T;
}
export function parseUser(value: unknown): User {
  const item = object(value);
  return { id: uuid(item.id), username: string(item.username), displayName: string(item.displayName),
    avatarId: item.avatarId === null ? null : uuid(item.avatarId) };
}
export function parseProfile(value: unknown): Profile {
  const item = object(value);
  const birthDate = item.birthDate === null ? null : string(item.birthDate);
  if (birthDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw new InvalidResponseError();
  return { ...parseUser(item), birthDate };
}
function parseAttachment(value: unknown): Attachment {
  const item = object(value);
  return { id: uuid(item.id), messageId: integer(item.messageId), filename: string(item.filename), sizeBytes: integer(item.sizeBytes) };
}
export function parseMessage(value: unknown): Message {
  const item = object(value);
  if (!Array.isArray(item.attachments) || typeof item.deleted !== 'boolean') throw new InvalidResponseError();
  return { id: integer(item.id), conversationId: uuid(item.conversationId), sender: parseUser(item.sender),
    text: string(item.text), createdAt: date(item.createdAt), attachments: item.attachments.map(parseAttachment), deleted: item.deleted };
}
export function parseConversation(value: unknown): Conversation {
  const item = object(value);
  return { id: uuid(item.id), peer: parseUser(item.peer),
    lastMessageId: item.lastMessageId === null ? null : integer(item.lastMessageId),
    lastMessageText: item.lastMessageText === null ? null : string(item.lastMessageText),
    lastActivityAt: date(item.lastActivityAt) };
}
export function parseChannel(value: unknown): Channel {
  const item = object(value);
  if (typeof item.subscribed !== 'boolean') throw new InvalidResponseError();
  return { id: uuid(item.id), username: string(item.username), title: string(item.title), description: string(item.description),
    owner: parseUser(item.owner), subscribed: item.subscribed, subscriberCount: integer(item.subscriberCount),
    viewerRole: item.viewerRole === null ? null : oneOf(item.viewerRole, ['OWNER', 'ADMIN', 'SUBSCRIBER'] as const),
    lastMessageId: item.lastMessageId === null ? null : integer(item.lastMessageId),
    lastMessageText: item.lastMessageText === null ? null : string(item.lastMessageText), lastActivityAt: date(item.lastActivityAt) };
}
export function parseGroup(value: unknown): Group {
  const item = object(value);
  return { id: uuid(item.id), title: string(item.title), owner: parseUser(item.owner),
    viewerRole: oneOf(item.viewerRole, ['OWNER', 'ADMIN', 'MEMBER', 'READER'] as const), memberCount: integer(item.memberCount),
    lastMessageId: item.lastMessageId === null ? null : integer(item.lastMessageId),
    lastMessageText: item.lastMessageText === null ? null : string(item.lastMessageText), lastActivityAt: date(item.lastActivityAt) };
}
export function parseGroupMember(value: unknown): GroupMember {
  const item = object(value);
  return { user: parseUser(item.user), role: oneOf(item.role, ['OWNER', 'ADMIN', 'MEMBER', 'READER'] as const) };
}
export function parseChannelMember(value: unknown): ChannelMember {
  const item = object(value);
  return { user: parseUser(item.user), role: oneOf(item.role, ['OWNER', 'ADMIN', 'SUBSCRIBER'] as const) };
}
export function parseMessageDeleted(value: unknown): { conversationId: string; messageId: number } {
  const item = object(value);
  return { conversationId: uuid(item.conversationId), messageId: integer(item.messageId) };
}
export function parseAuth(value: unknown): AuthResponse {
  const item = object(value);
  if (item.tokenType !== 'Bearer' || !item.accessToken) throw new InvalidResponseError();
  return { accessToken: string(item.accessToken), tokenType: item.tokenType, expiresIn: integer(item.expiresIn), user: parseUser(item.user) };
}
export function parsePage<T>(parse: (value: unknown) => T): (value: unknown) => Page<T> {
  return (value) => {
    const item = object(value);
    if (!Array.isArray(item.items) || typeof item.hasMore !== 'boolean') throw new InvalidResponseError();
    return { items: item.items.map(parse), hasMore: item.hasMore };
  };
}
