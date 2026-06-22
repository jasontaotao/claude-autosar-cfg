// @ts-check
// v1.8.0 / K Stencil Wizard — Task 11 E2E (Playwright).
//
// Scope: drive the load-bearing user journey from spec §8.5 through the
// actual Electron renderer launched in Playwright Chromium:
//
//   1. Happy path — enable `experimental.stencilWizard` via the mocked
//      `window.autosarApi.getFeatureFlags` reply (AppHeader reads this
//      flag to gate the menu entry). Hover the File menu to open the
//      dropdown, click the "New from Stencil" entry, verify the wizard
//      modal mounts with the family picker / mode toggle / gate toggle.
//      Pick family=Com, leave mode=free (default), leave gate=off
//      (default), click Generate, verify the modal closes and the IPC
//      bridge was called with the expected payload.
//
//   2. Reopen-as-template — seed `useArxmlStore` with one
//      `templatePaths`-marked document and verify the FileListTab
//      renders the "Template" badge for that row. This is the
//      user-visible half of Task 10 (`addDocument(..., { template: true })`),
//      driven through the store seed rather than the File → Open
//      dialog (which would require mocking the OS file picker — flaky
//      and explicitly out-of-scope per the task brief).
//
//   3. Cmd-K palette trigger — dispatch a `stencil:open` CustomEvent on
//      `window` and verify the wizard modal opens. AppHeader owns the
//      listener (`useEffect` in `AppHeader.tsx:143-149`); the event is
//      a stable cross-surface entry point for the keyboard palette and
//      any future trigger.
//
// Mocking strategy mirrors `import-flow.spec.ts` / `script-panel.spec.ts`
// — `addInitScript` overrides `window.autosarApi.{getFeatureFlags,
// stencilGenerate, getAppVersion, openArxmlMulti, parseArxml}` before
// the renderer boots. The renderer reaches the dev server fine, but
// `window.autosarApi` is undefined by default (Vite dev server, not
// Electron main); the mock runs in the page's main world on every
// navigation including the initial `page.goto('/')`.
//
// Deliberately OUT of scope (per Task 11 brief):
//   - Real native save dialog (Task 12 polish). The wizard currently
//     toasts the suggested filename and closes (StencilWizard.tsx:77-78);
//     no on-disk file is written. We assert the IPC contract is wired
//     correctly via the mocked `stencilGenerate` instead.
//   - Gate logic (Task 8). The brief says "gate = false" — we leave
//     the checkbox untouched and never hit the validator path.
//   - With-BSWMD mode (Task 9). The brief says family = Com with
//     defaults; we leave the mode radio on `free` (default) and never
//     exercise the `applyPatchSteps` path.
//   - Sub-sprint B Tasks 8-10 wiring details — covered by unit tests.

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Vite dev-server path to the renderer arxml store. Vite resolves
 * `./store/useArxmlStore` (used in App.tsx) to this URL. */
const STORE_MODULE_PATH = '/store/useArxmlStore.ts';

/**
 * Canned StencilResponse for family=Com. Mirrors the real
 * `src/main/stencil/schemas/com.ts` shape: one AR-PACKAGE named "Com",
 * one ECUC-MODULE-CONFIGURATION-VALUES module, one ComConfig
 * container. We use a deliberately tiny doc so the file content is
 * easy to scan and assert against.
 */
const CANNED_COM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Com</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>Com</SHORT-NAME>
          <CONTAINERS>
            <ECUC-CONTAINER-VALUE>
              <SHORT-NAME>ComConfig</SHORT-NAME>
              <PARAMETER-VALUES>
                <ECUC-NUMERICAL-PARAM-VALUE>
                  <DEFINITION-REF DEST="ECUC-BOOLEAN-DEF">/Com/ComConfig/ComConfigurationClass</DEFINITION-REF>
                  <VALUE>PRE_COMPILE</VALUE>
                </ECUC-NUMERICAL-PARAM-VALUE>
              </PARAMETER-VALUES>
            </ECUC-CONTAINER-VALUE>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;

/** Mock arxml-store seed used by Test 2 (reopen-as-template). */
const TEMPLATE_DOC_PATH = '/tmp/e2e-stencil/Com.arxml';

/**
 * Install the `window.autosarApi` mock before the page's scripts run.
 * The mock covers every method AppHeader / StencilWizard call during
 * the wizard flow:
 *   - `getFeatureFlags` returns `stencilWizard: true` so the menu
 *     entry renders and the wizard can be triggered.
 *   - `stencilGenerate` returns the canned Com XML so the modal
 *     closes with success.
 *   - `getAppVersion` returns a placeholder (AppHeader paints the
 *     version in the toolbar on mount; without a value the header
 *     shows "…" which is fine for the assertion but nicer with a
 *     real value).
 *   - `openArxmlMulti` + `parseArxml` are stubbed but unused by the
 *     happy-path test — Test 2 exercises the template-badge path
 *     through a store seed instead of the OS picker.
 */
