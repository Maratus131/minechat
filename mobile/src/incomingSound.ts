import type { Message } from '../../frontend/src/api/contracts';

/** Session-local IDs prevent duplicate sounds after reconnects. History never calls this gate. */
export function createIncomingSoundGate(userId: string) {
  const seen = new Set<number>();
  return (message: Message, alreadyLoaded = false) => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    if (seen.size > 4096) {
      const first = seen.values().next().value;
      if (first !== undefined) seen.delete(first);
    }
    return !alreadyLoaded && !message.deleted && !message.editedAt && message.sender.id !== userId;
  };
}
