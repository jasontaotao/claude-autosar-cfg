// @ts-check
// Sprint 14 / Task 14 — E2E coverage for the ECUC ARXML Import flow.
//
// Scope: drive the two load-bearing user journeys from spec §8.5
// through the actual Electron renderer launched in Playwright Chromium:
//
//   1. Happy path — open the FileListTab [Import…] entry, mock the
//      Electron `openArxmlMulti` + `parseArxml` IPC bridges so the
//      dialog returns two canned ECUC fixtures, check one of the
//      incoming modules, commit, and observe:
//        - `viewMode` returns to 'single'
//        - `importSession` is cleared
//        - the seeded target document picked up the incoming module
//        - `dirtyPaths` includes the target file path
//
//   2. Abort path — open [Import…] (same mocked dialog), check a
//      module, then click the panel's [Cancel] button. Verify:
//        - `viewMode` returns to 'single'
//        - `importSession` is cleared
//        - the seeded target document is byte-for-byte unchanged
//
// Mocking strategy: `addInitScript` runs before the renderer boots, so
// `window.autosarApi` carries the mocked `openArxmlMulti` / `parseArxml`
// pair the moment `ImportEntry` calls them. The mocks return canned
// `ArxmlDocument` shapes that match the small in-memory fixture pattern
// used by the renderer unit tests — no real disk IO is required.
//
// Seeding strategy mirrors `ecuc-from-bswmd.spec.ts`: a project is
// seeded via `useArxmlStore.setState` from `page.evaluate` so the
// import-merged column mounts in the left panel (Sprint 14 / T13).
// The left column swap is what unlocks the `[Import…]` button —
// without `project !== null` the import entry is rendered, but the
// store's collision detection still runs against the seeded target
// documents, which is what the happy-path collision assertion needs.
//
// Deliberately OUT of scope (per Task 14 brief):
//   - The DiffTable flow (Sprint 14 / T12). The spec's happy path
//     here exercises the no-collision branch (one incoming module
//     with a shortName that does not collide), so the default
//     'overwrite' resolution is enough to land the module. The
//     collision path is covered by the renderer unit tests in
//     DiffTable.test.tsx.
//   - The real Electron main process (this harness drives the Vite
//     dev server; `window.autosarApi` is overridden before page load).
//   - The dirty-guard ConfirmDialog (covered by the importSession
//     unit tests; toggling the dirty bit in the seed would slow the
//     happy path with an extra `window.confirm` round-trip that the
//     dialog layer already proves).

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Path to the renderer store module. Vite serves the renderer tree
 * from `/` (root = `src/renderer`), so the relative path below resolves
 * to `src/renderer/store/useArxmlStore.ts` on the dev server.
 */
const STORE_MODULE_PATH = '/src/renderer/store/useArxmlStore.ts';

/**
 * Canned incoming ECUC documents returned by the mocked
 * `openArxmlMulti` / `parseArxml` pair. The shapes are deliberately
 * minimal — one module, one container, one param — so the merge view
 * is fast to render and the diff is easy to assert.
 *
 * The two shortNames (`NewModule` and `NewModuleB`) are chosen to NOT
 * collide with the seeded target module (`Can`) so the happy path
 * exercises the no-collision branch (default 'overwrite' resolution
 * emits an `add-module` op).
 */
const INCOMING_A = {
  path: '/tmp/e2e-import/IncomingA.arxml',
  version: '4.6',
  packages: [
    {
      shortName: 'Pkg',
      path: '/Pkg',
      elements: [
        {
          kind: 'module',
          tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
          shortName: 'NewModule',
          params: {},
          children: [
            {
              kind: 'container',
              tagName: 'ECUC-CONTAINER-VALUE',
              shortName: 'Cfg',
              params: {
                P: { type: 'string', value: 'A' },
              },
              children: [],
            },
          ],
          references: [],
        },
      ],
    },
  ],
};

const INCOMING_B = {
  path: '/tmp/e2e-import/IncomingB.arxml',
  version: '4.6',
  packages: [
    {
      shortName: 'Pkg',
      path: '/Pkg',
      elements: [
        {
          kind: 'module',
          tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
          shortName: 'NewModuleB',
          params: {},
          children: [],
          references: [],
        },
      ],
    },
  ],
};

const TARGET_DOC = {
  path: '/tmp/e2e-import/Target.arxml',
  version: '4.6',
  packages: [
    {
      shortName: 'Pkg',
      path: '/Pkg',
      elements: [
        {
          kind: 'module',
          tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
          shortName: 'Can',
          params: {},
          children: [
            {
              kind: 'container',
              tagName: 'ECUC-CONTAINER-VALUE',
              shortName: 'Existing',
              params: {},
              children: [],
            },
          ],
          references: [],
        },
      ],
    },
  ],
};

