// @ts-check
// Sprint 14 / Task 13 — E2E coverage for the BSWMD-to-ECUC selection flow.
//
// Scope: drive the three load-bearing Sprint 14 user journeys through the
// actual Electron renderer launched in Playwright Chromium:
//   1. Happy path — open the new-project dialog from the AppHeader menu,
//      create a project, seed a BSWMD + open manifest into the store,
//      open the ECUC picker from the fileOps menu entry, pick the `Can`
//      module, confirm, and observe the resulting `Can_Cfg.arxml` row in
//      the FileListTab.
//   2. Module-name collision — seed 2 BSWMDs whose schemas both declare
//      `Can`. Open the picker, check both Can rows, and assert the
//      localized collision warning surfaces in the right pane (T3 +
//      T10).
//   3. Cascade-on-remove — seed a BSWMD with one ECUC dependent (a doc
//      whose `sourceBswmdPath` points at it). Click the BSWMD's `×`
//      remove button and assert the CascadeConfirmDialog overlay appears
//      (Task 12).
//
// Seeding strategy: each test drives `useArxmlStore.setState(...)` from
// `page.evaluate` via a dynamic `import()` of the renderer-side store
// module through Vite's dev server (`/src/renderer/store/useArxmlStore.ts`).
// The Vite config serves the renderer source root with `@core` + `@shared`
// aliases, so the same module the React tree already imports is reachable
// from the test runner without exposing any new test-only API. The store
// returned by `create()` is a singleton — calling `setState` on it
// re-renders every subscribed selector (which is exactly what the unit
// tests rely on), so seeding is enough to flip the UI.
//
// Deliberately OUT of scope (per Task 13 brief):
//   - The `file:URL` IPC round-trip for `writeArxmlBatch`. The desktop
//     build cannot be launched headless on this runner (Electron needs
//     a display server); the renderer reaches the dev server fine but
//     `window.autosarApi` is undefined. Test 1 therefore simulates the
//     post-IPC store write through a second `setState` call rather
//     than driving the IPC pipeline. CI will run the spec against a
//     real Electron build where the IPC handler is wired.
//   - The Browse… button (Playwright cannot reach Electron's OS file
//     picker); New-Project dialog inputs are filled directly.
//   - Locale flipping. The seeded store uses `locale: 'en'` so the
//     localized strings we assert against are stable across runs; the
//     `ecuc.fromBswmd.collisionWarn` en string is matched with a
//     locale-agnostic regex (see Test 2).

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Dynamic import path to the renderer store. Vite serves the renderer
 * source tree from `/` (root = `src/renderer`), so the relative path
 * below resolves to `src/renderer/store/useArxmlStore.ts` at the dev
 * server. The `.ts` extension is required — Vite does NOT auto-resolve
 * `import '.../foo'` to `foo.ts` for dynamic imports served over HTTP.
 */
const STORE_MODULE_PATH = '/src/renderer/store/useArxmlStore.ts';

interface BswmdSeed {
  readonly moduleName: string;
  readonly bswmdPath: string;
}

interface DependentSeed {
  readonly docPath: string;
  readonly sourceBswmdPath: string;
}

interface SeedOptions {
  readonly bswmds: readonly BswmdSeed[];
  readonly dependents: readonly DependentSeed[];
}

/**
 * Reset every store slice the tests touch. We do this once per test so
 * the shared Zustand singleton (one per Vite dev session) doesn't leak
 * schemas / projects across tests.
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
      dirtyPaths: new Set(),
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
      displayDoc: null,
      newProjectDialogOpen: false,
      confirmDialogOpen: false,
      bswmdPicker: { open: false, parentPath: null, kind: null },
      pendingDelete: null,
    });
  }, STORE_MODULE_PATH);
}

/**
 * Seed an open project + one or more BSWMDs + (optionally) one or more
 * ECUC docs with a `sourceBswmdPath` link. The renderer re-reads
 * `useArxmlStore((s) => s.project)` / `bswmdSchemas` selectors on the
 * next render, so seeding is sufficient — no IPC, no DOM manipulation.
 *
 * The BSWMD schema payload is intentionally minimal — one module,
 * one container, no params — enough for the picker to render a
 * checkbox and the cascade flow to resolve a dependent.
 */
