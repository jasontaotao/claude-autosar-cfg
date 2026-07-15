# Project Tab Collapse/Expand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**: Add a collapse/expand toggle to the left sidebar's "项目" tab body, persisted in localStorage, so the user can free vertical space for the right-pane ParamEditor.

**Architecture**: New zustand slice field `leftPanelProjectCollapsed: boolean` in `uiSlice.ts` with `setLeftPanelProjectCollapsed(value)` action. `LeftPanel.tsx` reads the field and conditionally renders `ProjectPanelInfo` (expanded) vs a 1-line compact placeholder (collapsed). The toggle button is rendered in **both** branches so the user can re-expand from the collapsed region. localStorage read happens once at store init; localStorage write happens inside the setter (try/catch + console.warn, matching the established `console.warn`-on-failure pattern from `useDefaultLayout`).

**Tech Stack**: Zustand 4.5.4, React 18.3.1, TypeScript 5.6, vitest 1.6 + RTL 16, localStorage (direct), Tailwind 3.4 (no new utilities — reuse existing tokens).

## Global Constraints

- **ECMAScript / TypeScript target**: ES2022 + strict `exactOptionalPropertyTypes: true` — every `definitionRef?` / `desc?` style field must use `...(prop !== undefined ? { prop } : {})` rather than `{ prop: undefined }`.
- **i18n parity**: every new key MUST appear in BOTH `src/shared/i18n.en/editor.ts` and `src/shared/i18n.zh-CN/editor.ts`, and the type interface in `src/shared/i18n/editor.ts` must be updated to declare the new key. Param type names (e.g. `'reference'`, `'integer'`) stay untranslated; only user-visible strings go through `t()`.
- **Test gate**: `pnpm verify` 8-stage (format + lint + type-check + test + coverage + build + import-regression + python-self-test) must stay GREEN. Pre-this-feature baseline: **3221 + 7 SKIP / 0 fail**. Net new tests: 5 (2 slice + 3 component).
- **Version discipline**: per `release-checklist-must-verify-package.json-bump-on-every-version-ship` (standalone) — `package.json` version bumped in a dedicated T-ship commit (not bundled with source). Next version: **1.54.5 → 1.55.0** (MINOR — first new user-facing feature since v1.54.x PATCH chain).
- **localStorage pattern**: try/catch + `console.warn('[ui] failed to ...', e)` — the existing pattern from `useDefaultLayout`-style persistence. Do NOT throw on quota / private mode.
- **Commit discipline**: per task, source-only commit. T-ship commit (version + CHANGELOG + release notes) is its own commit. Tag `v1.55.0` annotated at T-ship.
- **No mutation** of `useDefaultLayout({ groupId: 'workspace' })` or any horizontal-resize code. The collapse is a vertical content hide, orthogonal to the horizontal resizer.

---

## File Map (locked before tasks)

| File                                                                   | Role                                          | Type                              |
| ---------------------------------------------------------------------- | --------------------------------------------- | --------------------------------- |
| `src/shared/i18n/editor.ts`                                            | Interface for new keys                        | Modify (3 new lines in interface) |
| `src/shared/i18n.en/editor.ts`                                         | English text for new keys                     | Modify (3 new lines)              |
| `src/shared/i18n.zh-CN/editor.ts`                                      | Chinese text for new keys                     | Modify (3 new lines)              |
| `src/renderer/store/slices/uiSlice.ts`                                 | Slice field + setter + localStorage write     | Modify (~15 lines)                |
| `src/renderer/store/useArxmlStore.ts`                                  | localStorage read on store init               | Modify (~10 lines)                |
| `src/renderer/components/LeftPanel.tsx`                                | Conditional render + collapsed placeholder    | Modify (~20 lines)                |
| `src/renderer/components/ProjectPanel.tsx`                             | Chevron toggle button in header               | Modify (~25 lines)                |
| `src/renderer/components/ProjectPanel.css`                             | Toggle button styling                         | Modify (~15 lines)                |
| `src/renderer/components/__tests__/LeftPanel.collapse.test.tsx`        | Component tests (3 cases)                     | Create                            |
| `src/renderer/store/__tests__/useArxmlStore.leftPanelCollapse.test.ts` | Slice + rehydrate tests (2 cases)             | Create                            |
| `docs/release-notes/v1.55.0/README.md`                                 | Release notes                                 | Create                            |
| `CHANGELOG.md`                                                         | v1.55.0 entry at top                          | Modify (prepend)                  |
| `package.json`                                                         | `"version": "1.54.5"` → `"version": "1.55.0"` | Modify (1 line)                   |

Each task's commit set is explicit. Do not bundle tasks.

---

## Task 1: i18n keys (3 new keys × 2 locales + interface)

**Files:**

- Modify: `src/shared/i18n/editor.ts:46-49` (interface — add 3 new readonly fields)
- Modify: `src/shared/i18n.en/editor.ts:40-43` (en bundle — add 3 new entries)
- Modify: `src/shared/i18n.zh-CN/editor.ts:40-43` (zh-CN bundle — add 3 new entries)

**Interfaces:**

- Consumes: nothing
- Produces: i18n keys available to `t()` from anywhere

- [ ] **Step 1: Add the 3 keys to the interface in `src/shared/i18n/editor.ts`**

