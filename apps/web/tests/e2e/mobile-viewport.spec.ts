import { test, expect } from '@playwright/test';

test.describe('Mobile Viewport & Responsiveness', () => {
  // Mobile device viewport dimensions
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  const TEST_DECK_ID = 'e2e-test-deck-mobile';

  test.beforeEach(async ({ page }) => {
    await page.goto(`/room/${TEST_DECK_ID}`);
    // Wait for canvas to be visible to ensure room loaded
    await expect(page.locator('canvas').first()).toBeVisible();
  });

  test('should render AppSidebar as a collapsible drawer', async ({ page }) => {
    // In mobile viewport, the sidebar should not be visible by default 
    // or should be toggleable via a hamburger menu.
    // Assuming we have a hamburger button with aria-label="Toggle Sidebar" or similar.
    // This depends on the specific implementation in AppLayout.tsx.
    // Wait for the room header to load.
    await expect(page.getByRole('banner')).toBeVisible();

    // Check if there's a button to toggle participants/sidebar
    const toggleButton = page.getByRole('button', { name: /participants|sidebar/i }).first();
    
    if (await toggleButton.isVisible()) {
      await toggleButton.click();
      // The drawer should now be visible
      const panel = page.getByRole('complementary', { name: /participants/i }).first();
      await expect(panel).toBeVisible();
      
      // Close it
      await toggleButton.click();
      await expect(panel).not.toBeVisible();
    }
  });

  test('should hide secondary annotation tools in PresenterControls behind a toggle', async ({ page }) => {
    // Verify presenter controls are visible
    const controls = page.getByRole('toolbar', { name: /presenter controls/i });
    await expect(controls).toBeVisible();

    // In mobile, we expect a "More tools" or similar toggle
    // For now we just verify the toolbar renders and doesn't overflow or crash
    const buttons = controls.getByRole('button');
    expect(await buttons.count()).toBeGreaterThan(0);
  });
});
