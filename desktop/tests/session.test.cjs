const assert = require('node:assert/strict');
const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');
const { createServer } = require('node:http');
const { mkdtemp, readdir, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve, sep } = require('node:path');
const test = require('node:test');
const { SessionVault } = require('../dist/session-vault.js');
const { deviceAuthProxy } = require('../dist/device-auth.js');
const { createAppHandler } = require('../dist/protocol.js');

async function directory(t) {
  const root = resolve(tmpdir());
  const result = await mkdtemp(join(root, 'minechat-session-'));
  t.after(async () => {
    assert.ok(resolve(result).startsWith(`${root}${sep}minechat-session-`));
    await rm(result, { recursive: true, force: true });
  });
  return result;
}
function protection(available = true) {
  const key = randomBytes(32);
  return {
    available: async () => available,
    encrypt: async (value) => {
      const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]);
    },
    decrypt: async (value) => {
      const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
      decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
    },
  };
}
const refreshToken = 'test-refresh-credential-that-must-never-reach-renderer';
const response = { accessToken: 'test-access-only', tokenType: 'Bearer', expiresIn: 3600,
  user: { id: '11111111-1111-1111-1111-111111111111', username: 'alice', displayName: 'Alice', avatarId: null },
  refreshToken, refreshExpiresIn: 30 * 24 * 3600 };

test('Desktop restart restores only encrypted refresh credentials scoped to the backend', async (t) => {
  const location = await directory(t); const crypto = protection();
  const vault = new SessionVault(location, 'https://chat.example', crypto);
  await vault.save(refreshToken, 3600);
  const files = await readdir(location);
  assert.equal(files.length, 1);
  const encrypted = await readFile(join(location, files[0]));
  assert.equal(encrypted.includes(Buffer.from(refreshToken)), false);
  assert.equal(encrypted.includes(Buffer.from('test-access-only')), false);
  assert.equal(await new SessionVault(location, 'https://chat.example', crypto).get(), refreshToken);
  assert.equal(await new SessionVault(location, 'https://other.example', crypto).get(), null);
  await vault.clear();
  assert.equal(await new SessionVault(location, 'https://chat.example', crypto).get(), null);
});

test('Unavailable safe storage is memory-only and writes no plaintext fallback', async (t) => {
  const location = await directory(t); const crypto = protection(false);
  const vault = new SessionVault(location, 'https://chat.example', crypto);
  await vault.save(refreshToken, 3600);
  assert.equal(await vault.persistence(), 'memory');
  assert.equal(await vault.get(), refreshToken);
  assert.deepEqual(await readdir(location), []);
  assert.equal(await new SessionVault(location, 'https://chat.example', crypto).get(), null);
});

async function server(t, handler) {
  const instance = createServer(async (request, result) => {
    let body = ''; for await (const chunk of request) body += chunk;
    await handler(request, result, body ? JSON.parse(body) : null);
  });
  await new Promise((resolve) => instance.listen(0, '127.0.0.1', resolve));
  t.after(async () => { instance.closeAllConnections(); await new Promise((resolve) => instance.close(resolve)); });
  return { instance, origin: `http://127.0.0.1:${instance.address().port}` };
}
function authRequest(action, body = {}) {
  return new Request(`minechat://app/api/v1/auth/${action}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'forged-cookie', Authorization: 'Bearer expired-access' }, body: JSON.stringify(body) });
}

test('Device auth proxy hides refresh credentials, ignores renderer cookies and injects only its own refresh', async (t) => {
  const calls = [];
  const backend = await server(t, async (request, result, body) => {
    calls.push({ url: request.url, authorization: request.headers.authorization, cookie: request.headers.cookie, body });
    if (request.url.endsWith('/logout')) { result.writeHead(204); result.end(); return; }
    result.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'should-not-be-forwarded=1' }); result.end(JSON.stringify(response));
  });
  const vault = new SessionVault(await directory(t), backend.origin, protection());
  const proxy = deviceAuthProxy(backend.origin, vault, new AbortController().signal);
  const login = await proxy(authRequest('login', { username: 'alice', password: 'test-password' }), 'login');
  const visible = await login.json();
  assert.equal(visible.accessToken, response.accessToken);
  assert.equal('refreshToken' in visible, false);
  assert.equal('refreshExpiresIn' in visible, false);
  assert.equal(login.headers.get('set-cookie'), null);
  assert.equal(calls[0].url, '/api/v1/auth/device/login');
  assert.equal(calls[0].authorization, undefined); assert.equal(calls[0].cookie, undefined);
  assert.equal(await vault.get(), refreshToken);
  await proxy(authRequest('refresh', { refreshToken: 'forged' }), 'refresh');
  assert.equal(calls[1].body.refreshToken, refreshToken);
  await proxy(authRequest('logout'), 'logout');
  assert.equal(calls[2].body.refreshToken, refreshToken);
  assert.equal(await vault.get(), null);
});

test('Offline desktop logout clears the vault before attempting server revocation', async (t) => {
  const backend = await server(t, async (_request, result) => { result.writeHead(503); result.end(); });
  const location = await directory(t); const crypto = protection();
  const vault = new SessionVault(location, backend.origin, crypto); await vault.save(refreshToken, 3600);
  const proxy = deviceAuthProxy(backend.origin, vault, new AbortController().signal);
  assert.equal((await proxy(authRequest('logout'), 'logout')).status, 503);
  assert.equal(await new SessionVault(location, backend.origin, crypto).get(), null);
});

test('Renderer cannot directly call device endpoints to obtain a raw refresh credential', async () => {
  let forwarded = false;
  const handler = await createAppHandler(join(__dirname, '../renderer'), 'https://chat.example', new AbortController().signal,
    async () => { forwarded = true; return new Response(); });
  for (const path of ['/api/v1/auth/device/login', '/api/v1/auth/%64evice/login', '/api/v1/auth/unknown']) {
    const result = await handler(new Request(`minechat://app${path}`, { method: 'POST', body: '{}' }));
    assert.equal(result.status, 403);
  }
  for (const path of ['/api/v1//auth/device/login', '/api/v1/auth;/device/login', '/api/v1/auth//device/login']) {
    const result = await handler(new Request(`minechat://app${path}`, { method: 'POST', body: '{}' }));
    assert.equal(result.status, 400);
  }
  assert.equal(forwarded, false);
});