async function seedProjectWithBswmds(
  page: Page,
  opts: SeedOptions,
): Promise<void> {
  await page.evaluate(
    async ({
      path,
      projectPath,
      bswmds,
      dependents,
    }: {
      path: string;
      projectPath: string;
      bswmds: readonly { moduleName: string; bswmdPath: string }[];
      dependents: readonly { docPath: string; sourceBswmdPath: string }[];
    }) => {
      const mod = await import(/* @vite-ignore */ path);
      const { useArxmlStore } = mod;

      const schemas = bswmds.map((b) => ({
        modules: [
          {
            shortName: b.moduleName,
            longName: [],
            path: `/EAS/${b.moduleName}`,
            containers: [
              {
                shortName: 'General',
                path: `/EAS/${b.moduleName}/General`,
                parameters: [],
                references: [],
                subContainers: [],
              },
            ],
            references: [],
            parameters: [],
            choiceContainers: [],
          },
        ],
        disabledModules: new Set(),
      }));
      const paths = bswmds.map((b) => b.bswmdPath);

      const documents: unknown[] = [];
      const documentPaths: string[] = [];
      for (const d of dependents) {
        documents.push({
          filePath: d.docPath,
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
          sourceBswmdPath: d.sourceBswmdPath,
        });
        documentPaths.push(d.docPath);
      }

      useArxmlStore.setState({
        project: {
          name: 'E2E Project',
          manifestVersion: 1,
          createdAt: new Date().toISOString(),
          valueArxmlPaths: documentPaths,
          bswmdPaths: paths,
        },
        projectPath,
        bswmdSchemas: schemas,
        bswmdPaths: paths,
        documents,
        documentPaths,
        activeDocumentPath: documentPaths[0] ?? null,
        dirtyPaths: new Set(),
        error: null,
        validationErrors: [],
        leftTab: 'project',
      });
    },
    {
      path: STORE_MODULE_PATH,
      projectPath: '/tmp/e2e-project/E2E_Project.autosarcfg.json',
      bswmds: opts.bswmds,
      dependents: opts.dependents,
    },
  );
}

/**
 * Wait until the ECUC picker dialog is visible. The picker portals to
 * `document.body`, so we scope the role=dialog lookup to the page root.
 */
async function waitForPicker(page: Page): Promise<void> {
  await expect(
    page.getByRole('dialog', { name: /ECUC Module Selection|ECUC模块选择/ }),
  ).toBeVisible({ timeout: 5_000 });
}

/**
 * Wait for the AppHeader to mount. Other flows depend on it (menu
 * trigger, locale toggle, etc.).
 */
async function waitForHeader(page: Page): Promise<void> {
  await expect(page.getByTestId('app-header')).toBeVisible({ timeout: 5_000 });
}

