import { test as base, Page, BrowserContext, expect } from '@playwright/test';
import path from 'path';

type MultiplayerFixtures = {
  presenterContext: BrowserContext;
  presenterPage: Page;
  viewerContext: BrowserContext;
  viewerPage: Page;
};

export const test = base.extend<MultiplayerFixtures>({
  presenterContext: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.join(process.cwd(), 'tests/e2e/.auth/presenter.json'),
    });
    await use(context);
    await context.close();
  },
  presenterPage: async ({ presenterContext }, use) => {
    const page = await presenterContext.newPage();
    await use(page);
  },
  viewerContext: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: path.join(process.cwd(), 'tests/e2e/.auth/viewer.json'),
    });
    await use(context);
    await context.close();
  },
  viewerPage: async ({ viewerContext }, use) => {
    const page = await viewerContext.newPage();
    await use(page);
  },
});

export { expect };
