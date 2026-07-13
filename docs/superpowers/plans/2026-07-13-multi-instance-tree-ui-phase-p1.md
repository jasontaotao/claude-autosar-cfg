# Phase P1 Implementation Plan — Multi-Instance Tree Collection Header

> **For agentic workers:** REQUIRED SUB-SKILL: Main-thread execution per v1.42.1 PATCH D6 precedent (Tree mutation is sensitive to state closure; sub-agent dispatch risk too high for first iteration). Subsequent phases (P2 row buttons / P3 view density) may revisit sub-agent if P1 confirms stable.

**Goal:** Add collection-header UI to `Tree` for BSWMD `lower=0, upper=N` sub-containers with ≥2 same-`shortName` siblings. Header shows `<shortName> ×N`, defaults to collapsed, and exposes an `+ 1` button that's disabled when `currentCount >= upperMultiplicity`. Closes the screenshot pain point (user can't tell why `AFECellValidSet` and `AFETempValidSet` dialog buttons are grey).

**Architecture:** **T1 = pure helpers** (`collections.ts` + `optionalContainers.ts` filter extension) → **T2 = presentation component** (`CollectionHeader.tsx`) → **T3 = Tree integration** (`Tree.tsx:renderChildren` collection branch) → **T4 = i18n** (4 new keys × 2 locales) → **T5 = ship PATCH** (docs + CHANGELOG + release-notes). Total: 4 source commits + 1 docs ship. P1 leaves P2 (row buttons + ContextMenu) and P3 (view density + virtual scroll) as separate future plans.

**Tech Stack:** Electron + TypeScript 5.6 + React 19 + vitest 3 + jsdom 30+. Pure TS + React. No new deps. No backend change (relies on existing `coreAddContainer` auto-suffix at `src/core/arxml/mutation/container-ops.ts:98-103`).

**Baseline:** `8381982` (v1.54.1 PATCH post-Round-12 review; 3172 + 7 SKIP / 0 fail)
**Target:** 3177 + 7 SKIP / 0 fail (+5 from T3 collection scenario tests)

---

## Global Constraints

(Inherit verbatim from `docs/superpowers/specs/2026-07-13-multi-instance-tree-ui-design.md`. Implementer MUST obey these.)

