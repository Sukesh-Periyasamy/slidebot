/*
 * OfflineQueue — simple bounded optimistic queue persisted to localStorage.
 * - Survives tab reloads (localStorage)
 * - Dedupes by eventId
 * - Bounded to avoid unbounded memory growth
 */

// Lightweight id generator to avoid adding a dependency
function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const QUEUE_PREFIX = 'slidebot:annotationQueue';
const MAX_QUEUE = 512;

export type QueueEvent = {
  id: string;
  type: string;
  payload: unknown;
  retries: number;
  createdAt: number;
  lastAttemptAt?: number | null;
};

function storageKey(roomId: string) {
  return `${QUEUE_PREFIX}:${roomId}`;
}

export class OfflineQueue {
  private roomId: string;
  private items: QueueEvent[] = [];
  private dedupe = new Set<string>();

  constructor(roomId: string) {
    this.roomId = roomId;
    this.load();
  }

  private load() {
    try {
      const raw = localStorage.getItem(storageKey(this.roomId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as QueueEvent[];
      this.items = parsed.slice(0, MAX_QUEUE);
      for (const it of this.items) this.dedupe.add(it.id);
    } catch (err) {
      // ignore storage errors
      this.items = [];
      this.dedupe.clear();
    }
  }

  private persist() {
    try {
      localStorage.setItem(storageKey(this.roomId), JSON.stringify(this.items));
    } catch (err) {
      // noop
    }
  }

  enqueue(type: string, payload: unknown, id?: string) {
    const eventId = id ?? generateId();
    if (this.dedupe.has(eventId)) return;
    const ev: QueueEvent = {
      id: eventId,
      type,
      payload,
      retries: 0,
      createdAt: Date.now(),
      lastAttemptAt: null,
    };
    this.items.push(ev);
    this.dedupe.add(eventId);
    // enforce bound
    if (this.items.length > MAX_QUEUE) {
      const removed = this.items.splice(0, this.items.length - MAX_QUEUE);
      for (const r of removed) this.dedupe.delete(r.id);
    }
    this.persist();
  }

  peek(): QueueEvent | undefined {
    return this.items[0];
  }

  shift(): QueueEvent | undefined {
    const ev = this.items.shift();
    if (ev) this.dedupe.delete(ev.id);
    this.persist();
    return ev;
  }

  count() {
    return this.items.length;
  }

  // Retry/backoff policy (exponential): returns ms to wait
  nextBackoff(retries: number) {
    const base = 250; // ms
    const max = 30_000; // 30s
    const val = Math.min(max, Math.pow(2, retries) * base);
    return val;
  }

  clear() {
    this.items = [];
    this.dedupe.clear();
    this.persist();
  }
}

export function getQueueForRoom(roomId: string) {
  return new OfflineQueue(roomId);
}
