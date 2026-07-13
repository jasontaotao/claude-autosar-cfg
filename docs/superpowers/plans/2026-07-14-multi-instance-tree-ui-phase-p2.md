# Phase P2 Implementation Plan — Multi-Instance Tree Row Buttons

> **For agentic workers:** REQUIRED SUB-SKILL: Subagent-Driven Development (per Phase P1 cycle which validated the methodology end-to-end at scale: 9 sub-agents, 2 fix loops, 1 false-positive adjudication). Per-task implementer + reviewer + (conditional) fix loop + final whole-branch review.

**Goal:** Add row buttons + ContextMenu entries for collection-level operations: **duplicate last instance**, **sort siblings by shortName suffix**, **bulk-delete all siblings**. Closes the P2 scope of the multi-instance tree UI enhancement (per spec `docs/superpowers/specs/2026-07-13-multi-instance-tree-ui-design.md` §Phased delivery §P2). All mutations go through `coreAddContainer` / `coreRemoveContainer` (existing core); no new IPC channels.

**Architecture:** **T1 = mutation actions** (`mutationSlice.ts` 3 new actions: `duplicateContainer` / `sortSiblings` / `bulkDelete`) → **T2 = ContextMenu extension** (action union + 2 new builders for collection kind) → **T3 = CollectionHeader row buttons** (3 hover-visible buttons + props) → **T4 = i18n** (4 keys × 2 locales + parity test + useTranslation swap) → **T5 = ship PATCH v1.54.3** (docs + tag + release). Total: 4 source commits + 1 docs ship. Pure UI + slice actions — no backend / no schema / no IPC.

**Tech Stack:** Electron + TypeScript 5.6 + React 19 + vitest 3 + jsdom 30+. Pure TS + React. No new deps. Reuses existing `coreAddContainer` (auto-suffix at `src/core/arxml/mutation/container-ops.ts:98-103`) + existing `coreRemoveContainer` + existing `t(locale, key)` helper from `@shared/i18n`.

**Baseline:** `4f1ed8c` (v1.54.2 PATCH post-Phase-P1; 3190 + 7 SKIP / 0 fail)
**Target:** 3198 + 7 SKIP / 0 fail (+8 net: T1 +3 + T2 +2 + T3 +2 + T4 +1)

---

## Global Constraints

(Inherit verbatim from `docs/superpowers/specs/2026-07-13-multi-instance-tree-ui-design.md` + Phase P1 lessons. Implementer MUST obey these.)

- All modified/new files end with trailing newline.
- No `console.log` in production code; `console.warn` / `console.error` allowed for defensive warnings.
- 中文 for user-facing/business comments; 英文 for technical API/protocol comments per CLAUDE.md.
- **Subagent-Driven Development** (skill) — one implementer + one reviewer per task; fix loop on Critical/Important findings; final whole-branch review.
- Each task ends with `pnpm verify` 8-stage GREEN (per v1.45.0 lesson).
- Existing UI behavior MUST be preserved: real sibling rows still render via existing path; `addContainer` (+ button from P1) still works; `addContainer` for at-max still disabled.
- **Zero new test files outside the listed test files** per task. No opportunistic test additions.
- Exact values (file paths, function names, prop names, testid values, i18n keys) MUST match this plan + spec verbatim.
- After commit, dispatch `pkm-capture` agent. If pkm-capture fails, write the vault files directly (per v1.41.2 PATCH T3 process deviation).
- Implementer MUST NOT make destructive git operations (`reset --hard`, `push --force`) on `origin/main`.

### Decisions (locked from spec + Phase P1 + user direction 2026-07-14)

