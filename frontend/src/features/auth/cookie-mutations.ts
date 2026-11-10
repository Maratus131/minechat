/** Login/register/logout change one browser cookie, so tabs serialize them for the same backend. */
export function cookieMutation<T>(key: string, signal: AbortSignal, operation: () => Promise<T>, locks: LockManager | undefined): Promise<T> {
  if (!locks) return operation();
  return locks.request(`minechat.auth.${key}`, { signal }, operation);
}
