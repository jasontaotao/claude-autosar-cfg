# Sprint 16 — Bug Fixes + UX Polish Bundle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve user-reported issues found during E2E flow (BSWMD → ECUC generate → edit → save → reopen). Mix of real bugs and missing UX features. Shipped incrementally across two batches:

- **Sprint 16a** — original 5 fixes (T1-T5), all shipped on `a227220`
- **Sprint 16b** — follow-ups: T6 (project reopen bug) + T7 (Save All button)

**Architecture:**
- 1 store refactor: `buildCombinedDocument` adds smart collision detection; `findByPathMultiDoc` + `stripCombinedPrefix` accept unprefixed paths as fallback (T1)
- 1 IPC contract extension: `SaveArxmlRequest` gains optional `currentPath`; `SAVE_ARXML` handler skips dialog when present (T2)
- 1 type widening: `ParamValue` gains optional `definitionRef`; skeleton fills it; serializer prefers it; `applyParamUpdate` preserves it (T3)
- 1 naming change: `resolveCollisionFilename` switches `_Cfg.arxml` → `_EcucValues.arxml` (back-compat: old files still load) (T4)
- 1 new feature: `ModuleFromBswmdPicker` becomes set-semantic (diff add/remove on confirm); new `useRemoveEcucFiles` hook + dirty-guard (T5)
- 1 manifest round-trip fix: `projectSyncAddPath` / `projectSyncRemovePath` relativize via new `shared/path.ts#toManifestRelative` helper (T6)
- 1 new toolbar button: `btn-save-all` loops `dirtyPaths` and silent-saves each via T2 mechanism (T7)

**Tech Stack:** unchanged (Electron 30 + TypeScript 5 strict + React 18 + Zustand 4 + fast-xml-parser 4 + Vitest 1 + Playwright 1.45 + tailwind 3)

---

## 起点状态 (2026-06-19, post-Sprint 16a)

| 项 | 状态 |
|---|---|
| `local HEAD` | `a227220` (Sprint 16a 完成, branch `feature/sprint-16-fixes`) |
| Working tree | clean (T6/T7 起点) |
| Tests baseline | 1134 passed / 0 fail / 1 skipped |
| Typecheck | 0 errors |
| branch for Sprint 16b | `feature/sprint-16-fixes` from `a227220`（不切新分支，延续） |

---

## Conventions

- **TDD**: write failing test first, then minimal impl
- **Coverage floor**: ≥ 80% (project); pure helpers aim ≥ 95%
- **i18n parity**: every new key must have zh-CN + en entries
- **Commit format**: `fix(scope): ...` / `feat(scope): ...` / `test(scope): ...`
- **No `any`** in production code; tests may use `as any` for fixtures
- **Immutability**: helpers return new objects; never mutate inputs
- **One commit per task minimum**; bigger tasks split into sub-commits

---

## Issue list (user-reported, 2026-06-19)

| # | Issue | Layer | Symptom |
|---|---|---|---|
| 1 | Combined tree shows redundant `xxxCfg.arxml package` wrapper | renderer store + tree | Noise above every module when ≥1 ARXML loaded |
| 2 | `SAVE_ARXML` always pops save-as dialog; never silent-writes back | main IPC + renderer | Can't save edited ECUC cleanly |
| 3 | Generated ECUC writes `DEFINITION-REF = /__synthesized__/<paramShortName>` | core arxml | Placeholder path; vendor tools reject |
| 4 | Generated ECUC filename `<Module>_Cfg.arxml` not standard | core arxml | Naming convention mismatch |
| 5 | Picker "uncheck module" has no effect — module stays in tree | renderer hook + store | Missing set-semantic exclude flow |

---

## Sprint ordering

```
T1 (combined-view skip)
   ↓
T2 (save-bug silent save)
   ↓
T3 (DEFINITION-REF real path)
   ↓
T4 (file naming _EcucValues)
   ↓
T5 (picker unexclude with dirty-guard)
```

T1 is greenlit (user said "先不要排plan" before this plan was written — they wanted execution without ceremony). T2-T5 land in the same sprint but each gets its own task.

---

### Task 1: Combined-view smart basename wrapper skip

**Files:**
- Modify: `src/renderer/store/useArxmlStore.ts:1493-1526` (`buildCombinedDocument`)
- Modify: `src/core/arxml/path.ts:132-163` (`findByPathMultiDoc`)
- Modify: `src/renderer/store/useArxmlStore.ts:1572-1582` (`stripCombinedPrefix`)
- Test: `src/renderer/store/__tests__/useArxmlStore.combined.test.ts` (extend)
- Test: `src/core/arxml/__tests__/path.test.ts` (extend)

