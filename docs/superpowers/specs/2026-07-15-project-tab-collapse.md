# Project Tab Collapse/Expand (2026-07-15)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**: Let the user collapse the "项目" tab body inside the left sidebar (keep tabs + Tree visible) to free vertical space for the right-side ParamEditor, and re-expand it on demand. State persists in localStorage.

**Architecture**: A new boolean slice field `leftPanelProjectCollapsed` (zustand) is the single source of truth. `LeftPanel.tsx` reads it and conditionally renders the "项目" tab body. A toggle button inside the project body (and a sibling placeholder when collapsed) flips the field. The existing `useDefaultLayout({ groupId: 'workspace' })` resizer is untouched (drag-to-resize still works; collapse is a separate axis — vertical content visibility, not horizontal width).

**Tech Stack**: Zustand 4.5.4 (existing store), React 18.3.1, TypeScript 5.6, localStorage (existing safe wrapper if any, else direct `localStorage.getItem/setItem` with try/catch).

## User-facing behaviour

- **Expanded (default)**: "项目" tab body shows `ProjectPanelInfo` (header + meta + ARXML list + BSWMD list) — current behaviour.
- **Collapsed**: "项目" tab body shows a 1-line compact placeholder reading `项目面板已折叠 [展开]` (zh) / `Project panel collapsed [Expand]` (en). The tabs bar at the top of LeftPanel is unchanged. The Tree at the bottom of LeftPanel is unchanged. Right-pane ParamEditor gets the freed vertical space.
- **Toggle source**: a chevron button in the top-right of the ProjectPanelInfo header (replaces / accompanies the existing `×` close button — the chevron is the new control). The button is also rendered in the collapsed placeholder so the user can re-expand from inside the collapsed region.
- **Tab switching**: when the user clicks "文件" or "验证" tab, then clicks back to "项目", the collapse state is preserved. The "项目" tab body renders the same expanded-or-collapsed state the user left it in.
- **Loose mode** (no project open): the "项目" tab body shows the empty placeholder. The collapse state still applies: when collapsed, the body is replaced by the compact 1-line "Project panel collapsed" placeholder instead of the empty placeholder. The chevron toggle is still rendered in the compact placeholder so the user can re-expand.
- **Persistence**: the collapse state is written to `localStorage` under key `claude-autosarcfg:leftPanel:projectCollapsed` and rehydrated on app start. If the read fails (private mode, quota, malformed JSON), the value falls back to `false` and the failure is logged to the renderer console (once, on app start — the existing `console.warn` pattern from `loadDefaultLayout`-style helpers).
- **No effect on**:
  - The drag-to-resize separator between left/right (`react-resizable-panels`'s `<Separator>`).
  - The other two tabs ("文件", "验证") and the Tree.
  - The existing `×` close-project button — that one stays as-is.
  - The `leftTab` slice value — collapse is independent of tab selection.
  - The 367 tests / verify gate.

## Design decisions

- **D1 — Slice field, not local component state**. Other "user-tunable" UI state (e.g. `viewMode`, `leftTab`, `locale`) lives in the zustand store so it can be read by multiple components and round-tripped through tests. `leftPanelProjectCollapsed` follows the same pattern. A local `useState` would force the test for the AppHeader-driven chevron (if we ever add one) to walk through the full React tree; the slice test is a 5-line `useArxmlStore.getState().setLeftPanelProjectCollapsed(true)` + `expect(useArxmlStore.getState().leftPanelProjectCollapsed).toBe(true)`.
- **D2 — Persist via localStorage at the slice level**. The store already persists some fields (e.g. `locale`, `leftTab`) via the existing `localStorage` write in a slice's setter. The new field follows the same `try { localStorage.setItem(...) } catch (e) { console.warn(...) }` pattern so SSR / private-mode / quota errors are swallowed once. Rehydrate happens once on store creation (mirroring the existing `loadDefaultLayout` / locale init).
- **D3 — Toggle button placement**. Two options considered: (a) inside the existing `ProjectPanelInfo` header next to the `×` close button, (b) as a chevron in the tabs bar itself (a 3rd small icon next to the tab label). (a) wins because it lives where the user's eye is — at the top of the project content — and doesn't require touching the tabs bar code, which has 3+ dedicated tests. The collapsed placeholder also gets the same toggle so the user can re-expand from anywhere inside the project content area.
- **D4 — Collapsed placeholder is 1 line tall, not 0 height**. Pure 0-height would leave the tabs bar visually attached to the Tree, which is what we want for vertical space — but the user explicitly asked for a "展开" affordance, and a 0-height region has no clickable surface. A 1-line (≈ 32-40px) row with the placeholder text and a toggle button gives the user a discoverable expand target while still freeing ~70% of the original height (the current body is ~ 350px on a typical project).
- **D5 — Toggle button is keyboard-accessible + ARIA labelled**. `<button type="button" aria-expanded={!collapsed} aria-controls="left-pane-project">` — same ARIA contract as the tabs themselves. i18n keys `leftPanel.projectTab.toggleCollapse` and `leftPanel.projectTab.toggleExpand` (one for each direction so the screen-reader label is the action, not the state).
- **D6 — No defaultLayout interaction**. The horizontal resizer is unchanged. The collapse is a vertical content hide. They are orthogonal axes and the user can mix them (collapsed project tab + 30% left width = maximum right-pane space).

## Architecture

### Files

| File                                                                         | Change                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/renderer/store/useArxmlStore.ts` (or `slices/uiSlice.ts` if it exists)  | Add `leftPanelProjectCollapsed: boolean` field + `setLeftPanelProjectCollapsed(value: boolean): void` action. Add localStorage read in store init; add localStorage write in setter.                                                                         |
| `src/renderer/components/LeftPanel.tsx`                                      | Read `leftPanelProjectCollapsed` from store. Conditionally render `ProjectPanelInfo` (expanded) vs the compact 1-line placeholder (collapsed) inside the existing `left-pane-project` div. Render the chevron toggle in BOTH branches (always discoverable). |
| `src/renderer/components/ProjectPanel.tsx`                                   | Add a chevron toggle button to the existing `ProjectPanelInfo` header. The toggle calls `useArxmlStore((s) => s.setLeftPanelProjectCollapsed)(!collapsed)`.                                                                                                  |
| `src/renderer/components/ProjectPanel.css`                                   | New class `.project-panel-collapse-toggle` (chevron button styling).                                                                                                                                                                                         |
| `src/renderer/components/__tests__/LeftPanel.collapse.test.tsx` (NEW)        | 3 cases: (1) initial state is expanded, (2) click toggle → state persists to store, (3) rehydrate from localStorage on init.                                                                                                                                 |
| `src/renderer/store/__tests__/useArxmlStore.leftPanelCollapse.test.ts` (NEW) | 2 cases: (1) default is `false`, (2) setter writes to localStorage.                                                                                                                                                                                          |
| `src/shared/i18n/locales/{zh-CN,en}.json`                                    | 2 new keys: `leftPanel.projectTab.toggleCollapse`, `leftPanel.projectTab.toggleExpand` (and `leftPanel.projectTab.collapsedNotice` for the placeholder).                                                                                                     |
| `docs/release-notes/v1.55.0/README.md` (NEW, MINOR)                          | Per release-checklist; this is the user's first PATCH/MINOR on a new feature, and v1.55.0 follows the established sequence (last ship v1.54.5 PATCH).                                                                                                        |
| `CHANGELOG.md`                                                               | v1.55.0 entry per Keep-a-Changelog.                                                                                                                                                                                                                          |
| `package.json`                                                               | `"version": "1.54.5"` → `"version": "1.55.0"`.                                                                                                                                                                                                               |

### State changes

```ts
// slices/uiSlice.ts (or wherever leftTab lives)
interface UiSlice {
  // ...existing fields
  leftPanelProjectCollapsed: boolean;
  setLeftPanelProjectCollapsed: (value: boolean) => void;
}

// Store init (in useArxmlStore.ts)
const initialCollapsed = (() => {
  try {
    const raw = localStorage.getItem('claude-autosarcfg:leftPanel:projectCollapsed');
    if (raw === null) return false;
    return raw === 'true';
  } catch (e) {
    console.warn('[ui] failed to read leftPanelProjectCollapsed from localStorage', e);
    return false;
  }
})();

// In the slice setter
setLeftPanelProjectCollapsed: (value) => {
  set({ leftPanelProjectCollapsed: value });
  try {
    localStorage.setItem('claude-autosarcfg:leftPanel:projectCollapsed', String(value));
  } catch (e) {
    console.warn('[ui] failed to persist leftPanelProjectCollapsed', e);
  }
},
```

### UI changes

```tsx
// LeftPanel.tsx (inside the 'project' tab pane)
const collapsed = useArxmlStore((s) => s.leftPanelProjectCollapsed);
const setCollapsed = useArxmlStore((s) => s.setLeftPanelProjectCollapsed);

return (
  <div className="left-panel-pane" /* ... */>
    {collapsed ? (
      <CollapsedProjectPanelPlaceholder onExpand={() => setCollapsed(false)} />
    ) : isProjectOpen ? (
      <ProjectPanelInfo /* ...existing props... */ />
    ) : (
      <div className="left-panel-pane-empty" data-testid="left-pane-project-empty">
        {t(locale, 'leftPanel.project.empty')}
      </div>
    )}
  </div>
);
```

```tsx
// ProjectPanel.tsx (in ProjectPanelInfo header, next to the × close button)
<button
  type="button"
  className="project-panel-collapse-toggle"
  onClick={() => useArxmlStore.getState().setLeftPanelProjectCollapsed(true)}
  aria-label={t(locale, 'leftPanel.projectTab.toggleCollapse')}
  aria-expanded="true"
  aria-controls="left-pane-project"
  data-testid="project-panel-collapse-toggle"
  title={t(locale, 'leftPanel.projectTab.toggleCollapse')}
>
  {/* chevron-up icon (svg) */}
</button>
```

## Testing

- **Unit test (slice)**: default is `false`; setter writes boolean to localStorage; setter called with `true` then `false` produces 2 localStorage writes.
- **Component test (LeftPanel)**: render `<LeftPanel />` with a stub store; assert `ProjectPanelInfo` is in the DOM; click the chevron; assert `CollapsedProjectPanelPlaceholder` is in the DOM and `ProjectPanelInfo` is not; assert `useArxmlStore.getState().leftPanelProjectCollapsed === true`.
- **Rehydrate test**: pre-seed localStorage with `'true'`, mount the store, assert `leftPanelProjectCollapsed === true`.
- **Loose mode test**: in loose mode (no project open), collapse the tab; assert the empty placeholder is replaced by the collapsed placeholder (so the user can still re-expand).
- **i18n parity test**: 2 new keys in both `zh-CN.json` and `en.json` (existing parity test already covers this).
- **No regression on existing 3221 + 7 SKIP / 0 fail**: every test that touches `LeftPanel` / `ProjectPanel` / `useArxmlStore` / `localStorage` must stay green. The `useDefaultLayout({ groupId: 'workspace' })` is untouched, so the horizontal-resize tests are unaffected.

## Out of scope (explicit)

- **Animating the collapse/expand transition** — YAGNI; a snap is fine for the first cut. If users want smooth animation later, that is a follow-up PATCH.
- **Collapsing the other tabs ("文件" / "验证")** — the user only asked for "项目". Adding the same mechanism to the other tabs is a follow-up if requested.
- **Collapsing the Tree** — the Tree is a separate region of the LeftPanel and the user explicitly said the Tree should stay visible. The Tree collapse is a different feature.
- **Drag-to-resize the horizontal split** — already exists via `react-resizable-panels`. Not in scope.
- **Right-pane collapse** — the user only asked for the left side. The right side has only the ParamEditor and is content-driven (not a sidebar). Out of scope.
- **Multiple collapse axes per tab** — the user asked for one boolean. If they later want "tree-mode" vs "summary-mode" vs "collapsed", that is a separate feature.

## Risks

- **R1 — localStorage shape drift**. The existing pattern for `locale` / `leftTab` uses a top-level key. We use a namespaced key (`claude-autosarcfg:leftPanel:projectCollapsed`) to keep it from clashing with future settings. If the key collides with something else, the read still returns a boolean string per the `=== 'true'` check — non-`true` is treated as `false`, so collisions degrade gracefully.
- **R2 — Tests that pre-date this field**. The 3221-test baseline includes ~10 tests that read every slice field. Adding a new field is additive — no existing test should break. If a `Pick<UiSlice, ...>` type narrows the slice in a test, the new field is not in the pick and the test still passes.
- **R3 — Hydration race**. The store init reads localStorage synchronously at module load. Components render against the initial value. If a test mutates localStorage between renders, the slice won't pick it up (it's a one-shot read). This matches the existing locale-init pattern and is the expected trade-off.

## Spec self-review

- **Placeholder scan**: no TBD / TODO. All decisions concrete.
- **Internal consistency**: D1 (slice) → test plan (slice test) match. D2 (localStorage) → setter code → test plan (rehydrate test) match. D3 (toggle placement) → ProjectPanel.tsx diff → LeftPanel.tsx diff match.
- **Scope check**: focused on one boolean + one toggle button. No decomposition needed.
- **Ambiguity check**:
  - "What happens if the user collapses the project tab then closes the project (loose mode)?" — Specified in the "Loose mode" paragraph: collapse state persists; the empty placeholder is replaced by the compact collapsed placeholder.
  - "What happens if localStorage write fails inside the setter?" — Specified in D2: caught + console.warn, the in-memory state still flips.
  - "Does the chevron button replace the × close button?" — No. The × close button stays; the chevron is a 3rd control.
  - "Is the `leftTab` field affected?" — No. The user can be on the "文件" or "验证" tab while the project body is collapsed; collapse is independent of tab selection.

## Related documents

- v1.13.x (the historical collapse design that never shipped) — referenced in vault but not relevant to this spec.
- v1.15.2 / Sprint 13 Stage 4 Q1 — the horizontal resizer (untouched by this spec).
- v1.54.5 / Bug 8 — the previous PATCH (different subsystem, no overlap).
