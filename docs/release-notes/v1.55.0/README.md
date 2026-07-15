# v1.55.0 — Project Tab Collapse/Expand (MINOR)

**Released:** 2026-07-15
**Tag:** [`v1.55.0`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.55.0)
**Cycle type:** MINOR (new user-facing feature; pure UI + store; no IPC, no schema, no backend change)
**Ship basis:** 6 commits — 4 source feature commits + 2 supporting (test-setup shim + format drift) + 1 docs T-ship

## Summary

Closes the 2026-07-15 user feedback "我感觉这个view可以搞一个缩小展开的功能" — adds a collapse/expand toggle to the left sidebar's "项目" tab body. A new chevron-up button in the `ProjectPanelInfo` header (next to the existing × close) collapses the project body to a 1-line compact placeholder (`~40px` tall vs. the original `~350px`), freeing vertical space for the right-pane ParamEditor. The Tree and the tabs bar at the top of the LeftPanel stay visible. Clicking the inline `[展开] / [Expand]` button in the placeholder restores the panel. The collapse state is independent of `leftTab` — the user can switch to 文件 / 验证 tabs while the project body stays collapsed, and switching back to 项目 preserves the collapse. State persists in `localStorage` (key `claude-autosarcfg:leftPanel:projectCollapsed`) across page reloads.

**Zero IPC change. Zero backend change. Zero schema change.** First new user-facing feature since the v1.54.x PATCH chain.

## Commits

| # | Commit | Title |
|---|---|---|
| Task 1 — i18n | `a58c114` | `feat(i18n): add 3 leftPanel.projectTab.* keys for collapse/expand` |
| Task 2 — store slice | `5953aa5` | `feat(store): add leftPanelProjectCollapsed slice field + localStorage persist` |
| Task 2.5 — supporting | `aab864c` | `chore(test): add in-process localStorage shim to vitest setup (node-env)` |
| Task 3 — chevron toggle | `2abc938` | `feat(project-panel): add chevron toggle button to collapse project tab` |
| Task 4 — wire + placeholder | `eb731c1` | `feat(left-panel): wire collapse/expand + collapsed placeholder` |
| T-ship | `<this-commit>` | `chore(release): bump version 1.54.5 → 1.55.0 + release notes` |

## Decisions

- **D1 — slice field + setter in `uiSlice`, not a new slice** — `leftPanelProjectCollapsed` belongs to the existing `uiSlice` (it controls a UI layout state, not document/BSWMD data). Reusing the existing slice avoids creating a 1-field slice with a separate store key.
- **D2 — localStorage persist on every setter flip, rehydrate at store-init** — read pattern: `useArxmlStore` constructor calls `loadLeftPanelProjectCollapsedFromStorage()` once and passes the result as the initial state. Write pattern: setter wraps `localStorage.setItem(...)` in try/catch with `console.warn`. Both reads and writes degrade gracefully (default `false` on read error; in-memory state survives on write error).
- **D3 — toggle placement in `ProjectPanelInfo` header, next to × close** — keeps the toggle co-located with the project panel it controls. The chevron icon flips direction with state (chevron-up when expanded → click to collapse; chevron-down when collapsed → click to expand) for clear visual feedback.
- **D4 — collapsed placeholder is a 1-line compact row, not a hidden panel** — the user can see at a glance that the panel is collapsed (via the "项目面板已折叠。点击展开。" notice) and click to restore without opening a context menu or hunting for a hamburger. The row sits in the same scrollable area that `ProjectPanelInfo` used to occupy.
- **D5 — ARIA + i18n from the start** — chevron toggle gets `aria-expanded` + `aria-controls` + `aria-label` (localized); placeholder expand button gets the same; `role="tabpanel"` on the container is preserved when collapsed (the tab is still the active tab — only the body shape changed). All three new strings go through the project's existing `t(locale, key)` plumbing (no `react-i18next`).
- **D6 — no interaction with the horizontal `useDefaultLayout({ groupId: 'workspace' })` resizer** — the vertical-collapse state is orthogonal to the horizontal-pane-width state. Each persists in its own key. Resizing the workspace horizontally while collapsed does not un-collapse; collapsing the project body does not affect horizontal-pane width.

## User-visible behavior

