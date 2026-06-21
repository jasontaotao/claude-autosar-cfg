# v1.8.0 PATCH — Sprint 17 follow-up: Undo UI + ARIA nits

> **Status**: 📋 DESIGN READY 2026-06-22 (awaiting user review)
> **Owner**: Claude Fable 5 (this session)
> **Cluster**: v1.8.0 PATCH (single-fix closure for v1.6.1 close-out leftovers + ARIA)
> **Predecessor**: v1.8.0 K Stencil Wizard SHIPPED (HEAD `2b3e21c`); v1.7.3 SHIPPED 2026-06-21; v1.6.1 LOCAL READY → SHIPPED earlier this session
> **Branch**: `feature/v1-8-0-k-stencil-a` (current) — this PATCH is the next commit(s) on top
> **Goal**: Close 3 follow-up issues from v1.6.1 Sprint 17 code review that were deliberately deferred to keep the close-out tight: (1) orphan `undoLastRemoveBswmd` action has no UI affordance, (2) `ContextMenu` BSWMD remove item is missing `aria-label`, (3) BSWMD × button reuses ARXML aria key in two places.

## 1. Background

v1.6.1 (Sprint 17 P3+P4 close-out, SHIPPED earlier this session) introduced the full BSWMD remove flow:

- `ContextMenu.tsx:66` — `'remove-module'` action type
- `ContextMenu.tsx:311-324` — `buildBswmdItems` with the destructive menu item
- `App.tsx:353-360` — routes `'remove-module'` to `removeBswmdWithFullFlow(path)`
- `ProjectPanel.tsx:117-124, 130-141` — row-level `onContextMenu` + inline × button
- `removeBswmdWithFullFlow` (useProjectActions.ts:587) — 4-option dialog dispatch

The code-reviewer subagent flagged 3 nit-level issues that didn't block v1.6.1:

1. **Orphan `undoLastRemoveBswmd` action** — `bswmdSlice.ts:140, 369-393` defines the store action + `lastRemoveSnapshot`, tests in `useArxmlStore.removeBswmdFromDisk.test.ts` cover the round-trip, **but there is no UI affordance to trigger it**. A user who picks "cascade-and-unlink" (the only path that pushes a snapshot) and immediately regrets has no recourse besides re-loading the BSWMD file from disk via the picker.

2. **`mutation.action.removeModuleAria` i18n key unused** — declared at `src/shared/i18n.ts:364` (type), `:910` (zh-CN "移除 BSWMD '{name}'"), `:1403` (en "Remove BSWMD '{name}'"), but `ContextMenu.tsx:311-324` `buildBswmdItems` doesn't set `aria-label` on the rendered `<li>`. Screen readers announce only the `label` text without the interpolated `{name}` disambiguation.

3. **`projectPanel.removeBswmdAria` key missing** — type declaration at `src/shared/i18n.ts:143` only lists `projectPanel.removeArxmlAria`. Both `ProjectPanel.tsx:133` (BSWMD row × button) and `FileListTab.tsx:161` (ARXML row × button — same cross-contamination) reuse the ARXML key. Existing tests pass only because the ARXML aria string happens to read sensibly when the row is a BSWMD.