- [ ] **Step 1.1: Write failing test for collision detection**

  Add to `useArxmlStore.combined.test.ts`:
  ```ts
  it('combined mode: single file skips basename wrapper', () => {
    const store = useArxmlStore.getState();
    store.setDoc(makeDoc('/tmp/Can.arxml', 'Can', 'CanConfig'), '/tmp/Can.arxml');
    useArxmlStore.getState().setViewMode('combined');
    const next = useArxmlStore.getState();
    if (next.displayDoc === null) throw new Error('expected displayDoc');
    // Single file → no ambiguity → no basename wrapper; packages are
    // the doc's own root packages.
    expect(next.displayDoc.packages.map((p) => p.shortName)).toEqual(['EAS']);
  });

  it('combined mode: 2 files with unique modules skip basename wrapper', () => {
    const store = useArxmlStore.getState();
    store.setDoc(makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig'), '/tmp/Adc.arxml');
    store.addDocument(makeDoc('/tmp/Can.arxml', 'Can', 'CanConfig'), '/tmp/Can.arxml');
    useArxmlStore.getState().setViewMode('combined');
    const next = useArxmlStore.getState();
    if (next.displayDoc === null) throw new Error('expected displayDoc');
    // No module-shortName collision → no basename wrapper.
    expect(next.displayDoc.packages.map((p) => p.shortName)).toEqual(['EAS']);
  });

  it('combined mode: 2 files sharing module shortName keep basename wrapper', () => {
    const store = useArxmlStore.getState();
    store.setDoc(makeDoc('/a/Can.arxml', 'Can', 'A'), '/a/Can.arxml');
    store.addDocument(makeDoc('/b/Can.arxml', 'Can', 'B'), '/b/Can.arxml');
    useArxmlStore.getState().setViewMode('combined');
    const next = useArxmlStore.getState();
    if (next.displayDoc === null) throw new Error('expected displayDoc');
    // Module shortName collision → basename wrapper required.
    expect(next.displayDoc.packages.map((p) => p.shortName).sort())
      .toEqual(['Can.arxml', '[doc:1]']);
  });
  ```

  Update existing test "setViewMode("combined") synthesises..." — its assertion
  about `[Adc.arxml, Can.arxml]` no longer holds when modules are unique. Replace
  with the new flat expectation.

- [ ] **Step 1.2: Write failing test for `findByPathMultiDoc` fallback**

  Add to `path.test.ts`:
  ```ts
  it('findByPathMultiDoc falls back to per-doc lookup when no basename prefix', () => {
    // In flat (no-wrapper) mode, paths are unprefixed. findByPathMultiDoc
    // must locate the source doc by trying each doc in sequence.
    const docs = [buildAdcDoc(), buildCanDoc()];
    const paths = ['/tmp/Adc.arxml', '/tmp/Can.arxml'];
    const found = findByPathMultiDoc(docs, paths, '/EAS/Can/CanConfigSet');
    expect(found?.filePath).toBe('/tmp/Can.arxml');
    expect(found?.element.shortName).toBe('CanConfigSet');
  });

  it('findByPathMultiDoc flat-mode returns null when no doc contains the path', () => {
    const docs = [buildCanDoc()];
    const paths = ['/tmp/Can.arxml'];
    expect(findByPathMultiDoc(docs, paths, '/EAS/Adc/AdcConfigSet')).toBeNull();
  });
  ```

- [ ] **Step 1.3: Implement collision detection in `buildCombinedDocument`**

  Refactor `buildCombinedDocument` to:
  1. Compute `moduleShortNamesByDoc: Map<docIdx, Set<string>>` by walking each doc's root packages' module elements
  2. Compute `basenamesByFilePath: string[]`
  3. `hasCollision = any module shortName appears in 2+ docs OR any basename appears 2+ times`
  4. If no collision: return flat display doc with `packages: documents.flatMap(d => d.packages)` (paths unchanged)
  5. If collision: existing wrapping logic (rename `wrapPackageUnderSegment` etc. to `wrapPackageUnderSegmentWrapped` for clarity; keep behaviour)

  Add helper `detectCombinedCollision(documents, filePaths): boolean` to keep `buildCombinedDocument` readable.

- [ ] **Step 1.4: Implement `findByPathMultiDoc` fallback**

  In `src/core/arxml/path.ts:132-163`, after the existing prefix-matching block, add:
  ```ts
  // Flat-mode fallback: when no doc's basename or [doc:N] matches the
  // head segment, the combined view is using flat paths (no wrapper).
  // Try every doc in turn with the raw path; first hit wins.
  for (let i = 0; i < docs.length; i += 1) {
    const doc = docs[i];
    const filePath = filePaths[i];
    if (doc === undefined || filePath === undefined) continue;
    const found = findByPath(doc, combinedPath);
    if (found !== null) {
      return { doc, filePath, pkg: found.pkg, element: found.element };
    }
  }
  return null;
  ```

- [ ] **Step 1.5: Update `stripCombinedPrefix` for flat mode**

  In `useArxmlStore.ts:1572-1582`, change:
  ```ts
  function stripCombinedPrefix(combinedPath, sourceFilePath): string | null {
    const segments = combinedPath.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    const [head, ...rest] = segments;
    if (head === undefined) return null;
    if (head === lastSegment(sourceFilePath) || /^\[doc:\d+\]$/.test(head)) {
      return `/${rest.join('/')}`;
    }
    // Flat mode: head doesn't match this source's prefix — return
    // the path verbatim (it's already the inner path).
    return combinedPath;
  }
  ```

