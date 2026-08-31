// @ts-check
// Sprint 12 #3 — E2E coverage for the unified New Project dialog.
//
// Scope: drive the New Project flow through the actual Electron renderer
// in a Playwright-launched Chromium. We exercise:
//   1. Happy path — open dialog from AppHeader, fill name + dir, click
//      Create, observe the dialog closing on success.
//   2. Live validation — empty name keeps Create disabled; invalid
//      chars show a red error message; valid input clears the error.
//   3. Cancel paths — Cancel button, Esc key, close button, and
//      backdrop click all dismiss the dialog.
//
// Deliberately OUT of scope (per task spec — see sprint-12-3 plan):
//   - The Browse button (would require driving the OS file picker,
//     which Playwright cannot reach inside Electron main process;
//     we drive the dir input directly instead).
//   - Phase 1 simplification flows: overwrite-confirm is surfaced as
//     an inline error, and saveAndProceed is collapsed into
//     continue (canceled). Both are covered by unit tests.

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Minimal autosarApi stub: the dev harness has no Electron preload.
 *  projectNew returns created so the submit flow can close the dialog. */
async function installProjectApiStub(page: Page): Promise<void> {
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
async function openNewProjectDialog(page: Page): Promise<void> {
  // P2 fix (ledger R2) — the helper never navigated; on a fresh
  // browser context the app never loads and every test 5s-times out
  // waiting for app-header (pre-existing on main).
  await installProjectApiStub(page);
  await page.goto('/');
  await expect(page.getByTestId('app-header')).toBeVisible();
  // btn-project-new lives inside the BrandMenu dropdown, which is
  // conditionally mounted (`{menuOpen && ...}`) — open the menu first
  // (same as visual-regression.spec.ts note 3).
  await page.getByTestId('btn-menu-toggle').click();
  await page.getByTestId('btn-project-new').click();
  await expect(page.getByTestId('npd-overlay')).toBeVisible();
  await expect(page.getByTestId('npd-name-input')).toBeFocused();
}

test.describe('Sprint 12 #3 — New Project dialog (E2E)', () => {
  test('happy path: fill name + dir, click Create, dialog closes', async ({ page }) => {
    await openNewProjectDialog(page);
    await page.getByTestId('npd-name-input').fill('E2E Project');
    await page.getByTestId('npd-dir-input').fill('/tmp/e2e-project-target');
    await expect(page.getByTestId('npd-filename-preview')).toContainText(
      'E2E Project.autosarcfg.json',
    );
    await expect(page.getByTestId('npd-create')).toBeEnabled();
    await page.getByTestId('npd-create').click();
    await expect(page.getByTestId('npd-overlay')).not.toBeVisible();
  });

  test('validation: empty name keeps Create disabled', async ({ page }) => {
    await openNewProjectDialog(page);
    await page.getByTestId('npd-dir-input').fill('/tmp/e2e-project-target');
    await expect(page.getByTestId('npd-create')).toBeDisabled();
    // P2 (spec §4.2) — filling the dir blurs the name field, which
    // is now the trigger for showing the empty-name error.
    await expect(page.getByTestId('npd-name-error')).toBeVisible();
  });

  test('validation: invalid characters show the localized error', async ({ page }) => {
    await openNewProjectDialog(page);
    await page.getByTestId('npd-name-input').fill('bad<name');
    // P2 (spec §4.2) — the error surfaces on blur, not while typing.
    // Click the dialog title to move focus away → blur fires.
    await page.getByTestId('npd-title').click();
    await expect(page.getByTestId('npd-name-error')).toBeVisible();
    await expect(page.getByTestId('npd-name-error')).toHaveText(/.+/);
    await expect(page.getByTestId('npd-create')).toBeDisabled();
  });

  test('validation: error clears when user types a valid name', async ({ page }) => {
    await openNewProjectDialog(page);
    await page.getByTestId('npd-name-input').fill('bad<name');
    // P2 (spec §4.2) — blur first; the error appears only then.
    await page.getByTestId('npd-name-input').blur();
    await expect(page.getByTestId('npd-name-error')).toBeVisible();
    await page.getByTestId('npd-name-input').fill('GoodName');
    await page.getByTestId('npd-dir-input').fill('/tmp/e2e-project-target');
    await expect(page.getByTestId('npd-name-error')).not.toBeVisible();
    await expect(page.getByTestId('npd-create')).toBeEnabled();
  });

  test('cancel: clicking Cancel closes dialog and reopens clean', async ({ page }) => {
    await openNewProjectDialog(page);
    await page.getByTestId('npd-name-input').fill('Will Be Canceled');
    await page.getByTestId('npd-dir-input').fill('/tmp/e2e-project-target');
    await page.getByTestId('npd-cancel').click();
    await expect(page.getByTestId('npd-overlay')).not.toBeVisible();
    // The menu closed when the dialog opened — reopen it first.
    await page.getByTestId('btn-menu-toggle').click();
    await page.getByTestId('btn-project-new').click();
    await expect(page.getByTestId('npd-overlay')).toBeVisible();
    await expect(page.getByTestId('npd-name-input')).toHaveValue('');
    await expect(page.getByTestId('npd-dir-input')).toHaveValue('');
  });

  test('cancel: pressing Escape closes the dialog', async ({ page }) => {
    await openNewProjectDialog(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('npd-overlay')).not.toBeVisible();
  });

  test('cancel: clicking close button closes the dialog', async ({ page }) => {
    await openNewProjectDialog(page);
    await page.getByTestId('npd-close').click();
    await expect(page.getByTestId('npd-overlay')).not.toBeVisible();
  });

  test('cancel: clicking the backdrop closes the dialog', async ({ page }) => {
    await openNewProjectDialog(page);
    const overlay = page.getByTestId('npd-overlay');
    const box = await overlay.boundingBox();
    if (box === null) throw new Error('overlay has no bounding box');
    await page.mouse.click(box.x + 4, box.y + 4);
    await expect(page.getByTestId('npd-overlay')).not.toBeVisible();
  });

  test('Enter on the name input triggers submit', async ({ page }) => {
    await openNewProjectDialog(page);
    await page.getByTestId('npd-name-input').fill('Enter Project');
    await page.getByTestId('npd-dir-input').fill('/tmp/e2e-project-target');
    await page.getByTestId('npd-name-input').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('npd-overlay')).not.toBeVisible();
  });

  test('validation timing: no error on mount; appears after blur', async ({ page }) => {
    await openNewProjectDialog(page);
    await expect(page.getByTestId('npd-name-error')).not.toBeVisible();
    await page.getByTestId('npd-name-input').blur();
    await expect(page.getByTestId('npd-name-error')).toBeVisible();
  });
});