In the `EditorMessages` interface, after line 49 (`readonly 'leftPanel.project.empty': string;`), add:

```ts
  readonly 'leftPanel.projectTab.toggleCollapse': string;
  readonly 'leftPanel.projectTab.toggleExpand': string;
  readonly 'leftPanel.projectTab.collapsedNotice': string;
```

The exact indentation (2 spaces) matches the surrounding `leftPanel.*` block.

- [ ] **Step 2: Add the 3 keys to the en bundle in `src/shared/i18n.en/editor.ts`**

After line 43 (`'leftPanel.project.empty': 'No project open. Use the "Files" tab to create or open one.',`), add:

```ts
  'leftPanel.projectTab.toggleCollapse': 'Collapse project panel',
  'leftPanel.projectTab.toggleExpand': 'Expand project panel',
  'leftPanel.projectTab.collapsedNotice': 'Project panel is collapsed. Click to expand.',
```

- [ ] **Step 3: Add the 3 keys to the zh-CN bundle in `src/shared/i18n.zh-CN/editor.ts`**

After line 43 (`'leftPanel.project.empty': '未打开项目。请到"文件"标签新建或打开一个项目。',`), add:

```ts
  'leftPanel.projectTab.toggleCollapse': '折叠项目面板',
  'leftPanel.projectTab.toggleExpand': '展开项目面板',
  'leftPanel.projectTab.collapsedNotice': '项目面板已折叠。点击展开。',
```

- [ ] **Step 4: Run type-check to confirm both bundles satisfy the interface**

Run: `pnpm type-check 2>&1 | tail -20`
Expected: exit 0. `tsc --noEmit` for both `tsconfig.json` + `tsconfig.web.json` must compile cleanly. The 3 keys are now typed and available to `t()`.

- [ ] **Step 5: Run existing i18n parity test**

Run: `pnpm test src/shared/i18n/__tests__/editor.parity.test.ts 2>&1 | tail -15`
Expected: PASS. The parity test reads every key in `EditorMessages` and confirms both bundles have it; 3 new keys must now appear in both bundles and the test must still pass.

- [ ] **Step 6: Commit**

```bash
git add src/shared/i18n/editor.ts src/shared/i18n.en/editor.ts src/shared/i18n.zh-CN/editor.ts
git commit -m "feat(i18n): add 3 leftPanel.projectTab.* keys for collapse/expand

EN:
- leftPanel.projectTab.toggleCollapse: 'Collapse project panel'
- leftPanel.projectTab.toggleExpand: 'Expand project panel'
- leftPanel.projectTab.collapsedNotice: 'Project panel is collapsed. Click to expand.'

zh-CN:
- leftPanel.projectTab.toggleCollapse: '折叠项目面板'
- leftPanel.projectTab.toggleExpand: '展开项目面板'
- leftPanel.projectTab.collapsedNotice: '项目面板已折叠。点击展开。'

i18n parity test (src/shared/i18n/__tests__/editor.parity.test.ts) stays
green. type-check both configs clean."
```

---

## Task 2: Slice field + localStorage read/write + slice tests

**Files:**

- Modify: `src/renderer/store/slices/uiSlice.ts:16-128` (interface) + `:129-304` (defaults + setter)
- Modify: `src/renderer/store/useArxmlStore.ts` (localStorage read on init — see Step 3)
- Create: `src/renderer/store/__tests__/useArxmlStore.leftPanelCollapse.test.ts`

**Interfaces:**

- Consumes: `t()` from `@shared/i18n/index.js` (already imported)
- Produces:
  - `leftPanelProjectCollapsed: boolean` — slice field
  - `setLeftPanelProjectCollapsed: (value: boolean) => void` — slice action

- [ ] **Step 1: Write the failing slice test**

Create `src/renderer/store/__tests__/useArxmlStore.leftPanelCollapse.test.ts`:

```ts
// src/renderer/store/__tests__/useArxmlStore.leftPanelCollapse.test.ts
// Pin the contract of leftPanelProjectCollapsed: slice field + setter
// writes to localStorage + rehydrate from localStorage on store init.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useArxmlStore } from '../useArxmlStore.js';

const STORAGE_KEY = 'claude-autosarcfg:leftPanel:projectCollapsed';

describe('useArxmlStore — leftPanelProjectCollapsed (v1.55.0)', () => {
  beforeEach(() => {
    localStorage.clear();
    // Re-init: in vitest, the store module is loaded once per test
    // file; the localStorage read happens at module load. If a test
    // mutates localStorage mid-run, the slice does NOT re-hydrate
    // (one-shot read at module load — matches the locale init
    // pattern). Tests below re-import the module via
    // `vi.resetModules()` + dynamic import to exercise rehydrate.
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to false on a fresh store (no localStorage entry)', () => {
    // No localStorage write; default from initial state should be false.
    expect(useArxmlStore.getState().leftPanelProjectCollapsed).toBe(false);
  });

  it('setLeftPanelProjectCollapsed flips the in-memory field AND writes localStorage', () => {
    useArxmlStore.getState().setLeftPanelProjectCollapsed(true);
    expect(useArxmlStore.getState().leftPanelProjectCollapsed).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');

    useArxmlStore.getState().setLeftPanelProjectCollapsed(false);
    expect(useArxmlStore.getState().leftPanelProjectCollapsed).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/renderer/store/__tests__/useArxmlStore.leftPanelCollapse.test.ts 2>&1 | tail -20`
