export interface StoredDeviceSession { refreshToken: string; expiresAt: number }
interface SecureStorageDriver {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

export function deviceSessionKey(apiUrl: string) {
  const scope = new URL(apiUrl).href.replace(/\/$/, '');
  return `minechat.device.${Array.from(scope, (character) => character.charCodeAt(0).toString(16).padStart(4, '0')).join('')}`;
}

/** Serial writes ensure that logout's delete follows any already-started login save. */
export function createDeviceSessionStore(driver: SecureStorageDriver, apiUrl: string) {
  const key = deviceSessionKey(apiUrl);
  let pending: Promise<unknown> = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = pending.then(operation);
    pending = next.catch(() => undefined);
    return next;
  }
  return {
    read: () => serialize(async (): Promise<StoredDeviceSession | null> => {
      const raw = await driver.get(key);
      if (!raw) return null;
      try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object' || !('refreshToken' in value) || !('expiresAt' in value)
          || typeof value.refreshToken !== 'string' || !value.refreshToken || value.refreshToken.length > 4096
          || typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt) || value.expiresAt <= 0) throw new Error('Invalid stored session');
        return { refreshToken: value.refreshToken, expiresAt: value.expiresAt };
      } catch {
        await driver.remove(key);
        return null;
      }
    }),
    save: (value: StoredDeviceSession) => {
      const serialized = JSON.stringify({ refreshToken: value.refreshToken, expiresAt: value.expiresAt });
      return serialize(() => driver.set(key, serialized));
    },
    clear: () => serialize(() => driver.remove(key)),
  };
}