const PROJECT_PATH = '/tmp/e2e-import/Project.autosarcfg.json';

/**
 * Install the `window.autosarApi` mock before the page's scripts run.
 * `addInitScript` runs in the page's main world on every navigation
 * (including the initial `page.goto('/')`) and survives
 * `page.reload()`. The mock returns the canned INCOMING_A + INCOMING_B
 * shapes on `openArxmlMulti()` and a passthrough `parseArxml` that
 * returns each file as if it were already parsed.
 */
async function installApiMock(page: Page): Promise<void> {
  await page.addInitScript(
    ({ docs }: { docs: readonly unknown[] }) => {
      const api = {
        openArxmlMulti: async (): Promise<unknown> => ({
          kind: 'opened',
          results: docs.map((d) => ({
            path: (d as { path: string }).path,
            content: '<mock></mock>',
          })),
        }),
        parseArxml: async ({ path }: { path: string; content: string }): Promise<unknown> => {
          const doc = docs.find((d) => (d as { path: string }).path === path);
          if (doc === undefined) {
            return { ok: false, error: { kind: 'parse-failed', path, message: 'not found' } };
          }
          return { ok: true, value: doc };
        },
      };
      // The preload bridge exposes a thin wrapper; we shadow the same
      // method names so the renderer's `window.autosarApi.openArxmlMulti`
      // call site is unchanged. `addInitScript` runs in the page's main
      // world before the renderer's scripts execute, so the renderer
      // sees the mock on its first call.
      (globalThis as unknown as { autosarApi: unknown }).autosarApi = api;
    },
    { docs: [INCOMING_A, INCOMING_B] },
  );
}

/**
 * Reset every store slice the tests touch. Mirrors the helper in
 * `ecuc-from-bswmd.spec.ts` so the shared Zustand singleton doesn't
 * leak state across tests.
 */
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
      dirtyPaths: new Set<string>(),
      error: null,
      validationErrors: [],
      lastValidatedAt: null,
      project: null,
      projectPath: null,
      locale: 'en',
      leftTab: 'files',
      bswmdSchemas: [],
      bswmdPaths: [],
      viewMode: 'single',
      importSession: null,
      lastCommitSnapshot: null,
      newProjectDialogOpen: false,
      confirmDialogOpen: false,
      bswmdPicker: { open: false, parentPath: null, kind: null },
      pendingDelete: null,
    });
  }, STORE_MODULE_PATH);
}

/**
 * Seed: one open project + one target document so the import-merged
 * column mounts and the store's collision lookup runs against the
 * seeded `Can` module.
 */
async function seedProject(page: Page): Promise<void> {
  await page.evaluate(
    async ({ path, projectPath, doc }: { path: string; projectPath: string; doc: unknown }) => {
      const mod = await import(/* @vite-ignore */ path);
      const { useArxmlStore } = mod;
      const documents = [doc];
      const documentPaths = [(doc as { path: string }).path];
      useArxmlStore.setState({
        project: {
          name: 'E2E Import Project',
          manifestVersion: 1,
          createdAt: new Date().toISOString(),
          valueArxmlPaths: documentPaths,
          bswmdPaths: [],
        },
        projectPath,
        documents,
        documentPaths,
        activeDocumentPath: documentPaths[0] ?? null,
        dirtyPaths: new Set<string>(),
        error: null,
        validationErrors: [],
        leftTab: 'files',
        viewMode: 'single',
        importSession: null,
      });
    },
    { path: STORE_MODULE_PATH, projectPath: PROJECT_PATH, doc: TARGET_DOC },
  );
}

/** Wait for the AppHeader to mount. */
async function waitForHeader(page: Page): Promise<void> {
  await expect(page.getByTestId('app-header')).toBeVisible({ timeout: 5_000 });
}

/** Wait for the import-merged column to mount after startImport. */
async function waitForImportMergedColumn(page: Page): Promise<void> {
  await expect(page.getByTestId('app-import-merged-column')).toBeVisible({ timeout: 5_000 });
}