- **D-1 duplicateContainer**: copies the **last instance**'s parameters (highest-suffix `_N`) as defaults for the new instance. Rationale: lowest friction (user is at end of list); predictable behavior; matches "duplicate next" convention from spreadsheet UIs. NOT the bare-bsname (e.g. `Cell` not `Cell_1`) — that would require a separate selector that doesn't exist in current state.
- **D-2 sortSiblings**: sorts by **shortName suffix numeric ascending** (`_1` < `_2` < `_10`). Default. P3 may add a toggle for creation-order sort. Comparator is `(a, b) => compareSuffix(a.shortName, b.shortName)` extracted to a utility in `src/renderer/components/tree/collections.ts` (T1 sibling of existing `groupSiblingsByShortName` + `maxCollectionSize`).
- **D-3 ContextMenu vs row buttons**: **BOTH coexist**. Row buttons (3 small icon buttons) appear on CollectionHeader hover (already P1-hover affordance pattern). ContextMenu (right-click on header) shows the same 3 actions + an existing "Open BSWMD picker" / "Add container" / etc. Action union is extended with `kind: 'collection'` discriminator.
- **D-4 bulk-delete confirmation**: shows a `ConfirmDialog` (existing component at `src/renderer/components/ConfirmDialog.tsx`) with message "Delete all N siblings of `<shortName>`?" + Cancel/Delete buttons. No undo (YAGNI; user can re-add via +1).
- **D-5 hover-only row buttons**: CSS `:hover { opacity: 1 }` + default `opacity: 0` on the button group; `pointer-events: none` when hidden to avoid blocking clicks on siblings. A11y: buttons are always focusable (tabindex=0) but visually de-emphasized until hover/focus.

---

## File Structure (locked by spec section "Files to modify")

### New files (1)

- `src/renderer/components/tree/__tests__/Tree.rowButtons.test.tsx` (~120 LoC, 2 scenarios for T3 row buttons integration)

### Modified files (6)

- `src/renderer/store/slices/mutationSlice.ts` (+180 LoC: 3 actions)
- `src/renderer/components/ContextMenu.tsx` (+60 LoC: 3 new action union variants + 1 new builder branch)
- `src/renderer/components/tree/CollectionHeader.tsx` (+80 LoC: 3 new props + 3 button JSX)
- `src/renderer/components/tree/collections.ts` (+30 LoC: `compareSuffix` utility for sortSiblings)
- `src/renderer/components/tree/Tree.tsx` (+60 LoC: wire 3 button callbacks to mutationSlice)
- `src/shared/i18n/editor.ts` (+25 LoC: 4 new keys × 2 locales)

### Modified test files (3)

- `src/renderer/store/__tests__/useArxmlStore.mutation.test.ts` (+60 LoC: 3 new actions unit tests for T1)
- `src/renderer/components/ContextMenu.test.tsx` (existing — add 2 new scenarios for T2 collection menu)
- `src/renderer/components/tree/__tests__/CollectionHeader.test.tsx` (+30 LoC: 2 new scenarios for T3 buttons)

---

## Task 1: mutationSlice actions — `duplicateContainer` / `sortSiblings` / `bulkDelete`

**Files:**
- Modify: `src/renderer/store/slices/mutationSlice.ts:55-137`
- Modify: `src/renderer/components/tree/collections.ts` (add `compareSuffix`)
- Test: `src/renderer/store/__tests__/useArxmlStore.mutation.test.ts` (add 3 new scenarios)

**Interfaces:**
- Consumes: existing `coreAddContainer`, `coreRemoveContainer` from `src/core/arxml/mutation/container-ops.ts`
- Produces: 3 new `StateCreator` actions on the mutation slice

### Step 1: Write failing tests (RED)

In `useArxmlStore.mutation.test.ts`, append 3 new `describe` blocks:

```ts
describe('duplicateContainer', () => {
  it('creates a new sibling with auto-suffix _N+1 and copies the last sibling\'s params', () => {
    // fixture: parent has 3 children (Cell, Cell_1, Cell_2 with cellParams set)
    // action: store.getState().duplicateContainer(parentPath, 'Cell')
    // assertion: cellChildren.length === 4; cellChildren[3].shortName === 'Cell_3';
    //            cellChildren[3].params matches cellChildren[2].params
  });

  it('no-op when no siblings exist', () => {
    // fixture: parent has 0 children
    // action: store.getState().duplicateContainer(parentPath, 'Cell')
    // assertion: no-op (or returns error envelope — depends on impl); 0 children remain
  });
});

describe('sortSiblings', () => {
  it('reorders siblings by shortName suffix numeric ascending', () => {
    // fixture: parent has [Cell_3, Cell_1, Cell_2, Cell_10, Cell]
    // action: store.getState().sortSiblings(parentPath)
    // assertion: new order is [Cell, Cell_1, Cell_2, Cell_3, Cell_10]
  });
});

describe('bulkDelete', () => {
  it('removes all siblings matching the base shortName', () => {
    // fixture: parent has [Cell, Cell_1, Cell_2, Other]
    // action: store.getState().bulkDelete(parentPath, 'Cell')
    // assertion: cellChildren gone; Other remains
  });
});
```

