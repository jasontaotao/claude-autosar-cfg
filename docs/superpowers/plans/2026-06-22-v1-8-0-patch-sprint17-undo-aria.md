# v1.8.0 PATCH — Sprint 17 Follow-up (Undo UI + ARIA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the orphan `undoLastRemoveBswmd` store action to a Toast action button and fix 2 ARIA-key cross-contamination bugs in BSWMD remove UI (ContextMenu aria-label + ProjectPanel × button key).

**Architecture:** Extend `ToastState` with an optional `action: { label, onActivate }` field (one-line type change). `ErrorBanner` renders the action button next to copy/dismiss. `useProjectActions.removeBswmdWithFullFlow`'s `'cascade-and-unlink'` success branch fires `setSuccess(message, 8000, { label, onActivate })`. `onActivate` reads `lastRemoveSnapshot` synchronously and only calls `undoLastRemoveBswmd` when the snapshot's path matches the captured path (stale-toast defense — prevents an old toast from undoing a different remove). ARIA fixes are straight key swaps: new `projectPanel.removeBswmdAria` i18n key replaces the reused `removeArxmlAria` on the BSWMD row × button; `mutation.action.removeModuleAria` (already declared but unused) gets wired onto the `ContextMenu` remove-module item.

**Tech Stack:** React 19 + TypeScript + Zustand + Vitest + React Testing Library. **No new dependencies. No new IPC. No new files except possibly 1 plan/spec.**

## Global Constraints

- **TDD**: Write failing test → minimal impl → run → commit. No skipping red-green-refactor.
- **Frequent commits**: One commit per task minimum.
- **i18n**: Every user-facing string goes through `t(locale, key)`. zh-CN + en required for every new key.
- **Type safety**: No `any`. All new exports have explicit return types.
- **Immutability**: All store updates via spread, no in-place mutation.
- **Test coverage**: Target +7 to +10 new tests. No E2E for this PATCH.
- **No new files except**: this plan, its spec (already shipped), and a release notes file in Task 6. Modify existing files only.
- **Branch**: `feature/v1-8-0-k-stencil-a`. HEAD before any PATCH work: `2b3e21c` (v1.8.0 K Stencil Wizard). Spec commit: `4727682`.
- **Working tree**: The 29 v1.8.0 K Stencil modified files (`release-notes-v1.7.3.md`, `src/main/**`, `src/renderer/components/StencilWizard/**`, `src/renderer/keyboard/shortcuts/palette.ts`, `src/renderer/store/__tests__/useArxmlStore.templatePaths.test.ts`, `src/renderer/store/slices/ecucSlice.ts`, `src/renderer/components/AppHeader.tsx`, `tests/e2e/stencil-wizard.spec.ts`, `docs/superpowers/{plans,specs}/2026-06-21-v1-8-0-k-stencil.{md,design.md}`) are **NOT** part of this PATCH. **Do not stage them.**
- **FileListTab.tsx does NOT need changes**: the `×` button at `FileListTab.tsx:158-171` calls `removeDocument(p)` (ARXML removal, not BSWMD). The reused `removeArxmlAria` key is correct there. Spec §10 Q1 resolved.

---

## File Map

| File | Role | Modified by Task |
|---|---|---|
| `src/renderer/store/useArxmlStore.ts` | `ToastState` type lives here (lines 71-82) | T1 |
| `src/renderer/store/slices/uiSlice.ts` | `setSuccess` setter signature | T3 (widened with optional 3rd arg) |
| `src/renderer/components/ErrorBanner.tsx` | Renders `toast`; adds action button | T1 |
| `src/renderer/components/__tests__/ErrorBanner.test.tsx` | New test cases (3) | T1 |
| `src/shared/i18n.ts` | Type block + zh-CN + en value blocks | T2 |
| `src/renderer/hooks/useProjectActions.ts` | cascade-and-unlink success branch | T3 |
| `src/renderer/hooks/__tests__/useProjectActions.removeBswmd.test.ts` | New test cases (3) | T3 |
| `src/renderer/components/ContextMenu.tsx` | `buildBswmdItems` aria-label + render | T4 |
| `src/renderer/components/__tests__/ContextMenu.removeModule.test.tsx` | New test case (1) | T4 |
| `src/renderer/components/ProjectPanel.tsx` | BSWMD row × button aria key swap at line 133 | T5 |
| `src/renderer/components/__tests__/ProjectPanel.test.tsx` (or contextMenu variant if BSWMD row only tested there) | New test case (1) | T5 |
| `package.json` | Version bump 1.8.0 → 1.8.1 (or keep — user decides in T6) | T6 |
| `release-notes-v1.8.1.md` (or v1.8.0-patch.md) | New release notes | T6 |

---

## Task 1: ToastState.action field + ErrorBanner action button render

**Files:**
- Modify: `src/renderer/store/useArxmlStore.ts:71-82` — add `action?` to `ToastState`
- Modify: `src/renderer/components/ErrorBanner.tsx:136-165` — render action button when `toast.action` is present
- Modify: `src/renderer/components/__tests__/ErrorBanner.test.tsx` — append 3 new test cases to the existing `describe('ErrorBanner (Sprint 13+)')` block

**Interfaces:**
- Consumes: existing `useArxmlStore.toast: ToastState | null` selector (unchanged shape from existing readers)
- Produces: new optional field `ToastState.action?: { readonly label: string; readonly onActivate: () => void }`. Downstream readers (Task 3's `setSuccess` call site, Task 1's render) consume this.

---

### Step 1: Append 3 failing tests to `ErrorBanner.test.tsx`

Append to the existing `describe('ErrorBanner (Sprint 13+)')` block (currently ends around line 245):