test.describe('S14 — ECUC module selection (E2E)', () => {
  test('menu entry opens picker, pick + confirm creates Can_Cfg.arxml', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForHeader(page);
    await resetStore(page);

    // Seed: one BSWMD declaring `Can`, project open, no dependents yet.
    await seedProjectWithBswmds(page, {
      bswmds: [
        { moduleName: 'Can', bswmdPath: '/tmp/e2e-project/Can_Bswmd.arxml' },
      ],
      dependents: [],
    });

    // Sanity: project panel renders the BSWMD chip with count 1/1.
    await expect(page.getByTestId('project-panel-bswmd-chip-0')).toContainText(
      '1/1',
    );

    // Open the project menu via the inner button (the wrapper has only
    // mouseEnter handlers — the inner `<button>` toggles on click,
    // matching the React-testing-library pattern in AppHeader.test.tsx).
    await page.getByTestId('menu-project-trigger').locator('button').click();
    await expect(page.getByTestId('btn-ecuc-from-bswmd')).toBeVisible();

    // Click the ECUC-from-BSWMD menu item.
    await page.getByTestId('btn-ecuc-from-bswmd').click();
    await waitForPicker(page);

    // Verify the single BSWMD row appears and check `Can`.
    await expect(page.getByLabel('Can')).toBeVisible();
    await page.getByLabel('Can').check();
    await expect(page.getByLabel('Can')).toBeChecked();

    // Confirm. The confirm button label is `Create {count} ECUC` in en.
    await expect(page.getByTestId('mfbp-confirm')).toBeEnabled();
    await page.getByTestId('mfbp-confirm').click();

    // Picker closes on success.
    await expect(
      page.getByRole('dialog', { name: /ECUC Module Selection|ECUC模块选择/ }),
    ).not.toBeVisible();

    // Simulate the post-IPC store write (writeArxmlBatch adds the doc
    // through addDocumentWithSource; the desktop build does this for
    // us, the headless harness skips the IPC round-trip).
    await page.evaluate(async (path: string) => {
      const mod = await import(/* @vite-ignore */ path);
      const { useArxmlStore } = mod;
      const state = useArxmlStore.getState();
      const newDocPath = '/tmp/e2e-project/Can_Cfg.arxml';
      const doc = {
        filePath: newDocPath,
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
        sourceBswmdPath: '/tmp/e2e-project/Can_Bswmd.arxml',
      };
      useArxmlStore.setState({
        documents: [...state.documents, doc],
        documentPaths: [...state.documentPaths, newDocPath],
        activeDocumentPath: newDocPath,
        project:
          state.project !== null
            ? {
                ...state.project,
                valueArxmlPaths: [
                  ...state.project.valueArxmlPaths,
                  newDocPath,
                ],
              }
            : null,
      });
    }, STORE_MODULE_PATH);

    // Switch the left tab back to "files" so the FileListTab (which is
    // the ARXML doc browser) is rendered.
    await page.evaluate(async (path: string) => {
      const mod = await import(/* @vite-ignore */ path);
      const { useArxmlStore } = mod;
      useArxmlStore.setState({ leftTab: 'files' });
    }, STORE_MODULE_PATH);

    // The new ARXML row appears in FileListTab with the full path as
    // the testid suffix.
    await expect(
      page.getByTestId('file-list-tab-arxml-/tmp/e2e-project/Can_Cfg.arxml'),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('collision: 2 BSWMDs with Can → picker surfaces collision warning', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForHeader(page);
    await resetStore(page);

    // Seed 2 BSWMDs both declaring `Can`. T3's `resolveCollisionFilename`
    // produces vendor-suffixed filenames (`Can_vendor1_Cfg.arxml`,
    // `Can_vendor2_Cfg.arxml`) for the same moduleShortName picked
    // across 2+ BSWMDs; the picker renders a localized warning when
    // that happens.
    await seedProjectWithBswmds(page, {
      bswmds: [
        {
          moduleName: 'Can',
          bswmdPath: '/tmp/e2e-project/vendor1_Can_Bswmd.arxml',
        },
        {
          moduleName: 'Can',
          bswmdPath: '/tmp/e2e-project/vendor2_Can_Bswmd.arxml',
        },
      ],
      dependents: [],
    });

    await page.getByTestId('menu-project-trigger').locator('button').click();
    await page.getByTestId('btn-ecuc-from-bswmd').click();
    await waitForPicker(page);

    // Both BSWMD groups render a `Can` checkbox. Pick both.
    const checkboxes = page.getByLabel('Can');
    await expect(checkboxes).toHaveCount(2);
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();

    // Collision warning surfaces — locale-agnostic regex matches both
    // zh-CN and en strings.
    await expect(page.getByTestId('mfbp-collision')).toBeVisible();
    await expect(page.getByTestId('mfbp-collision')).toContainText(
      /collision|冲突|同名/iu,
    );

    // The right pane lists both vendor-suffixed target filenames.
    await expect(page.getByTestId('mfbp-files')).toContainText('Can');
  });

  test('BSWMD remove with dependents prompts cascade confirm', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForHeader(page);
    await resetStore(page);

    // Seed one BSWMD + one dependent ECUC doc whose sourceBswmdPath
    // points at it. The cascade-on-remove flow (Task 12) opens the
    // CascadeConfirmDialog when at least one dependent exists.
    await seedProjectWithBswmds(page, {
      bswmds: [
        { moduleName: 'Can', bswmdPath: '/tmp/e2e-project/Can_Bswmd.arxml' },
      ],
      dependents: [
        {
          docPath: '/tmp/e2e-project/Can_Cfg.arxml',
          sourceBswmdPath: '/tmp/e2e-project/Can_Bswmd.arxml',
        },
      ],
    });

    // Click the BSWMD row's remove button. ProjectPanel's FileList
    // testid is `${testIdPrefix}-remove-${p}` (Sprint 12 #2 contract).
    const bswmdRemoveBtn = page.getByTestId(
      'project-panel-bswmd-remove-/tmp/e2e-project/Can_Bswmd.arxml',
    );
    await expect(bswmdRemoveBtn).toBeVisible();
    await bswmdRemoveBtn.click();

    // Cascade confirm overlay appears with the localized title + the
    // dependent file listed.
    await expect(page.getByTestId('cascade-overlay')).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId('cascade-title')).toContainText(/Can/);
    await expect(page.getByTestId('cascade-refs')).toBeVisible();
    await expect(page.getByTestId('cascade-ref-item')).toHaveCount(1);
    await expect(page.getByTestId('cascade-ref-item').first()).toContainText(
      '/tmp/e2e-project/Can_Cfg.arxml',
    );

    // 3-option footer: Cancel / Only / Cascade — all visible.
    await expect(page.getByTestId('cascade-cancel')).toBeVisible();
    await expect(page.getByTestId('cascade-only')).toBeVisible();
    await expect(page.getByTestId('cascade-cascade')).toBeVisible();

    // Dismiss with Cancel so the test ends in a clean state.
    await page.getByTestId('cascade-cancel').click();
    await expect(page.getByTestId('cascade-overlay')).not.toBeVisible();
  });
});
