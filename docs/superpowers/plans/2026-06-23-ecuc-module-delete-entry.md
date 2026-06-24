# ECUC Module Delete Entry Point — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a UI entry to delete the entire `<ECUC-MODULE-CONFIGURATION-VALUES>` element via the existing context menu, without affecting the linked BSWMD file.

**Spec reference:** `docs/superpowers/specs/2026-06-23-ecuc-module-delete-entry-design.md`

**Architecture:**

- 1 new `ContextMenuAction` variant (`'delete-module'`)
- 1 widened `ContextMenuTarget` field (`modulePath?: string`)
- 1 new i18n label (`mutation.action.deleteModule` + aria variant + info toast)
- 1 new store action (`deleteEcucModule`)
- 1 new test file for store action
- 1 new test file for context menu

**Tech Stack:** existing — Electron 30 + TypeScript 5 strict + React 18 + Zustand 4 + Vitest 1.

---

## 起点状态 (2026-06-23)

| 项                   | 状态                                                                    |
| -------------------- | ----------------------------------------------------------------------- |
| `local HEAD`         | post-v1.8.4-ecucdefs-fold (this work is sequential, not parallel)       |
| Tests baseline       | 2101 passed + 1 skipped                                                 |
| branch for this work | `feature/v1-8-5-ecuc-module-delete` from `feature/v1-8-4-ecucdefs-fold` |

---

## Conventions

- **TDD**: every task writes the failing test FIRST, then the minimal implementation
- **i18n parity**: every new key must have both zh-CN + en entries; parity test must pass
- **Layering**: `core/` is pure TS; renderer can import `core/` but `core/` cannot import renderer
- **No `any`** in production code; tests may use `as any` for fixtures only
- **Immutability**: store mutations return new state; no mutation of inputs
- **Frequent commits**: one commit per task minimum

---

### Task 1: Add i18n keys (zh-CN + en)

**Files:**

- Modify: `src/shared/i18n.ts` (zh-CN section around line 933-940 + en section around line 1437-1444)

- [ ] **Step 1: Add zh-CN keys**

Find `'mutation.action.removeModule'` (zh-CN at ~line 936) and add after it:

```ts
'mutation.action.deleteModule': "删除 ECUC 模块 '{name}'",
'mutation.action.deleteModuleAria': "删除 ECUC 模块 '{name}'",
'mutation.info.ecucModuleDeleted': "已删除 ECUC 模块 '{name}'",
'mutation.info.ecucModuleUnlinked': "已删除 ECUC 模块 '{name}'，BSWMD 链接已断开",
```

- [ ] **Step 2: Add en keys**

Find `'mutation.action.removeModule'` (en at ~line 1440) and add after it:

```ts
'mutation.action.deleteModule': "Delete ECUC module '{name}'",
'mutation.action.deleteModuleAria': "Delete ECUC module '{name}'",
'mutation.info.ecucModuleDeleted': "Deleted ECUC module '{name}'",
'mutation.info.ecucModuleUnlinked': "Deleted ECUC module '{name}', BSWMD link broken",
```

- [ ] **Step 3: Run i18n parity test**

```bash
pnpm exec vitest run src/shared/__tests__/i18n.test.ts
```

Expected: parity test passes (both zh-CN and en sets have the same keys).

- [ ] **Step 4: Commit**

```bash
git add src/shared/i18n.ts
git commit -m "feat(i18n): add delete-module keys (zh-CN + en)"
```

---

### Task 2: `deleteEcucModule` store action (RED)

**Files:**

- Create: `src/renderer/store/__tests__/useArxmlStore.deleteModule.test.ts`
- Modify: `src/renderer/store/useArxmlStore.ts`

- [ ] **Step 1: Write failing tests**