```typescript
describe('ErrorBanner (Sprint 17 PATCH — Toast action button)', () => {
  it('renders the action button when toast.action is set', () => {
    const onActivate = vi.fn();
    act(() => {
      useArxmlStore.setState({
        error: null,
        toast: {
          kind: 'success',
          message: '已移除 BSWMD "Adc.arxml"',
          autoDismissMs: 8000,
          action: { label: '撤销', onActivate },
        },
      });
    });
    render(<ErrorBanner />);
    const actionBtn = screen.getByTestId('error-banner-action');
    expect(actionBtn).toBeInTheDocument();
    expect(actionBtn).toHaveTextContent('撤销');
  });

  it('does NOT render the action button when toast.action is absent', () => {
    act(() => {
      useArxmlStore.setState({
        error: null,
        toast: { kind: 'info', message: 'no action here', autoDismissMs: 3000 },
      });
    });
    render(<ErrorBanner />);
    expect(screen.queryByTestId('error-banner-action')).not.toBeInTheDocument();
  });

  it('clicking the action button calls onActivate exactly once', () => {
    const onActivate = vi.fn();
    act(() => {
      useArxmlStore.setState({
        error: null,
        toast: {
          kind: 'success',
          message: 'done',
          action: { label: '撤销', onActivate },
        },
      });
    });
    render(<ErrorBanner />);
    fireEvent.click(screen.getByTestId('error-banner-action'));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('clicking the action button does NOT auto-dismiss the toast (caller decides)', () => {
    const onActivate = vi.fn();
    act(() => {
      useArxmlStore.setState({
        error: null,
        toast: {
          kind: 'success',
          message: 'still here',
          action: { label: '撤销', onActivate },
        },
      });
    });
    render(<ErrorBanner />);
    fireEvent.click(screen.getByTestId('error-banner-action'));
    // Toast is STILL in the store — the action button only invokes
    // onActivate. The caller's onActivate (Task 3) is responsible
    // for calling dismissToast.
    expect(useArxmlStore.getState().toast).not.toBeNull();
  });
});
```

### Step 2: Run the 4 new tests, expect 4 failures

```bash
cd /d/claude_proj2/claude-AutosarCfg && pnpm test src/renderer/components/__tests__/ErrorBanner.test.tsx -t "Toast action button"
```

**Expected:** All 4 fail.

- Tests 1-3 fail because `ToastState.action` is not assignable (`Object literal may only specify known properties`).
- Test 4 fails for the same reason.

### Step 3: Add `action?` to `ToastState`

In `src/renderer/store/useArxmlStore.ts`, modify the `ToastState` interface (lines 71-82). Add one new optional field at the end:

```typescript
export interface ToastState {
  readonly kind: ToastKind;
  readonly message: string;
  /**
   * Auto-dismiss timeout in ms. Omit (or 0) for manual dismiss only.
   * The store's `setInfo` / `setSuccess` / `setWarning` defaults are
   * 3000 / 3000 / 5000 respectively; `setError` leaves it undefined
   * because errors demand explicit acknowledgment.
   */
  readonly autoDismissMs?: number;
  /**
   * Sprint 17 PATCH — optional action button (Undo etc). The
   * ErrorBanner renders a button next to copy / dismiss when this
   * is set. Clicking the button invokes `onActivate`; the caller
   * is responsible for clearing the toast (typically by calling
   * `dismissToast` from inside the callback). The button itself
   * does NOT auto-dismiss — preserves the caller's option to run
   * a state mutation first and then dismiss in one flow.
   */
  readonly action?: { readonly label: string; readonly onActivate: () => void };
}
```

### Step 4: Render action button in `ErrorBanner.tsx`

In `src/renderer/components/ErrorBanner.tsx`, modify the `.error-banner-actions` JSX block (around lines 136-165). Add the action button BEFORE the dismiss button:

```tsx
<div className="error-banner-actions">
  {showViewButton && (
    <button
      type="button"
      className="error-banner-btn"
      onClick={() => setViewerOpen(true)}
      data-testid="error-banner-view"
    >
      {t(locale, 'app.error.view')}
    </button>
  )}
  <button
    type="button"
    className="error-banner-btn"
    onClick={onCopy}
    data-testid="error-banner-copy"
    aria-label={t(locale, 'app.error.copyAria')}
  >
    {t(locale, 'app.error.copy')}
  </button>
  {/* Sprint 17 PATCH — optional action button (Undo etc). Renders
       only when toast.action is set. Click invokes the caller's
       onActivate; the caller is responsible for dismissToast. */}
  {toast.action !== undefined && (
    <button
      type="button"
      className="error-banner-btn error-banner-action"
      onClick={toast.action.onActivate}
      data-testid="error-banner-action"
    >
      {toast.action.label}
    </button>
  )}
  <button
    type="button"
    className="error-banner-btn error-banner-dismiss"
    onClick={() => dismissToast()}
    data-testid="error-banner-dismiss"
    aria-label={t(locale, 'app.error.dismissAria')}
  >
    ×
  </button>
</div>
```

Note: the existing `const { kind, message, autoDismissMs } = toast;` destructure at line 70 needs to ALSO destructure `action`:

```typescript
const { kind, message, autoDismissMs, action } = toast;
```

Then use `action` instead of `toast.action` in the JSX (or keep `toast.action` — both work; use `action` for consistency with the existing `kind` / `message` destructure).

### Step 5: Run the 4 new tests, expect PASS

```bash
cd /d/claude_proj2/claude-AutosarCfg && pnpm test src/renderer/components/__tests__/ErrorBanner.test.tsx -t "Toast action button"
```

**Expected:** 4 PASS.

Also run the full ErrorBanner test file to confirm no regression:

```bash
cd /d/claude_proj2/claude-AutosarCfg && pnpm test src/renderer/components/__tests__/ErrorBanner.test.tsx
```

**Expected:** all 11 tests PASS (7 existing + 4 new).

### Step 6: Commit

```bash
cd /d/claude_proj2/claude-AutosarCfg && git add src/renderer/store/useArxmlStore.ts src/renderer/components/ErrorBanner.tsx src/renderer/components/__tests__/ErrorBanner.test.tsx && git commit -m "feat(toast): add optional action button to ToastState

Extends ToastState with readonly action?: { label, onActivate }
field. ErrorBanner renders the button next to copy/dismiss when
set. Click invokes onActivate; the caller (Task 3's cascade-and-
unlink success branch) is responsible for dismissToast — keeps
undo flow atomic (mutate + dismiss in one render).

No IPC. No store action changes. No new files.

Refs: docs/superpowers/specs/2026-06-22-v1-8-0-patch-sprint17-undo-aria-design.md §3.1, §3.2"
```

---

## Task 2: i18n keys (3 mutation + 1 projectPanel)

**Files:**
- Modify: `src/shared/i18n.ts` — add 4 keys to type block (line ~364), zh-CN values (line ~910), en values (line ~1403)

