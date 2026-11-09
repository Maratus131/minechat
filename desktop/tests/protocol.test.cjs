const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { join } = require('node:path');
const test = require('node:test');
const { createAppHandler } = require('../dist/protocol.js');

test('Desktop proxy forwards PUT bodies and preserves the authorization header', async () => {
  let received;
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    received = { method: request.method, url: request.url, authorization: request.headers.authorization, origin: request.headers.origin, body };
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"saved":true}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const upstream = `http://127.0.0.1:${server.address().port}`;
    const handler = await createAppHandler(join(__dirname, '../renderer'), upstream, new AbortController().signal);
    const result = await handler(new Request('minechat://app/api/v1/users/me', {
      method: 'PUT', headers: { Authorization: 'Bearer test-only', 'Content-Type': 'application/json', Origin: 'minechat://app' }, body: '{"displayName":"Test"}',
    }));
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { saved: true });
    assert.deepEqual(received, { method: 'PUT', url: '/api/v1/users/me', authorization: 'Bearer test-only', origin: undefined, body: '{"displayName":"Test"}' });
    assert.equal((await handler(new Request('minechat://app/api/v1/users/me', { method: 'PATCH' }))).status, 405);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Renderer CSP allows only the configured WebSocket origin', async () => {
  const handler = await createAppHandler(join(__dirname, '../renderer'), 'https://chat.example:8443', new AbortController().signal);
  const result = await handler(new Request('minechat://app/'));
  assert.equal(result.status, 200);
  const csp = result.headers.get('Content-Security-Policy');
  assert.match(csp, /connect-src 'self' wss:\/\/chat\.example:8443;/);
  assert.ok(!csp.includes('*'));
  assert.equal((await handler(new Request('https://outside.example/'))).status, 403);
});