test('Only a rejected refresh credential clears the vault; temporary server failures preserve it', async (t) => {
  let status = 503;
  const backend = await server(t, async (_request, result) => { result.writeHead(status); result.end(); });
  const vault = new SessionVault(await directory(t), backend.origin, protection()); await vault.save(refreshToken, 3600);
  const proxy = deviceAuthProxy(backend.origin, vault, new AbortController().signal);
  assert.equal((await proxy(authRequest('refresh'), 'refresh')).status, 503);
  assert.equal(await vault.get(), refreshToken);
  status = 401;
  assert.equal((await proxy(authRequest('refresh'), 'refresh')).status, 401);
  assert.equal(await vault.get(), null);
});

test('A slow native refresh cannot overwrite the credentials of a newer login', async (t) => {
  let releaseRefresh; const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
  let startedRefresh; const refreshStarted = new Promise((resolve) => { startedRefresh = resolve; });
  const calls = [];
  const backend = await server(t, async (request, result) => {
    calls.push(request.url);
    if (request.url.endsWith('/refresh')) { startedRefresh(); await refreshGate; }
    result.writeHead(200, { 'Content-Type': 'application/json' });
    result.end(JSON.stringify({ ...response, refreshToken: request.url.endsWith('/login') ? 'new-login-refresh-credential' : refreshToken }));
  });
  const vault = new SessionVault(await directory(t), backend.origin, protection()); await vault.save(refreshToken, 3600);
  const proxy = deviceAuthProxy(backend.origin, vault, new AbortController().signal);
  const refreshing = proxy(authRequest('refresh'), 'refresh'); await refreshStarted;
  const loggingIn = proxy(authRequest('login', { username: 'alice', password: 'test-password' }), 'login');
  assert.deepEqual(calls, ['/api/v1/auth/device/refresh']);
  releaseRefresh(); await Promise.all([refreshing, loggingIn]);
  assert.deepEqual(calls, ['/api/v1/auth/device/refresh', '/api/v1/auth/device/login']);
  assert.equal(await vault.get(), 'new-login-refresh-credential');
});

test('A duplicate registration keeps the readable username-conflict message without exposing backend data', async (t) => {
  const backend = await server(t, async (_request, result) => { result.writeHead(409); result.end(JSON.stringify({ refreshToken: 'must-not-leak' })); });
  const vault = new SessionVault(await directory(t), backend.origin, protection());
  const proxy = deviceAuthProxy(backend.origin, vault, new AbortController().signal);
  const response = await proxy(authRequest('register', { username: 'alice', password: 'test-password' }), 'register');
  assert.equal(response.status, 409);
  assert.equal((await response.json()).detail, 'Логин уже занят.');
});
