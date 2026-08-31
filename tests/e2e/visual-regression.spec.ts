// P1 visual regression（spec §3.6）— 6 surface 基线。
// maxDiffPixelRatio 0.02 = spec「逐像素对比的合理色差窗口」。
// 打开各 surface 的助手从既有 spec 原样复制，选择器已由那些用例验证：
//   openNewProjectDialog ← tests/e2e/new-project-dialog.spec.ts:24
//   ScriptPanel 打开步骤 ← tests/e2e/script-panel.spec.ts 的 describe 初始 setup
//   RemoveModuleConfirmDialog 触发 ← tests/e2e/remove-bswmd.spec.ts 的 setup
//   delete-ecuc ConfirmDialog 触发 ← tests/e2e/delete-ecuc-module.spec.ts 的 setup
//
// 现实修正（Task 4 截图走查 capture.mjs 已逐一验证，见
// .superpowers/sdd/2026-08-30-p1-visual-foundation/task-4-report.md Step 4）：
//   1. 无 Electron preload 的 headless harness 中 window.autosarApi 为
//      undefined，AppHeader 挂载路径调 getAppVersion() 会崩掉整棵树
//      （tests/e2e/delete-ecuc-module.spec.ts installApiMock 注释原文）——
//      每个用例先 installApiStub（= installApiMock 原样 + script-panel
//      的 script 桥接方法，与 capture.mjs 的合并 stub 相同）。
//   2. store 动态 import 路径为 vite-root 相对的 `/store/*.ts`
//      （vite root=src/renderer）；源 spec 注释里的 `/src/renderer/store/*`
//      已过时（Task 4 curl 验证）。
//   3. btn-project-new 在 BrandMenu 面板内，面板 `{menuOpen && ...}`
//      条件挂载——必须先点 btn-menu-toggle，直接 click 会永不 attach。
//   4. dev harness 中 ProjectPanel × 不弹框（guardedDirtySwitch →
//      confirmRemoveBswmd 链路在无 IPC 时静默）——改用
//      RemoveModuleConfirmDialog 模块级 API confirmRemoveBswmd() 真实挂载。
//   5. delete-ecuc 的 ConfirmDialog 经 guardedDirtySwitch 浮现：seed 后把
//      dirtyPaths 置为含该文档（capture.mjs surface-06 同款）。
//   6. boot 尾段存在默认态回写竞态（run-3 实测；capture.mjs 的 04 参考
//      帧同样中招：reset 为 en/project，帧里却是 zh/files）：bare
//      setState 后 locale/leftTab 可能被延迟恢复覆盖 → 统一经
//      untilSettled（reset → 英文 chrome 断言 → 400ms 沉淀 → 复验，翻回
//      即重试），6 个 surface 基线全部固定 en 规范态，跨机器可复现。
import { expect, test, type Page } from '@playwright/test';

/** Vite dev-server path to the renderer arxml store. Vite root =
 *  src/renderer, so the URL is root-relative（源 spec 注释中的
 *  /src/renderer/... 已过时，Task 4 验证 /store/... 才可达）. */
const ARXML_STORE_PATH = '/store/useArxmlStore.ts';

/** Vite dev-server path to the renderer script store. */
const SCRIPT_STORE_PATH = '/store/useScriptStore.ts';

/** Vite dev-server path to RemoveModuleConfirmDialog — its module-level
 *  confirmRemoveBswmd() is the dev-harness-valid way to mount the dialog
 *  (× button is silently gated without Electron IPC). */
const REMOVE_DIALOG_PATH = '/components/RemoveModuleConfirmDialog.tsx';

/** Single canned validator script — mirrors tests/fixtures/scripts/pduid-uniqueness.js
 *  (copied verbatim from tests/e2e/script-panel.spec.ts). */
const FIXTURE_SCRIPT = {
  id: 'fixture-pduid',
  name: 'PduId uniqueness',
  shortName: 'pduid-uniqueness',
  kind: 'validator' as const,
  updatedAt: '2026-06-19T00:00:00Z',
};

/** Canned source for the fixture script (copied verbatim from
 *  tests/e2e/script-panel.spec.ts). */
const FIXTURE_SOURCE = `const seen = new Map();
const ipdus = ctx.project.findContainers({ def: '/ComTxIPdu' });
ctx.log.info('扫描完成: ' + ipdus.length + ' 个 ComIPdu');
`;

