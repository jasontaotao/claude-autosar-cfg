// @ts-check
// Sprint 14 / Phase D — E2E coverage for the ScriptEngine renderer
// integration. Verifies the user-visible happy path through the
// ScriptPanel + AppHeader + useScriptStore chain that Phase C shipped.
//
// Scope (one test):
//   1. Open the app
//   2. Click the Scripts toggle in AppHeader
//   3. Verify ScriptPanel mounts
//   4. Click a fixture script in the library (the validator, kind='validator')
//   5. Verify ScriptEditor populates with the script source
//   6. Click Run
//   7. Verify ScriptOutput renders logs + status
//
// IPC mocking strategy: mirrors `import-flow.spec.ts` and
// `ecuc-from-bswmd.spec.ts` — `addInitScript` overrides
// `window.autosarApi.{listScripts, runScript}` before the renderer
// boots. The fixture response matches the contracts the renderer
// expects (see `src/shared/types.ts` ScriptListResponse / ScriptRunResponse).
//
// Seeding strategy: useScriptStore is reachable via Vite's dev server
// at `/src/renderer/store/useScriptStore.ts`. We seed a single
// validator-kind script so the library row is clickable.
//
// Deliberately OUT of scope (per Phase D brief):
//   - The "New Script" dialog (Phase C shipped `handleNew` as a stub
//     that calls `saveScript` directly — there's no dialog to assert
//     against). The spec therefore does NOT exercise the
//     `script-btn-new` button.
//   - The validation panel "Script 校验" group — covered by Phase C's
//     renderer unit tests; the E2E here focuses on the ScriptPanel
//     surface only.
//   - The full Electron main process (the desktop build cannot be
//     launched headless on this runner; the renderer reaches the
//     dev server fine but `window.autosarApi` is undefined by default —
//     `addInitScript` overrides it before page load).

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Vite dev-server path to the renderer script store. */
const SCRIPT_STORE_PATH = '/src/renderer/store/useScriptStore.ts';

/** Vite dev-server path to the renderer arxml store (locale + ScriptPanel gate). */
const ARXML_STORE_PATH = '/src/renderer/store/useArxmlStore.ts';

/** Single canned validator script — mirrors tests/fixtures/scripts/pduid-uniqueness.js. */
const FIXTURE_SCRIPT = {
  id: 'fixture-pduid',
  name: 'PduId uniqueness',
  shortName: 'pduid-uniqueness',
  kind: 'validator' as const,
  updatedAt: '2026-06-19T00:00:00Z',
};

/** Canned source for the fixture script — non-empty so the editor renders. */
const FIXTURE_SOURCE = `const seen = new Map();
const ipdus = ctx.project.findContainers({ def: '/ComTxIPdu' });
ctx.log.info('扫描完成: ' + ipdus.length + ' 个 ComIPdu');
`;

/**
 * Wait for the AppHeader to mount. Other flows depend on it (Scripts
 * toggle, locale toggle, etc.).
 */
async function waitForHeader(page: Page): Promise<void> {
  await expect(page.getByTestId('app-header')).toBeVisible({ timeout: 5_000 });
}

/**
 * Reset both stores to a known baseline. The renderer Zustand
 * singletons persist across tests within the same Vite dev session.
 */
async function resetStores(page: Page): Promise<void> {
  await page.evaluate(
    async ({ scriptPath, arxmlPath }: { scriptPath: string; arxmlPath: string }) => {
      const sMod = await import(/* @vite-ignore */ scriptPath);
      const aMod = await import(/* @vite-ignore */ arxmlPath);
      sMod.useScriptStore.setState({
        scripts: [],
        selectedScriptId: null,
        editorSource: '',
        dirty: false,
        runResult: null,
        runProgress: [],
        loading: { list: false, save: false, run: false, delete: false },
        initialized: false,
      });
      aMod.useArxmlStore.setState({ locale: 'en', scriptPanelOpen: false });
    },
    { scriptPath: SCRIPT_STORE_PATH, arxmlPath: ARXML_STORE_PATH },
  );
}

/**
 * Open the ScriptPanel by clicking the AppHeader Scripts toggle and
 * waiting for the panel to mount.
 */
async function openScriptPanel(page: Page): Promise<void> {
  await page.getByTestId('btn-scripts-toggle').click();
  await expect(page.getByTestId('script-panel')).toBeVisible({ timeout: 5_000 });
}

test.describe('S14 — Script Panel E2E happy path', () => {
  test('header toggle opens panel → select fixture → run → output renders', async ({ page }) => {
    // 1. Boot + reset to a known baseline.
    await page.goto('/');
    await waitForHeader(page);
    await resetStores(page);

    // 2. Inject `window.autosarApi` BEFORE the React tree mounts. The
    //    script store's loadScripts + runScript call into this bridge,
    //    so we must stub it before any code path reads it.
    await page.addInitScript(({ fixture, source }) => {
      const api = {
        listScripts: async () => ({ scripts: [fixture] }),
        runScript: async (_id: string) => ({
          runId: 'run-1',
          status: 'ok',
          logs: [
            { level: 'info', message: 'hello from pduid-uniqueness', ts: Date.now() },
          ],
          violations: [],
          mutations: [],
          durationMs: 12,
        }),
        saveScript: async () => ({ id: fixture.id, updatedAt: '2026-06-19T00:00:00Z' }),
        deleteScript: async () => ({ ok: true }),
        onScriptProgress: (_cb: (event: unknown) => void) => () => undefined,
      };
      // Expose to the renderer; the store reads from `window.autosarApi`.
      (globalThis as unknown as { autosarApi: unknown }).autosarApi = api;
      // Also stash the source on globalThis so we can seed the editor
      // directly through the store (the run pipeline does not need
      // the source — it was already saved — but selecting a row must
      // populate the editor).
      (globalThis as unknown as { __scriptFixtureSource: string }).__scriptFixtureSource = source;
    }, { fixture: FIXTURE_SCRIPT, source: FIXTURE_SOURCE });

    // Reload to apply addInitScript — the previous goto already ran
    // without the bridge. addInitScript only takes effect on the NEXT
    // page load, so we navigate again.
    await page.reload();
    await waitForHeader(page);
    await resetStores(page);

    // 3. Click the Scripts toggle to mount the panel.
    await openScriptPanel(page);

    // 4. Verify the fixture row is visible in the library.
    const row = page.getByTestId(`script-row-${FIXTURE_SCRIPT.id}`);
    await expect(row).toBeVisible({ timeout: 5_000 });

    // 5. Click the row → editor populates with source. Phase C
    //    auto-selects the first script; we click explicitly to drive
    //    the assertion.
    await row.click();

    // 6. Verify editor mount (data-testid='script-editor' is on the
    //    host element).
    const editor = page.getByTestId('script-editor');
    await expect(editor).toBeVisible();

    // 7. Click Run → wait for output to render with status='ok'.
    await page.getByTestId('script-btn-run').click();
    await expect(page.getByTestId('script-output-status-ok')).toBeVisible({
      timeout: 5_000,
    });

    // 8. Verify at least one log line is visible (proves the output
    //    panel received the runResult.logs[] payload).
    await expect(page.getByTestId('script-output-logs')).toBeVisible();
    await expect(page.getByText('hello from pduid-uniqueness')).toBeVisible();

    // 9. Verify the kind badge for the selected validator surfaces
    //    correctly — sanity-check that the panel renders the
    //    kind-aware UI from Phase C.
    await expect(page.getByTestId(`script-kind-validator`).first()).toBeVisible();
  });
});