These are nit-level (don't affect functionality) but cheap to fix as a PATCH.

## 2. Approach (locked by user — "你定")

**Undo UI** — reuse existing `ToastState` infrastructure with a small extension. **Not** a new component, **not** a keyboard shortcut, **not** an AppHeader toolbar button.

| Option considered                                  | Verdict              | Reason                                                                                                        |
| -------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------- |
| **A. Toast with Undo action button** ✅             | **Selected**         | Extends existing typed `ToastState` (single field addition); `ErrorBanner` already renders all toast kinds. Self-dismisses after 8s — matches destructive-action UX in VSCode / Figma. |
| B. AppHeader dropdown "Edit" menu item             | Rejected             | Low discoverability (user just removed, doesn't think to look in chrome). Menu pattern is for low-freq actions. |
| C. Toolbar Undo button (always visible, disabled)  | Rejected             | Violates the existing "低频操作不放工具栏" convention (AppHeader only carries Save / Save All / project chip). |
| D. Toast + Ctrl+Z global shortcut                  | Deferred to future   | Best UX for power users but introduces shortcut conflicts with Electron menu (Edit → Undo built-in). Adds keyboard handler with minimal payoff. Revisit when shortcut layer is centralized. |

The PATCH scope locks to Option A. Ctrl+Z and dropdown alternatives are explicitly out of scope.

## 3. Architecture

### 3.1 Type extension

`src/renderer/store/useArxmlStore.ts:71-82` — `ToastState` gets one optional field:

```ts
export interface ToastState {
  readonly kind: ToastKind;
  readonly message: string;
  readonly autoDismissMs?: number;
  /** Sprint 17 PATCH — optional action button (Undo etc). The ErrorBanner
   *  renders a button next to copy / dismiss when this is set. Clicking
   *  the button calls `onActivate`; the caller is responsible for clearing
   *  the toast (typically via dismissToast) afterwards. */
  readonly action?: { readonly label: string; readonly onActivate: () => void };
}
```

The legacy `error: string | null` field is left untouched. `ErrorBanner` reads `toast.action` only — no migration needed.

### 3.2 Component changes

**`src/renderer/components/ErrorBanner.tsx`** (the only renderer change for undo UI):
- New button in the existing `.error-banner-actions` div: `<button className="error-banner-btn error-banner-action" data-testid="error-banner-action" onClick={action.onActivate}>{action.label}</button>`
- Renders when `toast.action !== undefined`
- Click does NOT auto-dismiss — the caller's `onActivate` is responsible (typically wraps `dismissToast()`)
- Button styling matches existing `.error-banner-btn` (same as copy / view buttons)

### 3.3 Hook changes

**`src/renderer/hooks/useProjectActions.ts:673-678`** — the `cascade-and-unlink` success branch:

Before:
```ts
const r = await useArxmlStore.getState().removeBswmdFromDisk(path);
if (r.kind === 'write-failed') return { kind: 'error', message: r.message };
return { kind: r.kind };
```

After:
```ts
const r = await useArxmlStore.getState().removeBswmdFromDisk(path);
if (r.kind === 'write-failed') return { kind: 'error', message: r.message };
if (r.kind === 'ok') {
  // Capture the snapshot reference AFTER the remove (the store
  // pushed it inside removeBswmdFromDisk). Used by the Undo
  // handler below for stale-toast defense.
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
            // Same snapshot — safe to undo
            useArxmlStore.getState().undoLastRemoveBswmd();
          } else {
            // Stale toast: another remove replaced the snapshot, or the
            // user added the same BSWMD back via the picker. Don't
            // undo someone else's remove. Surface a localized info
            // toast explaining why.
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
```

**Why capture snapshot AFTER the call**: `removeBswmdFromDisk` pushes the snapshot inside the store action (line 348 of `bswmdSlice.ts`). Reading `lastRemoveSnapshot` after the `await` guarantees we have the value we want to undo. Reading before would always see the previous snapshot (or null).

**Why snapshot.path check**: prevents a stale toast (one still rendered in the DOM after a newer remove replaced the snapshot) from accidentally undoing a different BSWMD. Standard undo/redo race defense.

### 3.4 i18n additions

`src/shared/i18n.ts` — three new keys (type declaration + zh-CN value + en value):

| Key                              | zh-CN                                    | en                                           |
| -------------------------------- | ---------------------------------------- | -------------------------------------------- |
| `mutation.action.undo`           | 撤销                                     | Undo                                         |
| `mutation.action.bswmdRemoved`   | 已移除 BSWMD '{name}'                    | Removed BSWMD '{name}'                       |
| `mutation.action.undoFailed`     | 撤销失败：BSWMD 已恢复或被替换           | Undo failed: BSWMD already restored or replaced |

And one key to fix the ARIA cross-contamination:

| Key                              | zh-CN                                    | en                                           |
| -------------------------------- | ---------------------------------------- | -------------------------------------------- |
| `projectPanel.removeBswmdAria`   | 移除 BSWMD '{name}'                      | Remove BSWMD '{name}'                        |

The existing `mutation.action.removeModuleAria` key (already declared + translated, just unused) is wired up in §3.5.

### 3.5 ARIA fixes

**`ContextMenu.tsx:311-324`** — `buildBswmdItems` adds `ariaLabel: t(locale, 'mutation.action.removeModuleAria', { name: target.shortName })` to the spec. The render path (`ContextMenu.tsx:496-514` `<li>` rendering) is extended to read `spec.ariaLabel` and forward it to the `<li>`'s `aria-label` attribute.

**`ProjectPanel.tsx:133`** — replace `t(locale, 'projectPanel.removeArxmlAria', { name: basename(p) })` with `t(locale, 'projectPanel.removeBswmdAria', { name: basename(p) })`. This is the BSWMD row × button (the ARXML section above uses `onRemove` with a different `removeArxmlAria` consumer — the `FileList` prop `onRemove` already passes the path; the aria key choice is hard-coded inside `FileList` itself, not in the parent).

**`FileListTab.tsx:161`** — same change. The FileListTab renders ARXML × buttons but the existing `removeArxmlAria` is the right key there (it IS an ARXML row). Wait — confirm by re-reading FileListTab.tsx:155-170 before implementation. If FileListTab:155-170 renders BSWMD × buttons under the same path, the fix is the same as ProjectPanel. If it's strictly ARXML, leave it alone.

This will be resolved during the writing-plans phase by a Read of FileListTab.tsx:155-170. If the BSWMD × button path turns out to be in FileListTab too (not just ProjectPanel), the fix is symmetric.

### 3.6 What we are NOT changing

- `bswmdSlice.ts` — store action `undoLastRemoveBswmd` already exists, behavior correct. The PATCH adds no store changes.
- The 4-option `RemoveModuleConfirmDialog.tsx` — the `'only'` and `'cascade'` branches do NOT push snapshots (only `'cascade-and-unlink'` does, by design). Undo is intentionally scoped to the destructive option.
- `removeBswmdWithGuard` (legacy hook) — superseded by `removeBswmdWithFullFlow`. Still exported for back-compat; no changes.
- `useArxmlStore.undoLastCommit` (the analogous ECUC undo) — separate concern, separate snapshot, separate UI work (not in scope).
- Global Ctrl+Z keyboard handler — explicit deferral per §2.

## 4. Error handling matrix

| Scenario                                              | Behavior                                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Toast auto-dismissed (8s timer), Undo not clicked     | `dismissToast()` clears UI; `lastRemoveSnapshot` retained in store; second remove replaces it; no undo possible until next `cascade-and-unlink` |
| User clicks Undo within 8s, snapshot still valid      | `undoLastRemoveBswmd()` re-inserts schema into `bswmdSchemas`, clears snapshot, dismisses toast |
| User clicks Undo within 8s, snapshot replaced         | Stale-toast defense: `setInfo(undoFailed, 4000)` — explains why, dismisses the success toast |
| User clicks Undo, snapshot was cleared by `addBswmd`   | `undoLastRemoveBswmd` no-ops (existing guard `if (snapshot === null) return`); toast still dismisses |
| User clicks Undo, `undoLastRemoveBswmd` IPC fails    | The action is purely in-memory (no IPC), so this branch is unreachable. `bswmdSlice.ts:369-393` only mutates local state. |
| BSWMD file still exists on disk after undo            | The undo only restores the in-memory schema (mirroring `undoLastCommit`). The disk file state is unchanged. The user can re-`addBswmd` via the picker if they want to re-attach. Documented in toast caption. |

No new IPC channels. No new file system operations. No new dependencies.

## 5. Testing strategy

| Test                                                              | Type           | Coverage                                                                                       |
| ----------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| `ErrorBanner.test.tsx` — new case: renders action button          | Unit           | `data-testid="error-banner-action"` present when `toast.action` set; absent otherwise           |
| `ErrorBanner.test.tsx` — click triggers `onActivate`              | Unit           | `onActivate` called once per click                                                              |
| `ErrorBanner.test.tsx` — click does NOT auto-dismiss              | Unit           | Verify `dismissToast` is NOT called by the button itself (caller's responsibility)             |
| `uiSlice.setSuccess` with action arg                              | Unit           | Store state correctly writes `action: { label, onActivate }` to `toast` field                   |
| `useProjectActions.test.ts` — cascade-and-unlink success           | Integration    | `setSuccess` called with `mutation.action.bswmdRemoved` message + Undo action                   |
| `useProjectActions.test.ts` — Undo stale-snapshot defense           | Integration    | Replace `lastRemoveSnapshot` between set and click; onActivate goes to `setInfo(undoFailed)` branch |
| `useProjectActions.test.ts` — Undo fresh snapshot                 | Integration    | onActivate calls `undoLastRemoveBswmd` + `dismissToast`                                        |
| `ContextMenu.test.tsx` — remove-module item has aria-label         | Unit           | `<li>` element has `aria-label` matching `mutation.action.removeModuleAria` resolved value      |
| `ProjectPanel.test.tsx` — BSWMD × button uses `removeBswmdAria`    | Unit           | `aria-label` resolves to "Remove BSWMD {name}" / "移除 BSWMD {name}"                            |
| `FileListTab.test.tsx` — same assertion (if BSWMD × lives there)  | Unit           | Same as above                                                                                  |

No E2E test added. Existing Sprint 17 P4 Playwright tests (`tests/e2e/remove-bswmd.spec.ts`, `tests/e2e/remove-bswmd-from-disk.spec.ts`) cover the remove flow; the undo path is purely renderer-state (no new IPC) so unit + integration coverage is sufficient. Adding E2E would slow the PATCH without commensurate signal.

## 6. Scope

**In scope:**
- `ToastState` type extension (`action?: { label, onActivate }`)
- `ErrorBanner.tsx` action button rendering
- `useProjectActions.removeBswmdWithFullFlow` cascade-and-unlink branch modification
- `i18n.ts` 3 new mutation keys + 1 new projectPanel key
- `ContextMenu.tsx` aria-label wiring on remove-module item
- `ProjectPanel.tsx:133` aria key swap (and `FileListTab.tsx:161` if FileListTab hosts BSWMD ×)
- ~9 new tests / 2 test files updated

**Out of scope (deferred):**
- Global Ctrl+Z keyboard shortcut (revisit when shortcut layer is centralized)
- AppHeader dropdown "Edit" menu item with Undo
- Multi-level undo (single-level is the existing store contract)
- Undo affordance for `only` / `cascade` choices (no snapshot pushed for these paths by design)
- `undoLastCommit` (ECUC undo) UI affordance — separate concern

## 7. Files

**Modified** (5 + conditional):
- `src/renderer/store/useArxmlStore.ts` — `ToastState.action` field
- `src/renderer/components/ErrorBanner.tsx` — action button render
- `src/renderer/hooks/useProjectActions.ts` — cascade-and-unlink success branch
- `src/shared/i18n.ts` — 4 new keys (3 mutation + 1 projectPanel)
- `src/renderer/components/ContextMenu.tsx` — `buildBswmdItems` aria-label + render
- `src/renderer/components/ProjectPanel.tsx` — aria key swap at line 133
- `src/renderer/components/FileListTab.tsx` — aria key swap at line 161 (conditional, if BSWMD × lives there)

**Test** (2 updated + 1 conditional):
- `src/renderer/components/__tests__/ErrorBanner.test.tsx` — 3 new cases
- `src/renderer/hooks/__tests__/useProjectActions.removeBswmd.test.ts` — 3 new cases (or new file if existing test coverage is sparse)
- `src/renderer/components/__tests__/ContextMenu.removeModule.test.tsx` — 1 new case
- `src/renderer/components/__tests__/ProjectPanel.test.tsx` (or similar) — 1 new case
- `src/renderer/components/__tests__/FileListTab.test.tsx` (or similar) — 1 new case (conditional)

**Docs** (1):
- This spec file

## 8. Test count delta

Expected: +7 to +10 tests depending on FileListTab verification. Existing v1.8.0 K Stencil baseline: see git log (HEAD `2b3e21c`) — `pnpm test` count to be measured at planning time.

## 9. Risks

| Risk                                                                  | Likelihood | Mitigation                                                                                       |
| --------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| `setSuccess` signature change (adding 3rd arg) breaks existing callers | Low        | `action` is positional-optional; only the cascade-and-unlink branch passes it. All other call sites (AppHeader save-error, etc.) continue to work with the old 2-arg form. |
| `lastRemoveSnapshot` path comparison is brittle (string equality)     | Low        | Paths are stable file paths; no normalization needed. `snapshot.path` is set from `state.bswmdPaths[idx]` inside `removeBswmdFromDisk` — same source as the action's undo target. |
| `ErrorBanner` action button visual conflict with existing buttons     | Low        | New CSS class `.error-banner-action` can reuse `.error-banner-btn` styling; if a distinctive style is desired (e.g. primary color), it's a CSS-only change. |
| Race between onActivate and store mutation                            | Very low   | `onActivate` reads `lastRemoveSnapshot` synchronously from `getState()` before calling `undoLastRemoveBswmd`. The store's `undoLastRemoveBswmd` is synchronous (no IPC). Race window is microseconds and benign. |

## 10. Open questions for the writing-plans phase

1. **`FileListTab.tsx:155-170`** — does it host a BSWMD × button or only ARXML? Read during planning; if BSWMD × is in FileListTab, the aria swap mirrors ProjectPanel; if not, FileListTab stays unchanged.
2. **`useArxmlStore.setSuccess` signature** — current is `(message, autoDismissMs?)`. Adding 3rd `action` arg means callers without action use the 2-arg form. Verify no other call site needs migration by `grep -r "\.setSuccess(" src/`. Expected result: only the cascade-and-unlink branch in useProjectActions.ts.
3. **Toast 8s default** — the store's `setSuccess` default is 3000ms (info/success). Forcing 8000ms here matches destructive-action UX. Plan task: pass `8000` explicitly; do NOT change the default in `uiSlice.ts` (would affect all success toasts).

All three resolved by Reads during planning — no new design decisions.