**Interfaces:**
- Consumes: existing `t(locale, key, params?)` signature (unchanged)
- Produces: 4 new i18n keys consumable by Tasks 3, 4, 5

---

### Step 1: Add 4 type declarations to i18n.ts type block

In `src/shared/i18n.ts`, find the mutation.action block (around line 355-369). Add 3 new keys after `mutation.action.removeModuleAria` (line 364):

```typescript
  readonly 'mutation.action.removeModule': string;
  readonly 'mutation.action.removeModuleAria': string; // {name}
  // Sprint 17 PATCH — Undo affordance. `undo` is the button label
  // (used in both ErrorBanner's action button and the cascade-and-
  // unlink success toast). `bswmdRemoved` is the toast message after
  // a successful cascade-and-unlink. `undoFailed` is the info toast
  // shown when the Undo button is clicked but the snapshot has been
  // replaced or cleared (stale-toast defense).
  readonly 'mutation.action.undo': string;
  readonly 'mutation.action.bswmdRemoved': string; // {name}
  readonly 'mutation.action.undoFailed': string;
```

Find the projectPanel block (around line 131-150). Add 1 new key after `removeArxmlAria` (line 143):

```typescript
  readonly 'projectPanel.removeArxmlAria': string; // {name}
  // Sprint 17 PATCH — distinct aria key for the BSWMD row × button.
  // Replaces the cross-contamination where ProjectPanel.tsx:133
  // reused the ARXML key (which happens to read sensibly because
  // the ARXML aria-string is generic).
  readonly 'projectPanel.removeBswmdAria': string; // {name}
```

### Step 2: Add 4 zh-CN values

In `src/shared/i18n.ts`, find the zh-CN values block (around line 748). Add the zh-CN values near the existing `mutation.action.removeModuleAria` and `projectPanel.removeArxmlAria`:

```typescript
  'mutation.action.undo': '撤销',
  'mutation.action.bswmdRemoved': "已移除 BSWMD '{name}'",
  'mutation.action.undoFailed': '撤销失败：BSWMD 已恢复或被替换',
```

And near `projectPanel.removeArxmlAria`:

```typescript
  'projectPanel.removeArxmlAria': '从项目中移除 {name}',
  'projectPanel.removeBswmdAria': "移除 BSWMD '{name}'",
```

### Step 3: Add 4 en values

In `src/shared/i18n.ts`, find the en values block (around line 1235). Add the en values near the existing en keys:

```typescript
  'mutation.action.undo': 'Undo',
  'mutation.action.bswmdRemoved': "Removed BSWMD '{name}'",
  'mutation.action.undoFailed': 'Undo failed: BSWMD already restored or replaced',
```

And near `projectPanel.removeArxmlAria`:

```typescript
  'projectPanel.removeArxmlAria': 'Remove {name} from project',
  'projectPanel.removeBswmdAria': "Remove BSWMD '{name}'",
```

### Step 4: Run type-check, expect PASS

```bash
cd /d/claude_proj2/claude-AutosarCfg && pnpm type-check
```

**Expected:** 0 errors. If you see errors about missing keys, the corresponding value entry above is missing — fix and re-run.

### Step 5: Commit

```bash
cd /d/claude_proj2/claude-AutosarCfg && git add src/shared/i18n.ts && git commit -m "feat(i18n): add Undo + BSWMD remove aria keys

Adds 3 mutation keys (undo / bswmdRemoved / undoFailed) for the
Sprint 17 PATCH undo toast affordance, plus 1 projectPanel key
(removeBswmdAria) to fix the ARIA cross-contamination bug at
ProjectPanel.tsx:133 where the BSWMD row × button reused the
ARXML aria key.

No new types, no behavioral change. Existing i18n tests (if any)
should still pass.

Refs: docs/superpowers/specs/2026-06-22-v1-8-0-patch-sprint17-undo-aria-design.md §3.4"
```

---

## Task 3: useProjectActions cascade-and-unlink Undo wiring

**Files:**
- Modify: `src/renderer/store/slices/uiSlice.ts:277-280` — widen `setSuccess` signature with optional 3rd `action` arg
- Modify: `src/renderer/hooks/useProjectActions.ts:673-678` — add success toast with Undo action to cascade-and-unlink success branch
- Modify: `src/renderer/hooks/__tests__/useProjectActions.removeBswmd.test.ts` — append 3 new test cases to the existing describe block

**Interfaces:**
- Consumes: `useArxmlStore.getState()` (snapshot read after `removeBswmdFromDisk`), `setSuccess(message, ms?, action?)`, `setInfo(message, ms?)`, `undoLastRemoveBswmd()`, `dismissToast()`
- Produces: `useArxmlStore.toast` with `kind: 'success'`, `message: bswmdRemoved localed`, `autoDismissMs: 8000`, `action: { label: undo localed, onActivate: closure }`. The closure captures the post-remove snapshot reference for stale defense.

---

### Step 1: Append 3 failing tests to `useProjectActions.removeBswmd.test.ts`

Append to the existing test file (find the last `it(...)` block in the top-level `describe`):

