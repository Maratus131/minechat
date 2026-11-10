import { baseUrl } from './api';
import { createDeviceSessionStore } from './deviceSessionStore';

async function secureStore() {
  // An old development build can lack this native module; session-only login still works.
  const store = await import('expo-secure-store');
  if (!await store.isAvailableAsync()) throw new Error('Secure storage is unavailable');
  return store;
}

export const deviceSessionStore = createDeviceSessionStore({
  get: async (key) => (await secureStore()).getItemAsync(key),
  set: async (key, value) => {
    const store = await secureStore();
    await store.setItemAsync(key, value, { keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
  remove: async (key) => (await secureStore()).deleteItemAsync(key),
}, baseUrl);