test.describe('S14 — ECUC ARXML Import (E2E)', () => {
  test('happy path: import 2 ECUC, check module, commit updates target + dirtyPaths', async ({
    page,
  }) => {
    await installApiMock(page);
    await page.goto('/');
    await waitForHeader(page);
    await resetStore(page);
    await seedProject(page);

    // The [Import…] button is the FileListTab's ImportEntry — a
    // directly-clickable button with the `import-entry-button`
    // testid.
    const importBtn = page.getByTestId('import-entry-button');
    await expect(importBtn).toBeVisible();
    await importBtn.click();

    // ModuleSelectionPanel mounts inside the import-merged column
    // (Sprint 14 / T13). Two rows = two incoming modules from the
    // canned fixtures.
    await waitForImportMergedColumn(page);
    const rows = page.getByTestId('module-selection-row');
    await expect(rows).toHaveCount(2);

    // Check the first row (NewModule — no collision with the seeded
    // 'Can' target, so the commit emits an `add-module` op).
    const firstCheckbox = page.getByTestId('module-selection-checkbox').first();
    await firstCheckbox.check();
    await expect(firstCheckbox).toBeChecked();

    // Commit is enabled when ≥1 row is checked.
    const commitBtn = page.getByTestId('module-selection-commit');
    await expect(commitBtn).toBeEnabled();
    await commitBtn.click();

    // After commit: importSession cleared, viewMode back to 'single',
    // import-merged column unmounts, target doc carries the new
    // module, and dirtyPaths includes the target file.
    await expect(page.getByTestId('app-import-merged-column')).not.toBeVisible({
      timeout: 5_000,
    });

    const after = await page.evaluate(async (path: string) => {
      const mod = await import(/* @vite-ignore */ path);
      const state = mod.useArxmlStore.getState();
      return {
        viewMode: state.viewMode,
        importSession: state.importSession,
        dirtyPaths: Array.from(state.dirtyPaths),
        targetModules: state.documents[0]?.packages[0]?.elements
          .filter((e: { kind: string }) => e.kind === 'module')
          .map((e: { shortName: string }) => e.shortName),
      };
    }, STORE_MODULE_PATH);

    expect(after.viewMode).toBe('single');
    expect(after.importSession).toBeNull();
    expect(after.dirtyPaths).toContain(TARGET_DOC.path);
    expect(after.targetModules?.sort()).toEqual(['Can', 'NewModule']);
  });

  test('abort path: cancel mid-import leaves store unchanged', async ({ page }) => {
    await installApiMock(page);
    await page.goto('/');
    await waitForHeader(page);
    await resetStore(page);
    await seedProject(page);

    // Snapshot the store BEFORE the import so the abort assertion can
    // prove the post-cancel state is byte-equal to the pre-import state.
    const before = await page.evaluate(async (path: string) => {
      const mod = await import(/* @vite-ignore */ path);
      const state = mod.useArxmlStore.getState();
      return {
        viewMode: state.viewMode,
        importSession: state.importSession,
        documents: JSON.stringify(state.documents),
        documentPaths: Array.from(state.documentPaths),
        dirtyPaths: Array.from(state.dirtyPaths),
      };
    }, STORE_MODULE_PATH);

    // Drive the import flow up to ModuleSelectionPanel.
    await page.getByTestId('import-entry-button').click();
    await waitForImportMergedColumn(page);
    const checkboxes = page.getByTestId('module-selection-checkbox');
    await expect(checkboxes).toHaveCount(2);
    await checkboxes.first().check();

    // Click Cancel — the spec §6.3 contract: "退出不弹 confirm".
    await page.getByTestId('module-selection-cancel').click();

    // Import-merged column unmounts, viewMode flips back to 'single',
    // importSession is cleared, and the target document is unchanged.
    await expect(page.getByTestId('app-import-merged-column')).not.toBeVisible({
      timeout: 5_000,
    });

    const after = await page.evaluate(async (path: string) => {
      const mod = await import(/* @vite-ignore */ path);
      const state = mod.useArxmlStore.getState();
      return {
        viewMode: state.viewMode,
        importSession: state.importSession,
        documents: JSON.stringify(state.documents),
        documentPaths: Array.from(state.documentPaths),
        dirtyPaths: Array.from(state.dirtyPaths),
      };
    }, STORE_MODULE_PATH);

    expect(after.viewMode).toBe('single');
    expect(after.importSession).toBeNull();
    // Documents array is byte-equal to the pre-import snapshot.
    expect(after.documents).toBe(before.documents);
    expect(after.documentPaths).toEqual(before.documentPaths);
    // dirtyPaths is unchanged — cancel must NOT mark the target dirty
    // (a clean cancel is not a "modification" of the project).
    expect(after.dirtyPaths).toEqual(before.dirtyPaths);
  });
});
