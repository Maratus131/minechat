/* Notifications only: this worker deliberately does not cache pages, API responses or tokens. */
const databaseName = 'minechat-notifications';
let updates = Promise.resolve();

function stateDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readBinding() {
  const database = await stateDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('state');
      const request = transaction.objectStore('state').get('binding');
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}
async function writeBinding(binding) {
  const database = await stateDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('state', 'readwrite');
      transaction.objectStore('state').put(binding, 'binding');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { database.close(); }
}
function validBinding(binding) {
  return binding && typeof binding.userId === 'string' && typeof binding.sessionId === 'string'
    && Number.isFinite(binding.expiresAt) && binding.expiresAt > Date.now() && typeof binding.sound === 'boolean' && typeof binding.enabled === 'boolean';
}
function validRoute(url) {
  return typeof url === 'string' && /^\/(?:chats|groups|channels)\/[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(url);
}
async function clientState(client, recipientId) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve({ active: false, visible: false }); }, 400);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer); channel.port1.close();
      resolve({ active: event.data?.active === true, visible: event.data?.visible === true });
    };
    client.postMessage({ type: 'minechat:state', recipientId }, [channel.port2]);
  });
}

self.addEventListener('install', () => { void self.skipWaiting(); });
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'minechat:binding') return;
  const data = event.data;
  updates = updates.catch(() => {}).then(async () => {
    if (data.binding === null) {
      const binding = await readBinding();
      if (binding?.sessionId === data.expectedSessionId) {
        await writeBinding(null);
        for (const notification of await self.registration.getNotifications()) notification.close();
      }
    } else if (validBinding(data.binding)) await writeBinding(data.binding);
  });
  event.waitUntil(updates.finally(() => event.ports?.[0]?.postMessage({ saved: true })));
});
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data;
    try { data = event.data?.json(); } catch { return; }
    if (!data || data.type !== 'message.created' || !Number.isSafeInteger(data.messageId) || data.messageId < 1
      || typeof data.title !== 'string' || !validRoute(data.url) || !Number.isFinite(Date.parse(data.expiresAt))
      || Date.parse(data.expiresAt) <= Date.now()) return;
    await updates;
    const binding = await readBinding();
    if (!validBinding(binding) || !binding.enabled || binding.userId !== data.recipientId) return;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const states = await Promise.all(windows.map((client) => clientState(client, data.recipientId)));
    if (states.some((state) => state.active && state.visible)) return;
    // Open clients play levelup.mp3 themselves. A closed client uses the OS sound instead.
    await self.registration.showNotification(data.title.slice(0, 80), { body: 'Новое сообщение',
      tag: `minechat-${data.messageId}`, silent: !binding.sound || states.some((state) => state.active),
      data: { url: data.url, recipientId: data.recipientId, expiresAt: Math.min(binding.expiresAt, Date.parse(data.expiresAt)) } });
  })());
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const data = event.notification.data;
    const binding = await readBinding();
    if (!validBinding(binding) || !binding.enabled || binding.userId !== data?.recipientId || data.expiresAt <= Date.now() || !validRoute(data.url)) return;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      const state = await clientState(client, data.recipientId);
      if (state.active) {
        await client.focus();
        client.postMessage({ type: 'minechat:open', url: data.url, recipientId: data.recipientId });
        return;
      }
    }
    await self.clients.openWindow(data.url);
  })());
});