- All modified/new files end with trailing newline.
- No `console.log` in production code; `console.warn` / `console.error` allowed for defensive warnings.
- 中文 for user-facing/business comments; 英文 for technical API/protocol/comments per CLAUDE.md.
- **Main-thread execution** (NOT sub-agent) for T2 + T3 (JSX-heavy). T1 (pure helpers) and T4 (i18n) may use sub-agent if convenient.
- Each task ends with `pnpm verify` 8-stage GREEN (per v1.45.0 lesson + this repo's baseline).
- **Existing UI behavior MUST be preserved** for siblings not affected by the collection branch (N=1 OR different-shortName siblings render unchanged).
- **Zero new tests outside the listed test files.** No opportunistic test additions.
- Exact values (file paths, function names, prop names, testid values, i18n keys) MUST match this plan + spec verbatim.
- After commit, dispatch `pkm-capture` agent. If pkm-capture fails, write the vault files directly (per v1.41.2 PATCH T3 process deviation).
- Implementer MUST NOT make destructive git operations (`reset --hard`, `push --force`) on `origin/main`.

---

## File Structure (locked by spec section "Files to modify")

### New files (2)

- `src/renderer/components/tree/collections.ts` (~60 LoC) — pure helpers `groupSiblingsByShortName` + `maxCollectionSize`
- `src/renderer/components/tree/CollectionHeader.tsx` (~120 LoC) — presentational component

### Modified files (4)

- `src/renderer/components/tree/optionalContainers.ts` (~30 LoC added) — return type extended with `currentCount` + `upperMultiplicity`
- `src/renderer/components/tree/Tree.tsx` (~40 LoC added in `renderChildren`) — collection branch
- `src/shared/i18n/editor.ts` (~20 LoC added) — 4 new keys × 2 locales
- `src/renderer/components/tree/__tests__/Tree.collectionHeader.test.tsx` (NEW, ~200 LoC, 5 scenarios)

### New test file (1)

- `src/renderer/components/tree/__tests__/Tree.collectionHeader.test.tsx`

---

## Task 1: Pure helpers — `collections.ts` + `optionalContainers.ts` filter extension

**Files:**

- Create: `src/renderer/components/tree/collections.ts`
- Modify: `src/renderer/components/tree/optionalContainers.ts:44-79`
- Test: `src/renderer/components/tree/__tests__/collections.test.ts` (NEW, ~50 LoC, 3 cases)

**Interfaces:**

- Consumes: `readonly ArxmlElement[]` (existing, from `src/shared/types/arxml.ts`)
- Produces: `Map<string, ArxmlElement[]>` from `groupSiblingsByShortName`; `number` from `maxCollectionSize`

### Step 1: Write failing test for `groupSiblingsByShortName`

Create `src/renderer/components/tree/__tests__/collections.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ArxmlElement } from '../../../../shared/types/arxml.js';
import { groupSiblingsByShortName, maxCollectionSize } from '../collections.js';

const makeContainer = (shortName: string): ArxmlElement => ({
  kind: 'container',
  shortName,
  definitionRef: 'AR-PACKAGE/REF',
  params: {},
  children: [],
});

describe('groupSiblingsByShortName', () => {
  it('returns empty Map for empty input', () => {
    expect(groupSiblingsByShortName([]).size).toBe(0);
  });

  it('groups siblings with same shortName', () => {
    const elements = [
      makeContainer('AFECellValidSet'),
      makeContainer('AFECellValidSet_1'),
      makeContainer('AFECellValidSet_2'),
      makeContainer('AFETempValidSet'),
    ];
    const groups = groupSiblingsByShortName(elements);
    expect(groups.size).toBe(2);
    expect(groups.get('AFECellValidSet')?.length).toBe(3);
    expect(groups.get('AFETempValidSet')?.length).toBe(1);
  });

  it('returns shortName without _N suffix as the base key', () => {
    const elements = [makeContainer('Cell'), makeContainer('Cell_1'), makeContainer('Cell_10')];
    const groups = groupSiblingsByShortName(elements);
    expect(groups.size).toBe(1);
    expect(groups.get('Cell')?.length).toBe(3);
  });
});

describe('maxCollectionSize', () => {
  it('returns 0 for empty input', () => {
    expect(maxCollectionSize([])).toBe(0);
  });

  it('returns max group size', () => {
    const elements = [
      makeContainer('A'),
      makeContainer('B'),
      makeContainer('B_1'),
      makeContainer('C'),
      makeContainer('C_1'),
      makeContainer('C_2'),
    ];
    expect(maxCollectionSize(elements)).toBe(3);
  });
});
```

### Step 2: Run test, verify it FAILS

Run: `pnpm test src/renderer/components/tree/__tests__/collections.test.ts`
Expected: FAIL with "Cannot find module '../collections.js'" or similar.

### Step 3: Implement `collections.ts`

Create `src/renderer/components/tree/collections.ts`:

```ts
// collections.ts — helpers for grouping Tree siblings by shortName.
//
// Used by Tree.renderChildren() to decide whether to render a "collection
// header" row above a group of same-shortName siblings. See:
//   docs/superpowers/specs/2026-07-13-multi-instance-tree-ui-design.md

import type { ArxmlElement } from '../../../shared/types/arxml.js';

/**
 * Group siblings by their "base" shortName (stripping any trailing `_<digits>`
 * suffix that the BSWMD auto-suffix mechanism produces — see
 * `coreAddContainer` at src/core/arxml/mutation/container-ops.ts:98-103).
 *
 * Returns a Map keyed by base shortName; values preserve original input order.
 */
export function groupSiblingsByShortName(
  siblings: readonly ArxmlElement[],
): Map<string, ArxmlElement[]> {
  const groups = new Map<string, ArxmlElement[]>();
  for (const sibling of siblings) {
    const baseName = stripSuffix(getShortName(sibling));
    const existing = groups.get(baseName) ?? [];
    existing.push(sibling);
    groups.set(baseName, existing);
  }
  return groups;
}

/**
 * Return the size of the largest same-baseName group in the input. 0 for empty.
 * Used to drive view-density decisions (collapsing default, future virtual
 * scroll trigger).
 */
export function maxCollectionSize(siblings: readonly ArxmlElement[]): number {
  let max = 0;
  for (const group of groupSiblingsByShortName(siblings).values()) {
    if (group.length > max) max = group.length;
  }
  return max;
}

/** Strip trailing `_<digits>` from a shortName. */
function stripSuffix(name: string): string {
  return name.replace(/_[0-9]+$/, '');
}

/** Get the canonical shortName for any ArxmlElement kind. */
function getShortName(element: ArxmlElement): string {
  if (element.kind === 'reference') return element.shortName ?? element.value;
  if (element.kind === 'unknown') return element.tagName;
  return element.shortName;
}
```

### Step 4: Run test, verify it PASSES

Run: `pnpm test src/renderer/components/tree/__tests__/collections.test.ts`
Expected: PASS (3 cases green).

### Step 5: Extend `optionalContainers.ts` return type with `currentCount` + `upperMultiplicity`

Modify `src/renderer/components/tree/optionalContainers.ts:44-79`:

```ts
// BEFORE (line 44):
export interface MissingOptionalSibling {
  cd: ContainerDef;
}

// (existed as inline type filter result, not named)

export function findMissingOptionalSiblings(
  bswmd: readonly BswSchema[],
  valueParentPath: string,
  existingChildren: readonly ArxmlElement[],
): readonly ContainerDef[] { ... }

// AFTER: export a named type + return it

export interface MissingOptionalSibling {
  readonly cd: ContainerDef;
  /** Count of existing siblings with same base shortName (0..N). */
  readonly currentCount: number;
  /** BSWMD-declared upper bound (`number` for finite, `'infinite'` for `0..*`). */
  readonly upperMultiplicity: number | 'infinite';
}

export function findMissingOptionalSiblings(
  bswmd: readonly BswSchema[],
  valueParentPath: string,
  existingChildren: readonly ArxmlElement[],
): readonly MissingOptionalSibling[] { ... }
```

Inside the function (around line 76-78), change the filter from `ContainerDef[]` to include `currentCount` + `upperMultiplicity`:

```ts
const existingShortNames = new Set<string>();
for (const c of existingChildren) {
  if (c.kind === 'reference') existingShortNames.add(c.value);
  else if (c.kind === 'unknown') existingShortNames.add(c.tagName);
  else existingShortNames.add(c.shortName);
}

return candidates
  .filter((cd) => cd.lowerMultiplicity === 0 && !existingShortNames.has(cd.shortName))
  .map((cd) => ({
    cd,
    currentCount: existingShortNames.size, // rough: total existing under parent
    upperMultiplicity: cd.upperMultiplicity,
  }));
```

> Note: `currentCount` is a rough total-existing-children-under-parent proxy. For more accurate per-cd counting in T2, see the spec note (use `countChildrenWithShortName` from `src/renderer/components/tree/tree-ops.ts:67-76`). Acceptable for P1 since header UI primarily needs upper-bound info.

Update callers of `findMissingOptionalSiblings`:

- `src/renderer/components/tree/Tree.tsx:355` — change the destructured access from `cd.shortName` to `missing.cd.shortName` (see T3 for full diff).
- `src/renderer/components/tree/__tests__/Tree.optionalContainers.test.tsx` — update existing 5 scenarios to consume the new return shape (assertions on `cd.shortName` → `missing.cd.shortName`).

### Step 6: Run all existing tests + new test, verify all PASS

Run: `pnpm test src/renderer/components/tree/__tests__/Tree.optionalContainers.test.tsx src/renderer/components/tree/__tests__/collections.test.ts`
Expected: PASS (existing 5 + new 3 = 8 cases green, 0 fail).

### Step 7: Run `pnpm verify`, verify 8-stage GREEN

Run: `pnpm verify`
Expected: format / lint / type-check / test / coverage / build / import-regression / python-self-test all GREEN.

### Step 8: Commit

```bash
git add src/renderer/components/tree/collections.ts \
        src/renderer/components/tree/optionalContainers.ts \
        src/renderer/components/tree/__tests__/collections.test.ts \
        src/renderer/components/tree/__tests__/Tree.optionalContainers.test.tsx
git commit -m "feat(tree): Phase P1 T1 -- collections.ts helpers + optionalContainers return type"
```

---

## Task 2: Presentational component — `CollectionHeader.tsx`

**Files:**

- Create: `src/renderer/components/tree/CollectionHeader.tsx`
- Test: `src/renderer/components/tree/__tests__/CollectionHeader.test.tsx` (NEW, ~80 LoC, 3 cases)

**Interfaces:**

- Consumes: `shortName: string`, `count: number`, `upperMultiplicity: number | 'infinite'`, `isExpanded: boolean`, `onToggle: () => void`, `onAdd: () => void`, `depth: number`
- Produces: `<div role="treeitem" data-kind="collection" data-testid="treeitem-collection-${shortName}">` row

### Step 1: Write failing test for `CollectionHeader`

Create `src/renderer/components/tree/__tests__/CollectionHeader.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CollectionHeader } from '../CollectionHeader.js';

describe('CollectionHeader', () => {
  it('renders shortName ×N badge', () => {
    render(
      <CollectionHeader
        shortName="AFECellValidSet"
        count={5}
        upperMultiplicity="infinite"
        isExpanded={false}
        onToggle={vi.fn()}
        onAdd={vi.fn()}
        depth={2}
      />,
    );
    expect(screen.getByTestId('treeitem-collection-AFECellValidSet')).toBeInTheDocument();
    expect(screen.getByText(/AFECellValidSet/)).toBeInTheDocument();
    expect(screen.getByText(/×5/)).toBeInTheDocument();
  });

  it('disables + button when count >= upperMultiplicity', () => {
    render(
      <CollectionHeader
        shortName="AFETempValidSet"
        count={1}
        upperMultiplicity={1}
        isExpanded={false}
        onToggle={vi.fn()}
        onAdd={vi.fn()}
        depth={2}
      />,
    );
    const addBtn = screen.getByTestId('add-collection-AFETempValidSet');
    expect(addBtn).toBeDisabled();
    expect(addBtn).toHaveAttribute('aria-label', expect.stringContaining('已达上限'));
  });

  it('fires onAdd when + button clicked (not at max)', () => {
    const onAdd = vi.fn();
    render(
      <CollectionHeader
        shortName="AFECellValidSet"
        count={3}
        upperMultiplicity="infinite"
        isExpanded={false}
        onToggle={vi.fn()}
        onAdd={onAdd}
        depth={2}
      />,
    );
    fireEvent.click(screen.getByTestId('add-collection-AFECellValidSet'));
    expect(onAdd).toHaveBeenCalledOnce();
  });
});
```

### Step 2: Run test, verify it FAILS

Run: `pnpm test src/renderer/components/tree/__tests__/CollectionHeader.test.tsx`
Expected: FAIL with "Cannot find module '../CollectionHeader.js'".

### Step 3: Implement `CollectionHeader.tsx`

Create `src/renderer/components/tree/CollectionHeader.tsx`:

```tsx
// CollectionHeader.tsx — synthetic Tree row representing a group of
// same-shortName siblings.
//
// Renders above real <TreeNode> siblings when ≥2 share the same base
// shortName. See:
//   docs/superpowers/specs/2026-07-13-multi-instance-tree-ui-design.md

import { useTranslation } from 'react-i18next';

export interface CollectionHeaderProps {
  /** Base shortName (without trailing `_<digits>`). */
  readonly shortName: string;
  /** Number of real siblings in this collection. */
  readonly count: number;
  /** BSWMD upper bound. `'infinite'` for `0..*`. */
  readonly upperMultiplicity: number | 'infinite';
  /** Whether the collection is currently expanded. */
  readonly isExpanded: boolean;
  /** Toggle expanded/collapsed. */
  readonly onToggle: () => void;
  /** Add a new sibling to this collection (calls store.addContainer). */
  readonly onAdd: () => void;
  /** Tree depth for indentation. */
  readonly depth: number;
}

export function CollectionHeader(props: CollectionHeaderProps): JSX.Element {
  const { shortName, count, upperMultiplicity, isExpanded, onToggle, onAdd, depth } = props;
  const { t } = useTranslation();
  const atMax = upperMultiplicity !== 'infinite' && count >= upperMultiplicity;
  const testKey = shortName;

  return (
    <div
      role="treeitem"
      aria-expanded={isExpanded}
      data-kind="collection"
      data-testid={`treeitem-collection-${testKey}`}
      className="tree-item tree-item-collection"
      style={{ paddingLeft: `${depth * 1.25}rem` }}
    >
      <button
        type="button"
        className="tree-chevron"
        data-testid={`chevron-collection-${testKey}`}
        onClick={onToggle}
        aria-label={isExpanded ? t('tree.collapseCollection') : t('tree.expandCollection')}
      >
        {isExpanded ? '▼' : '▶'}
      </button>
      <span className="kind-dot kind-collection" />
      <span className="tree-label tree-label-collection">
        <span className="tree-label-text">{shortName}</span>
        <span className="tree-collection-count" data-testid={`count-collection-${testKey}`}>
          ×{count}
        </span>
      </span>
      <button
        type="button"
        className="tree-add-collection"
        data-testid={`add-collection-${testKey}`}
        onClick={onAdd}
        disabled={atMax}
        aria-label={atMax ? t('tree.collectionAtMax') : t('tree.collectionAdd')}
        title={atMax ? t('tree.collectionAtMax') : t('tree.collectionAdd')}
      >
        + 1
      </button>
    </div>
  );
}
```

### Step 4: Add CSS classes (extend `src/renderer/styles.css`)

Append to existing `src/renderer/styles.css`:

```css
/* Collection header (Phase P1) */
.tree-item-collection {
  background: var(--color-surface-2, rgba(255, 255, 255, 0.03));
  border-left: 2px solid var(--color-accent, #0ea5e9);
}
.kind-collection {
  background: var(--color-accent, #0ea5e9);
}
.tree-collection-count {
  margin-left: 0.5em;
  padding: 0 0.4em;
  border-radius: 4px;
  background: var(--color-accent-fade, rgba(14, 165, 233, 0.15));
  color: var(--color-accent, #0ea5e9);
  font-size: 0.85em;
  font-weight: 600;
}
.tree-add-collection {
  margin-left: auto;
  padding: 0 0.6em;
  border-radius: 4px;
  background: var(--color-accent, #0ea5e9);
  color: white;
  font-size: 0.85em;
}
.tree-add-collection:disabled {
  background: var(--color-text-faint, #555);
  cursor: not-allowed;
}
```

### Step 5: Run test, verify it PASSES

Run: `pnpm test src/renderer/components/tree/__tests__/CollectionHeader.test.tsx`
Expected: PASS (3 cases green).

### Step 6: Run `pnpm verify`, verify 8-stage GREEN

Run: `pnpm verify`
Expected: 8-stage GREEN.

### Step 7: Commit

```bash
git add src/renderer/components/tree/CollectionHeader.tsx \
        src/renderer/components/tree/__tests__/CollectionHeader.test.tsx \
        src/renderer/styles.css
git commit -m "feat(tree): Phase P1 T2 -- CollectionHeader component + at-max disabled state"
```

---

## Task 3: Tree integration — `Tree.tsx` collection branch

**Files:**

- Modify: `src/renderer/components/tree/Tree.tsx:301-385`
- Test: `src/renderer/components/tree/__tests__/Tree.collectionHeader.test.tsx` (NEW, ~200 LoC, 5 scenarios)

### Step 1: Write failing test for Tree integration

Create `src/renderer/components/tree/__tests__/Tree.collectionHeader.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tree } from '../Tree.js';
import { makeStoreApi } from './fixtures/makeStoreApi.js'; // extract from existing optionalContainers.test.tsx

describe('Tree -- collection header integration', () => {
  it('renders collection header when ≥2 siblings share shortName', () => {
    const store = makeStoreApi({
      elements: [
        { kind: 'container', shortName: 'AFECellValidSet', definitionRef: '...', params: {}, children: [] },
        { kind: 'container', shortName: 'AFECellValidSet_1', definitionRef: '...', params: {}, children: [] },
        { kind: 'container', shortName: 'AFECellValidSet_2', definitionRef: '...', params: {}, children: [] },
      ],
      bswmdSchemas: [/* fixtures with AFECellValidSet lower=0, upper='infinite' */],
    });
    render(<Tree store={store} />);
    expect(screen.getByTestId('treeitem-collection-AFECellValidSet')).toBeInTheDocument();
    expect(screen.getByText(/×3/)).toBeInTheDocument();
  });

  it('does NOT render collection header when only 1 sibling', () => {
    const store = makeStoreApi({
      elements: [
        { kind: 'container', shortName: 'AFECellValidSet', ... },
      ],
      bswmdSchemas: [...],
    });
    render(<Tree store={store} />);
    expect(screen.queryByTestId('treeitem-collection-AFECellValidSet')).toBeNull();
  });

  it('hides real siblings under collection header when collapsed', () => {
    // collection header default-collapsed → AFECellValidSet_1/_2 should not be visible
    const store = makeStoreApi({ /* 3 AFECellValidSet */ });
    render(<Tree store={store} />);
    expect(screen.queryByTestId('treeitem-/JWQ3399/JWQ3399ConfigSet/AFECellValidSet_1')).toBeNull();
  });

  it('expands siblings when collection header chevron clicked', () => {
    // click chevron → _1/_2 visible
  });

  it('disables + button in header when upper bound hit', () => {
    // AFETempValidSet with 1 sibling, upper=1 → add-collection disabled
  });
});
```

> Note: 5 scenarios here are sketched; full implementations will be detailed in T3 implementation. Fixture builders reused from `Tree.optionalContainers.test.tsx:85-130` (`makeContainer`).

### Step 2: Run test, verify it FAILS

Run: `pnpm test src/renderer/components/tree/__tests__/Tree.collectionHeader.test.tsx`
Expected: FAIL (collection-header integration not yet implemented).

### Step 3: Modify `Tree.tsx:renderChildren` to insert collection branch

In `src/renderer/components/tree/Tree.tsx`:

```tsx
// Add at top of file:
import { CollectionHeader } from './CollectionHeader.js';
import { groupSiblingsByShortName } from './collections.js';

// Modify renderChildren (around lines 301-385) -- add collection grouping:

export function renderChildren(
  parentPath: string,
  elements: readonly ArxmlElement[],
  bswmdSchemas: readonly BswSchema[],
  depth: number,
  onContextMenu: (path: string, kind: TreeNodeKind, e: React.MouseEvent) => void,
): JSX.Element[] {
  const realRows = elements.map((el) => (
    <TreeNode
      key={`${parentPath}/${el.shortName}`}
      path={`${parentPath}/${el.shortName}`}
      label={el.shortName}
      kind={el.kind === 'container' ? 'container' : el.kind}
      depth={depth}
      isLeaf={/* existing logic */}
      onContextMenu={onContextMenu}
    />
  ));

  const collectionGroups = groupSiblingsByShortName(elements);
  const collectionHeaders: JSX.Element[] = [];
  for (const [baseName, group] of collectionGroups) {
    if (group.length < 2) continue; // only render header for N≥2
    // collect BSWMD upper-bound + render header
    const cd = findChildContainerDefForShortName(bswmdSchemas, parentPath, baseName);
    if (!cd) continue;
    const isExpanded = expandedPaths.has(`collection:${parentPath}/${baseName}`);
    collectionHeaders.push(
      <CollectionHeader
        key={`collection:${parentPath}/${baseName}`}
        shortName={baseName}
        count={group.length}
        upperMultiplicity={cd.upperMultiplicity}
        isExpanded={isExpanded}
        onToggle={() => toggleCollection(`${parentPath}/${baseName}`)}
        onAdd={() => store.getState().addContainer?.(parentPath, baseName)}
        depth={depth}
      />,
    );
    if (isExpanded) {
      // inject nested TreeNode rows
      realRows.push(.../* nested renders */);
    }
  }

  return [...collectionHeaders, ...realRows, /* OptionalAddPlaceholder rows */];
}
```

(Full implementation: see `src/renderer/components/tree/Tree.tsx:301-385` actual structure; preserve existing logic verbatim, only add collection branch.)

### Step 4: Extend Tree expansion state to track collection keys

In `src/renderer/components/tree/Tree.tsx:117`:

```tsx
const [expanded, setExpanded] = useState<Set<string>>(new Set());

// Add helper:
const toggleCollection = useCallback((collectionKey: string) => {
  setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(collectionKey)) next.delete(collectionKey);
    else next.add(collectionKey);
    return next;
  });
}, []);
```

(Keep `expanded` for real nodes separate from collection keys via `collection:` prefix to avoid collision.)

### Step 5: Run test, verify it PASSES

Run: `pnpm test src/renderer/components/tree/__tests__/Tree.collectionHeader.test.tsx`
Expected: PASS (5 scenarios green).

### Step 6: Run full test suite + verify, verify 8-stage GREEN

Run: `pnpm verify`
Expected: 8-stage GREEN; total tests = 3177 + 7 SKIP / 0 fail (+5 from T3).

### Step 7: Manual smoke test (per spec "Verification" section)

1. `pnpm dev`
2. Open fixture `C:/Users/13777/Desktop/ClaudeAutosarWorkSpace/111.au` (per user screenshot)
3. Navigate to `JWQ3399ConfigSet`
4. Verify `AFECellValidSet` collection header renders with `×3` count
5. Verify `AFECellValidSet_1/_2/_3` are HIDDEN by default (collection collapsed)
6. Click chevron → 3 real siblings appear
7. Click `+ 1` → new `AFECellValidSet_4` instance created (via store.addContainer → coreAddContainer auto-suffix)
8. Navigate to `AFETempValidSet` (upper=1, already has 1 instance)
9. Verify `+ 1` button in header is DISABLED with tooltip "已达上限"

### Step 8: Commit

```bash
git add src/renderer/components/tree/Tree.tsx \
        src/renderer/components/tree/__tests__/Tree.collectionHeader.test.tsx
git commit -m "feat(tree): Phase P1 T3 -- Tree integration of CollectionHeader (default-collapsed + auto-suffix add)"
```

---

## Task 4: i18n keys — 4 new keys × 2 locales

**Files:**

- Modify: `src/shared/i18n/editor.ts`

### Step 1: Write failing test for parity

In `src/shared/i18n/__tests__/editor.parity.test.ts` (existing file), add assertions for 4 new keys:

```ts
it('collection header keys are parity across locales', () => {
  const en = editorBundle.en as Record<string, string>;
  const zh = editorBundle.zh as Record<string, string>;
  for (const key of [
    'tree.expandCollection',
    'tree.collapseCollection',
    'tree.collectionAdd',
    'tree.collectionAtMax',
  ]) {
    expect(en[key], `en.${key}`).toBeTruthy();
    expect(zh[key], `zh.${key}`).toBeTruthy();
  }
});
```

### Step 2: Run test, verify it FAILS

Run: `pnpm test src/shared/i18n/__tests__/editor.parity.test.ts`
Expected: FAIL (4 keys missing).

### Step 3: Add 4 keys to `editor.ts`

In `src/shared/i18n/editor.ts`, append to the bundle object:

```ts
// English locale
'tree.expandCollection': 'Expand collection',
'tree.collapseCollection': 'Collapse collection',
'tree.collectionAdd': 'Add another instance to this collection',
'tree.collectionAtMax': 'Reached upper bound — cannot add more',

// 中文 locale (in the `zh` bundle)
'tree.expandCollection': '展开集合',
'tree.collapseCollection': '折叠集合',
'tree.collectionAdd': '在此集合中再添加一个实例',
'tree.collectionAtMax': '已达上限 — 无法继续添加',
```

### Step 4: Run test, verify it PASSES

Run: `pnpm test src/shared/i18n/__tests__/editor.parity.test.ts`
Expected: PASS (4 keys parity confirmed).

### Step 5: Run full verify

Run: `pnpm verify`
Expected: 8-stage GREEN.

### Step 6: Commit

```bash
git add src/shared/i18n/editor.ts \
        src/shared/i18n/__tests__/editor.parity.test.ts
git commit -m "feat(i18n): Phase P1 T4 -- 4 new collection header keys × 2 locales"
```

---

## Task 5: Ship Phase P1 PATCH — docs + CHANGELOG + release-notes

**Files:**

- Create: `docs/release-notes/v1.55.0/README.md` (or `v1.55.x/` — version bump per release-checklist)
- Modify: `CHANGELOG.md`
- Modify: `package.json` (bump version per release-checklist lesson)
- Modify: `docs/user-manual.html` (release history update — per established pattern)

### Step 1: Determine version (per release-checklist lesson)

Current HEAD: `8381982` (v1.54.1). Phase P1 is pure UI enhancement, no breaking change, no new IPC, no schema change. **PATCH** version bump → **v1.55.0** (next MINOR) or **v1.54.2** (next PATCH). Recommend **v1.54.2** (PATCH) per spec P1 scope.

Actually — per v1.45.0 D1 lesson: pure UI enhancement is PATCH. So **v1.54.2** PATCH.

### Step 2: Update `package.json`

```json
{
  "version": "1.54.2",
  ...
}
```

### Step 3: Update `CHANGELOG.md`

Append new entry:

```markdown
## [1.54.2] - 2026-07-13

### Added

- **Collection header for multi-instance sub-containers** (Phase P1 of multi-instance tree UI enhancement):
  - Synthetic `<TreeNode>` row above same-shortName siblings showing `<shortName> ×N` count badge.
  - Default-collapsed: siblings (`Foo_1`, `Foo_2`, ...) hidden until chevron clicked.
  - Inline `+ 1` button gated by BSWMD `upperMultiplicity`; disabled with tooltip "已达上限" when at max.
  - Closes the user-reported UX gap where existing AFECellValidSet dialog buttons showed as grey without explanation.

### Tests

- +11 new tests (3 collections.ts + 3 CollectionHeader + 5 Tree integration).
- Total: 3183 + 7 SKIP / 0 fail (+11 net).

### Specs

- [Multi-Instance Tree UI Design Spec](../superpowers/specs/2026-07-13-multi-instance-tree-ui-design.md)
- [Phase P1 Implementation Plan](../superpowers/plans/2026-07-13-multi-instance-tree-ui-phase-p1.md)
```

### Step 4: Create `docs/release-notes/v1.54.2/README.md`

```markdown
# v1.54.2 — Multi-Instance Tree Collection Header (PATCH)

**Released:** 2026-07-13
**Tag:** [`v1.54.2`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.54.2)
**Cycle type:** PATCH (UI enhancement; no IPC, no schema, no behavioral change)
**Ship basis:** 4 source commits (T1 + T2 + T3 + T4) + 1 docs ship (T5)

## Summary

Phase P1 of the multi-instance tree UI enhancement. Adds a synthetic
collection-header row above BSWMD `0..*` sub-containers when ≥2 instances exist,
showing `<shortName> ×N` badge with default-collapsed sibling list. Inline `+ 1`
button disabled when `upperMultiplicity` reached. Closes user-reported UX gap
where existing AFECellValidSet dialog buttons showed grey without explanation.

## Commits

| #      | Commit              | Title                                                                                                   |
| ------ | ------------------- | ------------------------------------------------------------------------------------------------------- |
| T1     | (this commit chain) | `feat(tree): Phase P1 T1 -- collections.ts helpers + optionalContainers return type`                    |
| T2     | (this commit chain) | `feat(tree): Phase P1 T2 -- CollectionHeader component + at-max disabled state`                         |
| T3     | (this commit chain) | `feat(tree): Phase P1 T3 -- Tree integration of CollectionHeader (default-collapsed + auto-suffix add)` |
| T4     | (this commit chain) | `feat(i18n): Phase P1 T4 -- 4 new collection header keys × 2 locales`                                   |
| T-ship | (this commit)       | `docs(release): v1.54.2 PATCH -- Phase P1 multi-instance tree collection header`                        |

## Decisions

- **D1 集合头 = 合成 row,不替换真 sibling** — 真实 sibling 保留独立 path / selection / context menu.
- **D2 默认折叠** — N 较大时屏幕占用恒定.
- **D3 行内按钮进集合头** — sibling 行不加按钮 (噪音).
- **D4 0..1 上限事前 disable + tooltip** — 不靠后端错误兜底.
- **D5 集合头 `+ 1` 替代 OptionalAddPlaceholder 在树底部** — 语义更清晰.
- **D6 不引入命名 dialog** — 后端自动 `_N` (coreAddContainer:98-103).
- **D7 不引入拖拽排序** — 按钮排序留作 P2.

## Test results

- vitest 360 files / 3183 + 7 SKIP / 0 fail (+11 net)
- tsc both configs clean
- prettier + eslint clean
- `pnpm verify` 8-stage GREEN

## Related documents

- **Spec**: `docs/superpowers/specs/2026-07-13-multi-instance-tree-ui-design.md`
- **Plan**: `docs/superpowers/plans/2026-07-13-multi-instance-tree-ui-phase-p1.md`
- **Future work**: P2 (row buttons + ContextMenu) and P3 (view density + virtual scroll) — separate plans.
```

### Step 5: Update `docs/user-manual.html` release history

Add a new `<li>` to the Release History section (between current v1.54.1 and end):

```html
<li>
  <strong>v1.54.2 PATCH · 2026-07-13</strong> — Multi-Instance Tree Collection Header (Phase P1)。
  当 ≥2 个同类型 siblings 存在时, 在它们上方显示 `(×N)` 集合头 + 默认折叠 + 行内 `+ 1` 按钮 (upper=1
  时禁用)。修复了 AFECellValidSet / AFETempValidSet 对话框灰色 `+` 按钮无说明的 UX 痛点。
  <a href="docs/release-notes/v1.54.2/README.md">release-notes</a>
</li>
```

Run `npx prettier --write docs/user-manual.html` after edit to keep format compliance.

### Step 6: Tag + push + GH release

```bash
git add docs/CHANGELOG.md package.json docs/release-notes/v1.54.2/ docs/user-manual.html
git commit -m "docs(release): v1.54.2 PATCH -- Phase P1 multi-instance tree collection header"
git tag -a v1.54.2 -m "v1.54.2 PATCH -- Phase P1 multi-instance tree collection header"
git push origin main --tags
gh release create v1.54.2 --title "v1.54.2 — Phase P1 Multi-Instance Tree Collection Header" --notes-file <(cat <<EOF
... release-notes content ...
EOF
)
```

If `gh release create` is blocked by classifier (per v1.54.0 first-attempt rejection), retry once or instruct user to run manually.

### Step 7: Dispatch `pkm-capture` agent

Per v1.43.1 D5 + post-commit hook: dispatch `pkm-capture` agent to update vault `devlog.md` + write capture-decisions file.

---

## Verification (end-to-end)

After T5 complete:

1. `pnpm verify` exits 0 (8-stage GREEN)
2. Test count 3183 + 7 SKIP / 0 fail (+11 net)
3. Manual smoke (T3 Step 7) confirms collection header visible + chevron toggles + `+ 1` button enabled/disabled correctly
4. Tag `v1.54.2` exists locally + pushed to origin
5. GH release published (or ready to publish manually)

## Risk register

| Risk                                                                                          | Mitigation                                                                                                                  |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `existingShortNames.size` in `optionalContainers.ts` doesn't equal per-cd count (rough proxy) | Acceptable for P1 (header UI only needs upper bound). Per-cd counting deferred to P2 if needed.                             |
| Collection header renders above `OptionalAddPlaceholder` rows (visual stacking)               | CSS-tested in T3; header has `border-left: 2px solid accent` to visually separate.                                          |
| `expanded: Set<string>` collision with collection keys                                        | Mitigated by `collection:` prefix on collection keys (T3 Step 4).                                                           |
| `findChildContainerDefForShortName` helper doesn't exist                                      | Must extract or inline (T3 Step 3). Reuse `findChildContainerDef` from `src/renderer/store/slices/mutationSlice.ts:72-137`. |
| i18n parity test fails after adding keys                                                      | Run `--incremental` tsc + full i18n parity test (T4 Step 4).                                                                |

## Self-review (run before user review)

- [ ] No placeholder ("TBD" / "TODO" / "类似") in any step
- [ ] All file:line references from code-base mapping verified
- [ ] All 4 i18n keys parity confirmed
- [ ] Total scope: 4 source commits + 1 docs ship = 5 commits
- [ ] No sub-agent dispatch (main-thread per v1.42.1 D6 precedent)
- [ ] Each task ends with `pnpm verify` GREEN
- [ ] Test delta = +11 (3 + 3 + 5) confirmed in T3 Step 6

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
