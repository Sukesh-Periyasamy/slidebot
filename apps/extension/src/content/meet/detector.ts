/**
 * Meet session detector — watches URL and DOM for meeting state transitions.
 *
 * Google Meet is a SPA, so navigation doesn't reload the page.
 * We detect:
 * 1. Entering a meeting: URL changes to /[code]
 * 2. Being in a meeting: specific DOM elements present
 * 3. Leaving a meeting: URL returns to /
 */

import { MEET_URL_REGEX } from '../../shared/constants';
import { MSG, sendToBackground } from '../../shared/messages';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type MeetState = 'lobby' | 'in-call' | 'ended' | 'unknown';

export interface MeetSessionInfo {
  meetCode: string;
  state: MeetState;
}

type StateChangeHandler = (info: MeetSessionInfo | null) => void;

// ─────────────────────────────────────────────────────────────────────────────
// MeetDetector
// ─────────────────────────────────────────────────────────────────────────────

export class MeetDetector {
  private currentMeetCode: string | null = null;
  private currentState: MeetState = 'unknown';
  private handlers = new Set<StateChangeHandler>();
  private urlObserver: MutationObserver | null = null;
  private callObserver: MutationObserver | null = null;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.init();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  onStateChange(handler: StateChangeHandler): () => void {
    this.handlers.add(handler);
    // Immediately call with current state
    if (this.currentMeetCode) {
      handler({ meetCode: this.currentMeetCode, state: this.currentState });
    }
    return () => this.handlers.delete(handler);
  }

  getCurrentState(): MeetSessionInfo | null {
    if (!this.currentMeetCode) return null;
    return { meetCode: this.currentMeetCode, state: this.currentState };
  }

  destroy(): void {
    this.urlObserver?.disconnect();
    this.callObserver?.disconnect();
    if (this.checkInterval) clearInterval(this.checkInterval);
  }

  // ── Initialization ────────────────────────────────────────────────────────

  private init(): void {
    // 1. Check current URL immediately
    this.checkUrl();

    // 2. Observe DOM for title changes (Meet changes <title> during navigation)
    this.urlObserver = new MutationObserver(() => this.checkUrl());
    const titleEl = document.querySelector('head > title');
    if (titleEl) {
      this.urlObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
    }

    // 3. Periodic URL check (fallback for SPA navigation)
    let lastUrl = location.href;
    this.checkInterval = setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        this.checkUrl();
      }
    }, 1000);

    // 4. Listen to history API mutations
    const origPushState = history.pushState.bind(history);
    history.pushState = (...args) => {
      origPushState(...args);
      this.checkUrl();
    };

    const origReplaceState = history.replaceState.bind(history);
    history.replaceState = (...args) => {
      origReplaceState(...args);
      this.checkUrl();
    };

    window.addEventListener('popstate', () => this.checkUrl());
  }

  private checkUrl(): void {
    const url = location.href;
    const match = MEET_URL_REGEX.exec(url);

    if (match) {
      const meetCode = match[1]!;

      if (meetCode !== this.currentMeetCode) {
        // Entered a new meeting
        this.currentMeetCode = meetCode;
        this.currentState = 'lobby';
        this.notifyHandlers();
        this.startCallObserver();
        void sendToBackground({
          type: MSG.MEET_SESSION_STARTED,
          payload: { meetCode },
        });
      }
    } else {
      if (this.currentMeetCode) {
        // Left the meeting
        const previousCode = this.currentMeetCode;
        this.currentMeetCode = null;
        this.currentState = 'ended';
        this.notifyHandlers();
        this.stopCallObserver();
        void sendToBackground({
          type: MSG.MEET_SESSION_ENDED,
          payload: { meetCode: previousCode },
        });
      }
    }
  }

  /** Watch DOM for transitions: lobby → in-call → ended */
  private startCallObserver(): void {
    this.stopCallObserver();

    // Meet indicators we watch:
    // - "You're in the call" → in-call
    // - "The call has ended" text → ended
    // - Leave button presence → in-call
    const detect = () => {
      const bodyText = document.body.innerText;

      if (
        document.querySelector('[data-call-ended]') ||
        bodyText.includes('The call has ended')
      ) {
        if (this.currentState !== 'ended') {
          this.currentState = 'ended';
          this.notifyHandlers();
        }
        return;
      }

      // Detect active call by presence of Meet's leave button or participants panel
      const inCallIndicators = [
        '[data-tooltip="Leave call"]',
        '[aria-label="Leave call"]',
        '[jsname="CQylAd"]', // Meet's mic button
      ];

      const isInCall = inCallIndicators.some((sel) => document.querySelector(sel));

      if (isInCall && this.currentState !== 'in-call') {
        this.currentState = 'in-call';
        this.notifyHandlers();
      }
    };

    this.callObserver = new MutationObserver(detect);
    this.callObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-call-ended', 'aria-label'],
    });

    // Run once immediately
    detect();
  }

  private stopCallObserver(): void {
    this.callObserver?.disconnect();
    this.callObserver = null;
  }

  private notifyHandlers(): void {
    const info = this.currentMeetCode
      ? { meetCode: this.currentMeetCode, state: this.currentState }
      : null;

    this.handlers.forEach((h) => h(info));
  }
}

/** Singleton for the content script context */
export const meetDetector = new MeetDetector();
