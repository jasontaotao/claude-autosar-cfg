// @ts-check
// HIGH-3 (v1.11.2) — E2E coverage for the deleteEcucModule flow.
//
// Sprint 17 P3 (v1.10.1) wired the new `Delete ECUC module` context-menu
// entry for source-backed ECUC module roots, but the spec file went
// un-shipped — there is no end-to-end coverage of the destructive flow
// (renderer integration, store mutation, sourceBswmdPath clear, IPC
// resilience on bad paths). v1.10.2 5-agent joint review flagged the
// gap as HIGH-3. This spec closes it.
//
// Scope: drive the deleteEcucModule store action through the real
// Electron renderer launched in Playwright Chromium, asserting the
// observable side effects in the DOM (toast banner, BSWMD chip, etc.)
// and the store state via page.evaluate. The action itself is reached
// in production via `handleContextMenuAction('delete-module', ...)` in
// App.tsx; driving the store action directly exercises the same
// post-mutation pipeline the context-menu routing triggers.
//
// Seeding strategy mirrors `remove-bswmd.spec.ts` /
// `remove-bswmd-from-disk.spec.ts`: drive `useArxmlStore.setState(...)`
// from `page.evaluate` via a dynamic `import()` of the renderer store.
// The Vite dev server resolves the same module the React tree imports,
// so this is a true renderer integration test (no test-only API).
//
// Deliberately OUT of scope (the headless harness does not boot the
// real Electron main process):
//   - The disk-unlink IPC round-trip: covered by `remove-bswmd-from-disk.spec.ts`.
//   - The native context-menu right-click → menu item chain: that path
//     is covered by the unit/component tests in
//     `ContextMenu.deleteModule.test.tsx` and
//     `useArxmlStore.deleteModule.test.ts`. This spec covers the
//     post-action integration instead.

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Dynamic import path to the renderer store. Vite serves the renderer
 *  source tree from `/` (root = `src/renderer`), so the relative path
 *  below resolves to `src/renderer/store/useArxmlStore.ts` on the dev
 *  server. The `.ts` extension is required — Vite does NOT auto-resolve
 *  `import '.../foo'` to `foo.ts` for dynamic imports served over HTTP. */
const STORE_MODULE_PATH = '/src/renderer/store/useArxmlStore.ts';

/** Wait for the AppHeader to mount — the toast banner is rendered
 *  inside it, so the E2E assertions below need the header up first. */
async function waitForHeader(page: Page): Promise<void> {
  await expect(page.getByTestId('app-header')).toBeVisible({ timeout: 5_000 });
}

/** Install a minimal `window.autosarApi` mock before the React tree
 *  mounts. The headless harness drives Vite directly — Electron's
 *  preload is absent, so `window.autosarApi` is `undefined` by default
 *  and AppHeader's `getAppVersion()` call on mount crashes the tree.
 *  This stub matches the pattern used by `stencil-wizard.spec.ts` /
 *  `script-panel.spec.ts`. Only methods reachable during the
 *  deleteEcucModule flow are stubbed; the rest return empty
 *  defaults so the tree mounts cleanly. */
async function installApiMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const api = {
      getAppVersion: async (): Promise<string> => '1.11.2-e2e',
      // Required by AppHeader's mount path but unused during this flow.
      getFeatureFlags: async (): Promise<unknown> => ({ experimental: {} }),
      openArxmlMulti: async (): Promise<unknown> => ({ kind: 'cancelled' }),
      parseArxml: async (): Promise<unknown> => ({
        ok: false,
        error: { kind: 'parse-failed', path: '', message: 'stub' },
      }),
      saveArxml: async (): Promise<unknown> => ({ ok: true }),
      // Feature-flagged IPC channels — stubbed so the boot phase does
      // not crash when the AppHeader subscriber fires.
      'feature-flags:get': async (): Promise<unknown> => ({ experimental: {} }),
    };
    (globalThis as unknown as { autosarApi: unknown }).autosarApi = api;
  });
}

/** Reset every store slice the tests touch. Mirrors the reset helper
 *  in `remove-bswmd.spec.ts` so the project / view mode / pending
 *  dialog state is the canonical empty shape before each test. */
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
      toast: null,
    });
  }, STORE_MODULE_PATH);
}

