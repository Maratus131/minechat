import type { Message } from '../../api/contracts';

/** One gate per signed-in session. History and updated events never pass through this gate. */
export class IncomingMessages {
  private readonly seen = new Set<number>();
  accept(message: Message, viewerId: string, alreadyLoaded = false): boolean {
    if (message.deleted || message.sender.id === viewerId || this.seen.has(message.id)) return false;
    this.seen.add(message.id);
    if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value!);
    return !alreadyLoaded;
  }
}

export function notificationRoute(value: string): boolean {
  return /^\/(?:chats|groups|channels)\/[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
}