- [ ] **Step 1.6: Run tests + coverage**

  ```bash
  cd D:/claude_proj2/claude-AutosarCfg
  npx vitest run src/renderer/store/__tests__/useArxmlStore.combined.test.ts src/core/arxml/__tests__/path.test.ts
  ```

  Expect all green. Coverage must remain ≥ 80%.

- [ ] **Step 1.7: Commit**

  ```bash
  git add src/renderer/store/useArxmlStore.ts src/core/arxml/path.ts \
          src/renderer/store/__tests__/useArxmlStore.combined.test.ts \
          src/core/arxml/__tests__/path.test.ts
  git commit -m "fix(tree): skip basename wrapper in combined view when no ambiguity

  Single-file or unique-module-shortsName cases no longer render the
  per-file '<filename> package' wrapper above each module. Collisions
  (same basename or same module shortName across files) keep the
  wrapper for disambiguation. findByPathMultiDoc + stripCombinedPrefix
  accept unprefixed paths as a fallback."
  ```

---

### Task 2: Silent save-back when `currentPath` is known

**Files:**
- Modify: `src/shared/types.ts:84-87` (extend `SaveArxmlRequest`)
- Modify: `src/main/ipc/register.ts:160-192` (`SAVE_ARXML` handler)
- Modify: `src/renderer/components/AppHeader.tsx:215-233` (`onSave`)
- Test: `src/main/ipc/__tests__/…` (new or extend existing `SAVE_ARXML` test)
- Test: `src/renderer/components/__tests__/AppHeader.test.tsx` (extend)

- [ ] **Step 2.1: Write failing test for `SAVE_ARXML` silent path**

  Add a test that calls the handler with `currentPath: '/tmp/X.arxml'` and asserts:
  - `dialog.showSaveDialog` is NOT invoked
  - `fs.writeFile` is called with that path
  - Result is `{ ok: true, value: { canceled: false, path: '/tmp/X.arxml' } }`

- [ ] **Step 2.2: Extend `SaveArxmlRequest`**

  ```ts
  export interface SaveArxmlRequest {
    readonly doc: ArxmlDocument;
    readonly defaultName?: string;
    readonly currentPath?: string;   // ← new; when present, skip dialog
  }
  ```

- [ ] **Step 2.3: Modify `SAVE_ARXML` handler**

  In `register.ts:160-192`:
  ```ts
  ipcMain.handle(IPC_CHANNELS.SAVE_ARXML, async (_evt, req) => {
    const defaultName = req.defaultName ?? 'untitled.arxml';
    let targetPath: string | null = null;

    // Sprint 16 — silent save-back when caller knows the on-disk path.
    if (req.currentPath !== undefined && req.currentPath !== '') {
      targetPath = req.currentPath;
    } else {
      const result = await dialog.showSaveDialog({
        title: 'Save ARXML',
        defaultPath: defaultName,
        filters: [{ name: 'ARXML', extensions: ['arxml'] }],
      });
      if (result.canceled || result.filePath === undefined) {
        return { ok: true, value: { canceled: true } };
      }
      targetPath = result.filePath;
    }

    const serialized = serializeArxml(req.doc);
    if (!serialized.ok) {
      return { ok: false, error: { kind: 'write-failed', message: serialized.error.message } };
    }
    try {
      await fs.writeFile(targetPath, serialized.value, 'utf8');
      return { ok: true, value: { canceled: false, path: targetPath } };
    } catch (e) {
      return { ok: false, error: { kind: 'write-failed', message: e instanceof Error ? e.message : String(e) } };
    }
  });
  ```

- [ ] **Step 2.4: Update `onSave` in `AppHeader.tsx:215`**

  ```ts
  const saved = await window.autosarApi.saveArxml({
    doc,
    defaultName,
    currentPath: filePath ?? undefined,   // ← new
  });
  ```

- [ ] **Step 2.5: Add AppHeader test**

  Verify that when `filePath` is set and `isActiveDirty` is true, `saveArxml` is called with `currentPath: filePath`.

- [ ] **Step 2.6: Run tests + commit**

  ```bash
  git commit -m "fix(save): silent save-back when currentPath known

  Saves a dirty ECUC back to its on-disk path without the OS save-as
  dialog. Falls back to the dialog only when currentPath is missing
  (e.g. brand-new untitled doc)."
  ```

---

### Task 3: `DEFINITION-REF` real BSWMD path (drop `__synthesized__/`)

**Files:**
- Modify: `src/core/arxml/types.ts:77-83` (extend `ParamValue` variants)
- Modify: `src/core/arxml/skeleton.ts:132-145` (carry `definitionRef` in `buildTopContainer`)
- Modify: `src/core/arxml/serializer.ts:289-298, 300-318` (prefer `value.definitionRef`)
- Modify: `src/renderer/store/useArxmlStore.ts:1360` (`applyParamUpdate`) — preserve `definitionRef`
- Test: `src/core/arxml/__tests__/serializer.test.ts` (extend)
- Test: `src/core/arxml/__tests__/skeleton.test.ts` (extend)
- Test: `src/renderer/store/__tests__/round-trip-mutate.test.ts` (extend)