/** Seed a project with one BSWMD schema + one source-backed ECUC doc
 *  carrying a single `Adc` module. The doc's `sourceBswmdPath` makes
 *  it eligible for the Sprint 17 P3 "Delete ECUC module" context-menu
 *  entry. Mirrors the BSWMD-to-ECUC skeleton shape so the post-fold
 *  module path is `/Adc/Adc` (package shortName == module shortName
 *  per v1.4.1 Bug 2c). */
async function seedSourceBackedProject(
  page: Page,
  bswmdPath: string,
  docPath: string,
): Promise<void> {
  await page.evaluate(
    async ({
      path,
      bswmdPath: b,
      docPath: d,
    }: {
      path: string;
      bswmdPath: string;
      docPath: string;
    }) => {
      const mod = await import(/* @vite-ignore */ path);
      const { useArxmlStore } = mod;
      // Minimal Adc BSWMD schema (1 module with 1 container).
      const bswmd = {
        version: '4.6',
        modules: [
          {
            shortName: 'Adc',
            path: '/Adc',
            dialect: 'ecuc-module-def',
            moduleId: 0,
            lowerMultiplicity: 0,
            upperMultiplicity: 1,
            containers: [
              {
                shortName: 'AdcConfig',
                path: '/Adc/AdcConfig',
                lowerMultiplicity: 0,
                upperMultiplicity: 1,
                subContainers: [],
                parameters: [],
                references: [],
                choices: [],
              },
            ],
            providedEntries: [],
          },
        ],
        warnings: [],
      };
      // Minimal ECUC value-side doc — flat shape, one module.
      const doc = {
        path: d,
        version: '4.6',
        sourceBswmdPath: b,
        packages: [
          {
            shortName: 'Adc',
            path: '/Adc',
            elements: [
              {
                kind: 'module',
                tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                shortName: 'Adc',
                params: {},
                children: [],
                references: [],
              },
            ],
          },
        ],
      };
      useArxmlStore.setState({
        project: {
          name: 'E2E delete-module',
          manifestVersion: 1,
          createdAt: new Date().toISOString(),
          valueArxmlPaths: [d],
          bswmdPaths: [b],
        },
        projectPath: '/tmp/e2e-delete-module/autosarcfg.json',
        documents: [doc],
        documentPaths: [d],
        activeDocumentPath: d,
        doc,
        filePath: d,
        displayDoc: doc,
        bswmdSchemas: [bswmd],
        bswmdPaths: [b],
        selectedPath: '/Adc/Adc',
        locale: 'en',
        leftTab: 'project',
        viewMode: 'single',
      });
    },
    { path: STORE_MODULE_PATH, bswmdPath, docPath },
  );
}

