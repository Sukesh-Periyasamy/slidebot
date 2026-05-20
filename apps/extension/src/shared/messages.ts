/**
 * Typed message contracts for all extension communication channels:
 *
 * Popup ↔ Background (service worker)
 * Content ↔ Background (service worker)
 * Background → Content (via tabs.sendMessage)
 *
 * All messages follow { type, payload? } shape.
 * Use sendMessage() / onMessage for type-safe dispatch.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Message type literals
// ─────────────────────────────────────────────────────────────────────────────

// Popup → Background
export const MSG = {
  // Popup requests
  GET_STATUS: 'GET_STATUS',
  OPEN_SLIDEBOT: 'OPEN_SLIDEBOT',
  CONNECT_SESSION: 'CONNECT_SESSION',
  DISCONNECT_SESSION: 'DISCONNECT_SESSION',
  STORE_AUTH_TOKEN: 'STORE_AUTH_TOKEN',
  CLEAR_AUTH_TOKEN: 'CLEAR_AUTH_TOKEN',

  // Content → Background
  MEET_SESSION_STARTED: 'MEET_SESSION_STARTED',
  MEET_SESSION_ENDED: 'MEET_SESSION_ENDED',
  CONTENT_READY: 'CONTENT_READY',
  SESSION_CODE_ENTERED: 'SESSION_CODE_ENTERED',

  // Background → Content
  SHOW_OVERLAY: 'SHOW_OVERLAY',
  HIDE_OVERLAY: 'HIDE_OVERLAY',
  PUSH_SESSION_STATE: 'PUSH_SESSION_STATE',
  PUSH_SLIDE_CHANGE: 'PUSH_SLIDE_CHANGE',
} as const;

export type MsgType = (typeof MSG)[keyof typeof MSG];

// ─────────────────────────────────────────────────────────────────────────────
// Message payload shapes (discriminated union)
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtensionStatus {
  isOnMeet: boolean;
  meetCode: string | null;
  isConnected: boolean;
  sessionId: string | null;
  deckTitle: string | null;
  currentSlide: number;
  totalSlides: number;
  isAuthenticated: boolean;
}

export interface SessionState {
  sessionId: string;
  deckId: string;
  deckTitle: string;
  presenterId: string;
  presenterName: string;
  currentSlide: number;
  totalSlides: number;
}

export interface SlideChangePayload {
  slideIndex: number;
  totalSlides: number;
  presenterName: string;
  sequenceNum: number;
}

// Union of all possible messages
export type ExtensionMessage =
  | { type: typeof MSG.GET_STATUS }
  | { type: typeof MSG.OPEN_SLIDEBOT; payload: { deckId?: string } }
  | { type: typeof MSG.CONNECT_SESSION; payload: { sessionCode: string } }
  | { type: typeof MSG.DISCONNECT_SESSION }
  | { type: typeof MSG.STORE_AUTH_TOKEN; payload: { token: string; userId: string } }
  | { type: typeof MSG.CLEAR_AUTH_TOKEN }
  | { type: typeof MSG.MEET_SESSION_STARTED; payload: { meetCode: string } }
  | { type: typeof MSG.MEET_SESSION_ENDED; payload: { meetCode: string } }
  | { type: typeof MSG.CONTENT_READY }
  | { type: typeof MSG.SESSION_CODE_ENTERED; payload: { code: string } }
  | { type: typeof MSG.SHOW_OVERLAY }
  | { type: typeof MSG.HIDE_OVERLAY }
  | { type: typeof MSG.PUSH_SESSION_STATE; payload: SessionState }
  | { type: typeof MSG.PUSH_SLIDE_CHANGE; payload: SlideChangePayload };

// ─────────────────────────────────────────────────────────────────────────────
// Type-safe messaging helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Send a message to the background service worker from popup/content. */
export function sendToBackground<T = unknown>(
  message: ExtensionMessage
): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

/** Send a message from background to a specific tab's content script. */
export function sendToTab<T = unknown>(
  tabId: number,
  message: ExtensionMessage
): Promise<T> {
  return chrome.tabs.sendMessage(tabId, message) as Promise<T>;
}

/** Register a typed message listener. Returns cleanup function. */
export function onMessage(
  handler: (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => boolean | void | Promise<void>
): () => void {
  const listener = (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => {
    return handler(message, sender, sendResponse);
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
