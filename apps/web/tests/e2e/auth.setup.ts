import { test as setup, expect } from '@playwright/test';
import path from 'path';

const presenterFile = path.join(process.cwd(), 'tests/e2e/.auth/presenter.json');
const viewerFile = path.join(process.cwd(), 'tests/e2e/.auth/viewer.json');

setup('authenticate as presenter', async ({ page }) => {
  // We use the TEST_PRESENTER_EMAIL from .env.test
  const email = process.env.TEST_PRESENTER_EMAIL || 'presenter@example.com';
  const password = process.env.TEST_PRESENTER_PASSWORD || 'password123';

  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Sign in")');
  
  // Wait for the dashboard to load, verifying successful login
  await expect(page).toHaveURL(/\/dashboard/);
  // Wait for network to idle to ensure Supabase session is persisted to localStorage
  await page.waitForLoadState('networkidle');

  await page.context().storageState({ path: presenterFile });
});

setup('authenticate as viewer', async ({ page }) => {
  const email = process.env.TEST_VIEWER_EMAIL || 'viewer@example.com';
  const password = process.env.TEST_VIEWER_PASSWORD || 'password123';

  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Sign in")');

  await expect(page).toHaveURL(/\/dashboard/);
  await page.waitForLoadState('networkidle');

  await page.context().storageState({ path: viewerFile });
});