test.describe('HIGH-3 (v1.11.2) — deleteEcucModule end-to-end', () => {
  test('source-backed doc: action removes module, clears sourceBswmdPath, shows info toast', async ({
    page,
  }) => {
    await installApiMock(page);
    await page.goto('/');
    await waitForHeader(page);
    await resetStore(page);

    const bswmdPath = '/tmp/e2e-delete-module/Adc_Bswmd.arxml';
    const docPath = '/tmp/e2e-delete-module/Adc_Cfg.arxml';
    await seedSourceBackedProject(page, bswmdPath, docPath);

    // Pre-condition sanity: 1 module in the doc, sourceBswmdPath set.
    await expect
      .poll(async () => {
        return await page.evaluate(async (path: string) => {
          const { useArxmlStore } = await import(/* @vite-ignore */ path);
          const s = useArxmlStore.getState();
          return {
            count: s.doc?.packages[0]?.elements.length ?? -1,
            source: s.doc?.sourceBswmdPath ?? null,
          };
        }, STORE_MODULE_PATH);
      })
      .toEqual({ count: 1, source: bswmdPath });

    // Act — drive the store action directly. In production this is
    // reached via `handleContextMenuAction('delete-module', ...)` in
    // App.tsx; the action's post-mutation pipeline is what we cover.
    await page.evaluate(async (path: string) => {
      const { useArxmlStore } = await import(/* @vite-ignore */ path);
      useArxmlStore.getState().deleteEcucModule('/Adc/Adc');
    }, STORE_MODULE_PATH);

    // Assert — module gone, sourceBswmdPath cleared, info toast visible.
    const post = await page.evaluate(async (path: string) => {
      const { useArxmlStore } = await import(/* @vite-ignore */ path);
      const s = useArxmlStore.getState();
      return {
        count: s.doc?.packages[0]?.elements.length ?? -1,
        source: s.doc?.sourceBswmdPath ?? null,
        toastKind: s.toast?.kind ?? null,
        toastMsg: s.toast?.message ?? null,
        documentsCount: s.documents[0]?.packages[0]?.elements.length ?? -1,
        // HIGH-2 trio — the post-mutation pipeline must refresh them.
        lastValidatedAt: s.lastValidatedAt,
      };
    }, STORE_MODULE_PATH);
    expect(post.count).toBe(0);
    expect(post.source).toBeUndefined();
    expect(post.documentsCount).toBe(0);
    expect(post.toastKind).toBe('info');
    // Localized message in en: "Deleted ECUC module 'Adc'"
    expect(post.toastMsg).toMatch(/Deleted ECUC module.*Adc|已删除 ECUC 模块.*Adc/);
    expect(post.lastValidatedAt).not.toBeNull();

    // Assert — the toast banner is rendered to the user. Query by the
    // `role="alert"` (the canonical accessibility hook for transient
    // status banners) rather than by `error-banner` testid — the
    // latter is a legacy internal name that the AppHeader uses for all
    // toast kinds (info / success / warning / error), so locking on
    // the testid couples the E2E to the implementation detail. The
    // semantic query survives any testid rename.
    const banner = page.locator('[role="alert"]').filter({ hasText: /Deleted|已删除/ });
    await expect(banner).toBeVisible({ timeout: 3_000 });
  });

  test('non-source-backed doc: action removes module, leaves sourceBswmdPath undefined, shows info toast', async ({
    page,
  }) => {
    await installApiMock(page);
    await page.goto('/');
    await waitForHeader(page);
    await resetStore(page);

    const docPath = '/tmp/e2e-delete-module/Legacy_Cfg.arxml';
    // Seed WITHOUT sourceBswmdPath — legacy ECUC value-side doc.
    await page.evaluate(
      async ({ path, docPath: d }: { path: string; docPath: string }) => {
        const { useArxmlStore } = await import(/* @vite-ignore */ path);
        const doc = {
          path: d,
          version: '4.6',
          packages: [
            {
              shortName: 'Adc',
              path: '/Adc',
              elements: [
                {
                  kind: 'module',
                  tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                  shortName: 'Adc',
                  params: {},
                  children: [],
                  references: [],
                },
              ],
            },
          ],
        };
        useArxmlStore.setState({
          documents: [doc],
          documentPaths: [d],
          activeDocumentPath: d,
          doc,
          filePath: d,
          displayDoc: doc,
          selectedPath: '/Adc/Adc',
          viewMode: 'single',
          leftTab: 'project',
        });
      },
      { path: STORE_MODULE_PATH, docPath },
    );

    // Act
    await page.evaluate(async (path: string) => {
      const { useArxmlStore } = await import(/* @vite-ignore */ path);
      useArxmlStore.getState().deleteEcucModule('/Adc/Adc');
    }, STORE_MODULE_PATH);

    // Assert — module gone, sourceBswmdPath still undefined (no source
    // to clear), info toast emitted.
    const post = await page.evaluate(async (path: string) => {
      const { useArxmlStore } = await import(/* @vite-ignore */ path);
      const s = useArxmlStore.getState();
      return {
        count: s.doc?.packages[0]?.elements.length ?? -1,
        source: s.doc?.sourceBswmdPath ?? null,
        toastKind: s.toast?.kind ?? null,
      };
    }, STORE_MODULE_PATH);
    expect(post.count).toBe(0);
    expect(post.source).toBeUndefined();
    expect(post.toastKind).toBe('info');
  });

  test('error path: non-existent module path → error toast, doc unchanged', async ({ page }) => {
    await installApiMock(page);
    await page.goto('/');
    await waitForHeader(page);
    await resetStore(page);

    const docPath = '/tmp/e2e-delete-module/Adc_Cfg.arxml';
    await page.evaluate(
      async ({ path, docPath: d }: { path: string; docPath: string }) => {
        const { useArxmlStore } = await import(/* @vite-ignore */ path);
        const doc = {
          path: d,
          version: '4.6',
          packages: [
            {
              shortName: 'Adc',
              path: '/Adc',
              elements: [
                {
                  kind: 'module',
                  tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                  shortName: 'Adc',
                  params: {},
                  children: [],
                  references: [],
                },
              ],
            },
          ],
        };
        useArxmlStore.setState({
          documents: [doc],
          documentPaths: [d],
          activeDocumentPath: d,
          doc,
          filePath: d,
          displayDoc: doc,
          viewMode: 'single',
          leftTab: 'project',
        });
      },
      { path: STORE_MODULE_PATH, docPath },
    );

    // Snapshot pre-state — the doc reference must be preserved on
    // the no-op error path (reference-equality convention).
    const pre = await page.evaluate(async (path: string) => {
      const { useArxmlStore } = await import(/* @vite-ignore */ path);
      const s = useArxmlStore.getState();
      return {
        docRef: s.documents[0],
        count: s.doc?.packages[0]?.elements.length ?? -1,
      };
    }, STORE_MODULE_PATH);

    // Act — non-existent path
    await page.evaluate(async (path: string) => {
      const { useArxmlStore } = await import(/* @vite-ignore */ path);
      useArxmlStore.getState().deleteEcucModule('/Adc/NonExistent');
    }, STORE_MODULE_PATH);

    // Assert — doc reference preserved, element count unchanged, error
    // toast surfaced with a localized module-not-found message.
    const post = await page.evaluate(async (path: string) => {
      const { useArxmlStore } = await import(/* @vite-ignore */ path);
      const s = useArxmlStore.getState();
      return {
        docRef: s.documents[0],
        count: s.doc?.packages[0]?.elements.length ?? -1,
        toastKind: s.toast?.kind ?? null,
        toastMsg: s.toast?.message ?? null,
      };
    }, STORE_MODULE_PATH);
    expect(post.docRef).toBe(pre.docRef);
    expect(post.count).toBe(1);
    expect(post.toastKind).toBe('error');
    // Localized in en / zh-CN — pin the module-not-found message.
    expect(post.toastMsg).toMatch(/module|模块/);

    // Assert — the error banner is rendered to the user. Query by
    // semantic role + text rather than the legacy `error-banner`
    // testid so the assertion does not break if the AppHeader renames
    // its internal testids (the testid is shared across info / success
    // / warning / error toasts and is therefore not a stable contract).
    const banner = page.locator('[role="alert"]').filter({ hasText: /module|模块/ });
    await expect(banner).toBeVisible({ timeout: 3_000 });
    await expect(banner).toHaveAttribute('role', 'alert');
  });

  test('combined mode: post-fold module path resolves and removes the module', async ({ page }) => {
    // HIGH-3 sub-case — combined-mode post-fold path resolution.
    // The Tree component emits the post-fold path (e.g. `/Adc/Adc`
    // for the package-shortName-equals-module-shortName shape), and
    // the action's `state.doc` lookup must resolve it to the module
    // even when the active doc is the same source-backed file. The
    // action's combined-mode path was the regression point in v1.9.0
    // (Sprint X HIGH #1 — vendor-fold), so this test locks the
    // deleteEcucModule combined-mode path against silent no-ops.
    await installApiMock(page);
    await page.goto('/');
    await waitForHeader(page);
    await resetStore(page);

    const bswmdPath = '/tmp/e2e-delete-module/Combined_Bswmd.arxml';
    const docPath = '/tmp/e2e-delete-module/Combined_Cfg.arxml';
    await seedSourceBackedProject(page, bswmdPath, docPath);

    // Switch to combined mode — simulates the user toggling view.
    await page.evaluate(async (path: string) => {
      const { useArxmlStore } = await import(/* @vite-ignore */ path);
      useArxmlStore.setState({ viewMode: 'combined' });
    }, STORE_MODULE_PATH);

    // Act — same post-fold path; in combined mode `state.doc` is
    // unchanged (the source of truth), so the lookup still resolves.
    await page.evaluate(async (path: string) => {
      const { useArxmlStore } = await import(/* @vite-ignore */ path);
      useArxmlStore.getState().deleteEcucModule('/Adc/Adc');
    }, STORE_MODULE_PATH);

    // Assert — module gone, source cleared, info toast.
    const post = await page.evaluate(async (path: string) => {
      const { useArxmlStore } = await import(/* @vite-ignore */ path);
      const s = useArxmlStore.getState();
      return {
        count: s.doc?.packages[0]?.elements.length ?? -1,
        source: s.doc?.sourceBswmdPath ?? null,
        toastKind: s.toast?.kind ?? null,
      };
    }, STORE_MODULE_PATH);
    expect(post.count).toBe(0);
    expect(post.source).toBeUndefined();
    expect(post.toastKind).toBe('info');
  });
});
