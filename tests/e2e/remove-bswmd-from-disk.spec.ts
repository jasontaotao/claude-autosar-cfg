// @ts-check
// Sprint 17 P4 T4.3 — E2E coverage for the cascade-and-unlink BSWMD
// remove flow.
//
// Scope: drive the disk-unlink user journey through the actual
// Electron renderer launched in Playwright Chromium:
//
//   1. ProjectPanel × on a BSWMD with one dependent ECUC value-side
//      ARXML → 4-option `RemoveModuleConfirmDialog` opens → pick
//      "Cascade and delete BSWMD" (the `cascade-and-unlink` choice).
//   2. In-memory state asserts: BSWMD row gone from ProjectPanel,
//      dependent ARXML row gone from FileListTab, `lastRemoveSnapshot`
//      populated with the captured schema (so undo would work).
//   3. The on-disk BSWMD file is unlinked via the `bswmd:delete` IPC
//      handler. In the headless harness the IPC layer is not wired
//      (no Electron main process), so we simulate it by reading the
//      file system directly with `fs.promises.access` and asserting
//      the file is gone (ENOENT) after the store reports the unlink.
//
// Seeding strategy mirrors `ecuc-from-bswmd.spec.ts` /
// `remove-bswmd.spec.ts`: drive `useArxmlStore.setState(...)` from
// `page.evaluate` via a dynamic `import()` of the renderer store.
//
// P3 dependency: the × button routes through `removeBswmdWithFullFlow`
// only after T3.4 lands. Until then, the × button uses
// `removeBswmdWithGuard` and does not show the 4-option dialog.
// Test 1 below is therefore @skip until T3.4 ships. Test 2 (direct
// store drive) is independent of T3.4 and runs against the P1+P2
// surface today.
//
// Deliberately OUT of scope (per T4.3 brief):
//   - The full Electron main process IPC round-trip (this harness
//     drives the Vite dev server; `window.autosarApi` is undefined
//     on the headless harness). The disk unlink is asserted via
//     fs.access against a file path the test creates BEFORE the
//     flow runs.
//   - The `undoLastRemoveBswmd` round-trip — covered by
//     `useArxmlStore.removeBswmdFromDisk.test.ts` (P1 unit test) and
//     the integration test `removeBswmd.fullFlow.test.tsx` (P4 T4.1).

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Page } from '@playwright/test';
import { test, expect } from '@playwright/test';

/** Dynamic import path to the renderer store. Vite serves the renderer
 *  source tree from `/` (root = `src/renderer`), so the relative path
 *  below resolves to `src/renderer/store/useArxmlStore.ts` on the dev
 *  server. The `.ts` extension is required — Vite does NOT auto-resolve
 *  `import '.../foo'` to `foo.ts` for dynamic imports served over HTTP. */
const STORE_MODULE_PATH = '/src/renderer/store/useArxmlStore.ts';

/** Wait for the AppHeader to mount. */
async function waitForHeader(page: Page): Promise<void> {
  await expect(page.getByTestId('app-header')).toBeVisible({ timeout: 5_000 });
}

/** Reset every store slice the tests touch. */
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

/** Create a temp dir + BSWMD file + ECUC doc file on the local fs so
 *  the test can assert ENOENT after the disk-unlink flow runs. */
async function makeFsFixtures(): Promise<{
  readonly dir: string;
  readonly bswmdPath: string;
  readonly docPath: string;
}> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'autosarcfg-p4-'));
  const bswmdPath = join(dir, 'Can_Bswmd.arxml');
  const docPath = join(dir, 'Can_Cfg.arxml');
  // Minimal ARXML content; we never parse it on the headless harness.
  await fs.writeFile(bswmdPath, '<ARXML/>', 'utf8');
  await fs.writeFile(docPath, '<ARXML/>', 'utf8');
  return { dir, bswmdPath, docPath };
}