Create `src/renderer/store/__tests__/useArxmlStore.deleteModule.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import type { ArxmlDocument, ArxmlModule } from '@core/arxml/types.js';

import { useArxmlStore } from '../useArxmlStore';

function makeModule(shortName: string, children: ArxmlModule['children'] = []): ArxmlModule {
  return {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName,
    params: {},
    children,
    references: [],
  };
}

function makeDoc(opts: { moduleShortName: string; sourceBswmdPath?: string }): ArxmlDocument {
  const moduleEl = makeModule(opts.moduleShortName);
  return {
    path: '/test/Adc_EcucValues.arxml',
    version: '4.6',
    sourceBswmdPath: opts.sourceBswmdPath,
    packages: [
      {
        shortName: 'Adc',
        path: '/Adc',
        elements: [moduleEl],
      },
    ],
  };
}

describe('useArxmlStore.deleteEcucModule', () => {
  beforeEach(() => {
    useArxmlStore.setState(useArxmlStore.getInitialState(), true);
  });

  it('removes the module from a non-source-backed doc', () => {
    // Arrange
    const doc = makeDoc({ moduleShortName: 'Adc' });
    useArxmlStore.getState().setDocument(doc);
    useArxmlStore.setState({ activeDocumentPath: doc.path });

    // Act
    useArxmlStore.getState().deleteEcucModule('/Adc');

    // Assert — module removed, no error, no source-link to clear
    const next = useArxmlStore.getState();
    expect(next.doc).not.toBeNull();
    expect(next.doc!.packages[0]!.elements.length).toBe(0);
    expect(next.doc!.sourceBswmdPath).toBeUndefined();
  });

  it('removes the module AND clears sourceBswmdPath for a source-backed doc', () => {
    // Arrange
    const doc = makeDoc({ moduleShortName: 'Adc', sourceBswmdPath: '/test/Adc_bswmd.arxml' });
    useArxmlStore.getState().setDocument(doc);
    useArxmlStore.setState({ activeDocumentPath: doc.path });

    // Act
    useArxmlStore.getState().deleteEcucModule('/Adc');

    // Assert — module removed AND sourceBswmdPath cleared (no dangling link)
    const next = useArxmlStore.getState();
    expect(next.doc!.packages[0]!.elements.length).toBe(0);
    expect(next.doc!.sourceBswmdPath).toBeUndefined();
  });

  it('surfaces a localized toast on success', () => {
    // Arrange
    const doc = makeDoc({ moduleShortName: 'Adc' });
    useArxmlStore.getState().setDocument(doc);
    useArxmlStore.setState({ activeDocumentPath: doc.path });

    // Act
    useArxmlStore.getState().deleteEcucModule('/Adc');

    // Assert — toast emitted
    const toasts = useArxmlStore.getState().toasts;
    expect(toasts.some((t) => /ECUC 模块|Adc|Deleted ECUC module/.test(t.message))).toBe(true);
  });

  it('no-ops with error toast when the path does not match any module', () => {
    // Arrange
    const doc = makeDoc({ moduleShortName: 'Adc' });
    useArxmlStore.getState().setDocument(doc);
    useArxmlStore.setState({ activeDocumentPath: doc.path });

    // Act
    useArxmlStore.getState().deleteEcucModule('/NonExistent');

    // Assert — doc unchanged, error toast
    const next = useArxmlStore.getState();
    expect(next.doc!.packages[0]!.elements.length).toBe(1);
    const toasts = useArxmlStore.getState().toasts;
    expect(toasts.some((t) => t.kind === 'error')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect 4 FAILs**

```bash
pnpm exec vitest run src/renderer/store/__tests__/useArxmlStore.deleteModule.test.ts
```

Expected: 4 tests fail because `deleteEcucModule` does not exist yet.

- [ ] **Step 3: Add the action to `useArxmlStore`**

Open `src/renderer/store/useArxmlStore.ts`. Find the action definitions (search for `deleteContainer` as an anchor). Add the new action:

```ts
/**
 * Sprint A+ — delete an entire ECUC module from the active document.
 * Atomic: removes the module element AND clears `sourceBswmdPath`
 * (so the BSWMD chip doesn't dangle). Emits a localized toast.
 * No-op + error toast if the path doesn't match a module.
 */