- [ ] **Step 3.1: Write failing test for skeleton carrying definitionRef**

  ```ts
  it('skeleton fills params with definitionRef from BSWMD path', () => {
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const param = skel.packages[0]?.elements[0]?.params.CanIfSupport;
    expect(param).toEqual({
      type: 'integer',
      value: 0,
      definitionRef: '/AUTOSAR/EcucDefs/Can/CanConfigSet/CanIfSupport',
    });
  });
  ```

- [ ] **Step 3.2: Extend `ParamValue`**

  Each variant gains `readonly definitionRef?: string`:
  ```ts
  export type ParamValue =
    | { readonly type: 'string'; readonly value: string; readonly definitionRef?: string }
    | { readonly type: 'integer'; readonly value: number; readonly definitionRef?: string }
    | { readonly type: 'float'; readonly value: number; readonly definitionRef?: string }
    | { readonly type: 'boolean'; readonly value: boolean; readonly definitionRef?: string }
    | { readonly type: 'enum'; readonly value: string; readonly definitionRef?: string }
    | { readonly type: 'reference'; readonly value: string; readonly dest?: string; readonly definitionRef?: string };
  ```

- [ ] **Step 3.3: Update `buildTopContainer` in `skeleton.ts:132-145`**

  When `buildDefaultValue(p)` returns a value, attach `definitionRef: p.path`:
  ```ts
  const v = buildDefaultValue(p);
  if (v !== null) {
    params[p.shortName] = { ...v, definitionRef: p.path };
    continue;
  }
  // For text-shaped fallbacks (empty enum/string), still attach the path:
  if (p.kind === 'enumeration') {
    params[p.shortName] = { type: 'enum', value: '', definitionRef: p.path };
  } else if (p.kind === 'string' || p.kind === 'function-name') {
    params[p.shortName] = { type: 'string', value: '', definitionRef: p.path };
  }
  ```

- [ ] **Step 3.4: Update `applyParamUpdate` in `useArxmlStore.ts:1360`**

  When replacing a param, preserve the existing `definitionRef`:
  ```ts
  const nextValue = existingValue.definitionRef !== undefined
    ? { ...newValue, definitionRef: existingValue.definitionRef }
    : newValue;
  ```

- [ ] **Step 3.5: Update serializer `renderRegularParam` + `renderReferenceParam`**

  In `serializer.ts:289-298`:
  ```ts
  const refPath = value.definitionRef ?? `/__synthesized__/${defName}`;
  return {
    [wrapperTag]: {
      'DEFINITION-REF': { '@_DEST': paramDefType, '#text': refPath },
      VALUE: value.value,
    },
  };
  ```

  Same for `renderReferenceParam` (serializer.ts:300-318).

- [ ] **Step 3.6: Run tests + commit**

  ```bash
  git commit -m "fix(arxml): write real BSWMD definition path in DEFINITION-REF

  Skeleton now carries the BSWMD-side path on every default-filled
  param. applyParamUpdate preserves the existing definitionRef when
  the user edits. Serializer prefers value.definitionRef, falling back
  to the existing '/__synthesized__/<shortName>' placeholder for
  manually-imported ARXML where no BSWMD is in scope.

  Closes: vendortool-rejects-on-import (EB tresos / Vector / ETAS
  were refusing our generated ECUC because DEFINITION-REF did not
  resolve)."
  ```

---

### Task 4: Filename `<Module>_Cfg.arxml` → `<Module>_EcucValues.arxml`

**Files:**
- Modify: `src/core/arxml/skeleton.ts:229, 247, 258` (3 template literals in `resolveCollisionFilename`)
- Test: 6 test fixtures with `_Cfg.arxml` (see grep at `__tests__/skeleton.test.ts`, `useCreateEcucFromBswmd.test.tsx`, `useProjectActions.s14.test.ts`, `useArxmlStore.s14.test.ts`, `ParamEditor.test.tsx`, `shared/__tests__/types.test.ts`)

- [ ] **Step 4.1: Write failing test for new naming**

  ```ts
  it('resolveCollisionFilename produces _EcucValues.arxml (no collision)', () => {
    const map = resolveCollisionFilename(
      [{ bswmdPath: '/BSWMD/Can.arxml', moduleShortName: 'Can' }],
      '/proj',
    );
    expect(map.get('/BSWMD/Can.arxml::Can')).toBe('/proj/ecuc/Can_EcucValues.arxml');
  });

  it('resolveCollisionFilename produces _EcucValues.arxml (with vendor collision)', () => {
    const map = resolveCollisionFilename(
      [
        { bswmdPath: '/BSWMD/Can_v1.arxml', moduleShortName: 'Can' },
        { bswmdPath: '/BSWMD/Can_v2.arxml', moduleShortName: 'Can' },
      ],
      '/proj',
    );
    expect(map.get('/BSWMD/Can_v1.arxml::Can')).toBe('/proj/ecuc/Can_EcucValues.arxml');
    expect(map.get('/BSWMD/Can_v2.arxml::Can')).toBe('/proj/ecuc/Can__can_v2_EcucValues.arxml');
  });
  ```