```typescript
describe('useProjectActions.removeBswmdWithFullFlow (Sprint 17 PATCH — Undo toast)', () => {
  beforeEach(() => {
    // Reset the store between tests; the test file's existing
    // beforeEach may already do this — adjust as needed.
    useArxmlStore.getState().clear();
  });

  it('after cascade-and-unlink success, sets a success toast with Undo action', async () => {
    // Setup: 1 BSWMD with 1 dependent ARXML, no dirty
    const bswmdPath = '/proj/Adc.arxml';
    const arxmlPath = '/proj/AdcEcuc.arxml';
    addBswmdWithDependent(bswmdPath, arxmlPath);

    // Mock dialog → 'cascade-and-unlink'
    mockConfirmRemoveBswmdResolve('cascade-and-unlink');
    // Mock IPCs → both ok
    mockDeleteArxmlOk();
    mockDeleteBswmdOk();

    const { result } = renderHook(() => useProjectActions());
    await act(async () => {
      const r = await result.current.removeBswmdWithFullFlow(bswmdPath);
      expect(r.kind).toBe('ok');
    });

    const toast = useArxmlStore.getState().toast;
    expect(toast).not.toBeNull();
    expect(toast?.kind).toBe('success');
    expect(toast?.autoDismissMs).toBe(8000);
    expect(toast?.action).toBeDefined();
    expect(toast?.action?.label).toMatch(/撤销|Undo/);
  });

  it('clicking Undo with fresh snapshot calls undoLastRemoveBswmd and dismisses toast', async () => {
    const bswmdPath = '/proj/Adc.arxml';
    const arxmlPath = '/proj/AdcEcuc.arxml';
    addBswmdWithDependent(bswmdPath, arxmlPath);
    mockConfirmRemoveBswmdResolve('cascade-and-unlink');
    mockDeleteArxmlOk();
    mockDeleteBswmdOk();

    const { result } = renderHook(() => useProjectActions());
    await act(async () => {
      await result.current.removeBswmdWithFullFlow(bswmdPath);
    });

    const toast = useArxmlStore.getState().toast;
    expect(toast?.action).toBeDefined();
    const snapshotPath = useArxmlStore.getState().lastRemoveSnapshot?.path;

    await act(async () => {
      toast?.action?.onActivate();
    });

    // Snapshot consumed → null
    expect(useArxmlStore.getState().lastRemoveSnapshot).toBeNull();
    // Schema re-inserted into bswmdSchemas
    expect(useArxmlStore.getState().bswmdPaths).toContain(snapshotPath);
    // Toast dismissed
    expect(useArxmlStore.getState().toast).toBeNull();
  });

  it('clicking Undo with stale snapshot surfaces undoFailed info toast instead of undoing', async () => {
    const bswmdPath = '/proj/Adc.arxml';
    const arxmlPath = '/proj/AdcEcuc.arxml';
    addBswmdWithDependent(bswmdPath, arxmlPath);
    mockConfirmRemoveBswmdResolve('cascade-and-unlink');
    mockDeleteArxmlOk();
    mockDeleteBswmdOk();

    const { result } = renderHook(() => useProjectActions());
    await act(async () => {
      await result.current.removeBswmdWithFullFlow(bswmdPath);
    });

    const toast = useArxmlStore.getState().toast;
    expect(toast?.action).toBeDefined();

    // Simulate stale snapshot: replace lastRemoveSnapshot with a
    // different path. The captured closure's snapshot.path won't
    // match anymore, triggering the undoFailed branch.
    act(() => {
      useArxmlStore.setState({
        lastRemoveSnapshot: {
          path: '/proj/DifferentBswmd.arxml',
          schema: makeBswmd([]),
          timestamp: Date.now(),
        },
      });
    });

    await act(async () => {
      toast?.action?.onActivate();
    });

    // Toast was replaced with undoFailed info
    const finalToast = useArxmlStore.getState().toast;
    expect(finalToast?.kind).toBe('info');
    expect(finalToast?.message).toMatch(/撤销失败|Undo failed/);
    // The unrelated BSWMD schema is still in the store (we didn't
    // accidentally undo it).
    expect(useArxmlStore.getState().bswmdSchemas.some(s => s.modules.length === 0 && /* the stale snapshot's schema */ true)).toBe(false);
  });
});
```

**Helper functions** (`addBswmdWithDependent`, `mockConfirmRemoveBswmdResolve`, `mockDeleteArxmlOk`, `mockDeleteBswmdOk`) — extract from the existing test patterns in the same file. The cascade-and-unlink tests at the bottom of the file already set these up; reuse them. Add new helpers above the new describe block:

```typescript
// Mock the dialog → resolve with `choice` when confirmRemoveBswmd is called
function mockConfirmRemoveBswmdResolve(choice: 'cancel' | 'only' | 'cascade' | 'cascade-and-unlink'): void {
  vi.spyOn(RemoveModuleConfirmDialogModule, 'confirmRemoveBswmd').mockResolvedValue(choice);
}

function mockDeleteArxmlOk(): void {
  vi.spyOn(window.autosarApi, 'deleteArxml').mockResolvedValue({ kind: 'ok' });
}

function mockDeleteBswmdOk(): void {
  vi.spyOn(window.autosarApi, 'deleteBswmd').mockResolvedValue({ kind: 'ok' });
}

function addBswmdWithDependent(bswmdPath: string, arxmlPath: string): void {
  // Add the BSWMD via the store, then create a dependent ARXML
  // whose sourceBswmdPath points at bswmdPath so
  // findDependentsOfBswmd returns it.
  const state = useArxmlStore.getState();
  state.addBswmd(bswmdPath, '<arxml>placeholder</arxml>');
  // The existing test setup uses addDocumentWithSource — see the
  // earlier tests in the same file for the exact pattern.
  state.addDocumentWithSource(makeArxmlDocument(arxmlPath), bswmdPath);
}
```

(If `makeArxmlDocument` is not already defined, copy from an existing test in the file. Search for `addDocumentWithSource` in the file for the canonical pattern.)

### Step 2: Run the 3 new tests, expect 3 failures

```bash
cd /d/claude_proj2/claude-AutosarCfg && pnpm test src/renderer/hooks/__tests__/useProjectActions.removeBswmd.test.ts -t "Undo toast"
```

