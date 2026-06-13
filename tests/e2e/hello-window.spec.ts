import { test, expect } from '@playwright/test';

test('Sprint 0 hello window renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'claude-AutosarCfg' })).toBeVisible();
  await expect(page.getByText('Hello, BSW world.')).toBeVisible();
  // IPC ping should resolve and render the timestamp
  await expect(page.locator('text=IPC ping ts:')).toBeVisible();
  // Wait for non-pending value
  await expect(page.locator('text=/IPC ping ts: \\d+/')).toBeVisible({ timeout: 5_000 });
});