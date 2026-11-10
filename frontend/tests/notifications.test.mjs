import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { MessageChannel } from 'node:worker_threads';
import test from 'node:test';
const { IncomingMessages, notificationRoute } = await import('../src/features/notifications/policy.ts');

test('Only new incoming messages pass the notification gate once per session', () => {
  const gate = new IncomingMessages();
  const message = { id: 1, sender: { id: 'peer' }, deleted: false };
  assert.equal(gate.accept(message, 'me'), true);
  assert.equal(gate.accept(message, 'me'), false);
  assert.equal(gate.accept({ ...message, id: 2, sender: { id: 'me' } }, 'me'), false);
  assert.equal(gate.accept({ ...message, id: 3, deleted: true }, 'me'), false);
  assert.equal(gate.accept({ ...message, id: 4 }, 'me', true), false);
  assert.equal(gate.accept({ ...message, id: 4 }, 'me'), false);
  assert.equal(new IncomingMessages().accept(message, 'me'), true);
});

test('Notification links accept only internal conversation routes', () => {
  const id = '33333333-3333-3333-3333-333333333333';
  for (const prefix of ['chats', 'groups', 'channels']) assert.equal(notificationRoute(`/${prefix}/${id}`), true);
  for (const url of ['https://outside.example', '//outside.example', '/profile', `/chats/${id}?redirect=https://outside.example`, '/chats/../profile']) {
    assert.equal(notificationRoute(url), false);
  }
});

async function worker() {
  let stored = null;
  const handlers = new Map();
  const shown = [];
  const windows = [];
  const database = { close() {}, transaction() {
    const transaction = { objectStore() { return {
      get() { const request = {}; queueMicrotask(() => { request.result = stored; request.onsuccess(); }); return request; },
      put(value) { stored = value; queueMicrotask(() => transaction.oncomplete()); },
    }; } };
    return transaction;
  } };
  runInNewContext(await readFile(new URL('../public/notifications-sw.js', import.meta.url), 'utf8'), {
    indexedDB: { open() { const request = {}; queueMicrotask(() => { request.result = database; request.onsuccess(); }); return request; } },
    MessageChannel, setTimeout, clearTimeout,
    self: { addEventListener(type, handler) { handlers.set(type, handler); },
      registration: { getNotifications: async () => [], showNotification: async (title, options) => { shown.push({ title, options }); } },
      clients: { matchAll: async () => windows },
    },
  });
  return { shown, windows, async emit(type, properties) {
    let finished = Promise.resolve();
    handlers.get(type)({ ...properties, waitUntil(promise) { finished = promise; } });
    await finished;
  } };
}
const binding = { userId: 'viewer', sessionId: 'session', expiresAt: Date.now() + 60_000, sound: true, enabled: true };
function push(recipientId = 'viewer') {
  return { type: 'message.created', messageId: 1, recipientId, title: 'Алексей',
    url: '/groups/33333333-3333-3333-3333-333333333333', expiresAt: new Date(Date.now() + 60_000).toISOString() };
}

test('Push requires a matching unexpired login binding; logout blocks subsequent delivery', async () => {
  const context = await worker();
  await context.emit('push', { data: { json: () => push() } });
  assert.equal(context.shown.length, 0);
  await context.emit('message', { data: { type: 'minechat:binding', binding } });
  await context.emit('push', { data: { json: () => push('another-user') } });
  assert.equal(context.shown.length, 0);
  await context.emit('push', { data: { json: () => ({ ...push(), expiresAt: '2000-01-01T00:00:00Z' }) } });
  assert.equal(context.shown.length, 0);
  await context.emit('push', { data: { json: () => push() } });
  assert.equal(context.shown.length, 1);
  assert.equal(context.shown[0].options.body, 'Новое сообщение');
  assert.equal(context.shown[0].options.silent, false);
  await context.emit('message', { data: { type: 'minechat:binding', binding: null, expectedSessionId: 'session' } });
  await context.emit('push', { data: { json: () => push() } });
  assert.equal(context.shown.length, 1);
});

test('A visible authenticated client suppresses push; hidden clients avoid a second system sound', async () => {
  const context = await worker();
  await context.emit('message', { data: { type: 'minechat:binding', binding } });
  let visible = true;
  context.windows.push({ postMessage(_data, ports) { ports[0].postMessage({ active: true, visible }); ports[0].close(); } });
  await context.emit('push', { data: { json: () => push() } });
  assert.equal(context.shown.length, 0);
  visible = false;
  await context.emit('push', { data: { json: () => push() } });
  assert.equal(context.shown.length, 1);
  assert.equal(context.shown[0].options.silent, true);
});

test('Cleanup from an old session cannot revoke the new session binding', async () => {
  const context = await worker();
  await context.emit('message', { data: { type: 'minechat:binding', binding: { ...binding, sessionId: 'new-session' } } });
  await context.emit('message', { data: { type: 'minechat:binding', binding: null, expectedSessionId: 'session' } });
  await context.emit('push', { data: { json: () => push() } });
  assert.equal(context.shown.length, 1);
});

test('Signing into another account with notifications disabled blocks the previous account push', async () => {
  const context = await worker();
  await context.emit('message', { data: { type: 'minechat:binding', binding } });
  await context.emit('message', { data: { type: 'minechat:binding', binding: { ...binding, userId: 'other', sessionId: 'new-session', enabled: false } } });
  await context.emit('push', { data: { json: () => push() } });
  await context.emit('push', { data: { json: () => push('other') } });
  assert.equal(context.shown.length, 0);
});