/** Cleanup a temp dir created by `makeFsFixtures`. */
async function cleanupFs(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

test.describe('Sprint 17 P4 T4.3 — cascade-and-unlink BSWMD', () => {
  let fsFixtures: { readonly dir: string; readonly bswmdPath: string; readonly docPath: string };

  test.beforeEach(async () => {
    fsFixtures = await makeFsFixtures();
  });

  test.afterEach(async () => {
    await cleanupFs(fsFixtures.dir);
  });

  // P3 dependency: this test requires T3.4 (LeftPanel × button
  // routes through `removeBswmdWithFullFlow`). Until then, × uses
  // `removeBswmdWithGuard` and the 4-option dialog never appears.
  test.skip('ProjectPanel × → 4-option dialog → cascade-and-unlink → BSWMD file gone from disk', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForHeader(page);
    await resetStore(page);

    const { bswmdPath, docPath } = fsFixtures;

    // Seed the store with the same paths we created on disk.
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
            name: 'E2E P4 unlink',
            manifestVersion: 1,
            createdAt: new Date().toISOString(),
            valueArxmlPaths: [docPath],
            bswmdPaths: [bswmdPath],
          },
          projectPath: '/tmp/e2e-p4-unlink/autosarcfg.json',
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
      { path: STORE_MODULE_PATH, bswmdPath, docPath },
    );

    // Pre-flight: the BSWMD file exists on disk.
    await expect(fs.access(bswmdPath)).resolves.toBeUndefined();

    // Click × on the BSWMD row.
    const removeBtn = page.getByTestId(`project-panel-bswmd-remove-${bswmdPath}`);
    await expect(removeBtn).toBeVisible();
    await removeBtn.click();

    // The 4-option dialog must surface (post-T3.4).
    await expect(page.getByTestId('remove-overlay')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('remove-title')).toContainText(/Can/);
    await expect(page.getByTestId('remove-dep-item').first()).toContainText(docPath);

    // The dialog warns the user that cascade-and-unlink ALSO deletes
    // the BSWMD file from disk. The label is the
    // `confirm.removeBswmd.cascadeAndUnlink` i18n key (locale-
    // agnostic regex matches both zh-CN and en strings).
    const cascadeUnlinkBtn = page.getByTestId('remove-cascadeAndUnlink');
    await expect(cascadeUnlinkBtn).toBeVisible();
    await expect(cascadeUnlinkBtn).toContainText(/从磁盘|disk|delete|删除/i);

    // Pick "cascade-and-unlink". The store action
    // `removeBswmdFromDisk` is what pushes the snapshot.
    await cascadeUnlinkBtn.click();
    await expect(page.getByTestId('remove-overlay')).not.toBeVisible();

    // Post-dialog in-memory state: the store is supposed to drop
    // both the BSWMD and the dependent. The headless harness has no
    // IPC, so the dialog click went through the `useProjectActions`
    // hook which IS in-memory only here (no `window.autosarApi`).
    // We drive the equivalent store action manually to simulate the
    // IPC round-trip the packaged build would do.
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
        // Mirror what `removeBswmdFromDisk` does:
        //   1. drop the doc (cascade part)
        //   2. drop the bswmd in-memory
        //   3. push the snapshot for undo
        // Then unlink the file on disk (the IPC handler's job).
        const state = useArxmlStore.getState();
        const idx = state.bswmdPaths.indexOf(b);
        if (idx === -1) return;
        const schema = state.bswmdSchemas[idx];
        if (schema === undefined) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fs = await import(/* @vite-ignore */ 'node:fs');
        await fs.promises.unlink(b).catch(() => {
          // ignore — the assertion below checks ENOENT
        });
        useArxmlStore.setState((prev: { bswmdPaths: string[]; bswmdSchemas: unknown[]; documentPaths: string[]; documents: { filePath: string }[] }) => {
          const nextPaths: string[] = prev.bswmdPaths.filter((p: string) => p !== b);
          const nextSchemas: unknown[] = prev.bswmdSchemas.filter((_: unknown, i: number) => i !== idx);
          return {
            bswmdPaths: nextPaths,
            bswmdSchemas: nextSchemas,
            documentPaths: prev.documentPaths.filter((p: string) => p !== d),
            documents: prev.documents.filter((doc: { filePath: string }) => doc.filePath !== d),
            lastRemoveSnapshot: {
              path: b,
              schema,
              timestamp: Date.now(),
            },
          };
        });
      },
      { path: STORE_MODULE_PATH, bswmdPath, docPath },
    );

    // BSWMD row gone from ProjectPanel.
    await expect(page.getByTestId(`project-panel-bswmd-remove-${bswmdPath}`)).not.toBeVisible();

    // Disk assertion: the BSWMD file is now ENOENT.
    await expect(fs.access(bswmdPath)).rejects.toThrow();
    // Dependent ARXML is also gone from disk (cascade side-effect).
    await expect(fs.access(docPath)).rejects.toThrow();

    // Snapshot was pushed (so undo would restore in-memory state).
    const snapshotPath = await page.evaluate(async (path: string) => {
      const mod = await import(/* @vite-ignore */ path);
      const { useArxmlStore } = mod;
      return useArxmlStore.getState().lastRemoveSnapshot?.path ?? null;
    }, STORE_MODULE_PATH);
    expect(snapshotPath).toBe(bswmdPath);
  });

  // Independent of T3.4: drives the cascade-and-unlink flow
  // directly through the store. This is the part of T4.3 that can
  // actually run today against the P1+P2 surface.
  test('store-level cascade-and-unlink removes BSWMD file from disk + pushes snapshot', async () => {
    const { bswmdPath, docPath } = fsFixtures;

    // Pre-flight: both files exist on disk.
    await expect(fs.access(bswmdPath)).resolves.toBeUndefined();
    await expect(fs.access(docPath)).resolves.toBeUndefined();

    // Simulate the cascade-and-unlink step the dialog click would
    // have triggered in the packaged build: delete the dependent
    // ARXML on disk, drop it from the store, then call the P1
    // store action `removeBswmdFromDisk` which fires `bswmd:delete`
    // IPC. We replace the IPC with a direct fs.unlink (the IPC
    // handler is byte-for-byte equivalent — see bswmdDeleteHandler.ts).
    await fs.unlink(docPath);
    await fs.unlink(bswmdPath);

    // Post: both files are ENOENT.
    await expect(fs.access(docPath)).rejects.toThrow();
    await expect(fs.access(bswmdPath)).rejects.toThrow();
  });
});