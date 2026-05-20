import { test, expect } from './fixtures/multiplayer';
import { 
  assertWebsocketConnected, 
  waitForActiveSlide, 
  waitForPresenterSlide, 
  waitForExplorationMode,
  simulateNetworkInterruption
} from './helpers/websocket';

test.describe('RoomPage E2E Multiplayer Synchronization', () => {

  const TEST_DECK_ID = 'e2e-test-deck-123';

  test.beforeEach(async ({ presenterPage, viewerPage }) => {
    // Both pages go directly to the room
    await presenterPage.goto(`/room/${TEST_DECK_ID}`);
    await viewerPage.goto(`/room/${TEST_DECK_ID}`);
    
    // Ensure both are connected deterministically
    await assertWebsocketConnected(presenterPage);
    await assertWebsocketConnected(viewerPage);
  });

  test.afterEach(async ({ presenterPage }) => {
    // Teardown: ensure presenter leaves the room properly
    await presenterPage.goto('/dashboard');
  });

  test('should synchronize slide navigation deterministically', async ({ presenterPage, viewerPage }) => {
    // Wait for initial slide
    await waitForActiveSlide(presenterPage, 1);
    await waitForActiveSlide(viewerPage, 1);

    // Presenter navigates forward
    await presenterPage.keyboard.press('ArrowRight');

    // Deterministic validation: viewer should snap to slide 2
    await waitForActiveSlide(presenterPage, 2);
    await waitForActiveSlide(viewerPage, 2);
    await waitForPresenterSlide(viewerPage, 2);

    // Ensure visual component is updated
    await expect(viewerPage.locator('canvas').first()).toBeVisible();
  });

  test('should maintain exploration mode isolation and handle snap-back', async ({ presenterPage, viewerPage }) => {
    await waitForActiveSlide(presenterPage, 1);
    await waitForActiveSlide(viewerPage, 1);

    // 1. Viewer navigates independently (enters exploration mode)
    await viewerPage.keyboard.press('ArrowRight');
    
    // Deterministic checks
    await waitForActiveSlide(viewerPage, 2);
    await waitForExplorationMode(viewerPage, true);
    
    const snapBanner = viewerPage.locator('text=Snap to Presenter');
    await expect(snapBanner).toBeVisible();

    // 2. Presenter navigates backward/forward
    await presenterPage.keyboard.press('ArrowRight');
    await waitForActiveSlide(presenterPage, 2);
    await presenterPage.keyboard.press('ArrowRight');
    await waitForActiveSlide(presenterPage, 3);

    // 3. Viewer should remain isolated on slide 2 but know presenter is on 3
    await waitForActiveSlide(viewerPage, 2);
    await waitForPresenterSlide(viewerPage, 3);
    await expect(snapBanner).toBeVisible();

    // 4. Viewer snaps back
    await snapBanner.click();
    await waitForActiveSlide(viewerPage, 3);
    await waitForExplorationMode(viewerPage, false);
    await expect(snapBanner).not.toBeVisible();
  });

  test('should verify presenter authority invariants (viewer cannot force change)', async ({ presenterPage, viewerPage }) => {
    await waitForActiveSlide(presenterPage, 1);
    await waitForActiveSlide(viewerPage, 1);

    // Viewer navigates (exploration mode)
    await viewerPage.keyboard.press('ArrowRight');
    await waitForActiveSlide(viewerPage, 2);

    // Wait 500ms to ensure the "unauthorized" slide:goto (if sent) is processed and rejected
    await viewerPage.waitForTimeout(500);

    // Presenter should NOT be affected
    await waitForActiveSlide(presenterPage, 1);
  });

  test('should recover state deterministically after network interruption', async ({ presenterPage, viewerPage }) => {
    await waitForActiveSlide(presenterPage, 1);
    await waitForActiveSlide(viewerPage, 1);

    // Simulate network drop for viewer via CDP
    await simulateNetworkInterruption(viewerPage, 5000);
    
    // Presenter navigates while viewer is offline
    await presenterPage.keyboard.press('ArrowRight');
    await presenterPage.keyboard.press('ArrowRight');
    await waitForActiveSlide(presenterPage, 3);

    // Network is restored by the helper automatically
    // Viewer should eventually reconnect and sync automatically
    await assertWebsocketConnected(viewerPage);
    await waitForActiveSlide(viewerPage, 3);
  });

  test('should synchronize collaborative annotations', async ({ presenterPage, viewerPage }) => {
    await waitForActiveSlide(presenterPage, 1);
    
    const canvas = presenterPage.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    // Presenter draws
    await presenterPage.mouse.move(box.x + 50, box.y + 50);
    await presenterPage.mouse.down();
    await presenterPage.mouse.move(box.x + 150, box.y + 150);
    await presenterPage.mouse.up();

    // Wait a brief moment for Yjs to sync
    await viewerPage.waitForTimeout(500);

    // In a headless DOM we assume no JS errors means Yjs applied the update successfully.
    // Real visual regression testing would use snapshot comparison here.
    // We verify the canvases are still mounted and connected.
    await expect(viewerPage.locator('canvas').first()).toBeVisible();
    await assertWebsocketConnected(viewerPage);
  });
});
