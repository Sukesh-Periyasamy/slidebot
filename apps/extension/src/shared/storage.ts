/**
 * Chrome storage helpers — typed wrappers around chrome.storage.local.
 *
 * Prefer chrome.storage.local over localStorage in extensions:
 * - Available in service workers (localStorage is not)
 * - Shared between all extension contexts (background, popup, content)
 * - Supports onChanged listeners
 */

// ─────────────────────────────────────────────────────────────────────────────
// Storage schema
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtensionStorageSchema {
  /** Supabase JWT for API authentication */
  authToken: string | null;
  userId: string | null;
  /** Last known active SlideBot session ID */
  activeSessionId: string | null;
  /** WebApp URL (configurable for dev/prod) */
  webAppUrl: string;
  /** API URL */
  apiUrl: string;
  /** Whether the overlay is dismissed by user */
  overlayDismissed: boolean;
  /** Meet code → session ID mapping (for reconnect) */
  meetSessionMap: Record<string, string>;
}

const DEFAULTS: ExtensionStorageSchema = {
  authToken: null,
  userId: null,
  activeSessionId: null,
  webAppUrl: 'https://slidebot-web.vercel.app',
  apiUrl: 'https://slidebot-api-mvb8.onrender.com',
  overlayDismissed: false,
  meetSessionMap: {},
};

// ─────────────────────────────────────────────────────────────────────────────
// Typed storage API
// ─────────────────────────────────────────────────────────────────────────────

/** Get a single value from storage with type safety. */
export async function storageGet<K extends keyof ExtensionStorageSchema>(
  key: K
): Promise<ExtensionStorageSchema[K]> {
  const result = await chrome.storage.local.get(key);
  return (result[key] ?? DEFAULTS[key]) as ExtensionStorageSchema[K];
}

/** Get multiple values from storage. */
export async function storageGetMultiple<K extends keyof ExtensionStorageSchema>(
  keys: K[]
): Promise<Pick<ExtensionStorageSchema, K>> {
  const result = await chrome.storage.local.get(keys);
  const output = {} as Pick<ExtensionStorageSchema, K>;
  for (const key of keys) {
    (output as Record<string, unknown>)[key] = result[key] ?? DEFAULTS[key];
  }
  return output;
}

/** Set one or more values in storage. */
export async function storageSet(updates: Partial<ExtensionStorageSchema>): Promise<void> {
  await chrome.storage.local.set(updates);
}

/** Remove a key from storage. */
export async function storageRemove(key: keyof ExtensionStorageSchema): Promise<void> {
  await chrome.storage.local.remove(key);
}

/** Clear all extension storage. */
export async function storageClear(): Promise<void> {
  await chrome.storage.local.clear();
}

/** Listen to storage changes with typed keys. */
export function onStorageChange(
  key: keyof ExtensionStorageSchema,
  handler: (newValue: ExtensionStorageSchema[typeof key]) => void
): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (key in changes && changes[key]) {
      handler(changes[key].newValue as ExtensionStorageSchema[typeof key]);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain-specific helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function saveAuthToken(token: string, userId: string): Promise<void> {
  await storageSet({ authToken: token, userId });
}

export async function clearAuthToken(): Promise<void> {
  await storageSet({ authToken: null, userId: null });
}

export async function getAuthToken(): Promise<string | null> {
  return storageGet('authToken');
}

export async function mapMeetToSession(meetCode: string, sessionId: string): Promise<void> {
  const existing = await storageGet('meetSessionMap');
  await storageSet({
    meetSessionMap: { ...existing, [meetCode]: sessionId },
  });
}

export async function getSessionForMeet(meetCode: string): Promise<string | null> {
  const map = await storageGet('meetSessionMap');
  return map[meetCode] ?? null;
}
