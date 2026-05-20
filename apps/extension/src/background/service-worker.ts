/**
 * Background Service Worker — the central hub for the SlideBot extension.
 *
 * Responsibilities:
 * - Route messages between popup, content scripts
 * - Manage auth token securely
 * - Track which tabs are active Meet sessions
 * - Handle extension lifecycle events
 */

import {
  MSG,
  onMessage,
  sendToTab,
  type ExtensionStatus,
} from '../shared/messages';
import {
  saveAuthToken,
  clearAuthToken,
  getAuthToken,
  storageGet,
  storageSet,
  mapMeetToSession,
  getSessionForMeet,
} from '../shared/storage';
import { MEET_URL_REGEX, ALARMS } from '../shared/constants';

// ─────────────────────────────────────────────────────────────────────────────
// State (in-memory, resets on service worker restart)
// ─────────────────────────────────────────────────────────────────────────────

/** tabId → meetCode for active Meet tabs */
const activeMeetTabs = new Map<number, string>();

/** Current extension status (rebuilt on demand) */
let currentStatus: Partial<ExtensionStatus> = {
  isOnMeet: false,
  meetCode: null,
  isConnected: false,
  sessionId: null,
  currentSlide: 0,
  totalSlides: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Install / update lifecycle
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    console.log('[SlideBot] Extension installed');
    // Open onboarding page
    void chrome.tabs.create({ url: `${getWebAppUrl()}/extension-welcome` });
  } else if (reason === 'update') {
    console.log('[SlideBot] Extension updated');
  }

  // Set up periodic heartbeat alarm
  void chrome.alarms.create(ALARMS.HEARTBEAT, { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARMS.HEARTBEAT) {
    // Keep service worker alive during active sessions
    void cleanupStaleTabs();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Tab lifecycle — detect Meet navigation
// ─────────────────────────────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  const url = tab.url ?? '';

  const meetMatch = MEET_URL_REGEX.exec(url);

  if (meetMatch) {
    const meetCode = meetMatch[1]!;

    if (!activeMeetTabs.has(tabId)) {
      activeMeetTabs.set(tabId, meetCode);
      currentStatus = { ...currentStatus, isOnMeet: true, meetCode };

      // Update popup icon badge
      void chrome.action.setBadgeText({ text: 'MEET', tabId });
      void chrome.action.setBadgeBackgroundColor({ color: '#6173F2', tabId });

      console.log(`[SlideBot BG] Meet tab detected: ${meetCode} (tab ${tabId})`);
    }
  } else {
    if (activeMeetTabs.has(tabId)) {
      const meetCode = activeMeetTabs.get(tabId)!;
      activeMeetTabs.delete(tabId);
      currentStatus = { ...currentStatus, isOnMeet: false, meetCode: null };

      void chrome.action.setBadgeText({ text: '', tabId });
      console.log(`[SlideBot BG] Left Meet: ${meetCode}`);
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  activeMeetTabs.delete(tabId);
});

// ─────────────────────────────────────────────────────────────────────────────
// Message routing
// ─────────────────────────────────────────────────────────────────────────────

onMessage(async (message, sender, sendResponse) => {
  switch (message.type) {

    // ── GET_STATUS — popup/content requests current state ─────────────────
    case MSG.GET_STATUS: {
      const authToken = await getAuthToken();
      const activeSessionId = await storageGet('activeSessionId');

      const status: ExtensionStatus = {
        isOnMeet: activeMeetTabs.size > 0,
        meetCode: Array.from(activeMeetTabs.values())[0] ?? null,
        isConnected: !!activeSessionId,
        sessionId: activeSessionId,
        deckTitle: null,
        currentSlide: currentStatus.currentSlide ?? 0,
        totalSlides: currentStatus.totalSlides ?? 0,
        isAuthenticated: !!authToken,
      };

      sendResponse(status);
      return false;
    }

    // ── STORE_AUTH_TOKEN — called from popup after web app login ──────────
    case MSG.STORE_AUTH_TOKEN: {
      await saveAuthToken(message.payload.token, message.payload.userId);
      sendResponse({ ok: true });
      return false;
    }

    // ── CLEAR_AUTH_TOKEN — sign out ───────────────────────────────────────
    case MSG.CLEAR_AUTH_TOKEN: {
      await clearAuthToken();
      await storageSet({ activeSessionId: null });
      sendResponse({ ok: true });
      return false;
    }

    // ── OPEN_SLIDEBOT — open web app in new tab ───────────────────────────
    case MSG.OPEN_SLIDEBOT: {
      const webAppUrl = await storageGet('webAppUrl');
      const url = message.payload.deckId
        ? `${webAppUrl}/room/${message.payload.deckId}`
        : `${webAppUrl}/dashboard`;
      void chrome.tabs.create({ url });
      sendResponse({ ok: true });
      return false;
    }

    // ── CONNECT_SESSION — content script entered a session code ───────────
    case MSG.CONNECT_SESSION: {
      const { sessionCode } = message.payload;
      await storageSet({ activeSessionId: sessionCode });
      currentStatus = { ...currentStatus, isConnected: true, sessionId: sessionCode };

      // Push state to all active Meet tabs
      for (const [tabId] of activeMeetTabs) {
        void sendToTab(tabId, {
          type: MSG.PUSH_SESSION_STATE,
          payload: {
            sessionId: sessionCode,
            deckId: '',
            deckTitle: 'SlideBot Presentation',
            presenterId: '',
            presenterName: 'Presenter',
            currentSlide: 0,
            totalSlides: 0,
          },
        });
      }

      sendResponse({ ok: true });
      return false;
    }

    // ── DISCONNECT_SESSION ────────────────────────────────────────────────
    case MSG.DISCONNECT_SESSION: {
      await storageSet({ activeSessionId: null });
      currentStatus = { ...currentStatus, isConnected: false, sessionId: null };
      sendResponse({ ok: true });
      return false;
    }

    // ── MEET_SESSION_STARTED — from content script ────────────────────────
    case MSG.MEET_SESSION_STARTED: {
      const { meetCode } = message.payload;
      const tabId = sender.tab?.id;
      if (tabId) activeMeetTabs.set(tabId, meetCode);

      // Check if we have a saved session for this Meet code
      const savedSession = await getSessionForMeet(meetCode);
      if (savedSession) {
        await storageSet({ activeSessionId: savedSession });
      }

      sendResponse({ ok: true });
      return false;
    }

    // ── MEET_SESSION_ENDED — from content script ──────────────────────────
    case MSG.MEET_SESSION_ENDED: {
      const tabId = sender.tab?.id;
      if (tabId) activeMeetTabs.delete(tabId);
      sendResponse({ ok: true });
      return false;
    }

    default:
      return false;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function cleanupStaleTabs(): Promise<void> {
  const allTabs = await chrome.tabs.query({});
  const activeTabIds = new Set(allTabs.map((t) => t.id));

  for (const tabId of activeMeetTabs.keys()) {
    if (!activeTabIds.has(tabId)) {
      activeMeetTabs.delete(tabId);
    }
  }
}

function getWebAppUrl(): string {
  return 'http://localhost:3000'; // Override in production builds
}

// Keep service worker alive during active sessions
chrome.runtime.onConnect.addListener((port) => {
  console.log('[SlideBot BG] Port connected:', port.name);
});
