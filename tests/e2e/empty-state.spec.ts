// @ts-check
// P2 (spec §4.2) — main-area empty state guidance.
// Harness notes carried over from visual-regression.spec.ts:
//   - The dev harness has no Electron preload; a minimal autosarApi
//     stub is installed before the app mounts.
//   - Boot-tail state restore can race a bare locale setState (see that
//     file's note 6), so these tests assert against both locale copies
//     instead of pinning the locale.
import { expect, test, type Page } from '@playwright/test';

async function installApiStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (globalThis as unknown as { autosarApi: unknown }).autosarApi = {
      getAppVersion: async (): Promise<string> => '0.0.0-e2e',
      getFeatureFlags: async (): Promise<unknown> => ({ experimental: {} }),
      projectNew: async (): Promise<unknown> => ({
        kind: 'created',
        path: '/tmp/e2e-project-target/.autosarcfg.json',
        manifest: {},
      }),
    };
  });
}

test('main area shows guided empty state with open/new actions', async ({ page }) => {
  await installApiStub(page);
  await page.goto('/');
  const empty = page.getByTestId('param-editor-empty-state');
  await expect(empty).toBeVisible();
  await expect(empty.getByRole('button', { name: /打开项目|Open Project/ })).toBeVisible();
  await expect(empty.getByRole('button', { name: /新建项目|New Project/ })).toBeVisible();
});

test('empty-state New Project button opens the dialog', async ({ page }) => {
  await installApiStub(page);
  await page.goto('/');
  await page
    .getByTestId('param-editor-empty-state')
    .getByRole('button', { name: /新建项目|New Project/ })
    .click();
  await expect(page.getByTestId('npd-overlay')).toBeVisible();
});
