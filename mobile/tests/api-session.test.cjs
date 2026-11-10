const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const { resolve } = require('node:path');
const test = require('node:test');
const ts = require('typescript');

// Exercise the actual native API adapter without loading React Native on the Node test runner.
function loadTypeScript(relativePath, imports = {}) {
  const filename = resolve(__dirname, relativePath);
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.require = (name) => Object.hasOwn(imports, name) ? imports[name] : require(name);
  loaded._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return loaded.exports;
}
function loadApi() {
  const previous = process.env.EXPO_PUBLIC_API_URL;
  process.env.EXPO_PUBLIC_API_URL = 'https://example.test/api/v1';
  try {
    return loadTypeScript('../src/api.ts', {
      './abort': loadTypeScript('../src/abort.ts'),
      '../../frontend/src/api/contracts': loadTypeScript('../../frontend/src/api/contracts.ts'),
    });
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previous;
  }
}

test('Renewing the access token preserves an in-flight POST and changes subsequent Authorization', async () => {
  const { ChatApi } = loadApi();
  const originalFetch = global.fetch;
  const requests = [];
  let completePost;
  global.fetch = async (url, options) => {
    requests.push({ signal: options.signal, bearer: options.headers.get('Authorization') });
    if (url.endsWith('/pending-message')) return new Promise((resolve) => {
      completePost = () => resolve(new Response(JSON.stringify({ saved: true }), { status: 200 }));
    });
    return new Response('{}', { status: 200 });
  };
  const api = new ChatApi('old-test-token');
  try {
    const sending = api.request('/pending-message', { method: 'POST' }, (response) => response.json());
    api.replaceAccessToken('new-test-token');
    assert.equal(requests[0].signal.aborted, false);
    await api.request('/next-request', {}, (response) => response.json());
    assert.equal(requests[0].bearer, 'Bearer old-test-token');
    assert.equal(requests[1].bearer, 'Bearer new-test-token');
    completePost();
    assert.deepEqual(await sending, { saved: true });
  } finally { api.dispose(); global.fetch = originalFetch; }
});

test('An unauthorized response asks for renewal; only actual session disposal aborts other requests', async () => {
  const { ChatApi } = loadApi();
  const originalFetch = global.fetch;
  let pendingSignal;
  let renewals = 0;
  global.fetch = (url, options) => {
    if (url.endsWith('/unauthorized')) return Promise.resolve(new Response(JSON.stringify({ detail: 'Expired test token' }), { status: 401 }));
    pendingSignal = options.signal;
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => {
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true }));
  };
  const api = new ChatApi('test-token', () => renewals++);
  try {
    const pending = api.request('/pending', {}, (response) => response.json());
    await assert.rejects(api.request('/unauthorized', {}, (response) => response.json()), (error) => error.status === 401);
    assert.equal(renewals, 1);
    assert.equal(pendingSignal.aborted, false);
    const rejected = assert.rejects(pending, (error) => error.name === 'AbortError');
    api.dispose();
    await rejected;
    assert.equal(pendingSignal.aborted, true);
  } finally { api.dispose(); global.fetch = originalFetch; }
});

test('Device refresh and logout never send the previous access token', async () => {
  const { ChatApi } = loadApi();
  const originalFetch = global.fetch;
  const requests = [];
  const auth = {
    accessToken: 'new-test-token', tokenType: 'Bearer', expiresIn: 3600,
    user: { id: '11111111-1111-1111-1111-111111111111', username: 'tester', displayName: 'Test', avatarId: null },
    refreshToken: 'test-refresh-token', refreshExpiresIn: 1000,
  };
  global.fetch = async (url, options) => {
    requests.push(options.headers.get('Authorization'));
    return url.endsWith('/logout') ? new Response(null, { status: 204 }) : new Response(JSON.stringify(auth), { status: 200 });
  };
  const api = new ChatApi('expired-test-token');
  try {
    await api.refreshDevice('test-refresh-token');
    await api.logoutDevice('test-refresh-token');
    assert.deepEqual(requests, [null, null]);
  } finally { api.dispose(); global.fetch = originalFetch; }
});
