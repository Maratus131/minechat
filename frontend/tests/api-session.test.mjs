import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); }
  catch (error) { if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.')) return next(`${specifier}.ts`, context); throw error; }
} });
const { ChatApi } = await import('../src/api/client.ts');

test('Renewing access leaves pending uploads alive and uses the new bearer on subsequent requests', async (t) => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  let complete; const requests = [];
  globalThis.fetch = (_url, options) => {
    requests.push(options);
    if (requests.length === 1) return new Promise((resolve) => { complete = resolve; });
    return Promise.resolve(new Response('{}'));
  };
  const api = new ChatApi('old-access');
  const upload = api.request('/conversations/test/messages', { method: 'POST', body: new FormData() });
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer old-access');
  api.replaceAccessToken('new-access');
  assert.equal(requests[0].signal.aborted, false);
  await api.request('/users/me');
  assert.equal(requests[1].headers.get('Authorization'), 'Bearer new-access');
  assert.equal(requests[0].signal.aborted, false);
  complete(new Response('{}')); assert.equal((await upload).status, 200);
  api.dispose(); assert.equal(requests[0].signal.aborted, true);
});

test('A 401 requests session restoration without aborting unrelated HTTP operations', async (t) => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const signals = []; let restored = 0;
  globalThis.fetch = async (_url, options) => { signals.push(options.signal); return new Response('{"detail":"Expired"}', { status: 401 }); };
  const api = new ChatApi('expired-access', () => { restored++; });
  await assert.rejects(api.request('/users/me'), (error) => error.status === 401);
  assert.equal(restored, 1); assert.equal(signals[0].aborted, false);
  api.replaceAccessToken('renewed-access');
  globalThis.fetch = async () => new Response('{}');
  assert.equal((await api.request('/users/me')).status, 200);
  api.dispose(); assert.equal(signals[0].aborted, true);
});