- Expanded by default on a fresh install — no behavioral change for users who never click the chevron.
- A new chevron-up button appears in the `ProjectPanelInfo` header, immediately left of the × close button.
- Click the chevron → the project body collapses to a 1-line placeholder (`~40px` tall) showing "项目面板已折叠。点击展开。" and an inline `[展开]` button. The Tree and the tabs bar stay visible.
- Click the `[展开]` button in the placeholder → the panel restores to its original shape.
- Switching to the 文件 or 验证 tabs while collapsed preserves the collapse; switching back to 项目 renders the same collapsed state.
- The collapse state survives a full page reload (Renderer restart) — `localStorage` key `claude-autosarcfg:leftPanel:projectCollapsed`.
- The collapse state is per-user (per localStorage origin), not per-project.

## Test results

- vitest 369 files / **3226 + 7 SKIP / 0 fail** (+5 net from v1.54.5's 3221 baseline)
- tsc both `tsconfig.json` + `tsconfig.web.json` clean
- `pnpm verify` 8-stage GREEN (format / lint / type-check / test / coverage / build / import-regression / python-self-test)
- Coverage maintained ≥ 96.69%
- New tests added:
  - **`useArxmlStore.leftPanelCollapse.test.ts`** (Task 2) — 2 tests
    - `defaults to false on a fresh store (no localStorage entry)`
    - `setLeftPanelProjectCollapsed flips the in-memory field AND writes localStorage`
  - **`LeftPanel.collapse.test.tsx`** (Task 4) — 3 tests
    - `expanded by default: ProjectPanelInfo is rendered when a project is open`
    - `clicking the chevron in the header collapses the panel (body → placeholder)`
    - `clicking the expand button in the placeholder restores the panel`

## Process lessons applied

- **`release-checklist-must-verify-package.json-bump-on-every-version-ship`** (standalone) — `package.json` `1.54.5` → `1.55.0` verified pre-tag, in a separate T-ship commit per the established v1.54.0+ pattern.
- **`systematic-debugging` Iron Law** (NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST, meta-lesson) — the plan's localStorage-gap surface during Task 2 was the implementer catching a real plan blind spot (vitest's node-env has no `localStorage`); the ship-time reward is a 1-line `globalThis.localStorage` shim in `src/test/setup.ts` that benefits every future test using localStorage.

## NEW 1/3 lesson candidates (awaiting 2 more observations each)

- **`plan-test-code-requires-deps-not-listed-in-file-map`** — the plan's Task 4 test code used `userEvent.setup()` without listing `@testing-library/user-event` in the file map; the Task 4 implementer caught it (the project already had `userEvent` from a previous PATCH; the plan just didn't surface it). Worth capturing as a 1/3 candidate if a 2nd such instance occurs in a future plan.

## Related documents

- **Spec**: `docs/superpowers/specs/2026-07-15-project-tab-collapse.md`
- **Plan**: `docs/superpowers/plans/2026-07-15-project-tab-collapse.md`
- **Previous release**: `docs/release-notes/v1.54.4/README.md` (PATCH — dBC-Apply Tree Display) and the in-between `v1.54.5` PATCH (Bug 8 closure — hasBswmdForModule walks all path segments)
- **CHANGELOG**: top entry of `CHANGELOG.md`

## Future work (deferred per spec)

- **Optional horizontal pane state persistence** — currently `useDefaultLayout({ groupId: 'workspace' })` is in-memory only across renderer restarts. Out of scope for v1.55.0 (separate feature work).
- **Per-tab collapse memory** — only the "项目" tab body has collapse/expand; the "文件" / "验证" tab bodies are full-height by design. YAGNI until user feedback surfaces a need.
- **Animations** — the collapse/expand transition is instant (no animation). Trivial to add via CSS `transition` if user feedback asks for it; not blocking.

## Manual smoke test (recommended at install time)

1. Open a project (e.g. `C:\Users\13777\Desktop\ClaudeAutosarWorkSpace\111.autosarcfg.json`) — verify `ProjectPanelInfo` renders in the "项目" tab body as before.
2. Verify a new chevron-up button is visible in the `ProjectPanelInfo` header, immediately left of the × close.
3. Click the chevron — verify the body collapses to a 1-line placeholder (`项目面板已折叠。点击展开。` + an inline `[展开]` button). The Tree below and the tabs bar above stay visible.
4. Click the `[展开]` button — verify the panel restores to its original shape.
5. Collapse again → switch to the "文件" tab → switch back to "项目" — verify the collapsed state is preserved.
6. Collapse once more → reload the Renderer (Ctrl+R) — verify the panel stays collapsed after the reload (localStorage persisted).