# v1.48.0 — A11y & polish (MINOR)

**Released:** 2026-07-12
**Tag:** [`v1.48.0`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.48.0)
**Cycle type:** MINOR (user-facing accessibility polish; tree-touching `src/renderer/styles.css` per v1.45.0 D1 complement)
**Ship basis:** 2 source commits (T1 + T2) + 1 docs ship (T3)

## Summary

First user-facing UX MINOR of the v1.42.x → v1.48.x chain. Closes **2 Web Content Accessibility Guidelines (WCAG)** criteria with **a11y polish** as the unifying theme:

| WCAG criterion | Description | Closed by |
|---|---|---|
| 2.2.2 | Pause, Stop, Hide | T1 (prefers-reduced-motion CSS) |
| 4.1.3 | Status Messages | T2 (role="status" + aria-live="polite" empty states) |

| | v1.47.0 baseline | **v1.48.0** | Delta |
|---|---|---|---|
| `prefers-reduced-motion` media query | absent | **PRESENT (global)** | +25 LoC CSS |
| Empty states with `role="status"` | 0/3 | **3/3** | +18 LoC TSX |
| Tests | 3128 + 7 SKIP | 3128 + 7 SKIP | 0 |
| `pnpm verify` | 8-stage GREEN | 8-stage GREEN | maintained |
| Public API | unchanged | **unchanged** | 0 |

## Commits

| # | Commit | Title |
|---|---|---|
| T1 | `719ec40` | `style(a11y): v1.48.0 MINOR T1 -- prefers-reduced-motion CSS + audit live regions` |
| T2 | `0f4df73` | `style(a11y): v1.48.0 MINOR T2 -- role=status + aria-live=polite for empty states` |
| T3 | (this commit) | `docs(release): v1.48.0 MINOR -- A11y & polish` |

## What's new

### T1 — WCAG 2.2.2 (Pause, Stop, Hide) for motion-sensitive users

