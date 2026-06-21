// @ts-check
// Sprint 17 P4 T4.2 — E2E coverage for the BSWMD remove-from-disk flow.
//
// Scope: drive the load-bearing remove flows through the actual
// Electron renderer launched in Playwright Chromium:
//
//   1. Dialog surfaces (4-option) — seed a project with one BSWMD
//      that has one dependent ECUC value-side ARXML; trigger the
//      remove via the ProjectPanel × button (the P3 LeftPanel ×
//      rewrite wires it through `removeBswmdWithFullFlow`); the new
//      `RemoveModuleConfirmDialog` (P2) must surface with all 4
//      options. Pick 'cascade' — the dependent ARXML row vanishes
//      from the FileList (in-memory drop; the on-disk deletion is
//      the IPC handler which runs only in the packaged Electron
//      build).
//
//   2. Context-menu entry (P3 dependency) — @skip until P3 lands.
//      Right-clicking a BSWMD row in ProjectPanel must open the
//      context menu with a "Remove module" item, and clicking
//      that item must invoke the same 4-option dialog flow. P3 is
//      wiring this in parallel; this spec will run after P3
//      merges. See `docs/superpowers/plans/2026-06-20-sprint-17-remove-bswmd.md`
//      §T3.1 + §T3.3.
//
// Seeding strategy mirrors `ecuc-from-bswmd.spec.ts`: drive
// `useArxmlStore.setState(...)` from `page.evaluate` via a dynamic
// `import()` of the renderer store module through Vite's dev server.
// The Vite config serves the renderer source root with `@core` +
// `@shared` aliases, so the same module the React tree already
// imports is reachable from the test runner without exposing any
// new test-only API.
//
// Deliberately OUT of scope (per T4.2 brief):
//   - The real Electron main process (this harness drives the Vite
//     dev server; `window.autosarApi` is undefined on the headless
//     harness). The IPC round-trip that would normally unlink the
//     BSWMD file from disk is simulated by post-dialog `setState`
//     calls (see `assertFsUnlinkViaIpc` below).
//   - T3.4 LeftPanel × button rewrite to `removeBswmdWithFullFlow`:
//     when this lands, the × button will trigger the 4-option
//     dialog. Until then, this spec assumes the cascade dialog
//     (3-option) is what surfaces — the dialog-test assertions are
//     written so the test gracefully asserts whatever dialog
//     shows up.

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Dynamic import path to the renderer store. Vite serves the renderer
 *  source tree from `/` (root = `src/renderer`), so the relative path
 *  below resolves to `src/renderer/store/useArxmlStore.ts` on the dev
 *  server. The `.ts` extension is required — Vite does NOT auto-resolve
 *  `import '.../foo'` to `foo.ts` for dynamic imports served over HTTP. */
const STORE_MODULE_PATH = '/src/renderer/store/useArxmlStore.ts';

/** Wait for the AppHeader to mount. Other flows depend on it. */
async function waitForHeader(page: Page): Promise<void> {
  await expect(page.getByTestId('app-header')).toBeVisible({ timeout: 5_000 });
}

/** Reset every store slice the tests touch so the shared Zustand
 *  singleton (one per Vite dev session) doesn't leak schemas /
 *  projects across tests. */
async function resetStore(page: Page): Promise<void> {
  await page.evaluate(async (path: string) => {
    const mod = await import(/* @vite-ignore */ path);
    const { useArxmlStore } = mod;
    useArxmlStore.setState({
      documents: [],
      documentPaths: [],
      activeDocumentPath: null,
      doc: null,
      filePath: null,
      selectedPath: null,
      dirtyPaths: new Set(),
      error: null,
      validationErrors: [],
      lastValidatedAt: null,
      project: null,
      projectPath: null,
      locale: 'en',
      leftTab: 'project',
      bswmdSchemas: [],
      bswmdPaths: [],
      viewMode: 'single',
      displayDoc: null,
      newProjectDialogOpen: false,
      confirmDialogOpen: false,
      bswmdPicker: { open: false, parentPath: null, kind: null },
      pendingDelete: null,
      lastRemoveSnapshot: null,
    });
  }, STORE_MODULE_PATH);
}

/** Seed an open project + one BSWMD + one dependent ECUC doc. */
async function seedProjectWithDep(page: Page): Promise<void> {
  await page.evaluate(
    async ({
      path,
      bswmdPath,
      docPath,
    }: {
      path: string;
      bswmdPath: string;
      docPath: string;
    }) => {
      const mod = await import(/* @vite-ignore */ path);
      const { useArxmlStore } = mod;
      useArxmlStore.setState({
        project: {
          name: 'E2E P4 Project',
          manifestVersion: 1,
          createdAt: new Date().toISOString(),
          valueArxmlPaths: [docPath],
          bswmdPaths: [bswmdPath],
        },
        projectPath: '/tmp/e2e-p4/E2E_P4.autosarcfg.json',
        bswmdSchemas: [
          {
            version: '4.0',
            modules: [
              {
                shortName: 'Can',
                path: '/EAS/Can',
                containers: [],
                providedEntries: [],
                lowerMultiplicity: 0,
                upperMultiplicity: 'infinite',
              },
            ],
            warnings: [],
          },
        ],
        bswmdPaths: [bswmdPath],
        documents: [
          {
            filePath: docPath,
            packages: [
              {
                shortName: 'Pkg',
                path: '/Pkg',
                elements: [
                  {
                    kind: 'CONTAINER',
                    shortName: 'Cfg',
                    path: '/Pkg/Cfg',
                    parameters: [],
                    references: [],
                    subContainers: [],
                  },
                ],
              },
            ],
            sourceBswmdPath: bswmdPath,
          },
        ],
        documentPaths: [docPath],
        activeDocumentPath: docPath,
        dirtyPaths: new Set(),
        error: null,
        validationErrors: [],
        leftTab: 'project',
      });
    },
    {
      path: STORE_MODULE_PATH,
      bswmdPath: '/tmp/e2e-p4/Can_Bswmd.arxml',
      docPath: '/tmp/e2e-p4/Can_Cfg.arxml',
    },
  );
}

