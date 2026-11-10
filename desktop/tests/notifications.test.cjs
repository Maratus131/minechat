const assert = require('node:assert/strict');
const test = require('node:test');
const { notificationClaims, parseNotification } = require('../dist/notification-policy.js');
const { createAppHandler } = require('../dist/protocol.js');
const { join } = require('node:path');
const userId = '11111111-1111-1111-1111-111111111111';
const conversationId = '33333333-3333-3333-3333-333333333333';
function token(claims) { return `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`; }

test('Desktop notification claims reject malformed and expired sessions before backend validation', () => {
  assert.equal(notificationClaims(null), null);
  assert.equal(notificationClaims('invalid'), null);
  assert.equal(notificationClaims(token({ sub: userId, exp: 1 })), null);
  assert.equal(notificationClaims(token({ sub: 'not-a-user', exp: 9_999_999_999 })), null);
  const expires = Math.floor(Date.now() / 1000) + 60;
  assert.deepEqual(notificationClaims(token({ sub: userId, exp: expires })), { userId, expiresAt: expires * 1000 });
});

test('Desktop notification payloads are limited to the current recipient and internal matching conversation', () => {
  const payload = { recipientId: userId, conversationId, messageId: 1, title: 'Алексей', url: `/groups/${conversationId}` };
  assert.deepEqual(parseNotification(payload, userId), payload);
  for (const change of [{ recipientId: conversationId }, { url: 'https://outside.example' }, { url: '/profile' },
    { url: `/chats/${userId}` }, { messageId: -1 }, { title: 'x'.repeat(81) }, { title: 'Title\nInjected' }]) {
    assert.equal(parseNotification({ ...payload, ...change }, userId), null);
  }
});

test('Packaged notification sound is served as playable local audio under the renderer CSP', async () => {
  const handler = await createAppHandler(join(__dirname, '../renderer'), 'https://chat.example', new AbortController().signal);
  const response = await handler(new Request('minechat://app/assets/levelup.mp3'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
  assert.match(response.headers.get('Content-Security-Policy'), /media-src 'self' blob:/);
  assert.ok((await response.arrayBuffer()).byteLength > 0);
});
