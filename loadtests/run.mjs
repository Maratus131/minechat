import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';

function number(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name}: допустимо ${min}..${max}`);
  return value;
}
const users = number('USERS', 100, 2, 1000);
const duration = number('DURATION_SEC', 60, 5, 600);
const interval = number('MESSAGE_INTERVAL_MS', 5000, 250, 60000);
if (!Number.isInteger(users) || users % 2) throw new Error('USERS должно быть чётным целым числом.');
if (users * duration * 1000 / interval > 100_000) throw new Error('Сократите нагрузку: не более 100000 сообщений за прогон.');
const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:18080/api/v1');
if (!['127.0.0.1', 'localhost', '[::1]', 'backend'].includes(base.hostname)
  || !['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash
  || base.pathname.replace(/\/$/, '') !== '/api/v1') {
  throw new Error('BASE_URL: только локальный /api/v1 или backend внутри отдельного Docker-стенда. Публичные серверы запрещены.');
}
base.pathname = base.pathname.replace(/\/$/, '');
const wsUrl = new URL(`${base}/ws`); wsUrl.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
const timeout = number('REQUEST_TIMEOUT_MS', 10000, 1000, 60000);
const limits = {
  httpErrorRate: number('MAX_HTTP_ERROR_RATE', 0.01, 0, 1),
  httpP95Ms: number('MAX_HTTP_P95_MS', 2000, 1, 60000),
  deliveryP95Ms: number('MAX_DELIVERY_P95_MS', 2000, 1, 60000),
  deliveryRate: number('MIN_DELIVERY_RATE', 0.99, 0, 1),
};
const runId = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
const signal = new AbortController();
const setup = { requests: 0, failed: 0, durations: [] };
const workload = { requests: 0, failed: 0, durations: [] };
const errors = [];
const clients = [];
const expected = new Map();
let closing = false, socketFailures = 0, invalidEvents = 0, isolationLeaks = 0;
let readyUsers = 0, connectedNow = 0, peakConnections = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function sample(message) { if (errors.length < 10 && !errors.includes(message)) errors.push(message); }
function percentile(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1] * 100) / 100;
}
function httpSummary(metric) {
  return { requests: metric.requests, failed: metric.failed, errorRate: metric.requests ? metric.failed / metric.requests : 0, p95Ms: percentile(metric.durations) };
}
async function jsonResponse(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Пустой HTTP-ответ');
  const chunks = []; let length = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.byteLength;
      if (length > 1024 * 1024) throw new Error('HTTP-ответ больше 1 МиБ');
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
async function request(path, { actor, body, method = 'GET', status = 200, phase = setup } = {}) {
  const start = performance.now(); phase.requests++;
  try {
    const response = await fetch(`${base}${path}`, {
      method, redirect: 'error', headers: { ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.any([signal.signal, AbortSignal.timeout(timeout)]),
    });
    if (response.status !== status) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
    return await jsonResponse(response);
  } catch (error) {
    phase.failed++;
    // Do not print request bodies, passwords, access tokens or response data.
    sample(`${method} ${path.split('?')[0]}: ${error.name === 'TimeoutError' ? 'timeout' : error.message.startsWith('HTTP ') ? error.message : error.name}`);
    throw new Error(`Не выполнен ${method} ${path.split('?')[0]}`);
  } finally { phase.durations.push(performance.now() - start); }
}
async function concurrent(items, operation, count = 8) {
  let next = 0, failure = null;
  await Promise.all(Array.from({ length: Math.min(count, items.length) }, async () => {
    while (next < items.length && !signal.signal.aborted && !failure) {
      try { await operation(items[next++]); } catch (error) { failure ??= error; }
    }
  }));
  if (failure) throw failure;
}
async function waitForServer() {
  const until = Date.now() + 120000;
  while (Date.now() < until && !signal.signal.aborted) {
    try {
      const response = await fetch(`${base}/users/me`, { signal: AbortSignal.timeout(2000), redirect: 'error' });
      await response.body?.cancel(); if (response.status === 401) return;
    } catch { /* Booting the isolated test stack. */ }
    await sleep(1000);
  }
  throw new Error('Backend не запустился за 120 секунд.');
}
function connect(actor) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl); actor.socket = socket;
    let ready = false;
    const timer = setTimeout(() => { socket.close(); reject(new Error('WebSocket ready timeout')); }, timeout);
    socket.addEventListener('open', () => {
      try { socket.send(JSON.stringify({ type: 'auth', token: actor.token })); }
      catch { clearTimeout(timer); reject(new Error('WebSocket auth send failed')); }
    });
    socket.addEventListener('message', ({ data }) => {
      try {
        if (typeof data !== 'string' || data.length > 1024 * 1024) throw new Error('frame');
        const frame = JSON.parse(data);
        if (frame.event === 'ready') {
          if (frame.data?.userId !== actor.id) throw new Error('userId');
          if (!ready) {
            ready = true; readyUsers++; connectedNow++; peakConnections = Math.max(peakConnections, connectedNow);
            clearTimeout(timer); resolve();
          }
        } else if (frame.event === 'message.created') {
          const message = frame.data;
          if (typeof message?.text !== 'string' || !Number.isSafeInteger(message.id)) throw new Error('message');
          if (message.conversationId !== actor.conversationId || ![actor.id, actor.peer.id].includes(message.sender?.id)) {
            isolationLeaks++; sample('WebSocket: сообщение получено посторонним пользователем'); return;
          }
          const sent = expected.get(message.text);
          if (sent && actor.id === sent.recipient && !sent.receivedAt) sent.receivedAt = performance.now();
        } else if (!['heartbeat', 'message.deleted'].includes(frame.event)) throw new Error('event');
      } catch { invalidEvents++; sample('WebSocket: некорректное событие'); }
    });
    socket.addEventListener('error', () => { if (!ready) { clearTimeout(timer); reject(new Error('WebSocket connection error')); } });
    socket.addEventListener('close', ({ code }) => {
      clearTimeout(timer);
      if (ready) connectedNow--;
      if (!closing) { socketFailures++; sample(`WebSocket: неожиданное закрытие (${code})`); }
      if (!ready) reject(new Error(`WebSocket closed before ready (${code})`));
    });
  });
}
async function play(actor, until) {
  await sleep(Math.random() * Math.min(interval, 1000));
  let sequence = 0;
  while (Date.now() < until && !signal.signal.aborted) {
    const text = `load:${runId}:${actor.index}:${sequence++}`;
    const record = { recipient: actor.peer.id, sentAt: performance.now(), accepted: false, receivedAt: null };
    expected.set(text, record);
    try {
      const message = await request(`/conversations/${actor.conversationId}/messages`, { actor, method: 'POST', body: { text }, status: 201, phase: workload });
      if (message.text !== text || message.conversationId !== actor.conversationId || message.sender?.id !== actor.id) {
        invalidEvents++; sample('HTTP send: некорректное сообщение');
      } else record.accepted = true;
      const history = await request(`/conversations/${actor.conversationId}/messages?limit=10`, { actor, phase: workload });
      if (!Array.isArray(history.items) || !history.items.some(item => item.id === message.id)) {
        invalidEvents++; sample('HTTP history: отправленное сообщение не найдено');
      }
    } catch { /* Failures remain visible in metrics and thresholds; the user continues at a bounded rate. */ }
    const remaining = Math.max(0, until - Date.now());
    await sleep(Math.min(interval, remaining));
    // A timer may wake slightly before the deadline. Do not shorten the last
    // interval and accidentally send a final burst just before the run ends.
    if (remaining <= interval) break;
  }
}
process.once('SIGINT', () => signal.abort());
process.once('SIGTERM', () => signal.abort());
let fatal = null;
const started = new Date();
try {
  await waitForServer();
  console.log(`Нагрузочный стенд: ${base.origin}; пользователей: ${users}; длительность: ${duration} с.`);
  await concurrent(Array.from({ length: users }, (_, index) => index), async index => {
    const username = `lt_${runId}_${index}`; const password = randomBytes(18).toString('base64url');
    await request('/auth/register', { method: 'POST', status: 201, body: { username, displayName: `Load user ${index}`, password } });
    const auth = await request('/auth/login', { method: 'POST', body: { username, password } });
    if (typeof auth.accessToken !== 'string' || typeof auth.user?.id !== 'string') throw new Error('Некорректный ответ входа');
    clients[index] = { index, id: auth.user.id, token: auth.accessToken };
  });
  await concurrent(clients.filter((_, index) => index % 2 === 0), async actor => {
    const peer = clients[actor.index + 1]; actor.peer = peer; peer.peer = actor;
    const conversation = await request('/conversations', { actor, method: 'POST', body: { userId: peer.id } });
    if (typeof conversation.id !== 'string') throw new Error('Некорректный ответ создания переписки');
    actor.conversationId = conversation.id; peer.conversationId = conversation.id;
  });
  await concurrent(clients, connect);
  console.log(`Подключено ${clients.length} WebSocket. Начинается отправка сообщений.`);
  await Promise.all(clients.map(actor => play(actor, Date.now() + duration * 1000)));
  const drainUntil = Date.now() + timeout;
  while ([...expected.values()].some(item => item.accepted && !item.receivedAt) && Date.now() < drainUntil && !signal.signal.aborted) await sleep(50);
} catch (error) { fatal = error.message; sample(fatal); }
finally {
  closing = true;
  for (const actor of clients) actor?.socket?.close();
}
const accepted = [...expected.values()].filter(item => item.accepted);
const delivered = accepted.filter(item => item.receivedAt !== null);
const deliveryP95 = percentile(delivered.map(item => item.receivedAt - item.sentAt));
const deliveryRate = accepted.length ? delivered.length / accepted.length : 0;
const http = httpSummary(workload);
const checks = {
  setup: !fatal && clients.length === users && readyUsers === users && peakConnections === users && setup.failed === 0,
  enoughMessages: accepted.length >= users,
  httpErrorRate: http.errorRate <= limits.httpErrorRate,
  httpP95: http.p95Ms !== null && http.p95Ms <= limits.httpP95Ms,
  deliveryRate: deliveryRate >= limits.deliveryRate,
  deliveryP95: deliveryP95 !== null && deliveryP95 <= limits.deliveryP95Ms,
  noSocketFailures: socketFailures === 0,
  noProtocolErrors: invalidEvents === 0,
  noIsolationLeaks: isolationLeaks === 0,
  notInterrupted: !signal.signal.aborted,
};
const passed = Object.values(checks).every(Boolean);
const report = {
  runId, startedAt: started.toISOString(), finishedAt: new Date().toISOString(), node: process.version,
  target: base.toString(), users, durationSeconds: duration, messageIntervalMs: interval,
  setupHttp: httpSummary(setup), workloadHttp: http,
  websocket: { readyUsers, peakConnections, acceptedMessages: accepted.length, deliveredMessages: delivered.length, deliveryRate, deliveryP95Ms: deliveryP95, socketFailures, invalidEvents, isolationLeaks },
  limits, checks, passed, errors,
};
const reportPath = process.env.REPORT_PATH || 'target/load-results/latest.json';
await mkdir(dirname(reportPath), { recursive: true }); await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log(`Отчёт: ${reportPath}`);
process.exitCode = passed ? 0 : signal.signal.aborted ? 130 : 1;
// Bound shutdown if a disconnected peer never acknowledges the close handshake.
setTimeout(() => process.exit(process.exitCode), 2000).unref();
