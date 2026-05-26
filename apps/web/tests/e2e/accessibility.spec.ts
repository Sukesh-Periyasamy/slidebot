import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Guidelines (WCAG)', () => {

  test('Dashboard should have no automatically detectable accessibility violations', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Wait for main content to render
    await page.waitForSelector('main', { state: 'visible' });

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Room Page should have no automatically detectable accessibility violations', async ({ page }) => {
    const TEST_DECK_ID = 'e2e-a11y-deck';
    await page.goto(`/room/${TEST_DECK_ID}`);
    
    // Wait for the room canvas and controls
    await expect(page.locator('canvas').first()).toBeVisible();
    await expect(page.getByRole('toolbar', { name: /presenter/i }).first()).toBeVisible();

    const accessibilityScanResults = await new AxeBuilder({ page })
      .disableRules([
        // Disable rules that might be falsely triggered by the complex canvas elements 
        // if they don't apply, or color contrast issues caused by user-uploaded slides.
        'color-contrast'
      ])
      .analyze();
    
    expect(accessibilityScanResults.violations).toEqual([]);
  });

});
