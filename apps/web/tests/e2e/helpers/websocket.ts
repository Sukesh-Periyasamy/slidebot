import { Page, expect } from '@playwright/test';

export interface TestSyncState {
  currentPage: number;
  isExploring: boolean;
  session: {
    sessionId: string;
    deckId: string;
    currentSlide: number;
    presenterId: string;
  } | null;
  connectionState: 'connected' | 'reconnecting' | 'disconnected';
}

/**
 * Validates that the WebSocket connection is active and stable deterministically via window state.
 */
export async function assertWebsocketConnected(page: Page) {
  await page.waitForFunction(() => {
    const state = (window as any).__TEST_SYNC_STATE__ as TestSyncState;
    return state?.connectionState === 'connected';
  }, undefined, { timeout: 10000 });
}

/**
 * Waits deterministically until the local viewer's active slide matches the expected slide.
 */
export async function waitForActiveSlide(page: Page, expectedSlide: number) {
  await page.waitForFunction(
    (expected) => {
      const state = (window as any).__TEST_SYNC_STATE__ as TestSyncState;
      return state?.currentPage === expected;
    },
    expectedSlide,
    { timeout: 5000 }
  );
}

/**
 * Waits deterministically until the server's known presenter slide matches the expected slide.
 */
export async function waitForPresenterSlide(page: Page, expectedSlide: number) {
  await page.waitForFunction(
    (expected) => {
      const state = (window as any).__TEST_SYNC_STATE__ as TestSyncState;
      return state?.session?.currentSlide === expected;
    },
    expectedSlide,
    { timeout: 5000 }
  );
}

/**
 * Waits deterministically for exploration mode to match the expected boolean state.
 */
export async function waitForExplorationMode(page: Page, isExploring: boolean) {
  await page.waitForFunction(
    (expected) => {
      const state = (window as any).__TEST_SYNC_STATE__ as TestSyncState;
      return state?.isExploring === expected;
    },
    isExploring,
    { timeout: 5000 }
  );
}

/**
 * Simulates a temporary network interruption on a specific page using CDP.
 */
export async function simulateNetworkInterruption(page: Page, durationMs: number = 3000) {
  const cdpSession = await page.context().newCDPSession(page);
  await cdpSession.send('Network.emulateNetworkConditions', {
    offline: true,
    downloadThroughput: 0,
    uploadThroughput: 0,
    latency: 0,
  });

  await page.waitForTimeout(durationMs);

  await cdpSession.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: -1,
    uploadThroughput: -1,
    latency: 0,
  });
}

/**
 * Simulates poor network conditions (throttling) to test latency tolerance.
 */
export async function simulatePoorNetwork(page: Page) {
  const cdpSession = await page.context().newCDPSession(page);
  await cdpSession.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (500 * 1024) / 8, // 500 kbps
    uploadThroughput: (500 * 1024) / 8, // 500 kbps
    latency: 200, // 200ms ping
  });
}

/**
 * Restores normal network conditions.
 */
export async function restoreNormalNetwork(page: Page) {
  const cdpSession = await page.context().newCDPSession(page);
  await cdpSession.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: -1,
    uploadThroughput: -1,
    latency: 0,
  });
}