Global `@media (prefers-reduced-motion: reduce)` rule in `src/renderer/styles.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Why 0.01ms not 0ms**: per WCAG 2.2.2 implementation guidance, setting duration to `0s` causes Safari to treat the animation as "blocked" and skip it entirely (which can cause layout jumps). The 0.01ms floor avoids that exception while making the animation effectively instantaneous.

**Cascading strategy**: the universal selector `*, *::before, *::after` with `!important` beats per-file CSS specificity, so 10+ per-component CSS files (BswmdPickerDialog, CascadeConfirmDialog, ConfirmDialog, DiagnosticExtractSuccessDialog, FileListTab, LeftPanel, ModuleFromBswmdPicker, NewProjectDialog, ScriptPanel, etc.) all inherit the rule without per-file edits. Single-point rule-application (no fan-out risk).

**Negative-evidence audit** (per Round-7 protocol baked in v1.47.0 release-checklist.md):

- `ErrorBanner.tsx:120-121` already has `role="alert"` + `aria-live={ariaLive}` (verified at v1.16.0 MINOR ship).
- `ErrorBoundary.tsx:89` already has `role="alert"` (verified at v1.21.0 MINOR ship).

Both already WCAG 4.1.3 compliant for the alert path. No code change required.

### T2 — WCAG 4.1.3 (Status Messages) for first-time users

Adds `role="status"` + `aria-live="polite"` to the 3 empty-state containers that first-time users encounter:

| File | Markup before | After |
|---|---|---|
| `ProjectPanel.tsx` | `<div className="project-panel-empty">{emptyHint}</div>` | `<div ... role="status" aria-live="polite">...` |
| `FileListTab.tsx` | `<div className="file-list-tab-empty">...</div>` | `<div ... role="status" aria-live="polite">...` |
| `Tree.tsx` | `<aside className="tree empty" data-testid="tree-empty">...</aside>` | `<aside ... role="status" aria-live="polite">...` |

**Why `role="status"` not `role="alert"`**: empty state is informational, not an alert. `role="status"` pairs with `aria-live="polite"` for non-urgent updates (the screen reader announces it on next natural pause). `role="alert"` would force immediate interruption, which is too aggressive for a first-load UI element that the user can see normally.

**Scope collapse via audit**: the 3 components were already rendering empty-state markup with i18n keys (`projectPanel.arxml.empty`, `tree.emptyHint`, etc.) from Sprint 11/12 implementation. T2 was scoped down from "add empty-state UI" (originally 3+ components of new copy + new i18n keys) to "add the a11y attributes" (18 LoC total) after the negative-evidence audit found the rendering already exists.

## Decisions

- **D1 MINOR not PATCH** — touches `src/renderer/styles.css` (tree-touching per v1.45.0 D1 complement). Tree-touching process improvements ship as MINOR. The 3 TSX edits are 6-line attribute additions in non-test files, also tree-touching but small enough to ship together.

- **D2 Global cascade not per-file media queries** — using the universal selector `*` + `!important` beats per-file specificity. Avoids 10+ identical `@media (prefers-reduced-motion: reduce) { ... }` blocks (DRY + single-point edit). Per-file specificity (e.g. `.btn { transition: 200ms }`) loses to `!important` so the rule cascades cleanly.

- **D3 `0.01ms` not `0s` for motion suppression** — WCAG 2.2.2 implementation guidance specifies the 0.01ms floor to avoid Safari's animation-blocked exception that 0s triggers. Documented in inline comment.

- **D4 `role="status"` not `role="alert"` for empty states** — empty state is informational. `status` + `polite` pairing is the correct WCAG semantic for non-urgent updates. Alert (with assertive) is reserved for actual error/warning conditions (ErrorBanner/ErrorBoundary already use it correctly).

- **D5 Scope collapse via Round-7 audit framework** — the original T2 was "add empty-state UI to 4 components with new i18n keys". The Round-7 audit framework (baked in v1.47.0 release-checklist.md) recommended cross-checking existing code for the surface first; the negative-evidence audit confirmed 3/3 components already render empty-state markup from Sprint 11/12. T2 collapsed to 18 LoC of attribute additions.

## Honest deviations

- **(a) Tree-empty aside gets `role="status"` not `role="tree"`** — when `doc === null`, the `<aside>` can't have `role="tree"` because there's no tree to be accessible to (the ARIA tree pattern requires the tree structure). The empty aside is purely informational, so `role="status"` is the correct fallback.
- **(b) No focus management added** — the empty state does not auto-focus on mount. WCAG doesn't require this for status messages; screen-reader announcement happens via `aria-live="polite"` regardless of focus state.
- **(c) No `prefers-contrast: more` / `prefers-color-scheme: dark` rules** — separate WCAG criteria (1.4.6 + 1.4.3 respectively). Out of scope for this MINOR's "motion + status messages" theme. Could be a future v1.49.x PATCH if dark-mode is on the roadmap.

## Process lessons applied (across T1-T2)

- **Lesson #10** (devlog-follow-up-status-claims) — `pnpm verify` 8-stage state confirmed at every commit boundary (T1 + T2 + T-ship).
- **Lesson #11** (pkm-capture-stub-topic-file-recovery) — applied proactively; capture-decisions file written inline via Write tool.
- **Lesson #13** (per-flow prereq analysis) — T1 verified per-component CSS uses the same media query via global cascade; T2 verified all 3 components already render empty-state markup (audit before code change).
- **Lesson #14** (chunk-replacement guard) — N/A (no Python marker-based text replacement in this cycle).
- **Lesson #15** (`function-extract-must-clip-verbatim-not-reimplement`) — N/A (no file-split in this cycle).

## Test results

- vitest 350/350 files / 3128 + 7 SKIP / 0 fail (zero test delta — pure CSS + 18 LoC TSX attribute adds).
- tsc `--noEmit -p tsconfig.json` + `--noEmit -p tsconfig.web.json` both clean.
- prettier check clean (1 auto-fix at T2 commit-time for `Tree.tsx` formatting).
- eslint `--max-warnings 0` clean (0 errors, 0 warnings).
- **`pnpm verify` 8-stage GREEN** — python-self-test 8/8 PASS.

## Related documents

- **CHANGELOG**: top entry of `CHANGELOG.md`
- **Round-7 protocol (applied via release-checklist.md)**: confirmed 0 actionable items; clean repo + last MINOR was Round-1 L8 closure in v1.46.0.
- **v1.47.0 ship notes** (predecessor): `docs/release-notes/v1.47.0/README.md` (Round-7 audit framework baked here informed T2 scope collapse).

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