async function installApiMock(page: Page): Promise<void> {
  await page.addInitScript(
    ({ xml, templatePath }: { xml: string; templatePath: string }) => {
      const api = {
        getAppVersion: async (): Promise<string> => '1.8.0-e2e',
        getFeatureFlags: async (): Promise<unknown> => ({
          experimental: {
            onboarding: false,
            streaming: false,
            indexedDb: false,
            headlessCli: false,
            swsValidator: false,
            keyboardFirst: false,
            stencilWizard: true,
          },
        }),
        stencilGenerate: async (req: unknown): Promise<unknown> => {
          // Echo the request family so the test can assert the IPC
          // payload was correctly forwarded by the preload bridge.
          const family = (req as { family?: string }).family ?? 'com';
          return {
            ok: true,
            xml,
            suggestedFilename: `${family.charAt(0).toUpperCase()}${family.slice(1)}.arxml`,
          };
        },
        openArxmlMulti: async (): Promise<unknown> => ({
          kind: 'opened',
          results: [{ path: templatePath, content: xml }],
        }),
        parseArxml: async ({ path }: { path: string; content: string }): Promise<unknown> => {
          if (path !== templatePath) {
            return { ok: false, error: { kind: 'parse-failed', path, message: 'not found' } };
          }
          return {
            ok: true,
            value: {
              path: templatePath,
              version: '4.6',
              packages: [
                {
                  shortName: 'Com',
                  path: '/Com',
                  elements: [
                    {
                      kind: 'module',
                      tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                      shortName: 'Com',
                      params: {},
                      children: [],
                      references: [],
                    },
                  ],
                },
              ],
            },
          };
        },
      };
      (globalThis as unknown as { autosarApi: unknown }).autosarApi = api;
    },
    { xml: CANNED_COM_XML, templatePath: TEMPLATE_DOC_PATH },
  );
}

/**
 * Pre-warm the Vite transform pipeline. The dev server transforms
 * modules on demand; the first dynamic import from `page.evaluate`
 * races the transform and fails with "Failed to fetch dynamically
 * imported module". Issuing a fetch first lets Vite cache the
 * transformed module before we try to import it.
 */
async function warmupStoreModule(page: Page): Promise<void> {
  await page.request.get('http://localhost:5173/src/renderer/store/useArxmlStore.ts');
}

/**
 * Reset the arxml store to a known baseline. The shared Zustand
 * singleton persists across tests within the same Vite dev session,
 * so each test must scrub the slice it touches.
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
      templatePaths: new Set<string>(),
      toast: null,
    });
  }, STORE_MODULE_PATH);
}

/** Wait for the AppHeader to mount. */
async function waitForHeader(page: Page): Promise<void> {
  await expect(page.getByTestId('app-header')).toBeVisible({ timeout: 5_000 });
}

/**
 * Open the File menu and click the Stencil Wizard entry. The menu is
 * hover-to-open (per `AppHeader.tsx:onMouseEnter=openMenu`); for an
 * E2E we drive the open via hover on the trigger, which sets
 * `menuOpen=true` and renders the dropdown containing the
 * `btn-stencil-new` row. Clicking the button inside the trigger
 * also toggles the dropdown via its own onClick handler.
 */
async function openStencilWizard(page: Page): Promise<void> {
  const trigger = page.getByTestId('menu-project-trigger');
  await expect(trigger).toBeVisible();
  // Hover the trigger — AppHeader opens the dropdown on
  // `onMouseEnter`. The `scheduleClose` on `onMouseLeave` closes it
  // 150ms after the cursor leaves, so we click the entry while the
  // cursor is still inside the trigger.
  await trigger.hover();
  const stencilBtn = page.getByTestId('btn-stencil-new');
  await expect(stencilBtn).toBeVisible({ timeout: 5_000 });
  await stencilBtn.click();
  // Wizard mounts via `createPortal` into `document.body`.
  await expect(page.getByTestId('stencil-overlay')).toBeVisible({ timeout: 5_000 });
}