**Expected:** All 3 fail (either with `toast.action` being `undefined`, or `useArxmlStore.setState` type errors if `action` isn't yet on `ToastState`).

### Step 3: Widen `setSuccess` signature in `uiSlice.ts`

In `src/renderer/store/slices/uiSlice.ts:279-280`, modify the `setSuccess` setter:

```typescript
setSuccess: (message, autoDismissMs = 3000, action) =>
  set({
    error: message,
    toast: { kind: 'success', message, autoDismissMs, action },
  }),
```

No type widening needed at the slice level — `action` is inferred from the `set({ toast: { ... } })` call and matches `ToastState.action?` (optional).

### Step 4: Modify cascade-and-unlink success branch in `useProjectActions.ts`

In `src/renderer/hooks/useProjectActions.ts`, find the cascade-and-unlink block (lines 647-678). Replace the success block:

```typescript
      if (choice === 'cascade-and-unlink') {
        // For each dependent, delete from disk via IPC, then drop
        // from the store. (Existing comment, preserved.)
        for (const filePath of dependents) {
          const result = await window.autosarApi.deleteArxml({ filePath });
          if (result.kind === 'write-failed') {
            return { kind: 'error', message: result.message };
          }
          useArxmlStore.getState().removeDocument(filePath);
        }
        // 'cascade-and-unlink' — cascade + unlink the BSWMD file
        // from disk via the P1 store action. (Existing comment.)
        const r = await useArxmlStore.getState().removeBswmdFromDisk(path);
        if (r.kind === 'write-failed') {
          return { kind: 'error', message: r.message };
        }
        if (r.kind === 'ok') {
          // Sprint 17 PATCH — surface a success toast with an Undo
          // action button. 8s window gives the user time to react.
          // The snapshot reference is captured AFTER the unlink so
          // we have the path that was actually removed. The closure
          // compares it against the live snapshot on click — if
          // they don't match (a newer remove replaced the snapshot),
          // we surface an undoFailed info toast instead of undoing
          // the wrong thing. (Stale-toast defense.)
          const snapshot = useArxmlStore.getState().lastRemoveSnapshot;
          if (snapshot !== null) {
            const localeNow = useArxmlStore.getState().locale;
            const storeState = useArxmlStore.getState();
            storeState.setSuccess(
              t(localeNow, 'mutation.action.bswmdRemoved', { name: basename(path) }),
              8000,
              {
                label: t(localeNow, 'mutation.action.undo'),
                onActivate: () => {
                  const current = useArxmlStore.getState().lastRemoveSnapshot;
                  if (current !== null && current.path === snapshot.path) {
                    useArxmlStore.getState().undoLastRemoveBswmd();
                  } else {
                    useArxmlStore.getState().setInfo(
                      t(useArxmlStore.getState().locale, 'mutation.action.undoFailed'),
                      4000,
                    );
                  }
                  useArxmlStore.getState().dismissToast();
                },
              },
            );
          }
        }
        return { kind: r.kind };
      }
```

### Step 5: Run the 3 new tests, expect PASS

```bash
cd /d/claude_proj2/claude-AutosarCfg && pnpm test src/renderer/hooks/__tests__/useProjectActions.removeBswmd.test.ts -t "Undo toast"
```

**Expected:** 3 PASS.

Also run the full test file to confirm no regression on existing cascade-and-unlink tests:

```bash
cd /d/claude_proj2/claude-AutosarCfg && pnpm test src/renderer/hooks/__tests__/useProjectActions.removeBswmd.test.ts
```

**Expected:** all tests PASS.

### Step 6: Commit

```bash
cd /d/claude_proj2/claude-AutosarCfg && git add src/renderer/store/slices/uiSlice.ts src/renderer/hooks/useProjectActions.ts src/renderer/hooks/__tests__/useProjectActions.removeBswmd.test.ts && git commit -m "feat(undo): wire cascade-and-unlink success toast with Undo button

Closes the orphan undoLastRemoveBswmd UI gap. After a successful
cascade-and-unlink, fires setSuccess(message, 8000, {label, onActivate}).
The action captures the post-unlink snapshot reference and compares
its path against the live lastRemoveSnapshot on click — stale
toasts (replaced by a newer remove) surface an undoFailed info
toast instead of undoing the wrong BSWMD.

setSuccess signature widened with optional 3rd action arg. No
new IPC, no new files, no new dependencies.

Refs: docs/superpowers/specs/2026-06-22-v1-8-0-patch-sprint17-undo-aria-design.md §3.3, §4"
```

---

## Task 4: ContextMenu remove-module aria-label

**Files:**
- Modify: `src/renderer/components/ContextMenu.tsx:234-242, 311-324, 496-514` — add `ariaLabel` to `MenuItemSpec`, set it in `buildBswmdItems`, render it on the `<li>`
- Modify: `src/renderer/components/__tests__/ContextMenu.removeModule.test.tsx` — append 1 new test case

**Interfaces:**
- Consumes: existing `Locale` prop on `ContextMenuRoot`, `t(locale, 'mutation.action.removeModuleAria', { name })` from Task 2
- Produces: `<li>` for the remove-module item has `aria-label` attribute matching the localized value

---

### Step 1: Append 1 failing test

Append to `src/renderer/components/__tests__/ContextMenu.removeModule.test.tsx` (after the 3 existing `it(...)` blocks):

```typescript
  it('remove-module item carries aria-label with the BSWMD shortName', () => {
    cleanup();
    const onAction = vi.fn();
    return mountHost(onAction).then(() => {
      act(() => {
        openContextMenu(
          { path: '/fake/Adc.arxml', kind: 'bswmd', shortName: 'Adc.arxml' },
          100, 100,
        );
      });
      const item = screen.getByTestId('context-menu-item-remove-module');
      // aria-label interpolates {name} with the BSWMD shortName
      // via `mutation.action.removeModuleAria` (zh-CN: "移除 BSWMD '{name}'").
      expect(item).toHaveAttribute('aria-label', "移除 BSWMD 'Adc.arxml'");
    });
  });

  it('remove-module item carries aria-label in en locale', async () => {
    cleanup();
    const onAction = vi.fn();
    render(<Host onAction={onAction as never} locale="en" />);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      openContextMenu(
        { path: '/fake/Adc.arxml', kind: 'bswmd', shortName: 'Adc.arxml' },
        100, 100,
      );
    });
    const item = await waitFor(() => screen.getByTestId('context-menu-item-remove-module'));
    expect(item).toHaveAttribute('aria-label', "Remove BSWMD 'Adc.arxml'");
  });
```

### Step 2: Run the 2 new tests, expect 2 failures

```bash
cd /d/claude_proj2/claude-AutosarCfg && pnpm test src/renderer/components/__tests__/ContextMenu.removeModule.test.tsx -t "aria-label"
```

**Expected:** 2 FAIL — `item` does not have the `aria-label` attribute (currently `<li>` has no `aria-label`).

### Step 3: Add `ariaLabel` to `MenuItemSpec` interface

In `src/renderer/components/ContextMenu.tsx`, modify the `MenuItemSpec` interface (lines 234-241):

```typescript
interface MenuItemSpec {
  readonly id: string;
  readonly label: string;
  readonly disabled: boolean;
  readonly disabledTitle?: string;
  readonly cssClass: string;
  readonly build: (target: ContextMenuTarget) => ContextMenuAction;
  /** Sprint 17 PATCH — optional aria-label for the rendered <li>.
   *  When set, the render path forwards it to the menuitem's
   *  `aria-label` attribute. Falls back to the label text when
   *  omitted (existing behavior). */
  readonly ariaLabel?: string;
}
```

### Step 4: Set `ariaLabel` in `buildBswmdItems`

Modify `buildBswmdItems` (lines 311-324):

```typescript
function buildBswmdItems(target: ContextMenuTarget, locale: Locale): readonly MenuItemSpec[] {
  return [
    {
      id: 'remove-module',
      label: t(locale, 'mutation.action.removeModule'),
      // Sprint 17 PATCH — aria-label disambiguates the destructive
      // item with the BSWMD shortName so screen readers announce
      // which module will be removed (e.g. "Remove BSWMD 'Adc.arxml'"
      // vs. just "Remove module").
      ariaLabel: t(locale, 'mutation.action.removeModuleAria', { name: target.shortName }),
      disabled: false,
      cssClass: 'context-menu-item context-menu-item-delete',
      build: () => ({ type: 'remove-module', path: target.path }),
    },
  ];
}
```

### Step 5: Render `aria-label` on the `<li>`

Modify the render `<li>` (lines 496-514). Add `aria-label={spec.ariaLabel}`:

```tsx
<li
  key={spec.id}
  ref={(el) => {
    itemRefs.current[idx] = el;
    if (idx === 0) firstItemRef.current = el;
  }}
  role="menuitem"
  tabIndex={spec.disabled ? -1 : 0}
  aria-disabled={spec.disabled}
  // Sprint 17 PATCH — forward the spec's aria-label to the
  // menuitem. Falls back to undefined (no attribute) when omitted.
  aria-label={spec.ariaLabel}
  title={spec.disabledTitle}
  data-idx={idx}
  data-testid={`context-menu-item-${spec.id}`}
  className={spec.cssClass}
  onClick={() => handleItemClick(spec, s.target)}
>
  {spec.label}
</li>
```

### Step 6: Run the 2 new tests, expect PASS

```bash
cd /d/claude_proj2/claude-AutosarCfg && pnpm test src/renderer/components/__tests__/ContextMenu.removeModule.test.tsx -t "aria-label"
```

**Expected:** 2 PASS.

Full file run for regression check:

```bash
cd /d/claude_proj2/claude-AutosarCfg && pnpm test src/renderer/components/__tests__/ContextMenu.removeModule.test.tsx
```

**Expected:** all 5 tests PASS (3 existing + 2 new).

### Step 7: Commit

```bash
cd /d/claude_proj2/claude-AutosarCfg && git add src/renderer/components/ContextMenu.tsx src/renderer/components/__tests__/ContextMenu.removeModule.test.tsx && git commit -m "feat(aria): wire mutation.action.removeModuleAria onto ContextMenu item

Wires the existing-but-unused
mutation.action.removeModuleAria i18n key onto the remove-module
<menuitem>'s aria-label. Screen readers now announce the
interpolated {name} (e.g. \"Remove BSWMD 'Adc.arxml'\") instead of
just \"Remove module\".

MenuItemSpec gains optional ariaLabel field; render forwards it
to the <li> aria-label. No new files, no behavioral change.

Refs: docs/superpowers/specs/2026-06-22-v1-8-0-patch-sprint17-undo-aria-design.md §3.5 (Fix 2)"
```

---

## Task 5: ProjectPanel BSWMD × button aria key swap

**Files:**
- Modify: `src/renderer/components/ProjectPanel.tsx:133` — replace `projectPanel.removeArxmlAria` with `projectPanel.removeBswmdAria`
- Modify: `src/renderer/components/__tests__/ProjectPanel.test.tsx` (or `ProjectPanel.contextMenu.test.tsx` if the BSWMD row × button is only tested there) — append 1 new test case

**Interfaces:**
- Consumes: `t(locale, 'projectPanel.removeBswmdAria', { name })` from Task 2
- Produces: BSWMD row × button has `aria-label` matching the localized `removeBswmdAria` value

---

### Step 1: Identify which existing test file covers the BSWMD × button

Read the test files quickly:

```bash
cd /d/claude_proj2/claude-AutosarCfg && grep -l "project-panel-bswmd-remove" src/renderer/components/__tests__/*.tsx
```

If both `ProjectPanel.test.tsx` and `ProjectPanel.contextMenu.test.tsx` exist and reference this test-id, add the new test to whichever already mounts `ProjectPanelInfo` with `onRemoveBswmd`. (The contextMenu variant may only mount the FileList with `onContextMenuRow`, not `onRemove`.)

### Step 2: Append 1 failing test

Append to the chosen test file:

```typescript
  it('BSWMD row × button uses projectPanel.removeBswmdAria, not removeArxmlAria', () => {
    // Mount ProjectPanelInfo with a manifest that has 1 BSWMD
    // path. Reuse the existing fixture helpers from the file.
    renderProjectPanelInfo({
      manifest: makeManifestWithBswmds(['/proj/Adc.arxml']),
      onRemoveBswmd: vi.fn(),
    });
    const removeBtn = screen.getByTestId('project-panel-bswmd-remove-/proj/Adc.arxml');
    // zh-CN default: "移除 BSWMD '{name}'" → "移除 BSWMD 'Adc.arxml'"
    expect(removeBtn).toHaveAttribute('aria-label', "移除 BSWMD 'Adc.arxml'");
    // Negative assertion: must NOT carry the ARXML-string
    expect(removeBtn.getAttribute('aria-label')).not.toMatch(/从项目中移除|Remove .* from project/);
  });

  it('BSWMD row × button aria-label in en locale uses removeBswmdAria', () => {
    useArxmlStore.getState().setLocale('en');
    renderProjectPanelInfo({
      manifest: makeManifestWithBswmds(['/proj/Adc.arxml']),
      onRemoveBswmd: vi.fn(),
    });
    const removeBtn = screen.getByTestId('project-panel-bswmd-remove-/proj/Adc.arxml');
    expect(removeBtn).toHaveAttribute('aria-label', "Remove BSWMD 'Adc.arxml'");
  });
```

(`renderProjectPanelInfo` and `makeManifestWithBswmds` are the existing test helpers in the chosen file. Adapt names to match.)

### Step 3: Run the 2 new tests, expect 2 failures

```bash
cd /d/claude_proj2/claude-AutosarCfg && pnpm test src/renderer/components/__tests__/ProjectPanel.test.tsx -t "removeBswmdAria"
```

**Expected:** 2 FAIL — aria-label currently resolves to the ARXML-string.

### Step 4: Swap aria key in `ProjectPanel.tsx`

In `src/renderer/components/ProjectPanel.tsx`, line 133:

```typescript
// Before:
aria-label={t(locale, 'projectPanel.removeArxmlAria', {
  name: basename(p),
})}

// After:
aria-label={t(locale, 'projectPanel.removeBswmdAria', {
  name: basename(p),
})}
```

(Use Edit with exact context. The line is inside the `FileList` component's `<button>` block, line numbers ~129-140.)

### Step 5: Run the 2 new tests, expect PASS

```bash
cd /d/claude_proj2/claude-AutosarCfg && pnpm test src/renderer/components/__tests__/ProjectPanel.test.tsx -t "removeBswmdAria"
```

**Expected:** 2 PASS.

Full file run for regression:

```bash
cd /d/claude_proj2/claude-AutosarCfg && pnpm test src/renderer/components/__tests__/ProjectPanel.test.tsx
```

**Expected:** all tests PASS.

Also run `FileListTab.test.tsx` (ARXML × button) to confirm no regression on the ARXML row:

```bash
cd /d/claude_proj2/claude-AutosarCfg && pnpm test src/renderer/components/__tests__/FileListTab.test.tsx
```

**Expected:** all PASS — the ARXML × button still uses `removeArxmlAria` (correct per spec §10 Q1 resolution).

### Step 6: Commit

```bash
cd /d/claude_proj2/claude-AutosarCfg && git add src/renderer/components/ProjectPanel.tsx src/renderer/components/__tests__/ProjectPanel.test.tsx && git commit -m "fix(aria): swap BSWMD row × button to projectPanel.removeBswmdAria

Closes the ARIA cross-contamination at ProjectPanel.tsx:133 where
the BSWMD row × button reused projectPanel.removeArxmlAria. The
two existing tests passed only because the ARXML aria-string
('Remove {name} from project') happens to read sensibly when the
row is a BSWMD. Now uses the dedicated BSWMD key ('Remove BSWMD
{name}').

FileListTab.tsx:158-171 is the ARXML row × button — kept on
removeArxmlAria (correct per spec §10 Q1).

Refs: docs/superpowers/specs/2026-06-22-v1-8-0-patch-sprint17-undo-aria-design.md §3.5 (Fix 3)"
```

---

## Task 6: Final verification + release commit

**Files:**
- Modify: `package.json` — version bump 1.8.0 → 1.8.1 (if user confirms)
- Create: `release-notes-v1.8.1.md` (if version bumped)
- No source code changes unless verification surfaces issues

**Interfaces:**
- Consumes: all 5 prior task commits
- Produces: a clean `pnpm verify` (test + lint + type-check + build), code-reviewer approval, release tag

---

### Step 1: Run the full test suite

```bash
cd /d/claude_proj2/claude-AutosarCfg && pnpm test
```

**Expected:** 0 failures, all PATCH tests pass, no regressions on existing tests. Capture the total test count delta (before: N tests, after: N + 7..10 tests).

### Step 2: Run lint and type-check

```bash
cd /d/claude_proj2/claude-AutosarCfg && pnpm lint && pnpm type-check
```

**Expected:** 0 errors.

### Step 3: Run the production build

```bash
cd /d/claude_proj2/claude-AutosarCfg && pnpm build
```

**Expected:** build success. Renderer bundle size delta should be ~+1 KB (the small action button CSS class + aria-label wire).

### Step 4: Dispatch code-reviewer subagent

In this session, invoke:

```
Agent: code-reviewer
Prompt: Review the 5 commits on feature/v1-8-0-k-stencil-a since
        commit 2b3e21c (v1.8.0 K Stencil release). The commits
        implement the spec at
        docs/superpowers/specs/2026-06-22-v1-8-0-patch-sprint17-undo-aria-design.md.
        Report any CRITICAL / HIGH / MEDIUM issues with line numbers
        and recommended fixes. The PATCH is small (~10 files
        modified, no new files except possibly this plan's release
        notes). Verify:
        1. ToastState.action is correctly typed and read in ErrorBanner.
        2. setSuccess signature widening is back-compat (existing
           callers without action still work).
        3. cascade-and-unlink Undo wiring handles stale-snapshot
           race correctly.
        4. i18n keys exist in both locales with matching parameter
           shapes.
        5. ContextMenu aria-label uses the existing key (not a new one).
        6. ProjectPanel aria swap doesn't accidentally hit ARXML rows.
        Report findings inline.
```

**Expected:** APPROVE or APPROVE_WITH_MINOR. Fix any CRITICAL/HIGH issues before continuing.

### Step 5: Decide on version bump

Ask the user:

> "PATCH 测试 + lint + type-check + build + code-review 全绿。版本 bump 策略：
>
> - **A. v1.8.1 PATCH**（推荐）— 单独 tag，按 PATCH bump 规范（bug fix / a11y）
> - **B. 保持 v1.8.0** — 等下个改动合并后再 bump（如果还有其他 PATCH fix 在路上）
> - **C. Folding into next MINOR** — 跳过 release 直接进 v1.9.0 brainstorm
>
> 选哪个？"

### Step 6: Write release notes

If user chose A or B:

```bash
cd /d/claude_proj2/claude-AutosarCfg
```

Create `release-notes-v1.8.1.md` (or `release-notes-v1.8.0-patch.md` if B):

```markdown
# v1.8.1 — Sprint 17 PATCH follow-up

> **Release date**: 2026-06-22
> **Predecessor**: v1.8.0 (K Stencil Wizard) SHIPPED earlier
> **Type**: PATCH
> **Commits since v1.8.0**: 5 (T1 ToastState, T2 i18n, T3 undo wiring, T4 ContextMenu aria, T5 ProjectPanel aria)

## What's new

### Undo for cascade-and-unlink BSWMD remove

Sprint 17's `cascade-and-unlink` dialog option deletes a BSWMD
file from disk + its dependent ARXMLs. Until v1.8.1, the
`undoLastRemoveBswmd` store action existed but had no UI
affordance — a user who immediately regretted had to re-load the
BSWMD file from the picker manually.

Now: a success toast with an "撤销" / "Undo" button appears for 8
seconds after a successful unlink. Click it to restore the
in-memory schema (the disk file is still gone; use the picker to
re-attach). A stale-toast defense prevents undoing the wrong
BSWMD if a newer remove has replaced the snapshot.

### Accessibility: distinct aria-labels for BSWMD vs ARXML remove

- `ContextMenu` "Remove module" item now carries `aria-label` =
  "移除 BSWMD 'Adc.arxml'" / "Remove BSWMD 'Adc.arxml'" (was just
  the generic "Remove module" label).
- `ProjectPanel` BSWMD row × button now uses the dedicated
  `projectPanel.removeBswmdAria` key (was reusing
  `projectPanel.removeArxmlAria` — the strings happened to read
  sensibly because the ARXML aria-string is generic, but screen
  readers now announce a precise description).

## Internal

- `ToastState` extended with optional `action: { label, onActivate }`.
- `setSuccess` signature widened with optional 3rd `action` arg.
- `useProjectActions.removeBswmdWithFullFlow`'s cascade-and-unlink
  success branch fires the new success toast.
- 4 new i18n keys (3 mutation + 1 projectPanel).
- No new dependencies. No new IPC. No new files (except this
  release notes).

## Test count

+9 tests across 4 files:

- ErrorBanner.test.tsx: +4 (action button render / absence / click / no auto-dismiss)
- useProjectActions.removeBswmd.test.ts: +3 (success toast + Undo click fresh + Undo click stale)
- ContextMenu.removeModule.test.tsx: +2 (aria-label zh-CN + en)
- ProjectPanel.test.tsx: +2 (removeBswmdAria zh-CN + en)
- FileListTab.test.tsx: +0 (no change needed)

Total: previous count + 9 (likely around 2033 → 2042; confirm at
release time).
```

### Step 7: Version bump + final commit

If user chose A (v1.8.1 PATCH):

```bash
cd /d/claude_proj2/claude-AutosarCfg
# Edit package.json: change "version": "1.8.0" to "version": "1.8.1"
git add package.json release-notes-v1.8.1.md
git commit -m "chore(release): v1.8.1 — Sprint 17 PATCH follow-up

  - Toast action button for undoLastRemoveBswmd (cascade-and-unlink)
  - ContextMenu BSWMD remove aria-label wire
  - ProjectPanel BSWMD × button distinct aria key
  - 4 new i18n keys (zh-CN + en)
  - 9 new tests, 0 regressions
  - No new dependencies, no new IPC"
```

If user chose B (keep v1.8.0):

```bash
cd /d/claude_proj2/claude-AutosarCfg
git add release-notes-v1.8.0-patch.md
git commit -m "chore(release): v1.8.0 PATCH — Sprint 17 follow-up (no version bump)

  - Toast action button for undoLastRemoveBswmd (cascade-and-unlink)
  - ContextMenu BSWMD remove aria-label wire
  - ProjectPanel BSWMD × button distinct aria key
  - 4 new i18n keys (zh-CN + en)
  - 9 new tests, 0 regressions
  - Defer version bump until next PATCH lands (per user choice)"
```

### Step 8: Inform user

Report:

- Total test count delta
- Commit list (6 commits: 5 task commits + 1 release commit)
- Whether version was bumped
- Awaiting user decision on push + tag (network-bound)

---

## Self-Review (run before handing off)

**Spec coverage:**
- [x] §3.1 ToastState.action — Task 1
- [x] §3.2 ErrorBanner render — Task 1
- [x] §3.3 useProjectActions cascade-and-unlink — Task 3
- [x] §3.4 4 new i18n keys — Task 2
- [x] §3.5 ContextMenu aria-label — Task 4
- [x] §3.5 ProjectPanel aria swap — Task 5
- [x] §4 stale-toast defense — Task 3 (Test 3)
- [x] §5 test coverage (all 9 cases) — distributed across Tasks 1, 3, 4, 5
- [x] §6 scope respected — no new IPC, no new files except release notes

**Placeholder scan:** No "TBD" / "TODO" / "implement later" / "fill in details" in any step. Helper functions in Task 3 reference existing test file patterns (the implementer adapts to actual existing helpers).

**Type consistency:**
- `ToastState.action` defined in Task 1, used in Task 3 (setSuccess setter) — consistent shape `{ readonly label: string; readonly onActivate: () => void }`.
- `setSuccess(message, ms?, action?)` signature in Task 3 widens with `action` matching the ToastState.action shape.
- `MenuItemSpec.ariaLabel?` in Task 4 matches the render path's `aria-label={spec.ariaLabel}` — consistent.
- `projectPanel.removeBswmdAria` i18n key in Task 2 used identically in Tasks 4 + 5 — consistent.

**Plan risks identified:**
- Test 3 in Task 3 uses `setState` directly to swap `lastRemoveSnapshot`; verify this matches the actual `BswmdRemoveSnapshot` shape (`{ path, schema, timestamp }`) — read `useArxmlStore.ts` `BswmdRemoveSnapshot` type if uncertain.
- Helper functions `addBswmdWithDependent` / `mockConfirmRemoveBswmdResolve` / `mockDeleteArxmlOk` / `mockDeleteBswmdOk` in Task 3 may need adaptation to existing patterns in the test file. Implementer should grep for `confirmRemoveBswmd` and `deleteArxml` mocking patterns in `useProjectActions.removeBswmd.test.ts` and follow the local convention.

**Resolved during planning:**
- §10 Q1: `FileListTab.tsx:158-171` confirmed as ARXML × button (`removeDocument(p)` call). FileListTab does NOT need aria swap. Plan Task 5 scoped to ProjectPanel only.
- §10 Q2: `setSuccess` callers — only `useProjectActions` cascade-and-unlink passes `action`. Other callers (AppHeader save errors) use the 2-arg form unchanged. No migration needed.
- §10 Q3: 8000ms explicit in `setSuccess(message, 8000, action)`. `uiSlice.ts` default stays at 3000ms.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-22-v1-8-0-patch-sprint17-undo-aria.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