async function waitForAppReady(page: Page): Promise<void> {
  await expect(page.getByTestId('app-header')).toBeVisible();
  await expect(page.getByTestId('left-tab-files')).toBeVisible();
}

const OPTS = { maxDiffPixelRatio: 0.02, animations: 'disabled' as const };

/** Install a minimal `window.autosarApi` mock before the React tree
 *  mounts. Copied from tests/e2e/delete-ecuc-module.spec.ts
 *  installApiMock, widened with the ScriptPanel bridge methods from
 *  tests/e2e/script-panel.spec.ts（capture.mjs 同款合并 stub）. Only
 *  methods reachable during these flows are stubbed; the rest return
 *  empty defaults so the tree mounts cleanly. */
async function installApiStub(page: Page): Promise<void> {
  await page.addInitScript(
    ({ fixture, source }: { fixture: typeof FIXTURE_SCRIPT; source: string }) => {
      const api = {
        getAppVersion: async (): Promise<string> => '1.11.2-e2e',
        // Required by AppHeader's mount path but unused during these flows.
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
        listScripts: async () => ({ scripts: [fixture] }),
        runScript: async (_id: string) => ({
          runId: 'run-1',
          status: 'ok',
          logs: [{ level: 'info', message: 'hello from pduid-uniqueness', ts: Date.now() }],
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
      (globalThis as unknown as { __scriptFixtureSource: string }).__scriptFixtureSource = source;
    },
    { fixture: FIXTURE_SCRIPT, source: FIXTURE_SOURCE },
  );
}

/** Reset every store slice the tests touch so the shared Zustand
 *  singleton doesn't leak schemas / projects. Copied verbatim from
 *  tests/e2e/delete-ecuc-module.spec.ts resetStore（store 路径修正为
 *  /store/...）. Retried once per capture.mjs: the first dynamic import
 *  of a cold dependency graph can trigger a Vite full-reload. */
async function resetStore(page: Page): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
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
      }, ARXML_STORE_PATH);
      return;
    } catch (err) {
      if (attempt >= 2) throw err;
      await page.waitForTimeout(1200);
    }
  }
}

/** Reset both stores to a known baseline for the ScriptPanel surface.
 *  Copied verbatim from tests/e2e/script-panel.spec.ts resetStores
 *  （store 路径修正为 /store/...，重试理由同 resetStore）. */
async function resetStores(page: Page): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
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
      return;
    } catch (err) {
      if (attempt >= 2) throw err;
      await page.waitForTimeout(1200);
    }
  }
}

/** openNewProjectDialog — copied verbatim from
 *  tests/e2e/new-project-dialog.spec.ts:24. The caller must have the
 *  BrandMenu dropdown open first（btn-project-new 只在面板内挂载，
 *  见文件头「现实修正」3）. */
async function openNewProjectDialog(page: Page): Promise<void> {
  await expect(page.getByTestId('app-header')).toBeVisible();
  await page.getByTestId('btn-project-new').click();
  await expect(page.getByTestId('npd-overlay')).toBeVisible();
  await expect(page.getByTestId('npd-name-input')).toBeFocused();
}

/** Seed an open project + one BSWMD + one dependent ECUC doc.
 *  Copied verbatim from tests/e2e/remove-bswmd.spec.ts seedProjectWithDep
 *  （store 路径修正为 /store/...）. */
async function seedProjectWithDep(page: Page): Promise<void> {
  await page.evaluate(
    async ({ path, bswmdPath, docPath }: { path: string; bswmdPath: string; docPath: string }) => {
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
      path: ARXML_STORE_PATH,
      bswmdPath: '/tmp/e2e-p4/Can_Bswmd.arxml',
      docPath: '/tmp/e2e-p4/Can_Cfg.arxml',
    },
  );
}

/** Seed a project with one BSWMD schema + one source-backed ECUC doc
 *  carrying a single `Adc` module. Copied verbatim from
 *  tests/e2e/delete-ecuc-module.spec.ts seedSourceBackedProject
 *  （store 路径修正为 /store/...）. */
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
    { path: ARXML_STORE_PATH, bswmdPath, docPath },
  );
}