deleteEcucModule: (modulePath: string) => void;
```

Implementation in the action body (use the existing `setInfo`/`setError`
helpers for toasts; the `findByPath` helper for path resolution):

```ts
deleteEcucModule: (modulePath) => {
  const state = get();
  if (state.doc === null) {
    setInfo(i18nT(state.locale, 'mutation.error.noActiveDocument'));
    return;
  }
  const moduleEl = findByPath(state.doc, modulePath);
  if (moduleEl === null || moduleEl.kind !== 'module') {
    setError(i18nT(state.locale, 'mutation.error.moduleNotFound', { path: modulePath }));
    return;
  }
  const wasSourceBacked = state.doc.sourceBswmdPath !== undefined;
  const nextDoc = removeModuleFromDoc(state.doc, modulePath);
  set({
    doc: { ...nextDoc, sourceBswmdPath: undefined },
    isDirty: true,
  });
  setInfo(
    i18nT(
      state.locale,
      wasSourceBacked
        ? 'mutation.info.ecucModuleUnlinked'
        : 'mutation.info.ecucModuleDeleted',
      { name: moduleEl.shortName },
    ),
  );
},
```

You'll need to add helpers:

- `removeModuleFromDoc(doc, modulePath): ArxmlDocument` — pure, returns a
  new doc with the module element removed from its parent package.
- `findByPath(doc, path)` — likely already exists; search for it.

You'll also need to add the missing i18n keys (one was added in Task 1,
the new error key needs adding):

```ts
'mutation.error.moduleNotFound': "找不到 ECUC 模块 '{path}'",  // zh-CN
'mutation.error.moduleNotFound': "ECUC module not found at '{path}'",  // en
```

- [ ] **Step 4: Run tests — expect 4 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/renderer/store/useArxmlStore.ts \
        src/renderer/store/__tests__/useArxmlStore.deleteModule.test.ts \
        src/shared/i18n.ts
git commit -m "feat(store): add deleteEcucModule action (RED+GREEN)"
```

---

### Task 3: ContextMenu integration (RED + GREEN)

**Files:**

- Modify: `src/renderer/components/ContextMenu.tsx`
- Modify: `src/renderer/components/tree/TreeNode.tsx`
- Modify: `src/renderer/App.tsx`
- Create: `src/renderer/components/__tests__/ContextMenu.deleteModule.test.tsx`

- [ ] **Step 1: Widen `ContextMenuTarget`**

In `ContextMenu.tsx:47-51`, add the optional `modulePath`:

```ts
export type ContextMenuTarget = {
  readonly path: string;
  readonly kind: 'module' | 'container' | 'reference' | 'bswmd';
  readonly shortName: string;
  /**
   * Sprint A+ — when the right-click target is a module-kind node
   * whose source BSWMD is loaded, this carries the post-fold module
   * path so the menu can offer "Delete ECUC module" alongside
   * "Remove BSWMD". Undefined for non-module targets.
   */
  readonly modulePath?: string;
};
```

- [ ] **Step 2: Add `'delete-module'` action variant**

In `ContextMenu.tsx:60-66`, extend the union:

```ts
export type ContextMenuAction =
  | { readonly type: 'add-container'; readonly path: string }
  | { readonly type: 'add-parameter'; readonly path: string }
  | { readonly type: 'add-reference'; readonly path: string }
  | { readonly type: 'delete-container'; readonly path: string; readonly name: string }
  | { readonly type: 'delete-reference'; readonly path: string }
  | { readonly type: 'remove-module'; readonly path: string }
  | { readonly type: 'delete-module'; readonly path: string; readonly name: string };
```

- [ ] **Step 3: Add menu item to `buildContainerItems`**

In `ContextMenu.tsx:248-287`, insert the new item **before** `delete-container`:

```ts
{
  id: 'delete-module',
  label: t(locale, 'mutation.action.deleteModule', { name: target.shortName }),
  ariaLabel: t(locale, 'mutation.action.deleteModuleAria', { name: target.shortName }),
  disabled: target.modulePath === undefined,  // hide for non-module targets
  cssClass: 'context-menu-item context-menu-item-delete',
  build: (t) => ({ type: 'delete-module', path: t.modulePath ?? t.path, name: t.shortName }),
},
```

- [ ] **Step 4: Update TreeNode.tsx re-route**

In `TreeNode.tsx:182-218`, widen the re-route to pass BOTH paths:

```ts
if (kind === 'module') {
  const state = useArxmlStore.getState();
  const doc = state.doc ?? state.displayDoc;
  if (doc?.sourceBswmdPath !== undefined) {
    openContextMenu(
      {
        path: doc.sourceBswmdPath,
        kind: 'bswmd',
        shortName: basename(doc.sourceBswmdPath),
        // New: also carry the module path so the menu can offer
        // "Delete ECUC module" alongside "Remove BSWMD".
        modulePath: path,
      },
      e.clientX,
      e.clientY,
    );
    return;
  }
}
```

- [ ] **Step 5: Wire `delete-module` in App.tsx**

In `App.tsx handleContextMenuAction` (around line 329-370), add:

```ts
case 'delete-module':
  deleteEcucModuleAction(action.path);
  return;
```

Pull the action at the top of `App.tsx` alongside the other store hooks:

