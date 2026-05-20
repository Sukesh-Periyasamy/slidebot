/**
 * Shared constants for the SlideBot extension.
 */

/** Regex matching a Google Meet meeting room URL */
export const MEET_URL_REGEX = /^https:\/\/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})(?:\?.*)?$/;

/** ID of the shadow host injected into Meet */
export const SHADOW_HOST_ID = 'slidebot-extension-host';

/** ID attribute on the panel container */
export const PANEL_ID = 'slidebot-panel';

/** Extension origins allowed to communicate */
export const ALLOWED_ORIGINS = [
  'https://app.slidebot.app',
  'http://localhost:3000',
] as const;

/** Default web app URL */
export const DEFAULT_WEB_APP_URL = 'https://app.slidebot.app';

/** WebSocket reconnect delays (ms) */
export const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000] as const;

/** How long to wait before assuming a Meet session is dead (ms) */
export const MEET_IDLE_TIMEOUT_MS = 60_000;

/** SlideBot API endpoints */
export const API = {
  sessions: '/api/v1/sessions',
  decks: '/api/v1/decks',
  auth: '/api/v1/auth',
} as const;

/** Chrome alarm names */
export const ALARMS = {
  HEARTBEAT: 'slidebot:heartbeat',
} as const;
