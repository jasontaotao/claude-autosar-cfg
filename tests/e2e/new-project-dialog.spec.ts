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

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

async function openNewProjectDialog(page: Page): Promise<void> {
  await expect(page.getByTestId("app-header")).toBeVisible();
  await page.getByTestId("btn-project-new").click();
  await expect(page.getByTestId("npd-overlay")).toBeVisible();
  await expect(page.getByTestId("npd-name-input")).toBeFocused();
}

test.describe("Sprint 12 #3 — New Project dialog (E2E)", () => {
  test("happy path: fill name + dir, click Create, dialog closes", async ({ page }) => {
    await openNewProjectDialog(page);
    await page.getByTestId("npd-name-input").fill("E2E Project");
    await page.getByTestId("npd-dir-input").fill("/tmp/e2e-project-target");
    await expect(page.getByTestId("npd-filename-preview")).toContainText(
      "E2E_Project.autosarcfg.json",
    );
    await expect(page.getByTestId("npd-create")).toBeEnabled();
    await page.getByTestId("npd-create").click();
    await expect(page.getByTestId("npd-overlay")).not.toBeVisible();
  });

  test("validation: empty name keeps Create disabled", async ({ page }) => {
    await openNewProjectDialog(page);
    await page.getByTestId("npd-dir-input").fill("/tmp/e2e-project-target");
    await expect(page.getByTestId("npd-create")).toBeDisabled();
    await expect(page.getByTestId("npd-name-error")).not.toBeVisible();
  });

  test("validation: invalid characters show the localized error", async ({ page }) => {
    await openNewProjectDialog(page);
    await page.getByTestId("npd-name-input").fill("bad<name");
    await page.getByTestId("npd-dir-input").fill("/tmp/e2e-project-target");
    await expect(page.getByTestId("npd-name-error")).toBeVisible();
    await expect(page.getByTestId("npd-name-error")).toHaveText(/.+/);
    await expect(page.getByTestId("npd-create")).toBeDisabled();
  });

  test("validation: error clears when user types a valid name", async ({ page }) => {
    await openNewProjectDialog(page);
    await page.getByTestId("npd-name-input").fill("bad<name");
    await expect(page.getByTestId("npd-name-error")).toBeVisible();
    await page.getByTestId("npd-name-input").fill("GoodName");
    await page.getByTestId("npd-dir-input").fill("/tmp/e2e-project-target");
    await expect(page.getByTestId("npd-name-error")).not.toBeVisible();
    await expect(page.getByTestId("npd-create")).toBeEnabled();
  });

  test("cancel: clicking Cancel closes dialog and reopens clean", async ({ page }) => {
    await openNewProjectDialog(page);
    await page.getByTestId("npd-name-input").fill("Will Be Canceled");
    await page.getByTestId("npd-dir-input").fill("/tmp/e2e-project-target");
    await page.getByTestId("npd-cancel").click();
    await expect(page.getByTestId("npd-overlay")).not.toBeVisible();
    await page.getByTestId("btn-project-new").click();
    await expect(page.getByTestId("npd-overlay")).toBeVisible();
    await expect(page.getByTestId("npd-name-input")).toHaveValue("");
    await expect(page.getByTestId("npd-dir-input")).toHaveValue("");
  });

  test("cancel: pressing Escape closes the dialog", async ({ page }) => {
    await openNewProjectDialog(page);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("npd-overlay")).not.toBeVisible();
  });

  test("cancel: clicking close button closes the dialog", async ({ page }) => {
    await openNewProjectDialog(page);
    await page.getByTestId("npd-close").click();
    await expect(page.getByTestId("npd-overlay")).not.toBeVisible();
  });

  test("cancel: clicking the backdrop closes the dialog", async ({ page }) => {
    await openNewProjectDialog(page);
    const overlay = page.getByTestId("npd-overlay");
    const box = await overlay.boundingBox();
    if (box === null) throw new Error("overlay has no bounding box");
    await page.mouse.click(box.x + 4, box.y + 4);
    await expect(page.getByTestId("npd-overlay")).not.toBeVisible();
  });

  test("Enter on the name input triggers submit", async ({ page }) => {
    await openNewProjectDialog(page);
    await page.getByTestId("npd-name-input").fill("Enter Project");
    await page.getByTestId("npd-dir-input").fill("/tmp/e2e-project-target");
    await page.getByTestId("npd-name-input").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("npd-overlay")).not.toBeVisible();
  });
});