```ts
const deleteEcucModuleAction = useArxmlStore((s) => s.deleteEcucModule);
```

- [ ] **Step 6: Write context-menu test (RED first)**

Create `src/renderer/components/__tests__/ContextMenu.deleteModule.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ContextMenuAction, ContextMenuTarget } from '../ContextMenu';
import { ContextMenuRoot, openContextMenu } from '../ContextMenu';

afterEach(() => cleanup());

function mountMenu(target: ContextMenuTarget, onAction: (a: ContextMenuAction) => void): void {
  render(<ContextMenuRoot onAction={onAction} locale="zh-CN" />);
  openContextMenu(target, 100, 100);
}

describe('ContextMenu — delete-module item', () => {
  it('appears for module kind when modulePath is set', () => {
    const onAction = vi.fn();
    mountMenu(
      {
        path: '/Adc_bswmd.arxml',
        kind: 'bswmd',
        shortName: 'Adc_bswmd.arxml',
        modulePath: '/Adc',
      },
      onAction,
    );

    const item = screen.getByTestId('context-menu-item-delete-module');
    expect(item).toBeInTheDocument();
    expect(item.textContent).toMatch(/删除 ECUC 模块|Delete ECUC module/);
  });

  it('emits delete-module action with modulePath and shortName', () => {
    const onAction = vi.fn();
    mountMenu(
      {
        path: '/Adc_bswmd.arxml',
        kind: 'bswmd',
        shortName: 'Adc_bswmd.arxml',
        modulePath: '/Adc',
      },
      onAction,
    );

    fireEvent.click(screen.getByTestId('context-menu-item-delete-module'));

    expect(onAction).toHaveBeenCalledWith({
      type: 'delete-module',
      path: '/Adc',
      name: 'Adc_bswmd.arxml',
    });
  });

  it('is disabled for container kind (no modulePath)', () => {
    const onAction = vi.fn();
    mountMenu(
      {
        path: '/Adc/AdcConfig',
        kind: 'container',
        shortName: 'AdcConfig',
      },
      onAction,
    );

    const item = screen.queryByTestId('context-menu-item-delete-module');
    expect(item).toHaveAttribute('aria-disabled', 'true');
  });
});
```

- [ ] **Step 7: Run tests — expect 3 PASS**

```bash
pnpm exec vitest run src/renderer/components/__tests__/ContextMenu.deleteModule.test.tsx
```

- [ ] **Step 8: Run full suite — expect 2101 → 2108 passed**

```bash
pnpm exec vitest run
```

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/ContextMenu.tsx \
        src/renderer/components/tree/TreeNode.tsx \
        src/renderer/App.tsx \
        src/renderer/components/__tests__/ContextMenu.deleteModule.test.tsx \
        src/shared/i18n.ts
git commit -m "feat(renderer): add delete-module context menu item"
```

---

### Task 4: Verify + release notes

**Files:**

- Verify: `pnpm verify` all 7 stages
- Create: `docs/release-notes-v1.8.5.md`

- [ ] **Step 1: Full verification**

```bash
pnpm verify
```

Expected: all 7 stages green.

- [ ] **Step 2: Manual smoke**

1. Load project with `Adc_bswmd.arxml` + linked `Adc_EcucValues.arxml`.
2. Right-click module root in Tree.
3. Confirm menu shows BOTH "Remove BSWMD" AND "Delete ECUC module 'Adc'".
4. Pick "Delete ECUC module 'Adc'" → confirm:
   - ECUC values are gone from Tree (module root now empty)
   - BSWMD is still listed in Project panel
   - BSWMD chip no longer shows module count (link broken)
   - Toast: "已删除 ECUC 模块 'Adc'，BSWMD 链接已断开" / "Deleted ECUC module 'Adc', BSWMD link broken"
   - Project is marked dirty
5. Save → confirm on-disk ECUC file has the module element removed.
6. Save + reload → confirm the dangle is permanent (no resurrection).

- [ ] **Step 3: Write release notes**

Use the v1.8.4 notes as template. Sections:

- Summary
- New behavior: "Delete ECUC module" context menu item
- Migration: none
- Tests: 2101 → 2108 passed
- Spec: `2026-06-23-ecuc-module-delete-entry-design.md`

- [ ] **Step 4: Bump version**

`package.json` 1.8.4 → 1.8.5 (PATCH).

- [ ] **Step 5: Push, tag, GH release**

Same workflow as v1.8.4.