/** Reset + wait until the canonical state is actually reflected in the
 *  rendered chrome AND stays put. Rationale（run-3 实测）: a bare
 *  `resetStore` right after waitForAppReady can be silently reverted by
 *  a late boot-time default restore / Vite re-optimization reload —
 *  surfaces 01/02 captured the machine-default zh locale + files tab
 *  even though the setState resolved without error（capture.mjs 的
 *  04 参考帧也中了同一竞态：reset 为 en/project，帧里却是 zh/files）.
 *  Loop: reset → expect the English header label → settle 400ms →
 *  re-verify; on any flip, re-apply the reset. */
async function untilSettled(page: Page, reset: () => Promise<void>): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    await reset();
    try {
      const trigger = page.getByTestId('btn-menu-toggle');
      await expect(trigger).toContainText('Project', { timeout: 2_000 });
      await page.waitForTimeout(400);
      await expect(trigger).toContainText('Project', { timeout: 2_000 });
      return;
    } catch {
      if (attempt >= 3) throw new Error('store reset kept reverting (locale/leftTab)');
    }
  }
}

test.describe('P1 visual baselines', () => {
  test('surface-01 默认工作区（header + 左面板 + 空态主区）', async ({ page }) => {
    await installApiStub(page);
    await page.goto('/');
    await waitForAppReady(page);
    // 机器默认态（locale=zh、leftTab='files'，uiSlice.ts:153）会随宿主机
    // 漂移——capture.mjs 在每个 surface 前都 reset（locale:'en'、
    // leftTab:'project'），基线同样固定到该规范态；untilSettled 吸收
    // boot 尾段的默认态回写竞态（见 untilSettled 注释）。
    await untilSettled(page, () => resetStore(page));
    await expect(page).toHaveScreenshot('surface-01-default-workspace.png', OPTS);
  });

  test('surface-02 左面板文件 tab', async ({ page }) => {
    await installApiStub(page);
    await page.goto('/');
    await waitForAppReady(page);
    await untilSettled(page, () => resetStore(page));
    await page.getByTestId('left-tab-files').click();
    await expect(page.locator('[aria-labelledby="left-tab-files"]')).toBeVisible();
    await expect(page).toHaveScreenshot('surface-02-files-tab.png', OPTS);
  });

  test('surface-03 NewProjectDialog（反转组件）', async ({ page }) => {
    await installApiStub(page);
    await page.goto('/');
    await waitForAppReady(page);
    await untilSettled(page, () => resetStore(page));
    // btn-project-new lives inside the BrandMenu dropdown panel which is
    // conditionally mounted（`{menuOpen && ...}`）— open the menu first
    // via its trigger（Task 4 capture.mjs 验证的打开路径）.
    await page.getByTestId('btn-menu-toggle').click();
    await expect(page.getByTestId('btn-project-new')).toBeVisible();
    // openNewProjectDialog：从 tests/e2e/new-project-dialog.spec.ts:24 原样复制
    await openNewProjectDialog(page);
    await expect(page).toHaveScreenshot('surface-03-new-project-dialog.png', OPTS);
  });

  test('surface-04 ScriptPanel（保暗 chrome）', async ({ page }) => {
    // ScriptPanel 打开步骤：从 tests/e2e/script-panel.spec.ts 复制
    // （waitForHeader → waitForAppReady 超集替换；store 路径修正见文件头 2）.
    await installApiStub(page);
    await page.goto('/');
    await waitForAppReady(page);
    // 源 spec 的第二段 addInitScript + reload 在此省略：installApiStub
    // 已是同款 stub 的超集（另含 getAppVersion / getFeatureFlags）。
    // 保留二次覆盖反而把 getAppVersion 抹掉 → header 退化为「v ?」
    // （run-3 实测；Task 4 参考帧为 1.11.2-e2e）。
    await untilSettled(page, () => resetStores(page));

    // Click the Scripts toggle to mount the panel（原样复制 openScriptPanel）.
    await page.getByTestId('btn-scripts-toggle').click();
    await expect(page.getByTestId('script-panel')).toBeVisible({ timeout: 5_000 });

    // Verify the fixture row is visible in the library（原样复制）.
    const row = page.getByTestId(`script-row-${FIXTURE_SCRIPT.id}`);
    await expect(row).toBeVisible({ timeout: 5_000 });

    // Click the row → editor populates with source（原样复制）.
    await row.click();
    await expect(page.getByTestId('script-editor')).toBeVisible();
    await expect(page).toHaveScreenshot('surface-04-script-panel.png', OPTS);
  });

  test('surface-05 RemoveModuleConfirmDialog（反转组件）', async ({ page }) => {
    // 触发步骤：从 tests/e2e/remove-bswmd.spec.ts 复制（resetStore +
    // seedProjectWithDep + × 按钮 sanity + remove-deps 断言链）。
    // dev harness 中 × 点击静默无框（现实修正 4）——复用 Task 4 验证的
    // 模块级 API confirmRemoveBswmd() 挂载同一对话框，参数即源用例
    // 断言的依赖文档。
    await installApiStub(page);
    await page.goto('/');
    await waitForAppReady(page);
    await untilSettled(page, () => resetStore(page));

    const bswmdPath = '/tmp/e2e-p4/Can_Bswmd.arxml';
    const docPath = '/tmp/e2e-p4/Can_Cfg.arxml';
    await seedProjectWithDep(page);

    // Sanity: the seeded BSWMD row is rendered with the × button（原样复制）.
    const removeBtn = page.getByTestId(`project-panel-bswmd-remove-${bswmdPath}`);
    await expect(removeBtn).toBeVisible();

    // Mount the 4-option dialog through its real module-level API（同
    // useProjectActions.removeBswmdWithFullFlow 的调用形状；probe4 已验证）.
    await page.evaluate(
      async ({ path, docPath: d }: { path: string; docPath: string }) => {
        const m = await import(/* @vite-ignore */ path);
        void m.confirmRemoveBswmd({
          targetShortName: 'Can_Bswmd.arxml',
          dependents: [{ filePath: d }],
        });
      },
      { path: REMOVE_DIALOG_PATH, docPath },
    );

    // removeOpen 断言链（原样复制自 remove-bswmd.spec.ts）.
    await expect(page.getByTestId('remove-overlay')).toBeVisible();
    await expect(page.getByTestId('remove-deps')).toBeVisible();
    await expect(page.getByTestId('remove-dep-item').first()).toContainText(docPath);
    await expect(page.getByTestId('remove-cancel')).toBeVisible();
    await expect(page.getByTestId('remove-only')).toBeVisible();
    await expect(page.getByTestId('remove-cascade')).toBeVisible();
    await expect(page.getByTestId('remove-cascadeAndUnlink')).toBeVisible();
    await expect(page).toHaveScreenshot('surface-05-remove-module-confirm.png', OPTS);
  });

  test('surface-06 delete-ecuc ConfirmDialog（反转组件）', async ({ page }) => {
    // 触发步骤：从 tests/e2e/delete-ecuc-module.spec.ts 复制（installApiMock
    // → installApiStub、resetStore、seedSourceBackedProject）；右键触发
    // 链（chevron 展开 → context-menu → delete-module → confirm-overlay）
    // 为 Task 4 capture.mjs 验证的同款步骤。
    await installApiStub(page);
    await page.goto('/');
    await waitForAppReady(page);
    await untilSettled(page, () => resetStore(page));

    const bswmdPath = '/tmp/e2e-delete-module/Adc_Bswmd.arxml';
    const docPath = '/tmp/e2e-delete-module/Adc_Cfg.arxml';
    await seedSourceBackedProject(page, bswmdPath, docPath);

    // guardedDirtySwitch only routes 'delete-module' through the
    // ConfirmDialog when the doc is dirty（capture.mjs surface-06 同款）.
    await page.evaluate(
      async ({ path, docPath: d }: { path: string; docPath: string }) => {
        const mod = await import(/* @vite-ignore */ path);
        const { useArxmlStore } = mod;
        useArxmlStore.setState({ dirtyPaths: new Set([d]) });
      },
      { path: ARXML_STORE_PATH, docPath },
    );

    // Expand the package so the module row mounts, then right-click it.
    await expect(page.getByTestId('treeitem-/Adc')).toBeVisible();
    await page.getByTestId('chevron-/Adc').click();
    const treeItem = page.getByTestId('treeitem-/Adc/Adc');
    await expect(treeItem).toBeVisible();
    await treeItem.click({ button: 'right' });
    await expect(page.getByTestId('context-menu')).toBeVisible();
    await page.getByTestId('context-menu-item-delete-module').click();
    await expect(page.getByTestId('confirm-overlay')).toBeVisible();
    await expect(page).toHaveScreenshot('surface-06-confirm-dialog.png', OPTS);
  });
});
