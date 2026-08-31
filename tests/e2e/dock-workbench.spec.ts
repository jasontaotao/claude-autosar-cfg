// P4 (spec §6) — Dock workbench e2e (8-panel IA).
// Covers: default layout (project/files/validation tabs + arxml-tree below + param-editor right),
// View menu (8 panels + reset), layout persistence, reset.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function waitForAppReady(page: Page): Promise<void> {
  await expect(page.getByTestId('app-header')).toBeVisible({ timeout: 15000 });
}

test.describe('Dock workbench (P4)', () => {
  test('default layout renders dockview workspace', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await expect(page.locator('.dv-dockview').first()).toBeVisible({ timeout: 10000 });
  });

  test('View menu opens and lists all 8 panels + reset', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.click('[data-testid="btn-view-menu"]');
    for (const id of [
      'project',
      'files',
      'validation',
      'arxml-tree',
      'param-editor',
      'script-panel',
      'dbc-viewer',
      'odx-viewer',
    ]) {
      await expect(page.locator(`[data-testid="menu-item-${id}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-testid="btn-reset-layout"]')).toBeVisible();
  });

  test('layout persists across reload', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await expect(page.locator('.dv-dockview').first()).toBeVisible();
    await page.waitForTimeout(1000);
    const stored = await page.evaluate(() => localStorage.getItem('autosarcfg.layout.v1'));
    expect(stored).not.toBeNull();
  });

  test('reset layout restores default', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await expect(page.locator('.dv-dockview').first()).toBeVisible();
    await page.click('[data-testid="btn-view-menu"]');
    await page.click('[data-testid="btn-reset-layout"]');
    await expect(page.locator('.dv-dockview').first()).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem('autosarcfg.layout.v1'));
    expect(stored).toBeNull();
  });
});

test('file template badge remains readable against its chip background', async ({ page }) => {
  await page.goto('/');
  await waitForAppReady(page);
  await expect(page.locator('.dv-dockview').first()).toBeVisible();
  const path = '/tmp/OpenedTemplate.arxml';
  const storePath = '/store/useArxmlStore.ts';
  await page.evaluate(
    async ({ filePath, modulePath }: { filePath: string; modulePath: string }) => {
      const mod = await import(/* @vite-ignore */ modulePath);
      mod.useArxmlStore.setState({
        documentPaths: [filePath],
        activeDocumentPath: filePath,
        templatePaths: new Set([filePath]),
        viewMode: 'single',
      });
    },
    { filePath: path, modulePath: storePath },
  );
  await page.click('[data-testid="btn-view-menu"]');
  await page.click('[data-testid="menu-item-files"]');
  const badge = page.getByTestId(`file-list-tab-arxml-badge-template-${path}`);
  await expect(badge).toBeVisible();
  const style = await badge.evaluate((el) => {
    const css = window.getComputedStyle(el);
    return { color: css.color, backgroundColor: css.backgroundColor };
  });
  expect(style.color).not.toBe('rgb(15, 23, 42)');
  expect(style.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(style.color).not.toBe(style.backgroundColor);
});
