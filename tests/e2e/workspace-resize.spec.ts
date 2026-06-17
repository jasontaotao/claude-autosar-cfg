// @ts-check
// Sprint 13+ Stage 4 Q1 — E2E coverage for the workspace splitter.
//
// Scope: drive the new `react-resizable-panels` Group between the
// left tab column and the right parameter editor, and pin the
// contract that:
//   1. The splitter is visible and the user can grab it.
//   2. Dragging the splitter to the right grows the left panel.
//   3. The library persists the new layout to localStorage and
//      restores it on page reload.
//
// Out of scope for v1 (deferred to a follow-up):
//   - localStorage key pinning (we wait for the library to settle
//     on a stable key in v4.x; for now we read whatever key it
//     uses).
//   - Collapsed / minimised / snapped layout states.

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function waitForAppReady(page: Page): Promise<void> {
  await expect(page.getByTestId('app-header')).toBeVisible();
  await expect(page.getByTestId('left-tab-files')).toBeVisible();
}

test.describe('Workspace splitter (Q1)', () => {
  test('renders the splitter inside the workspace', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    const splitter = page.locator('.workspace-resize-h');
    await expect(splitter).toBeVisible();
  });

  test('dragging the splitter to the right grows the left panel', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    const splitter = page.locator('.workspace-resize-h');
    await expect(splitter).toBeVisible();

    // Capture the left panel's bounding box BEFORE the drag so we
    // can assert the width CHANGES afterward. The library stores
    // the size as the panel's flex-grow (inline style) and renders
    // it as a percentage of the group width.
    const leftPanel = page.locator('[data-panel][id="workspace-left"]');
    const beforeBox = await leftPanel.boundingBox();
    expect(beforeBox).not.toBeNull();
    const beforeWidth = beforeBox!.width;

    // Drag the splitter 120px to the right. Playwright's mouse
    // helpers (down → move → up) are the standard pattern for
    // pointer-driven drag interactions; v4 of the library listens
    // to `pointerdown` / `pointermove` / `pointerup` and the
    // underlying Chromium route accepts MouseEvent-style moves.
    const handleBox = await splitter.boundingBox();
    expect(handleBox).not.toBeNull();
    const startX = handleBox!.x + handleBox!.width / 2;
    const startY = handleBox!.y + handleBox!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 120, startY, { steps: 10 });
    await page.mouse.up();

    // After the drag, the left panel should be wider than before.
    // We allow a small tolerance for subpixel rounding.
    const afterBox = await leftPanel.boundingBox();
    expect(afterBox).not.toBeNull();
    const afterWidth = afterBox!.width;
    expect(afterWidth).toBeGreaterThan(beforeWidth + 50);
  });

  test('the splitter position persists across page reloads', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    const splitter = page.locator('.workspace-resize-h');
    const handleBox = await splitter.boundingBox();
    expect(handleBox).not.toBeNull();
    const startX = handleBox!.x + handleBox!.width / 2;
    const startY = handleBox!.y + handleBox!.height / 2;

    // Drag the splitter 150px to the right.
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 150, startY, { steps: 10 });
    await page.mouse.up();

    // Capture the post-drag width.
    const leftPanel = page.locator('[data-panel][id="workspace-left"]');
    const draggedBox = await leftPanel.boundingBox();
    expect(draggedBox).not.toBeNull();
    const draggedWidth = draggedBox!.width;

    // Reload the page; the library's `useDefaultLayout` (when
    // configured with the default localStorage storage) restores
    // the new percentage split.
    await page.reload();
    await waitForAppReady(page);

    const reloadedBox = await leftPanel.boundingBox();
    expect(reloadedBox).not.toBeNull();
    const reloadedWidth = reloadedBox!.width;

    // Tolerance for subpixel rounding: the reloaded width should
    // match the dragged width to within 4px.
    expect(Math.abs(reloadedWidth - draggedWidth)).toBeLessThan(4);
  });
});
