import assert from 'node:assert/strict';
import test from 'node:test';
const { PersistentSession } = await import('../src/features/auth/session-state.ts');
const { cookieMutation } = await import('../src/features/auth/cookie-mutations.ts');
const first = { accessToken: 'access-a', tokenType: 'Bearer', expiresIn: 3600,
  user: { id: '11111111-1111-1111-1111-111111111111', username: 'alice', displayName: 'Alice', avatarId: null } };
const second = { ...first, accessToken: 'access-b', user: { ...first.user, id: '22222222-2222-2222-2222-222222222222', username: 'bob' } };
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
function fixture(overrides = {}, remembered = { loggedOut: false }) {
  let now = 1_000_000;
  const calls = { refresh: 0, logout: 0 };
  const changes = [];
  const controller = new PersistentSession({
    refresh: async (signal) => { calls.refresh++; return overrides.refresh ? overrides.refresh(signal) : first; },
    logout: async (signal) => { calls.logout++; return overrides.logout?.(signal); },
  }, { now: () => now, loggedOut: () => remembered.loggedOut,
    markLoggedOut: () => { remembered.loggedOut = true; }, markLoggedIn: () => { remembered.loggedOut = false; }, changed: (value) => changes.push(value) });
  return { controller, calls, changes, remembered, advance: (ms) => { now += ms; } };
}

test('Startup restores an existing login before entering the application', async () => {
  const pending = deferred(); const value = fixture({ refresh: () => pending.promise });
  const request = value.controller.restore();
  assert.equal(value.controller.state.phase, 'restoring');
  pending.resolve(first); await request;
  assert.equal(value.controller.state.session.auth.user.id, first.user.id);
  assert.equal(value.controller.state.phase, 'ready');
  assert.equal(value.calls.refresh, 1);
});

test('A missing or rejected refresh credential produces the login screen, not a network retry', async () => {
  const value = fixture({ refresh: async () => { throw { status: 401 }; } });
  await value.controller.restore();
  assert.equal(value.controller.state.phase, 'ready');
  assert.equal(value.controller.state.session, null);
});

test('Offline restoration keeps persistent login and can be retried', async () => {
  let offline = true;
  const value = fixture({ refresh: async () => { if (offline) throw { status: 503 }; return first; } });
  await value.controller.restore();
  assert.equal(value.controller.state.phase, 'unavailable');
  assert.equal(value.remembered.loggedOut, false);
  offline = false; await value.controller.restore();
  assert.equal(value.controller.state.session.auth.accessToken, first.accessToken);
});

test('A failed renewal preserves a still-valid access token and drops only expired access', async () => {
  const value = fixture({ refresh: async () => { throw { status: 0 }; } });
  value.controller.accept(first);
  await value.controller.restore();
  assert.equal(value.controller.state.session.auth.accessToken, first.accessToken);
  value.advance(3_600_001); await value.controller.restore();
  assert.equal(value.controller.state.session, null);
  assert.equal(value.controller.state.phase, 'unavailable');
  assert.equal(value.remembered.loggedOut, false);
});

test('Concurrent refresh requests share a single operation', async () => {
  const pending = deferred(); const value = fixture({ refresh: () => pending.promise });
  const a = value.controller.restore(); const b = value.controller.restore();
  assert.equal(value.calls.refresh, 1);
  pending.resolve(first); await Promise.all([a, b]);
});

test('A late refresh cannot sign the user back in after logout', async () => {
  const pending = deferred(); let signal;
  const value = fixture({ refresh: (current) => { signal = current; return pending.promise; } });
  const request = value.controller.restore(); await value.controller.logout();
  assert.equal(signal.aborted, true);
  pending.resolve(first); await request;
  assert.equal(value.controller.state.session, null);
  assert.equal(value.remembered.loggedOut, true);
});

test('A late refresh cannot replace a newer explicit login', async () => {
  const pending = deferred(); const value = fixture({ refresh: () => pending.promise });
  const request = value.controller.restore(); value.controller.accept(second);
  pending.resolve(first); await request;
  assert.equal(value.controller.state.session.auth.user.id, second.user.id);
});

test('Offline logout persists a non-secret marker and a new app instance does not restore it', async () => {
  const value = fixture({ logout: async () => { throw new Error('offline'); } });
  value.controller.accept(first); await value.controller.logout();
  const reopened = fixture({}, value.remembered); await reopened.controller.restore();
  assert.equal(reopened.calls.refresh, 0);
  assert.equal(reopened.controller.state.session, null);
  reopened.controller.accept(second);
  assert.equal(value.remembered.loggedOut, false);
});

test('New login waits until logout has finished changing browser cookies', async () => {
  const pending = deferred(); const value = fixture({ logout: () => pending.promise });
  void value.controller.logout(); let ready = false;
  const request = value.controller.beforeLogin().then(() => { ready = true; });
  await Promise.resolve(); assert.equal(ready, false);
  pending.resolve(); await request;
  assert.equal(ready, true);
});

test('Unmount aborts restoration without logging out or erasing persistent credentials', async () => {
  const pending = deferred(); const value = fixture({ refresh: () => pending.promise });
  const request = value.controller.restore(); value.controller.stop(); pending.resolve(first); await request;
  assert.equal(value.calls.logout, 0);
  assert.equal(value.remembered.loggedOut, false);
  assert.equal(value.controller.state.session, null);
});

test('Browser auth-cookie mutations acquire a shared backend lock', async () => {
  const signal = new AbortController().signal;
  const calls = [];
  const result = await cookieMutation('https://chat.example/api/v1', signal, async () => 'login', {
    async request(key, options, operation) { calls.push({ key, signal: options.signal }); return operation(); },
  });
  assert.equal(result, 'login');
  assert.equal(calls[0].key, 'minechat.auth.https://chat.example/api/v1');
  assert.equal(calls[0].signal, signal);
});