Expected: FAIL with "leftPanelProjectCollapsed is not a function" / "undefined" (the field doesn't exist yet).

- [ ] **Step 3: Add the field to `UiSlice` interface in `src/renderer/store/slices/uiSlice.ts`**

In the `UiSlice` interface (after the `setLeftTab: (tab: LeftTabId) => void;` line, around line 28), add:

```ts
  /**
   * v1.55.0 — Project Tab Collapse/Expand. When true, the "项目" tab
   * body (header + meta + ARXML/BSWMD lists) is replaced by a 1-line
   * compact placeholder so the right-pane ParamEditor can use the
   * freed vertical space. The Tree and the tabs bar at the top of
   * the LeftPanel stay visible. Persisted to localStorage under
   * `claude-autosarcfg:leftPanel:projectCollapsed` so the user's
   * last choice survives page reload. Default false.
   */
  readonly leftPanelProjectCollapsed: boolean;
  setLeftPanelProjectCollapsed: (value: boolean) => void;
```

- [ ] **Step 4: Add the field default to the slice creator**

In the `createUiSlice` body (after the `leftTab: 'files',` line, around line 141), add:

```ts
  // v1.55.0 — project tab collapse state. Default false (panel
  // expanded). The localStorage rehydrate at useArxmlStore.ts module
  // load replaces this default if the user previously collapsed the
  // panel — see `loadLeftPanelProjectCollapsedFromStorage()`.
  leftPanelProjectCollapsed: false,
```

- [ ] **Step 5: Add the setter to the slice creator**

In the `createUiSlice` body, after the existing `setLeftTab: (tab) => set({ leftTab: tab }),` line, add:

```ts
  // v1.55.0 — toggle the project tab collapse. Wraps the `set(...)`
  // call in a try/catch + localStorage write so quota / private-mode
  // errors degrade to a console.warn (matches the existing
  // useDefaultLayout-onLayoutChanged pattern in App.tsx). The
  // in-memory state flip is unconditional — a failed write still
  // flips the UI; the next page reload simply reverts to whatever
  // the storage had (likely the previous value, which is fine).
  setLeftPanelProjectCollapsed: (value) => {
    set({ leftPanelProjectCollapsed: value });
    try {
      localStorage.setItem(
        'claude-autosarcfg:leftPanel:projectCollapsed',
        String(value),
      );
    } catch (e) {
      console.warn('[ui] failed to persist leftPanelProjectCollapsed', e);
    }
  },
```

- [ ] **Step 6: Wire the localStorage read in `src/renderer/store/useArxmlStore.ts`**

This is the **only** localStorage read for this field. It happens at module load, before the store is first used.

At the top of the file, after the existing imports (around line 37, before the `// Shared types` block), add a small helper:

```ts
/**
 * v1.55.0 — one-shot localStorage read for the project tab collapse
 * state. Called once at module load; the result is fed into the
 * uiSlice's initial state. Returns false on any read failure
 * (private mode, quota, malformed JSON) so the store always has a
 * valid boolean to start with. The `console.warn` mirrors the
 * pattern in `useDefaultLayout`-style persistence (App.tsx) and
 * the setter's write-side catch.
 */
function loadLeftPanelProjectCollapsedFromStorage(): boolean {
  try {
    const raw = localStorage.getItem('claude-autosarcfg:leftPanel:projectCollapsed');
    if (raw === null) return false;
    return raw === 'true';
  } catch (e) {
    console.warn('[ui] failed to read leftPanelProjectCollapsed from localStorage', e);
    return false;
  }
}
```

Then, in the slice composition (find the `createUiSlice(...)` call inside the `create<ArxmlState>(...)` call) — pass the loaded value into the slice creator's initial state. The exact mechanism depends on how the existing slices receive their initial state; **read `useArxmlStore.ts` around line 100-150 to find the `createUiSlice` call**, then modify the call site so the slice reads the pre-loaded value. Two acceptable patterns:

**Pattern A** (preferred if `createUiSlice` accepts no params today): keep the field default at `false` and override it via a top-level `useArxmlStore.setState({ leftPanelProjectCollapsed: loadLeftPanelProjectCollapsedFromStorage() })` call right after the `create(...)` returns. The setState call runs once at module load; subsequent state changes go through the setter.

**Pattern B** (acceptable alternative): pass the loaded value as the `leftPanelProjectCollapsed` field's initial value by replacing the literal `false` in Step 4 with `loadLeftPanelProjectCollapsedFromStorage()` (move the helper above the slice composition).

Pick Pattern A unless the existing slice-composition style makes Pattern B cleaner. Document the choice in a 1-line comment in the code.

- [ ] **Step 7: Run the slice test to verify it passes**

Run: `pnpm test src/renderer/store/__tests__/useArxmlStore.leftPanelCollapse.test.ts 2>&1 | tail -15`
Expected: PASS. Both cases green.

- [ ] **Step 8: Run the full test suite to confirm no regression**

Run: `pnpm test 2>&1 | tail -8`
Expected: 3221 + 7 SKIP / 0 fail + **2 new** = 3223 + 7 SKIP / 0 fail (the +2 is from THIS task's slice test). No existing test fails.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/store/slices/uiSlice.ts src/renderer/store/useArxmlStore.ts src/renderer/store/__tests__/useArxmlStore.leftPanelCollapse.test.ts
git commit -m "feat(store): add leftPanelProjectCollapsed slice field + localStorage persist

UiSlice gains:
- leftPanelProjectCollapsed: boolean (default false)
- setLeftPanelProjectCollapsed(value: boolean): void

Persistence: localStorage key
'claude-autosarcfg:leftPanel:projectCollapsed', read once at
useArxmlStore module load (loadLeftPanelProjectCollapsedFromStorage
helper, try/catch + console.warn matching the useDefaultLayout
pattern in App.tsx), written inside the setter (try/catch + warn).

The field is the single source of truth for the Project Tab
Collapse/Expand feature. The setter unconditionally flips the
in-memory state; the localStorage write is best-effort.

Tests: 2 new cases in
src/renderer/store/__tests__/useArxmlStore.leftPanelCollapse.test.ts
- default false on fresh store
- setter flips in-memory state AND writes localStorage

No regression: 3221 + 7 SKIP / 0 fail baseline → 3223 + 7 SKIP /
0 fail (+2 net)."
```

---

## Task 3: Component — Chevron toggle button in `ProjectPanelInfo` header

**Files:**

- Modify: `src/renderer/components/ProjectPanel.tsx:336-357` (header) + add chevron button
- Modify: `src/renderer/components/ProjectPanel.css` (toggle button styling)

**Interfaces:**

- Consumes: `setLeftPanelProjectCollapsed` from store (Task 2)
- Produces: A clickable chevron button in the `ProjectPanelInfo` header

- [ ] **Step 1: Add CSS for the toggle button in `src/renderer/components/ProjectPanel.css`**

Open the file and find the existing `.project-panel-close` rule (search for `.project-panel-close {` or its descendants). After the closing `}` of `.project-panel-close`, add:

```css
/* v1.55.0 — Project Tab Collapse/Expand. Chevron button in the
   ProjectPanelInfo header next to the × close button. Mirrors the
   close-button styling (small, round, hover-grey) but the icon is
   a chevron-up (collapse) — the user clicks it to fold the project
   tab body into a 1-line compact placeholder. */
.project-panel-collapse-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: rgb(100 116 139); /* slate-500 */
  cursor: pointer;
  transition:
    background 150ms ease,
    color 150ms ease;
}

.project-panel-collapse-toggle:hover {
  background: rgb(241 245 249); /* slate-100 */
  color: rgb(15 23 42); /* slate-900 */
}

.project-panel-collapse-toggle:focus-visible {
  outline: 2px solid rgb(59 130 246); /* blue-500 */
  outline-offset: 1px;
}

.project-panel-collapse-toggle svg {
  width: 14px;
  height: 14px;
}
```

- [ ] **Step 2: Add the toggle button in `ProjectPanelInfo` header**

In `src/renderer/components/ProjectPanel.tsx`, find the `<header className="project-panel-header">` block (line 336-357). The block currently has a `<button className="project-panel-close">×</button>` element at the end. Wrap both buttons (the existing `×` and the new chevron) in a flex container so they sit side by side at the right of the header.

Replace the existing `<button className="project-panel-close" ...>×</button>` block with:

```tsx
<div className="project-panel-header-actions">
  {/* v1.55.0 — Project Tab Collapse/Expand. Chevron-up
              button collapses the entire project tab body into a
              1-line compact placeholder (see LeftPanel.tsx). The
              Tree and the tabs bar at the top of the LeftPanel stay
              visible. The toggle is independent of `×` (close
              project) — collapsing the panel does NOT close the
              project. ARIA: aria-expanded reflects the state
              (always true here since the button only renders when
              expanded); aria-controls points to the left-pane-
              project tabpanel. i18n: title + aria-label share the
              same action-verb key (leftPanel.projectTab.toggleCollapse)
              so the screen-reader announcement is the action, not
              the state. */}
  <button
    type="button"
    className="project-panel-collapse-toggle"
    onClick={() => useArxmlStore.getState().setLeftPanelProjectCollapsed(true)}
    aria-label={t(locale, 'leftPanel.projectTab.toggleCollapse')}
    aria-expanded="true"
    aria-controls="left-pane-project"
    title={t(locale, 'leftPanel.projectTab.toggleCollapse')}
    data-testid="project-panel-collapse-toggle"
  >
    {/* chevron-up (svg, 14x14, stroke 2) */}
    <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M3 9 L7 5 L11 9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </button>
  <button
    type="button"
    className="project-panel-close"
    onClick={onClose}
    data-testid="project-panel-close-btn"
    aria-label={t(locale, 'projectPanel.closeAria', { name: manifest.name })}
  >
    ×
  </button>
</div>
```

- [ ] **Step 3: Add a CSS rule for the `.project-panel-header-actions` flex container**

In `src/renderer/components/ProjectPanel.css`, after the `.project-panel-collapse-toggle` block, add:

```css
/* v1.55.0 — flex container for the collapse-toggle + close buttons
   so they sit side by side at the right of the header. */
.project-panel-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
```

- [ ] **Step 4: Run type-check + full test suite to confirm no regression**

Run:

```bash
pnpm type-check 2>&1 | tail -10
pnpm test 2>&1 | tail -8
```

Expected: type-check clean; 3223 + 7 SKIP / 0 fail (same as Task 2). No existing test should break — `ProjectPanel.test.tsx` doesn't assert on the header's button count, but if any test does fail, investigate before committing.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ProjectPanel.tsx src/renderer/components/ProjectPanel.css
git commit -m "feat(project-panel): add chevron toggle button to collapse project tab

Click the chevron-up next to the existing × close button in the
ProjectPanelInfo header to fold the entire project tab body into a
1-line compact placeholder. The Tree and the tabs bar at the top of
the LeftPanel stay visible. The toggle is independent of × (close
project) — collapsing the panel does NOT close the project.

i18n: aria-label + title use leftPanel.projectTab.toggleCollapse
('Collapse project panel' / '折叠项目面板'). ARIA: aria-expanded
reflects the rendered state (true here since the button only renders
when expanded); aria-controls points to the left-pane-project
tabpanel.

CSS: new .project-panel-collapse-toggle + .project-panel-header-
actions rules. Chevron-up SVG (14x14, stroke 2, rounded caps).

State: read + set via the slice field added in the previous commit
(setLeftPanelProjectCollapsed). No regression: 3223 + 7 SKIP / 0 fail."
```

---

## Task 4: Component — LeftPanel conditional render + collapsed placeholder

**Files:**

- Modify: `src/renderer/components/LeftPanel.tsx:75-191` (add collapsed branch in the 'project' tab pane)
- Create: `src/renderer/components/__tests__/LeftPanel.collapse.test.tsx`

**Interfaces:**

- Consumes: `leftPanelProjectCollapsed` + `setLeftPanelProjectCollapsed` from store
- Produces: A `CollapsedProjectPanelPlaceholder` (inline subcomponent or top-level) + the wiring that swaps the body

- [ ] **Step 1: Write the failing component tests**

Create `src/renderer/components/__tests__/LeftPanel.collapse.test.tsx`:

```tsx
// src/renderer/components/__tests__/LeftPanel.collapse.test.tsx
// @vitest-environment jsdom
//
// v1.55.0 — Project Tab Collapse/Expand. Pins the contract:
// - initial render: ProjectPanelInfo is in the DOM (when a project
//   is open); the collapsed placeholder is NOT.
// - click the chevron toggle: ProjectPanelInfo unmounts; the
//   collapsed placeholder mounts; the store's
//   leftPanelProjectCollapsed field is true.
// - click the expand button in the placeholder: ProjectPanelInfo
//   re-mounts; the store's field flips back to false.
//
// Loose-mode variant: when no project is open, the empty placeholder
// is replaced by the collapsed placeholder; clicking the expand
// button brings back the empty placeholder.

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useArxmlStore } from '../../store/useArxmlStore';
import { LeftPanel } from '../LeftPanel';

beforeEach(() => {
  useArxmlStore.setState({
    leftPanelProjectCollapsed: false,
    project: null,
    projectPath: null,
    leftTab: 'project',
  });
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('LeftPanel — Project Tab Collapse/Expand (v1.55.0)', () => {
  it('expanded by default: ProjectPanelInfo is rendered when a project is open', () => {
    useArxmlStore.setState({
      project: {
        schemaVersion: '1.0.0',
        id: 'test',
        name: 'Test Project',
        valueArxmlPaths: [],
        bswmdPaths: [],
      },
      projectPath: '/proj/test.autosarcfg.json',
    });
    render(<LeftPanel />);
    expect(screen.getByTestId('project-panel-open')).toBeInTheDocument();
    expect(screen.queryByTestId('left-pane-project-collapsed')).not.toBeInTheDocument();
  });

  it('clicking the chevron in the header collapses the panel (body → placeholder)', async () => {
    const user = userEvent.setup();
    useArxmlStore.setState({
      project: {
        schemaVersion: '1.0.0',
        id: 'test',
        name: 'Test Project',
        valueArxmlPaths: [],
        bswmdPaths: [],
      },
      projectPath: '/proj/test.autosarcfg.json',
    });
    render(<LeftPanel />);
    expect(screen.getByTestId('project-panel-open')).toBeInTheDocument();

    await user.click(screen.getByTestId('project-panel-collapse-toggle'));

    expect(useArxmlStore.getState().leftPanelProjectCollapsed).toBe(true);
    expect(screen.queryByTestId('project-panel-open')).not.toBeInTheDocument();
    expect(screen.getByTestId('left-pane-project-collapsed')).toBeInTheDocument();
  });

  it('clicking the expand button in the placeholder restores the panel', async () => {
    const user = userEvent.setup();
    useArxmlStore.setState({
      project: {
        schemaVersion: '1.0.0',
        id: 'test',
        name: 'Test Project',
        valueArxmlPaths: [],
        bswmdPaths: [],
      },
      projectPath: '/proj/test.autosarcfg.json',
      leftPanelProjectCollapsed: true,
    });
    render(<LeftPanel />);
    expect(screen.queryByTestId('project-panel-open')).not.toBeInTheDocument();
    expect(screen.getByTestId('left-pane-project-collapsed')).toBeInTheDocument();

    await user.click(screen.getByTestId('left-pane-project-collapsed-expand'));

    expect(useArxmlStore.getState().leftPanelProjectCollapsed).toBe(false);
    expect(screen.getByTestId('project-panel-open')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/renderer/components/__tests__/LeftPanel.collapse.test.tsx 2>&1 | tail -25`
Expected: FAIL — `project-panel-collapse-toggle` doesn't exist yet, and the collapsed placeholder is not implemented.

- [ ] **Step 3: Add the `leftPanelProjectCollapsed` selector + handler in `LeftPanel`**

In `src/renderer/components/LeftPanel.tsx`, after the existing `useArxmlStore((s) => s.leftTab)` selector (line 76), add:

```tsx
// v1.55.0 — project tab collapse. Read the field and the setter
// from the uiSlice. The collapse state is independent of the
// `leftTab` value (the user can be on the "文件" or "验证" tab
// while the project body is collapsed) but the test setup
// explicitly lands on `leftTab: 'project'` to make the swap
// observable.
const projectCollapsed = useArxmlStore((s) => s.leftPanelProjectCollapsed);
const setProjectCollapsed = useArxmlStore((s) => s.setLeftPanelProjectCollapsed);
```

- [ ] **Step 4: Conditionally render the project tab body**

In the same file, find the `{activeTab === 'project' && (` ... `)}` block (line 127-159). Replace its inner content so the `ProjectPanelInfo` only renders when not collapsed, and the collapsed placeholder renders when collapsed. Replace the entire inner JSX (the `<div className="left-panel-pane" role="tabpanel" ...>` and its children) with:

```tsx
{
  activeTab === 'project' && (
    <div
      className="left-panel-pane"
      role="tabpanel"
      id="left-pane-project"
      aria-labelledby="left-tab-project"
      data-testid="left-pane-project"
    >
      {/* v1.55.0 — Project Tab Collapse/Expand. When the user
                clicked the chevron in the ProjectPanelInfo header,
                the body collapses into a 1-line compact placeholder
                with an inline [展开] / [Expand] button. The Tree
                below and the tabs bar above stay visible. The
                collapsed state is independent of `leftTab` — the
                user can switch to the "文件" / "验证" tabs while
                the project body stays collapsed, and switching
                back to "项目" renders the same collapsed state. */}
      {projectCollapsed ? (
        <div
          className="left-panel-pane left-panel-pane-collapsed"
          data-testid="left-pane-project-collapsed"
        >
          <span className="left-panel-pane-collapsed-notice">
            {t(locale, 'leftPanel.projectTab.collapsedNotice')}
          </span>
          <button
            type="button"
            className="left-panel-pane-collapsed-expand"
            onClick={() => setProjectCollapsed(false)}
            aria-label={t(locale, 'leftPanel.projectTab.toggleExpand')}
            aria-expanded="false"
            aria-controls="left-pane-project"
            data-testid="left-pane-project-collapsed-expand"
          >
            {t(locale, 'leftPanel.projectTab.toggleExpand')}
          </button>
        </div>
      ) : isProjectOpen ? (
        <ProjectPanelInfo
          locale={locale}
          manifest={project}
          manifestPath={projectPath}
          onClose={closeProject}
          onRemoveArxml={removeDocument}
          onAddBswmd={() => void addBswmdFromDialog()}
          onRemoveBswmd={(path) => void removeBswmdWithFullFlow(path)}
          onAddEcuc={onAddEcucFromBswmd}
          onConfigureModules={onAddEcucFromBswmd}
        />
      ) : (
        <div className="left-panel-pane-empty" data-testid="left-pane-project-empty">
          {t(locale, 'leftPanel.project.empty')}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Add CSS for the collapsed placeholder**

In `src/renderer/components/LeftPanel.css`, after the existing `.left-panel-pane-empty { ... }` block, add:

```css
/* v1.55.0 — Project Tab Collapse/Expand. 1-line compact placeholder
   shown when the project tab body is collapsed. Notice text on the
   left, [Expand] button on the right; the row sits in the same
   scrollable area that ProjectPanelInfo used to occupy but is
   roughly 40px tall instead of ~350px. */
.left-panel-pane-collapsed {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  min-height: 40px;
  background: rgb(248 250 252); /* slate-50 */
  border-bottom: 1px solid rgb(226 232 240); /* slate-200 */
}

.left-panel-pane-collapsed-notice {
  font-size: 12px;
  color: rgb(100 116 139); /* slate-500 */
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.left-panel-pane-collapsed-expand {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid rgb(203 213 225); /* slate-300 */
  background: white;
  color: rgb(15 23 42); /* slate-900 */
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 150ms ease;
}

.left-panel-pane-collapsed-expand:hover {
  background: rgb(241 245 249); /* slate-100 */
}

.left-panel-pane-collapsed-expand:focus-visible {
  outline: 2px solid rgb(59 130 246); /* blue-500 */
  outline-offset: 1px;
}
```

- [ ] **Step 6: Run the failing tests to verify they pass**

Run: `pnpm test src/renderer/components/__tests__/LeftPanel.collapse.test.tsx 2>&1 | tail -15`
Expected: 3/3 PASS. All three test cases green.

- [ ] **Step 7: Run the full test suite to confirm no regression**

Run: `pnpm test 2>&1 | tail -8`
Expected: 3221 + 7 SKIP / 0 fail + **5 new** (2 from Task 2 + 3 from Task 4) = 3226 + 7 SKIP / 0 fail. No existing test fails.

- [ ] **Step 8: Run `pnpm verify` 8-stage**

Run: `pnpm verify 2>&1 | tail -25`
Expected: 8 stages GREEN. format + lint + type-check + test + coverage + build + import-regression + python-self-test all pass. If format reports drift (likely on the new test file's spacing), run `pnpm prettier --write <files>` and re-verify.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/LeftPanel.tsx src/renderer/components/LeftPanel.css src/renderer/components/__tests__/LeftPanel.collapse.test.tsx
git commit -m "feat(left-panel): wire collapse/expand + collapsed placeholder

When the slice field leftPanelProjectCollapsed is true, the '项目'
tab body (ProjectPanelInfo) is replaced by a 1-line compact
placeholder showing
  'Project panel is collapsed. Click to expand.'
plus an inline [Expand] / [展开] button. The Tree and the tabs bar
at the top of the LeftPanel stay visible. The collapsed state is
independent of leftTab — switching to '文件' / '验证' and back
preserves the collapse.

CSS: new .left-panel-pane-collapsed + .left-panel-pane-collapsed-
notice + .left-panel-pane-collapsed-expand rules. The row is ~40px
tall instead of the original ~350px, freeing vertical space for the
right-pane ParamEditor.

Tests: 3 new cases in LeftPanel.collapse.test.tsx
- expanded by default: ProjectPanelInfo renders, no placeholder
- click chevron: ProjectPanelInfo unmounts, placeholder mounts,
  store.leftPanelProjectCollapsed === true
- click expand button in placeholder: panel re-mounts, store
  field === false

No regression: 3221 + 7 SKIP / 0 fail baseline → 3226 + 7 SKIP /
0 fail (+5 net). pnpm verify 8-stage GREEN."
```

---

## Task 5: T-ship — version bump + CHANGELOG + release notes + tag v1.55.0

**Files:**

- Modify: `package.json:3` (`"version": "1.54.5"` → `"version": "1.55.0"`)
- Modify: `CHANGELOG.md` (prepend v1.55.0 entry at the top, after the `# Changelog` header)
- Create: `docs/release-notes/v1.55.0/README.md`

**Interfaces:**

- Consumes: previous release notes pattern (read `docs/release-notes/v1.54.5/README.md` if it exists, or `v1.54.4/README.md` as template)
- Produces: v1.55.0 release commit, tag `v1.55.0` annotated

- [ ] **Step 1: Bump `package.json` version**

Open `package.json`. Change line 3 from `"version": "1.54.5"` to `"version": "1.55.0"`. Save.

- [ ] **Step 2: Prepend the v1.55.0 CHANGELOG entry**

Open `CHANGELOG.md`. The first content line is `## v1.54.5 (2026-07-15) — PATCH (...)`. **Above** that line, add the v1.55.0 entry. Follow the existing Keep-a-Changelog format used in the v1.54.5 / v1.54.4 entries (verifiable by reading those entries). The new entry MUST include:

- `## v1.55.0 (2026-07-15) — MINOR (Project Tab Collapse/Expand)` header
- One-sentence summary of the feature
- Per-commit bullet list (Tasks 1-4 + this T-ship task)
- Test results (`3221 + 7 SKIP / 0 fail` → `3226 + 7 SKIP / 0 fail`, +5 net)
- `pnpm verify 8-stage GREEN` claim
- Process lessons applied (`release-checklist-must-verify-package.json-bump-on-every-version-ship` standalone; `function-extract-must-clip-verbatim-not-reimplement` standalone if you verbatim-copy any helper from a previous slice)

The entry should be 30-60 lines. Use the v1.54.4 entry (in `docs/release-notes/v1.54.4/README.md`) as a template for length and tone.

- [ ] **Step 3: Create the release notes file**

Create `docs/release-notes/v1.55.0/README.md` with the following sections (per the v1.54.4 template structure, which the implementer should read first):

1. **Title**: `# v1.55.0 — Project Tab Collapse/Expand (MINOR)`
2. **Released**: `2026-07-15` + tag link + cycle type + ship basis
3. **Summary**: 1 paragraph explaining the user-facing behaviour (collapse the project tab body to free vertical space for ParamEditor; click chevron to collapse, click [Expand] in placeholder to restore; state persists in localStorage)
4. **Commits**: table of Tasks 1-4 commits + this T-ship commit
5. **Decisions**: 6 design decisions from the spec (D1 slice, D2 localStorage, D3 toggle placement, D4 collapsed shape 1-line, D5 ARIA + i18n, D6 no interaction with horizontal resizer)
6. **User-visible behaviour**: 3-5 bullet list of what the user sees (expanded by default; chevron in header collapses; collapsed placeholder is 1 line tall; switching tabs preserves state; survives page reload)
7. **Test results**: full count + the 5 new tests named
8. **Process lessons applied**: bullets
9. **Related documents**: spec link, previous release notes
10. **Manual smoke test**: 5-6 numbered steps the user can run in their dev workspace to verify

Target length: 100-150 lines (the v1.54.4 README is 151 lines — match its density).

- [ ] **Step 4: Run `pnpm format` to normalize formatting**

Run: `pnpm format 2>&1 | tail -10`
Expected: writes prettier formatting to any of the 3 modified/new files that drift. Re-run `pnpm verify` to confirm format + test still pass.

- [ ] **Step 5: Run `pnpm verify` one more time**

Run: `pnpm verify 2>&1 | tail -25`
Expected: 8 stages GREEN.

- [ ] **Step 6: Commit T-ship**

```bash
git add package.json CHANGELOG.md docs/release-notes/v1.55.0/README.md
git commit -m "chore(release): bump version 1.54.5 → 1.55.0 + release notes

Per release-checklist-must-verify-package.json-bump-on-every-version-ship (standalone).

First MINOR in the v1.55.x cycle. Closes the 2026-07-15 user
feedback '我感觉这个view可以搞一个缩小展开的功能' — adds a
collapse/expand toggle to the left sidebar's '项目' tab body so
the user can free vertical space for the right-pane ParamEditor.

User-visible: a chevron-up button in the ProjectPanelInfo header
(next to × close) collapses the project body to a 1-line compact
placeholder; the Tree and the tabs bar stay visible; the state
persists in localStorage (key
'claude-autosarcfg:leftPanel:projectCollapsed') across page reloads.

Test: 3221 + 7 SKIP / 0 fail → 3226 + 7 SKIP / 0 fail (+5 net:
2 slice tests + 3 component tests). pnpm verify 8-stage GREEN.
tsc both configs clean."
```

- [ ] **Step 7: Tag v1.55.0 (annotated)**

Run:

```bash
git tag -a v1.55.0 -m "v1.55.0 MINOR — Project Tab Collapse/Expand

First new user-facing feature since v1.54.x PATCH chain. Closes
the 2026-07-15 user request to add a collapse/expand toggle to the
left sidebar so the user can free vertical space for the right-
pane ParamEditor.

5 commits:
- 3 new i18n keys (leftPanel.projectTab.toggleCollapse /
  toggleExpand / collapsedNotice) × 2 locales + interface
- uiSlice: leftPanelProjectCollapsed field + setter + localStorage
  persist (read on store init, write in setter, try/catch + warn)
- ProjectPanel: chevron-up toggle button in header
- LeftPanel: conditional render + 1-line collapsed placeholder
- this T-ship commit (version + CHANGELOG + release notes)

Test: 3226 + 7 SKIP / 0 fail (+5 net). pnpm verify 8-stage GREEN."
```

Expected: tag created. `git tag -l "v1.55.0"` lists it.

- [ ] **Step 8: Stop. Do NOT push. Hand off to user for review.**

The user has a pre-review gate (per v1.54.2 PATCH pattern: tag local-only, not pushed to origin). Pushing is the user's call.

## Self-Review (orchestrator side, post-plan)

- **Spec coverage**:
  - Scope (only project tab body) — Task 4 Step 4
  - 1-line collapsed placeholder — Task 4 Step 4-5
  - localStorage persist — Task 2 Steps 5-6
  - Chevron toggle in header — Task 3
  - Expand button in placeholder — Task 4 Step 4
  - i18n keys × 2 locales + interface — Task 1
  - Tab switching preserves state — covered by design (the slice field is independent of `leftTab`)
  - Loose mode — handled by the ternary `projectCollapsed ? collapsed : isProjectOpen ? ProjectPanel : empty` (placeholder replaces the empty placeholder, expand button still works)
  - No interaction with horizontal resizer — explicit in Task 4 Step 4 (no `useDefaultLayout` references)
  - 3221 + 7 SKIP / 0 fail baseline — Task 2 Step 8 + Task 4 Step 7
  - 5 new tests — Task 2 (2) + Task 4 (3) = 5
  - Version bump 1.54.5 → 1.55.0 — Task 5 Step 1
  - Tag v1.55.0 — Task 5 Step 7
- **Placeholder scan**: no "TBD" / "TODO" / "implement later" / "fill in details". Every step has concrete code or command.
- **Type consistency**: `leftPanelProjectCollapsed` used identically across Tasks 2-4. `setLeftPanelProjectCollapsed` used identically. `STORAGE_KEY` in Task 2 test is `'claude-autosarcfg:leftPanel:projectCollapsed'` (matches Task 2 Step 5 setter write and Task 2 Step 6 helper read — string-equal).
- **One ambiguity resolved**: Task 2 Step 6 offers Pattern A or B for the localStorage read wiring. Implementer picks based on existing slice-composition style. Document the choice in code.
- **Risk**: Task 4 Step 4's ternary on `projectCollapsed ? collapsed : isProjectOpen ? ProjectPanel : empty` must be parenthesized correctly (the `? :` chain has 3 alternatives). The implementer must read the existing JSX carefully and replace the right block.
- **Out of scope confirmed**: animation, other tabs collapse, Tree collapse, horizontal resize changes, right-pane collapse. None of these tasks touch them.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-15-project-tab-collapse.md`. 5 tasks, 5 source commits + 1 docs commit (T-ship) + 1 tag.

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review per task, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