- [ ] **Step 4.2: Update `resolveCollisionFilename`**

  Replace `_Cfg` with `_EcucValues` in the 3 template literals at lines 229, 247, 258 of `skeleton.ts`. Update the docstring at lines 18, 178-188 accordingly.

- [ ] **Step 4.3: Update existing fixtures in 6 test files**

  Use `replace_all: true` semantics to swap `_Cfg.arxml` → `_EcucValues.arxml` across:
  - `src/core/arxml/__tests__/skeleton.test.ts` (5 occurrences)
  - `src/renderer/hooks/__tests__/useCreateEcucFromBswmd.test.tsx` (8 occurrences)
  - `src/renderer/hooks/__tests__/useProjectActions.s14.test.ts` (6 occurrences)
  - `src/renderer/store/__tests__/useArxmlStore.s14.test.ts` (5 occurrences)
  - `src/renderer/components/editor/__tests__/ParamEditor.test.tsx` (2 occurrences)
  - `src/shared/__tests__/types.test.ts` (1 occurrence)

- [ ] **Step 4.4: Run all tests + commit**

  ```bash
  npx vitest run
  git commit -m "refactor(arxml): rename ECUC files to <Module>_EcucValues.arxml

  Matches AUTOSAR TPS_StandardizationTemplate convention (plural
  'EcucValues') and the existing parser.test.ts fixture naming.
  Backward-compatible: pre-existing _Cfg.arxml files in user
  projects continue to load and edit; only newly generated files
  use the new suffix."
  ```

---

### Task 5: Picker "uncheck module" excludes ECUC from project (set semantics + dirty-guard)

**Files:**
- Modify: `src/renderer/components/ModuleFromBswmdPicker.tsx` (compute existing picks, pre-seed `selected`, drive onConfirm with diff)
- New hook: `src/renderer/hooks/useRemoveEcucFiles.ts` (orchestrates diff-delete + dirty-guard)
- Modify: `src/renderer/components/App.tsx` (wire onConfirm to new behaviour)
- Modify: `src/shared/i18n.ts` (new keys: `ecuc.exclude.*`, `confirm.unsaved.message.excludeEcuc`, `confirm.unsaved.discard.excludeEcuc`, `confirm.unsaved.saveAndExcludeEcuc`)
- Test: `useRemoveEcucFiles.test.tsx` (new)
- Test: `ModuleFromBswmdPicker.test.tsx` (extend with existing-picks pre-seed + diff flow)

- [ ] **Step 5.1: Spec the dirty-guard axis**

  Extend `SwitchingAction` in `useProjectActions.ts:116` with `'excludeEcuc'` and the matching `'excludeEcuc'` axis in `toI18nAxis`. ConfirmDialog props reuse the existing discard/save-and-X layout, swapping `target` to `{moduleShortName} of {bswmdBasename}`.

- [ ] **Step 5.2: Write failing test for `useRemoveEcucFiles`**

  ```ts
  it('useRemoveEcucFiles removes clean ECUCs without dialog', async () => {
    // Setup: store has 1 doc + clean dirtyPaths
    // Action: removeEcucFiles([{bswmdPath, moduleShortName}])
    // Expect: deleteArxml IPC fired; removeDocument called; no dialog
  });

  it('useRemoveEcucFiles with dirty target opens confirm dialog', async () => {
    // Setup: doc is dirty
    // Action: removeEcucFiles(...)
    // Expect: confirm dialog open; no IPC; on user "discard" → delete + removeDocument
    // Expect: on user "save" → save silently (using task #2 fix) → delete + removeDocument
    // Expect: on user "cancel" → no-op
  });

  it('useRemoveEcucFiles partial failure continues with the rest', async () => {
    // Setup: 3 ECUCs; deleteArxml returns ok, ok, write-failed
    // Expect: first 2 removed; last stays in store + error surfaced
  });
  ```

- [ ] **Step 5.3: Implement `useRemoveEcucFiles` hook**

  ```ts
  export function useRemoveEcucFiles(): {
    readonly remove: (picks: readonly PickedModule[]) => Promise<RemoveResult>;
  };

  // Behaviour:
  // 1. Compute targetFilePaths from current store: for each (bswmdPath, moduleShortName),
  //    find doc where doc.sourceBswmdPath === bswmdPath AND doc.packages[0].elements[0].shortName === moduleShortName
  // 2. For each target, check dirtyPaths; if any dirty, open ConfirmDialog with action='excludeEcuc'
  //    - on "save": silent-save via task #2 fix, then proceed
  //    - on "discard": proceed
  //    - on "cancel": abort entire batch
  // 3. For each proceed target: deleteArxml IPC + removeDocument store action
  // 4. Return { kind: 'ok' | 'partial' | 'error', removed, failed }
  ```