### Step 2: Run tests, verify FAIL

Run: `pnpm test src/renderer/store/__tests__/useArxmlStore.mutation.test.ts`
Expected: FAIL with "duplicateContainer is not a function" or similar.

### Step 3: Implement `compareSuffix` utility (in `collections.ts`)

```ts
/**
 * Compare two shortNames by suffix-numeric ascending. Bare shortName sorts
 * before all suffixed siblings (e.g. `Cell` < `Cell_1` < `Cell_2` < `Cell_10`).
 *
 * Used by `sortSiblings` to give collections a predictable display order.
 */
export function compareSuffix(a: string, b: string): number {
  const aBase = stripSuffixLocal(a);
  const bBase = stripSuffixLocal(b);
  if (aBase !== bBase) return aBase.localeCompare(bBase);
  const aSuffix = extractSuffix(a);
  const bSuffix = extractSuffix(b);
  return aSuffix - bSuffix;
}

function stripSuffixLocal(name: string): string {
  return name.replace(/_[0-9]+$/, '');
}
function extractSuffix(name: string): number {
  const m = name.match(/_([0-9]+)$/);
  return m ? parseInt(m[1]!, 10) : -1; // bare name = -1, sorts before _0
}
```

**Important**: `stripSuffix` is currently private in `collections.ts`. Either re-export it, or duplicate the 1-line regex. **Recommendation**: export `stripSuffix` (it's a 1-line utility; no risk of divergence if both `groupSiblingsByShortName` and `compareSuffix` use the same regex).

### Step 4: Implement 3 mutation slice actions

In `mutationSlice.ts`, append after the existing `addContainer` (line 137):

```ts
// duplicateContainer — creates a new sibling with auto-suffix, copying the LAST
// sibling's params as defaults. Per spec D-1.
duplicateContainer: (parentPath: string, baseShortName: string) => void;

// sortSiblings — reorders all siblings with the same baseShortName by suffix
// numeric ascending (Cell, Cell_1, Cell_2, ...). Per spec D-2.
sortSiblings: (parentPath: string) => void;

// bulkDelete — removes all siblings matching baseShortName under parentPath.
// Caller is responsible for confirmation dialog (per spec D-4).
bulkDelete: (parentPath: string, baseShortName: string) => void;
```

Implementations follow the same combined-mode / single-mode pattern as `addContainer` (lines 72-137). Internal use of `coreAddContainer` / `coreRemoveContainer` from `src/core/arxml/mutation/container-ops.ts`. For `duplicateContainer`, the source's params come from the LAST sibling (highest-suffix `_N`) — find via `findLastSiblingsWithShortName(parent, baseShortName)` (helper to be added inline in `mutationSlice.ts` or a small util).

### Step 5: Run tests, verify PASS

Run focused suite + full `pnpm verify` 8-stage GREEN.

### Step 6: Commit

```bash
git add src/renderer/store/slices/mutationSlice.ts \
        src/renderer/components/tree/collections.ts \
        src/renderer/store/__tests__/useArxmlStore.mutation.test.ts
git commit -m "feat(tree): Phase P2 T1 -- mutationSlice duplicate/sort/bulk-delete actions"
```

---

## Task 2: ContextMenu extension — 3 new action variants + collection-kind builder

**Files:**
- Modify: `src/renderer/components/ContextMenu.tsx:68-79` (action union) + `:617-653` (`buildItems` dispatch)
- Test: `src/renderer/components/ContextMenu.test.tsx` (add 2 scenarios)

### Step 1: Write failing test

```ts
describe('ContextMenu — collection kind', () => {
  it('shows duplicate / sort / bulk-delete items when target.kind === collection', () => {
    render(<ContextMenu target={{ kind: 'collection', path: '...', shortName: 'Cell' }} ... />);
    expect(screen.getByText(/复制上一实例/i)).toBeInTheDocument();
    expect(screen.getByText(/排序/i)).toBeInTheDocument();
    expect(screen.getByText(/删除全部/i)).toBeInTheDocument();
  });

  it('does NOT show duplicate / sort / bulk-delete for non-collection targets', () => {
    render(<ContextMenu target={{ kind: 'container', path: '...', shortName: 'Cell_1' }} ... />);
    expect(screen.queryByText(/复制上一实例/i)).toBeNull();
  });
});
```

### Step 2: Run test, verify FAIL

### Step 3: Extend action union + buildItems

Add to `ContextMenuAction` union (line 68-79):
```ts
| 'duplicate-children' { path, shortName }
| 'sort-children' { path }
| 'bulk-delete-children' { path, shortName }
```

Add to `ContextMenuTarget` union (line 48-59):
```ts
| { kind: 'collection', path, shortName }
```

Add new builder `buildCollectionItems(target, ...)` (around line 343-396):
```ts
function buildCollectionItems(target: Extract<ContextMenuTarget, { kind: 'collection' }>) {
  return [
    { label: t('tree.duplicateChildren'), action: { kind: 'duplicate-children', path: target.path, shortName: target.shortName } },
    { label: t('tree.sortChildren'), action: { kind: 'sort-children', path: target.path } },
    { label: t('tree.bulkDelete'), action: { kind: 'bulk-delete-children', path: target.path, shortName: target.shortName }, destructive: true },
  ];
}
```

Extend `buildItems` (line 617) to dispatch collection kind BEFORE the container fall-through.

### Step 4: Run tests, verify PASS + pnpm verify 8-stage GREEN

### Step 5: Commit

```bash
git add src/renderer/components/ContextMenu.tsx \
        src/renderer/components/ContextMenu.test.tsx
git commit -m "feat(tree): Phase P2 T2 -- ContextMenu collection kind + duplicate/sort/bulk actions"
```

---

## Task 3: CollectionHeader row buttons + Tree wiring

**Files:**
- Modify: `src/renderer/components/tree/CollectionHeader.tsx`
- Modify: `src/renderer/components/tree/Tree.tsx`
- Test: `src/renderer/components/tree/__tests__/CollectionHeader.test.tsx` (2 new scenarios)
- New: `src/renderer/components/tree/__tests__/Tree.rowButtons.test.tsx` (2 scenarios)

### Step 1: Write failing tests

**CollectionHeader.test.tsx** (add 2 scenarios):
```ts
it('renders 3 row buttons with hover-affordance CSS', () => { ... });
it('fires onDuplicate / onSortChildren / onBulkDelete when buttons clicked', () => { ... });
```

**Tree.rowButtons.test.tsx** (new file, 2 scenarios):
```ts
it('wires CollectionHeader onDuplicate to mutationSlice.duplicateContainer', () => { ... });
it('wires CollectionHeader onBulkDelete to mutationSlice.bulkDelete after confirm', () => { ... });
```

### Step 2: Run tests, verify FAIL

### Step 3: Extend CollectionHeader props + JSX

Add 3 new props to `CollectionHeaderProps`:
```ts
readonly onDuplicate?: () => void;
readonly onSortChildren?: () => void;
readonly onBulkDelete?: () => void;
```

Add 3 buttons in JSX (after the existing `+ 1` button), wrapped in a `<div className="tree-collection-actions">` with `opacity: 0` by default + `opacity: 1` on parent hover (CSS in `styles.css`).

Buttons (only render if callback provided):
- Duplicate button: `aria-label="复制上一实例"`, testid `duplicate-collection-${shortName}`
- Sort button: `aria-label="排序"`, testid `sort-collection-${shortName}`
- Bulk-delete button: `aria-label="删除全部"`, testid `bulk-delete-collection-${shortName}`, red color

### Step 4: Wire Tree.tsx to pass callbacks

In `Tree.tsx`, in the collection-branch render:
```tsx
<CollectionHeader
  ...
  onDuplicate={() => store.getState().duplicateContainer?.(parentPath, baseName)}
  onSortChildren={() => store.getState().sortSiblings?.(parentPath)}
  onBulkDelete={() => {
    if (window.confirm(`Delete all ${group.length} siblings of ${baseName}?`)) {
      store.getState().bulkDelete?.(parentPath, baseName);
    }
  }}
/>
```

(`window.confirm` is acceptable for P2 per spec D-4 — full ConfirmDialog UI deferred.)

### Step 5: CSS hover affordance

Append to `styles.css`:
```css
.tree-collection-actions { opacity: 0; pointer-events: none; transition: opacity 120ms; }
.tree-item-collection:hover .tree-collection-actions,
.tree-collection-actions:focus-within { opacity: 1; pointer-events: auto; }
```

### Step 6: Run tests, verify PASS + pnpm verify 8-stage GREEN

### Step 7: Commit

```bash
git add src/renderer/components/tree/CollectionHeader.tsx \
        src/renderer/components/tree/Tree.tsx \
        src/renderer/components/tree/styles.css \
        src/renderer/components/tree/__tests__/CollectionHeader.test.tsx \
        src/renderer/components/tree/__tests__/Tree.rowButtons.test.tsx
git commit -m "feat(tree): Phase P2 T3 -- CollectionHeader row buttons (duplicate/sort/bulk) + Tree wiring"
```

---

## Task 4: i18n — 4 keys × 2 locales + useTranslation swap

**Files:**
- Modify: `src/shared/i18n/editor.ts` (interface + en + zh-CN bundles — 4 keys)
- Modify: `src/renderer/components/tree/CollectionHeader.tsx` (swap literal hover-strings for `useArxmlStore((s) => s.locale) + t(locale, key)`)
- Modify: `src/renderer/components/ContextMenu.tsx` (swap literal strings in `buildCollectionItems`)
- Test: `src/shared/i18n/__tests__/editor.parity.test.ts` (add 4 new keys parity assertions)

### Step 1: Write failing parity test

Append to `editor.parity.test.ts`:
```ts
for (const key of ['tree.duplicateChildren', 'tree.sortChildren', 'tree.bulkDelete', 'tree.bulkDeleteConfirm']) {
  expect(en[key], `en.${key}`).toBeTruthy();
  expect(zh[key], `zh.${key}`).toBeTruthy();
}
```

### Step 2: Run test, verify FAIL

### Step 3: Add 4 keys to `editor.ts`

```ts
// en
'tree.duplicateChildren': 'Duplicate last instance',
'tree.sortChildren': 'Sort siblings',
'tree.bulkDelete': 'Delete all siblings',
'tree.bulkDeleteConfirm': 'Delete all N siblings of <name>?',

// zh-CN
'tree.duplicateChildren': '复制上一实例',
'tree.sortChildren': '排序兄弟',
'tree.bulkDelete': '删除全部兄弟',
'tree.bulkDeleteConfirm': '删除 <name> 的全部 N 个实例?',
```

### Step 4: Swap literals in CollectionHeader + ContextMenu

Replace literal `"复制上一实例"` / `"排序"` / `"删除全部"` / `"Delete all N siblings?"` with `t(locale, 'tree.*')` calls. Use `useArxmlStore((s) => s.locale)` selector (NOT `useTranslation` — codebase has no `react-i18next` dep, per Phase P1 T4 D1 lesson).

### Step 5: Run tests, verify PASS + pnpm verify 8-stage GREEN

### Step 6: Commit

```bash
git add src/shared/i18n/editor.ts \
        src/renderer/components/tree/CollectionHeader.tsx \
        src/renderer/components/ContextMenu.tsx \
        src/shared/i18n/__tests__/editor.parity.test.ts
git commit -m "feat(i18n): Phase P2 T4 -- 4 collection-action keys x 2 locales + CollectionHeader/ContextMenu swap"
```

---

## Task 5: Ship PATCH v1.54.3 — docs + CHANGELOG + release-notes + tag + GH release

**Files:**
- Modify: `package.json` (1.54.2 → 1.54.3)
- Modify: `CHANGELOG.md` (append v1.54.3 entry)
- Create: `docs/release-notes/v1.54.3/README.md`
- Modify: `docs/user-manual.html` (add v1.54.3 row + update hero)

### Step 1: Determine version

Per `release-checklist-must-verify-package.json-bump` (standalone, 7th application): v1.54.3 PATCH (pure UI + slice actions, no IPC/backend/schema).

### Step 2: Bump package.json

```json
"version": "1.54.3",
```

### Step 3: CHANGELOG entry

```markdown
## v1.54.3 (2026-07-14) — PATCH (Multi-Instance Tree Row Buttons, Phase P2)

**Phase P2 of multi-instance tree UI enhancement.** Adds row buttons + ContextMenu entries on CollectionHeader for collection-level operations: duplicate last instance, sort siblings by suffix numeric ascending, bulk-delete all siblings. Closes the collection-management UX gap surfaced by Phase P1.

T1 `<sha>` — feat(store): mutationSlice duplicateContainer / sortSiblings / bulkDelete (3 new actions, +180 LoC, +3 tests)
T2 `<sha>` — feat(ContextMenu): collection-kind action union + 3 new action variants + item builder
T3 `<sha>` — feat(tree): CollectionHeader 3 row buttons (hover affordance) + Tree wiring
T4 `<sha>` — feat(i18n): 4 collection-action keys × 2 locales + parity + ContextMenu/CollectionHeader swap

Test delta: 3190 → 3198 + 7 SKIP / 0 fail (+8 net). pnpm verify 8-stage GREEN.

Process lessons applied: function-extract-must-clip-verbatim-not-reimplement (now standalone from 3 confirmations).
```

### Step 4: Create release-notes README

`docs/release-notes/v1.54.3/README.md` (template per v1.54.2 README; list 4 source commits + decisions D1-D5 + user-visible behavior).

### Step 5: Update user-manual.html

Add `<li><strong>v1.54.3 PATCH · 2026-07-14</strong> — Multi-Instance Tree Row Buttons (Phase P2). ... </li>` to the Whole-Project Review section (after v1.54.2). Update hero / brand / RELEASE HISTORY header (28 → 29 ships, 2026-07-13 → 2026-07-14).

Re-render PNG with `node scripts/_render-user-manual-png.mjs` (one-shot).

### Step 6: Tag + push + GH release

```bash
git tag -a v1.54.3 -m "v1.54.3 PATCH -- Phase P2 multi-instance tree row buttons"
git push origin main --tags
gh release create v1.54.3 --title "v1.54.3 — Phase P2 Multi-Instance Tree Row Buttons (PATCH)" --notes-file <(cat docs/release-notes/v1.54.3/README.md)
```

If `gh release create` rejected (per v1.54.0 pattern), retry once or instruct user to run manually.

### Step 7: Dispatch pkm-capture

Per v1.43.1 D5 + post-commit hook: dispatch `pkm-capture` agent to update vault `devlog.md` + write capture-decisions file at `claude-autosarcfg-v1-54-3-patch-phase-p2-multi-instance-tree-row-buttons-2026-07-14.md` + update MEMORY.md.

---

## Verification (end-to-end)

After T5 complete:
1. `pnpm verify` exits 0 (8-stage GREEN)
2. Test count 3198 + 7 SKIP / 0 fail (+8 net from v1.54.2)
3. Manual smoke (T3 step analog): open fixture, expand collection header → hover reveals 3 buttons → click duplicate → new `_N+1` instance appears with copied params → click sort → siblings reorder → click bulk-delete → confirm dialog → all siblings removed
4. Tag `v1.54.3` pushed to origin
5. GH release published
6. pkm-capture: vault + MEMORY.md updated; MEMORY.md stays under 17.1KB cap

## Risk register

| Risk | Mitigation |
|---|---|
| `duplicateContainer` triggers N mutations — partial failure leaves inconsistent state | Use `coreAddContainer` × N atomic batch wrapper (per spec §Risks); on failure, rollback via `coreRemoveContainer` |
| `sortSiblings` mutates in-memory doc — race with concurrent edits | Single-store mutation; vitest 3 mock can test concurrent; runtime race window small (UI click); user can undo via manual reorder |
| `bulkDelete` destroys user data without undo | ConfirmDialog before action (spec D-4); no undo for P2 (YAGNI; user can re-add via +1) |
| ContextMenu collection kind collides with existing `bswmd` kind | New discriminator `'collection'` added to union; `buildItems` dispatches collection BEFORE bswmd fall-through |
| `compareSuffix` divergence from `groupSiblingsByShortName` suffix logic | Both call same exported `stripSuffix` (T1 Step 3); single source of truth |
| Row buttons hidden via `opacity: 0` not accessible to keyboard | Buttons stay `tabindex=0`; CSS `:focus-within` reveals them (T3 Step 5); screen-reader users discover them via tab |

## Self-review checklist (before user review)

- [ ] No placeholder ("TBD" / "TODO" / "类似") in any step
- [ ] All file:line references from code-base mapping verified (P1 spec + plan + Explore agent output)
- [ ] All 4 i18n keys parity confirmed
- [ ] Total scope: 4 source commits + 1 docs ship = 5 commits
- [ ] Subagent-Driven Development for each task (per skill)
- [ ] Each task ends with `pnpm verify` GREEN
- [ ] Test delta = +8 (3 + 2 + 2 + 1) confirmed in T5 Step 6

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)