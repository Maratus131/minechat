export interface NotificationPayload { recipientId: string; messageId: number; conversationId: string; title: string; url: string }
const uuid = '[a-f\\d]{8}-[a-f\\d]{4}-[a-f\\d]{4}-[a-f\\d]{4}-[a-f\\d]{12}';
const idPattern = new RegExp(`^${uuid}$`, 'i');

export function notificationClaims(token: unknown, now = Date.now()): { userId: string; expiresAt: number } | null {
  if (typeof token !== 'string' || token.length > 8192 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'));
    if (!claims || typeof claims !== 'object' || !('sub' in claims) || typeof claims.sub !== 'string' || !idPattern.test(claims.sub)
      || !('exp' in claims) || typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) || claims.exp * 1000 <= now) return null;
    // Only tentative claims: main must validate this token with the configured backend before accepting them.
    return { userId: claims.sub, expiresAt: claims.exp * 1000 };
  } catch { return null; }
}

export function parseNotification(value: unknown, userId: string): NotificationPayload | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<NotificationPayload>;
  if (item.recipientId !== userId || typeof item.conversationId !== 'string' || !idPattern.test(item.conversationId)
    || !Number.isSafeInteger(item.messageId) || item.messageId! < 1 || typeof item.title !== 'string'
    || !item.title.trim() || item.title.length > 80 || /[\u0000-\u001f\u007f]/.test(item.title)
    || typeof item.url !== 'string' || !new RegExp(`^/(?:chats|groups|channels)/${uuid}$`, 'i').test(item.url)
    || item.url.split('/')[2] !== item.conversationId) return null;
  return item as NotificationPayload;
}