- [ ] **Step 5.4: Modify `ModuleFromBswmdPicker` for set semantics**

  - Read `useArxmlStore.documents` and `documentPaths` to compute `existingPicks`
  - Initial `selected` Set seeds with `existingPicks`
  - `onConfirm(picks)` is the **new** picks (after user toggled); diff against existingPicks:
    - `toAdd = picks - existingPicks` → call existing `useCreateEcucFromBswmd.create()`
    - `toRemove = existingPicks - picks` → call new `useRemoveEcucFiles.remove()`
  - Show 2 sections in right pane: "Will create (N)" + "Will remove (M)" + dirty-guard hint

- [ ] **Step 5.5: i18n keys**

  Add zh-CN + en entries:
  - `ecuc.fromBswmd.willRemove` (count placeholder)
  - `ecuc.fromBswmd.removeN` (count placeholder)
  - `ecuc.fromBswmd.dirtyHint` (explanation when excludes have unsaved changes)
  - `confirm.unsaved.message.excludeEcuc` ({name} {target})
  - `confirm.unsaved.discard.excludeEcuc`
  - `confirm.unsaved.saveAndNew.excludeEcuc`

- [ ] **Step 5.6: Run tests + commit**

  ```bash
  git commit -m "feat(picker): set-semantic exclude with dirty-guard

  ModuleFromBswmdPicker now pre-seeds its checkbox set from the
  project's existing ECUC instances. Confirm computes a diff:
  newly-checked modules → generate via existing BSWMD-to-ECUC path;
  newly-unchecked modules → delete from disk + removeDocument.
  Excludes that have unsaved parameter changes route through the
  existing SwitchingAction confirm dialog (save / discard / cancel)
  so dirty data isn't lost silently."
  ```

---

## Cross-cutting verification

- [ ] Final: full test run (`npx vitest run`)
- [ ] Final: typecheck (`pnpm tsc --noEmit --incremental`)
- [ ] Final: lint (`pnpm lint`) — must be 0 errors
- [ ] Final: coverage report (`pnpm coverage`) — must remain ≥ 80% stmts / 80% branches
- [ ] Final: manual smoke
  - Open BSWMD → generate Can_EcucValues.arxml → tree shows module, NO basename wrapper
  - Edit param → click 保存 → file silently written (no dialog)
  - Inspect DEFINITION-REF in saved file → starts with `/AUTOSAR/EcucDefs/` or `/EAS/...`, NOT `/__synthesized__/`
  - Reopen picker → Can checkbox pre-checked → uncheck Can → confirm → file deleted + tree empties
  - **T6**: Open BSWMD → generate ECUC → Save Project → close → reopen → project loads cleanly with ECUC docs restored
  - **T7**: Have 3 dirty ECUCs (edit params in each) → click 全部保存 → all 3 files written, dirty cleared, toast "已保存 3 个文件"

## Done criteria

- **Sprint 16a** (T1-T5, 5 commits): shipped on `a227220` ✅
- **Sprint 16b** (T6-T7, 2 commits): ~5 file changes, ~5 new tests
- 0 lint errors; 0 type errors
- Coverage ≥ 80% stmts / ≥ 80% branches
- HEAD on `feature/sprint-16-fixes` ready for review

---

# Sprint 16b — Project round-trip + Save All

Two follow-ups identified after the original 5 shipped. Both real bugs/UX gaps surfaced by the user during E2E.

## Issue list (16b)

| # | Issue | Layer | Symptom |
|---|---|---|---|
| 6 | Project reopen fails after BSWMD-to-ECUC generation | renderer store + manifest | `Manifest invalid: absolute path`; user can't reopen saved project |
| 7 | Save All button missing | renderer AppHeader | dirty 5 ECUCs requires 5 individual Save clicks |

---

### Task 6: Project reopen after BSWMD-to-ECUC (abs → rel path round-trip)

**Files:**
- Modify: `src/shared/path.ts` (add `dirname` + `toManifestRelative`)
- Modify: `src/renderer/store/useArxmlStore.ts` (`projectSyncAddPath` / `projectSyncRemovePath` + their 4 call sites)
- Test: `src/shared/__tests__/path.test.ts` (new helpers)
- Test: `src/renderer/store/__tests__/useArxmlStore.project.test.ts` (end-to-end addDoc → saveManifest → loadManifest)

- [ ] **Step 6.1: Write failing end-to-end test**

  ```ts
  // In useArxmlStore.project.test.ts
  it('T6: addDocument + saveManifest + loadManifest round-trip succeeds with relative paths', async () => {
    // 1. Project open at D:/proj/MyProj.autosarcfg.json
    // 2. addDocument with absolute filePath D:/proj/ecuc/Can_EcucValues.arxml
    // 3. project.valueArxmlPaths must contain the RELATIVE form
    //    './ecuc/Can_EcucValues.arxml', NOT the absolute
    // 4. saveManifest(...) → loadManifest(...) round-trip accepts (no 'absolute' error)
  });

  it('T6: removeDocument removes the relative entry when given an absolute filePath', () => {
    // When user removes a doc by absolute filePath, the manifest's
    // relative entry must also be removed (not just the in-memory doc).
  });

  it('T6: cross-drive addDocument leaves path unchanged + manifest rejects on save', () => {
    // Edge: filePath on a different Windows drive than manifestDir
    // can't be relativized. Document the behavior — keep absolute,
    // save will fail loud. (User picks this scenario by hand; rare.)
  });
  ```