test.describe('v1.8.0 K — Stencil Wizard (E2E)', () => {
  test('happy path: enable flag → menu → wizard → Com/Generate → IPC payload correct', async ({
    page,
  }) => {
    await installApiMock(page);
    await page.goto('/');
    await waitForHeader(page);
    await warmupStoreModule(page);
    await resetStore(page);

    // Track every call into the mocked `stencilGenerate` so we can
    // assert the preload bridge forwarded the right payload after the
    // user clicks Generate.
    await page.evaluate(() => {
      const w = globalThis as unknown as { __stencilCalls: unknown[] };
      w.__stencilCalls = [];
      const api = (
        globalThis as unknown as {
          autosarApi: { stencilGenerate: (req: unknown) => Promise<unknown> };
        }
      ).autosarApi;
      const original = api.stencilGenerate;
      api.stencilGenerate = async (req: unknown): Promise<unknown> => {
        w.__stencilCalls.push(req);
        return original(req);
      };
    });

    // 1. Open the File menu and trigger the Stencil Wizard.
    await openStencilWizard(page);

    // 2. The wizard body shows the family picker, mode toggle, and
    //    gate toggle (testids defined in FamilyPicker / ModeToggle /
    //    GateToggle). Default family=Com, mode=free, gate=off.
    await expect(page.getByTestId('stencil-title')).toBeVisible();
    const familyPicker = page.getByTestId('stencil-family');
    await expect(familyPicker).toBeVisible();
    await expect(familyPicker).toHaveValue('com');
    await expect(page.getByTestId('stencil-mode-free')).toBeChecked();
    await expect(page.getByTestId('stencil-gate')).not.toBeChecked();

    // 3. The brief specifies "pick family = Com (default)" — we leave
    //    the picker at its default value and click Generate.
    const generateBtn = page.getByTestId('stencil-generate');
    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();

    // 4. Wizard closes on success (StencilWizard.tsx:78 — `onClose()`
    //    after the ok branch). Overlay unmounts.
    await expect(page.getByTestId('stencil-overlay')).not.toBeVisible({
      timeout: 5_000,
    });

    // 5. The IPC bridge was invoked exactly once with the expected
    //    payload — family=com, mode=free, gate=false. We do not
    //    assert against the optional `projectPath` (the wizard omits
    //    it when no project is open).
    const calls = await page.evaluate(
      () => (globalThis as unknown as { __stencilCalls: unknown[] }).__stencilCalls,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ family: 'com', mode: 'free', gate: false });
  });

  test('reopen-as-template: a doc seeded via addDocument({template:true}) shows the Template badge', async ({
    page,
  }) => {
    await installApiMock(page);
    await page.goto('/');
    await waitForHeader(page);
    await warmupStoreModule(page);
    await resetStore(page);

    // Seed via the React tree's module instance. Vite HMR gives the
    // renderer's import a `?t=<timestamp>` query string, so a plain
    // `/store/useArxmlStore.ts` import from page.evaluate yields a
    // SEPARATE module instance (verified by querying `performance`
    // for both URLs and reading each instance's document count). We
    // discover the React tree's URL from the performance timeline and
    // import that exact URL before calling addDocument so the
    // subscription picks up the change.
    await page.evaluate(
      async ({ templatePath }: { templatePath: string }) => {
        const resources = performance.getEntriesByType('resource').map((e) => e.name);
        const reactTreeUrl = resources.find(
          (n) => n.includes('useArxmlStore') && n.includes('?t='),
        );
        if (reactTreeUrl === undefined) {
          throw new Error('Could not find React tree URL for useArxmlStore');
        }
        // eslint-disable-next-line no-await-in-loop
        const mod = await import(/* @vite-ignore */ reactTreeUrl);
        const store = (
          mod as unknown as {
            useArxmlStore: {
              getState: () => {
                addDocument: (doc: unknown, path: string, opts: unknown) => void;
              };
            };
          }
        ).useArxmlStore;
        const doc = {
          path: templatePath,
          version: '4.6',
          packages: [
            {
              shortName: 'Com',
              path: '/Com',
              elements: [
                {
                  kind: 'module',
                  tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
                  shortName: 'Com',
                  params: {},
                  children: [],
                  references: [],
                },
              ],
            },
          ],
        };
        store.getState().addDocument(doc, templatePath, { template: true });
      },
      { templatePath: TEMPLATE_DOC_PATH },
    );

    const row = page.getByTestId(`file-list-tab-arxml-${TEMPLATE_DOC_PATH}`);
    await expect(row).toBeVisible({ timeout: 5_000 });
    const badge = page.getByTestId(`file-list-tab-arxml-badge-template-${TEMPLATE_DOC_PATH}`);
    await expect(badge).toBeVisible();
  });

  test('Cmd-K palette trigger: stencil:open event opens the wizard', async ({ page }) => {
    await installApiMock(page);
    await page.goto('/');
    await waitForHeader(page);
    await warmupStoreModule(page);
    await resetStore(page);

    // The palette dispatches a CustomEvent on `window`. AppHeader
    // listens via useEffect (AppHeader.tsx:143-149) and flips
    // `stencilOpen`, which mounts the wizard modal.
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('stencil:open'));
    });

    await expect(page.getByTestId('stencil-overlay')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('stencil-family')).toHaveValue('com');
    await expect(page.getByTestId('stencil-mode-free')).toBeChecked();

    // Cancel closes the wizard cleanly (Esc on the overlay also works
    // — covered by StencilWizard unit tests, not asserted here).
    await page.getByTestId('stencil-cancel').click();
    await expect(page.getByTestId('stencil-overlay')).not.toBeVisible({
      timeout: 5_000,
    });
  });
});