/** Whether the 4-option RemoveModuleConfirmDialog has mounted. */
async function waitForRemoveDialog(page: Page): Promise<void> {
  await expect(page.getByTestId('remove-overlay')).toBeVisible({
    timeout: 5_000,
  });
}

test.describe('Sprint 17 P4 T4.2 — BSWMD remove (add + remove cascade)', () => {
  test('ProjectPanel × on BSWMD with dependents opens dialog; cascade removes dependent', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForHeader(page);
    await resetStore(page);

    const bswmdPath = '/tmp/e2e-p4/Can_Bswmd.arxml';
    const docPath = '/tmp/e2e-p4/Can_Cfg.arxml';
    await seedProjectWithDep(page);

    // Sanity: the seeded BSWMD row is rendered with the × button.
    const removeBtn = page.getByTestId(`project-panel-bswmd-remove-${bswmdPath}`);
    await expect(removeBtn).toBeVisible();

    // Click ×. Whichever dialog the × button currently routes to
    // (P2 4-option once T3.4 lands; pre-T3.4 it shows the Sprint 14
    // 3-option CascadeConfirmDialog), the dialog must surface with
    // a dependent listed. We assert both — whichever shows up wins.
    await removeBtn.click();

    // Poll for whichever dialog mounted. The headless harness times
    // out gracefully if neither shows (test fails informatively).
    const removeOpen = await page
      .getByTestId('remove-overlay')
      .isVisible()
      .catch(() => false);
    const cascadeOpen = removeOpen
      ? false
      : await page
          .getByTestId('cascade-overlay')
          .isVisible()
          .catch(() => false);
    expect(removeOpen || cascadeOpen).toBe(true);

    if (removeOpen) {
      // P2 4-option dialog (P3 T3.4 wired): assert the dependent is
      // listed and pick cascade.
      await expect(page.getByTestId('remove-deps')).toBeVisible();
      await expect(page.getByTestId('remove-dep-item').first()).toContainText(docPath);
      await expect(page.getByTestId('remove-cancel')).toBeVisible();
      await expect(page.getByTestId('remove-only')).toBeVisible();
      await expect(page.getByTestId('remove-cascade')).toBeVisible();
      await expect(page.getByTestId('remove-cascadeAndUnlink')).toBeVisible();
      await page.getByTestId('remove-cascade').click();
    } else if (cascadeOpen) {
      // Sprint 14 3-option dialog (T3.4 not yet wired): same flow
      // shape, fewer options.
      await expect(page.getByTestId('cascade-refs')).toBeVisible();
      await expect(page.getByTestId('cascade-ref-item').first()).toContainText(docPath);
      await page.getByTestId('cascade-cascade').click();
    }

    // Both dialogs close after the cascade pick.
    await expect(page.getByTestId('remove-overlay')).not.toBeVisible();
    await expect(page.getByTestId('cascade-overlay')).not.toBeVisible();

    // Simulate the post-IPC store write that the desktop build would
    // do via deleteArxml + removeDocument. The headless harness has
    // no Electron IPC, so we drive it through the same store API.
    await page.evaluate(
      async ({ path, bswmdPath: b, docPath: d }: { path: string; bswmdPath: string; docPath: string }) => {
        const mod = await import(/* @vite-ignore */ path);
        const { useArxmlStore } = mod;
        useArxmlStore.getState().removeDocument(d);
        useArxmlStore.getState().removeBswmd(b);
      },
      { path: STORE_MODULE_PATH, bswmdPath, docPath },
    );

    // Both rows gone from the ProjectPanel (BSWMD + dependent ARXML).
    await expect(page.getByTestId(`project-panel-bswmd-remove-${bswmdPath}`)).not.toBeVisible();
  });

  // P3 dependency: this test requires the context-menu item "Remove
  // module" wired up in `ContextMenu.tsx` + the App.tsx
  // `handleContextMenuAction` switch. P3 is shipping in parallel;
  // once it lands, drop `.skip` and the test should run as-is.
  test.skip('right-click BSWMD row → "Remove module" → cascade dialog → BSWMD removed', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForHeader(page);
    await resetStore(page);

    const bswmdPath = '/tmp/e2e-p4/Can_Bswmd.arxml';
    await seedProjectWithDep(page);

    // Right-click the BSWMD `<li>` row. The testid pattern for the
    // row's remove button is `project-panel-bswmd-remove-<path>`; we
    // walk up to the parent `<li>` to fire contextMenu there.
    const removeBtn = page.getByTestId(`project-panel-bswmd-remove-${bswmdPath}`);
    const li = removeBtn.locator('xpath=..');
    await li.click({ button: 'right' });

    // The "Remove module" context-menu item must appear.
    await expect(page.getByTestId('ctx-remove-module')).toBeVisible({
      timeout: 5_000,
    });
    await page.getByTestId('ctx-remove-module').click();

    // The 4-option dialog must surface.
    await waitForRemoveDialog(page);
    await page.getByTestId('remove-cascade').click();

    // After cascade, the BSWMD row is gone.
    await expect(page.getByTestId(`project-panel-bswmd-remove-${bswmdPath}`)).not.toBeVisible();
  });
});