- [ ] **Step 6.2: Write failing test for `toManifestRelative`**

  ```ts
  // In shared/__tests__/path.test.ts
  describe('toManifestRelative', () => {
    it('POSIX: /proj + /proj/ecuc/X.arxml → ecuc/X.arxml', () => {...});
    it('Windows: D:\\proj + D:\\proj\\ecuc\\X.arxml → ecuc/X.arxml', () => {...});
    it('already-relative: passes through unchanged', () => {...});
    it('cross-drive Windows: returns null', () => {...});
    it('POSIX: /a + /b (no shared prefix) → null', () => {...});
  });
  ```

- [ ] **Step 6.3: Implement `shared/path.ts` helpers**

  ```ts
  /** Portable dirname (no node:path; renderer-safe). */
  export function dirname(p: string): string {
    // Strip trailing separator, then everything after the last / or \
    const stripped = p.replace(/[\\/]+$/, '');
    const idx = stripped.search(/[\\/][^\\/]*$/);
    return idx >= 0 ? stripped.slice(0, idx) : '';
  }

  /**
   * Convert absolute filePath to manifest-relative (POSIX separators).
   * Returns null when the file lives outside manifestDir (different
   * drive on Windows, no shared prefix on POSIX).
   */
  export function toManifestRelative(
    manifestDir: string, filePath: string,
  ): string | null {
    if (filePath === '') return null;
    // Normalise separators
    const normDir = manifestDir.replace(/\\/g, '/');
    const normFile = filePath.replace(/\\/g, '/');
    // Drive letter check
    const dirDrive = normDir.match(/^([A-Za-z]:)/)?.[1]?.toLowerCase();
    const fileDrive = normFile.match(/^([A-Za-z]:)/)?.[1]?.toLowerCase();
    if (dirDrive !== undefined || fileDrive !== undefined) {
      if (dirDrive === undefined || fileDrive === undefined) return null;
      if (dirDrive !== fileDrive) return null;
    }
    // Strip drive from both for prefix comparison
    const dirNoDrive = dirDrive !== undefined ? normDir.slice(2) : normDir;
    const fileNoDrive = fileDrive !== undefined ? normFile.slice(2) : normFile;
    const dirNorm = dirNoDrive.replace(/\/+$/, '');
    if (fileNoDrive === dirNorm) return '.';
    if (fileNoDrive.startsWith(dirNorm + '/')) {
      return fileNoDrive.slice(dirNorm.length + 1);
    }
    return null;
  }
  ```

- [ ] **Step 6.4: Refactor `projectSyncAddPath` / `projectSyncRemovePath`**

  ```ts
  function projectSyncAddPath(
    m: ProjectManifest | null,
    filePath: string,
    manifestDir: string | null,
  ): ProjectManifest | null {
    if (m === null) return m;
    const rel = manifestDir !== null
      ? (toManifestRelative(manifestDir, filePath) ?? filePath)
      : filePath;
    if (m.valueArxmlPaths.includes(rel)) return m;
    return { ...m, valueArxmlPaths: [...m.valueArxmlPaths, rel] };
  }

  function projectSyncRemovePath(
    m: ProjectManifest | null,
    filePath: string,
    manifestDir: string | null,
  ): ProjectManifest | null {
    if (m === null) return m;
    const rel = manifestDir !== null
      ? (toManifestRelative(manifestDir, filePath) ?? filePath)
      : filePath;
    if (!m.valueArxmlPaths.includes(rel) && !m.valueArxmlPaths.includes(filePath)) {
      return m;
    }
    return {
      ...m,
      valueArxmlPaths: m.valueArxmlPaths.filter(
        (p) => p !== rel && p !== filePath,
      ),
    };
  }
  ```

- [ ] **Step 6.5: Update 4 call sites in useArxmlStore.ts**

  - `addDocument` (line 388-419): pass `manifestDir = dirname(state.projectPath)`
  - `removeDocument` (line 421+): same
  - (other add/remove paths if any)

- [ ] **Step 6.6: Run all tests + typecheck + commit**

  ```bash
  npx vitest run
  npx tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/tsc-hook.tsbuildinfo
  git add -A src/
  git commit -m "fix(project): relativize paths before persisting to manifest

  addDocument and removeDocument now convert absolute filePaths
  to manifest-relative POSIX paths before storing them in
  project.valueArxmlPaths. Manifest spec requires relative paths
  (classifyBadPath rejects absolute); previously generated
  manifests failed loadManifest on reopen with 'absolute' error.

  Adds shared/path.ts#toManifestRelative + dirname (portable,
  renderer-safe; no node:path). Updates projectSyncAddPath /
  projectSyncRemovePath to thread manifestDir. 4 call sites in
  useArxmlStore.ts updated.

  Tests: end-to-end addDoc → saveManifest → loadManifest round-trip
  in project.test.ts; new toManifestRelative cases in path.test.ts."
  ```

