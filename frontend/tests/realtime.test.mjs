import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';

// Resolve extensionless bundler imports for Node's built-in TypeScript loader; no runtime dependency.
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && context.parentURL?.includes('/src/api/')) return next(`${specifier}.ts`, context);
    throw error;
  }
} });
const { consumeRealtime } = await import('../src/api/realtime.ts');
const { parseRealtimeFrame } = await import('../src/api/contracts.ts');
const { throwIfAborted } = await import('../../mobile/src/abort.ts');
const userId = '11111111-1111-1111-1111-111111111111';
const conversationId = '22222222-2222-2222-2222-222222222222';
const ready = { event: 'ready', data: { userId } };
const message = { id: 1, conversationId, sender: { id: userId, username: 'test', displayName: 'Test', avatarId: null }, text: 'Hello', createdAt: '2026-11-08T00:00:00Z', attachments: [], deleted: false };
class Socket {
  closed = false;
  close() { this.closed = true; }
  emit(frame) { this.onmessage?.({ data: JSON.stringify(frame) }); }
}

test('WebSocket frame parser validates event payloads', () => {
  assert.equal(parseRealtimeFrame(ready).data.userId, userId);
  assert.equal(parseRealtimeFrame({ event: 'message.created', data: message }).data.id, 1);
  assert.throws(() => parseRealtimeFrame({ event: 'ready', data: { userId: 'invalid' } }));
  assert.throws(() => parseRealtimeFrame({ event: 'message.deleted', data: { conversationId, messageId: -1 } }));
  assert.throws(() => parseRealtimeFrame({ event: 'unknown', data: {} }));
});

test('Ready recovery finishes before queued message and deletion callbacks', async () => {
  const socket = new Socket();
  const controller = new AbortController();
  const calls = [];
  let finishRecovery;
  const recovery = new Promise((resolve) => { finishRecovery = resolve; });
  const running = consumeRealtime(async () => socket, controller.signal, async () => {
    calls.push('recover'); await recovery; calls.push('ready');
  }, (value) => calls.push(`message:${value.id}`), (id, messageId) => calls.push(`delete:${id}:${messageId}`));
  const stopped = assert.rejects(running, /остановлено/);
  await setImmediate();
  socket.emit(ready);
  socket.emit({ event: 'message.created', data: message });
  socket.emit({ event: 'message.deleted', data: { conversationId, messageId: 1 } });
  await setImmediate();
  assert.deepEqual(calls, ['recover']);
  finishRecovery();
  await setImmediate();
  assert.deepEqual(calls, ['recover', 'ready', 'message:1', `delete:${conversationId}:1`]);
  controller.abort();
  await stopped;
  assert.equal(socket.closed, true);
  assert.equal(socket.onmessage, null);
});

test('Events before authentication and malformed frames close the connection', async () => {
  for (const frame of [{ event: 'heartbeat', data: {} }, { event: 'ready', data: { userId: 'bad' } }]) {
    const socket = new Socket();
    const running = consumeRealtime(async () => socket, new AbortController().signal, async () => {}, () => assert.fail('Unexpected message'), () => assert.fail('Unexpected deletion'));
    const failed = assert.rejects(running);
    await setImmediate(); socket.emit(frame); await failed;
    assert.equal(socket.closed, true);
  }
});

test('Closing a socket aborts its recovery without marking a closed connection live', async () => {
  const socket = new Socket();
  const parent = new AbortController();
  const calls = [];
  let connectionSignal;
  let finishRecovery;
  const recovery = new Promise((resolve) => { finishRecovery = resolve; });
  const running = consumeRealtime(async () => socket, parent.signal, async (signal) => {
    connectionSignal = signal;
    calls.push('recover');
    await recovery;
    if (!signal.aborted) calls.push('live');
  }, () => calls.push('message'), () => calls.push('delete'));
  const stopped = assert.rejects(running, /прервано/);
  await setImmediate();
  socket.emit(ready);
  socket.emit({ event: 'message.created', data: message });
  await setImmediate();
  assert.equal(connectionSignal.aborted, false);
  socket.onclose();
  await stopped;
  assert.equal(connectionSignal.aborted, true);
  assert.equal(parent.signal.aborted, false);
  finishRecovery();
  await setImmediate();
  assert.deepEqual(calls, ['recover']);
});

test('Abort while resolving the endpoint closes the socket without processing events', async () => {
  const socket = new Socket();
  const controller = new AbortController();
  let opened;
  const running = consumeRealtime(() => new Promise((resolve) => { opened = resolve; }), controller.signal, async () => assert.fail('Unexpected ready'), () => {}, () => {});
  const stopped = assert.rejects(running);
  controller.abort(); opened(socket); await stopped;
  assert.equal(socket.closed, true);
});

test('An idle connection closes after the watchdog deadline', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const socket = new Socket();
  const running = consumeRealtime(async () => socket, new AbortController().signal, async () => {}, () => {}, () => {});
  const expired = assert.rejects(running, /не отвечает/);
  await setImmediate();
  context.mock.timers.tick(65_000);
  await expired;
  assert.equal(socket.closed, true);
});

test('React Native compatible signals work without AbortSignal.throwIfAborted', async () => {
  const controller = new AbortController();
  Object.defineProperty(controller.signal, 'throwIfAborted', { value: undefined });
  assert.equal(typeof controller.signal.throwIfAborted, 'undefined');
  assert.doesNotThrow(() => throwIfAborted(controller.signal));
  const socket = new Socket();
  let readyCount = 0;
  const running = consumeRealtime(async () => socket, controller.signal, async () => { readyCount++; }, () => {}, () => {});
  const stopped = assert.rejects(running, /остановлено/);
  await setImmediate(); socket.emit(ready); await setImmediate();
  assert.equal(readyCount, 1);
  controller.abort(); await stopped;
  assert.equal(socket.closed, true);
  assert.throws(() => throwIfAborted(controller.signal), { name: 'AbortError' });
  await assert.rejects(consumeRealtime(async () => assert.fail('Opening an aborted connection'), controller.signal, async () => {}, () => {}, () => {}), /остановлено/);
});