---

### Task 7: Save All toolbar button

**Files:**
- Modify: `src/renderer/components/AppHeader.tsx` (new `onSaveAll` + button + i18n)
- Modify: `src/shared/i18n.ts` (zh-CN + en)
- Test: `src/renderer/components/__tests__/AppHeader.test.tsx` (extend)

- [ ] **Step 7.1: Write failing test**

  ```ts
  it('Save All click silent-saves every dirty ECUC via currentPath', async () => {
    // 3 dirty docs with distinct filePaths → saveArxml called 3 times
    // each with currentPath === doc.path; markSaved called 3 times;
    // toast set to "已保存 3 个文件" / "Saved 3 files"
  });

  it('Save All is disabled when no doc is dirty', () => {
    // 0 dirty paths → button disabled
  });

  it('Save All surfaces partial-failure toast', async () => {
    // 2 dirty, second saveArxml returns ok:false → toast shows failure
  });
  ```

- [ ] **Step 7.2: Implement `onSaveAll`**

  ```ts
  const onSaveAll = async (): Promise<void> => {
    if (state.busy) return;
    const state = useArxmlStore.getState();
    const dirty = Array.from(state.dirtyPaths);
    if (dirty.length === 0) return;
    setState({ busy: true });
    setStoreError(null);
    let saved = 0;
    const failed: string[] = [];
    for (const path of dirty) {
      const doc = state.documents.find((d) => d.path === path);
      if (doc === undefined) continue;
      const r = await window.autosarApi.saveArxml({
        doc,
        defaultName: basename(path) || 'untitled.arxml',
        currentPath: path,
      });
      if (r.ok && !r.value.canceled) {
        useArxmlStore.getState().markSaved(r.value.path ?? path);
        saved += 1;
      } else if (!r.ok) {
        failed.push(r.error.message);
      }
    }
    setState({ busy: false });
    if (failed.length === 0) {
      setStoreError(t(locale, 'app.saveAllDone', { count: saved }));
    } else {
      setStoreError(
        t(locale, 'app.saveAllPartial', {
          saved, failed: failed.length, firstError: failed[0],
        }),
      );
    }
  };
  ```

- [ ] **Step 7.3: Toolbar button JSX**

  ```tsx
  <button
    type="button"
    onClick={onSaveAll}
    disabled={!canSaveAll}
    className={`app-btn app-btn-save-all ${dirtyPaths.size > 0 ? 'is-dirty' : ''}`}
    data-testid="btn-save-all"
    title={
      dirtyPaths.size > 0
        ? t(locale, 'app.saveAllDirtyTitle', { count: dirtyPaths.size })
        : t(locale, 'app.saveAllTitle')
    }
  >
    {dirtyPaths.size > 0
      ? t(locale, 'app.saveAllDirty', { count: dirtyPaths.size })
      : t(locale, 'app.saveAll')}
  </button>
  ```

  Placed immediately to the right of `btn-save` (the single-doc save button), per the user's "高频按钮常驻工具栏" principle.

- [ ] **Step 7.4: i18n keys (zh-CN + en)**

  - `app.saveAll` — `'全部保存'` / `'Save All'`
  - `app.saveAllDirty` — `'保存 {count} 个'` / `'Save {count}'`
  - `app.saveAllTitle` — `'保存所有未存的 ECUC'` / `'Save all unsaved ECUCs'`
  - `app.saveAllDirtyTitle` — `'{count} 个 ECUC 待保存'` / `'{count} ECUCs pending'`
  - `app.saveAllDone` — `'已保存 {count} 个文件'` / `'Saved {count} files'`
  - `app.saveAllPartial` — `'已保存 {saved} 个，{failed} 个失败：{firstError}'` / `'Saved {saved}, {failed} failed: {firstError}'`

- [ ] **Step 7.5: Wire `canSaveAll`**

  ```ts
  const canSaveAll = !state.busy && dirtyPaths.size > 0;
  ```

- [ ] **Step 7.6: Run tests + commit**

  ```bash
  git commit -m "feat(save): Save All button for multi-ECUC dirty sessions

  Toolbar btn-save-all sits next to btn-save. Loops every entry in
  store.dirtyPaths, calls saveArxml({ doc, currentPath }) per dirty
  doc (reuses T2 silent-save-back; no dialog), markSaved on success,
  collects failures. Toast reports success / partial / failure counts.

  Common case: BSWMD-to-ECUC generates N files, user edits params
  in several, then clicks 全部保存 once instead of N individual
  Save clicks.

  Tests: 3 AppHeader cases — happy path 3 dirty → 3 silent saves,
  button disabled when clean, partial-failure surfaces in toast."
  ```