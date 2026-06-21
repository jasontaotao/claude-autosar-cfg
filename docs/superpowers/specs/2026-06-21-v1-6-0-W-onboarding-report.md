# Cluster W Spec — Write Report

**Date**: 2026-06-21
**Agent**: Cluster W spec writer
**Output**: `D:\claude_proj2\claude-AutosarCfg\docs\superpowers\specs\2026-06-21-v1-6-0-W-onboarding-design.md`

---

## 1. Status

**DONE_WITH_CONCERNS**

Spec written end-to-end; 10 mandatory sections present; self-review 8/8 passed. Concerns are documented in §10 (5 user-decision questions), not blockers.

---

## 2. Spec path

`D:\claude_proj2\claude-AutosarCfg\docs\superpowers\specs\2026-06-21-v1-6-0-W-onboarding-design.md`

---

## 3. Section checklist

| §   | Title                                            | Status |
| --- | ------------------------------------------------ | ------ |
| 0   | Why W (overview + out-of-scope)                  | ✅     |
| 1   | User Stories (3)                                 | ✅     |
| 2   | Architecture & Components (module diagram, 9 modules) | ✅ |
| 3   | API / Interface Contract (state machine, IPC, i18n, types) | ✅ |
| 4   | Data Model (persisted + in-memory + reused)      | ✅     |
| 5   | Error Handling (6 paths)                         | ✅     |
| 6   | Testing Strategy (unit / integration / E2E / coverage / TDD) | ✅ |
| 7   | Migration / Backward Compatibility (5 dimensions) | ✅    |
| 8   | Risks & Open Questions (7 risks + 5 user questions + non-goals) | ✅ |
| 9   | Acceptance Criteria (15 BLOCK + 3 WARN + 7 OUT)  | ✅     |

All 10 mandatory sections present.

---

## 4. Self-review checklist (8 items)

| #   | Check                                                            | Verdict |
| --- | ---------------------------------------------------------------- | ------- |
| 1   | Scope matches brainstorm W (no schema editor / Script tour)      | ✅ PASS  |
| 2   | Style consistent with v1.5.1 spec (section shape, depth, table density) | ✅ PASS |
| 3   | Tour state machine complete (5 states + 7 transitions listed)    | ✅ PASS  |
| 4   | Demo ECU asset source + path explicit (`samples/arxml/demo-ecu/`) | ✅ PASS |
| 5   | i18n keys planned (20 keys, exceeds 12 minimum; EN+ZH)           | ✅ PASS  |
| 6   | Feature flag explicit (`V16_ONBOARDING` → `experimental.onboarding`, default OFF, new `config/featureFlags.ts`) | ✅ PASS |
| 7   | ≥3 risks + open questions clear (7 risks + 5 user questions)     | ✅ PASS  |
| 8   | Acceptance criteria measurable (numbers, times, paths, pnpm cmds) | ✅ PASS  |

8/8 passed.

---

## 5. Key design decisions

1. **Renderer-side feature flag in new `config/featureFlags.ts`** — mirrors the `arxml-stream/feature-flag.ts` pattern but runs in renderer (reads via IPC passthrough from main, which already reads `settings.json` for v1.5.1 streaming/indexedDb).
2. **Tour state machine: 5 states (`idle` / `running` / `completed` / `dismissed` / `suppressed`), 7 explicit transitions, immutable** — `TourState` uses readonly fields; no in-place mutation. Persisted via atomic-write `<userData>/tour.json` (reuses v1.5.1 PR(4) temp+rename pattern).
3. **Demo ECU is a vanilla template** — auto-discovered by existing `discoverBuiltinTemplates` (zero changes to template infrastructure). `samples/arxml/demo-ecu/` follows the existing `samples/README.md` convention with `template.json` + `bswmd/` + value ARXML.
4. **Tour target wiring via `data-tour-id` attributes** — no DOM restructuring; existing panes get minimal attribute additions. Missing-target fallback (centered bubble) tested in E2E.
5. **7-day suppress window, hardcoded** — not configurable in v1.6.0 (deferred to v1.7.0+); aligns with industry-standard onboarding patterns.
6. **20 i18n keys** (exceeds 12 minimum): 5 step titles + 5 step bodies + 4 CTAs (welcome×2 + controls×2) + 1 progress + 1 skip + 1 finish + 1 back + 1 next + 1 welcome-title + 1 welcome-body.
7. **NO new top-level deps** — `react-resizable-panels` + zustand + react already present; reuse.
8. **Composition via slice pattern** (PR(5) v1.5.1) — `tourSlice` plugs into existing `useArxmlStore`; existing 60+ selector call-sites unaffected.
9. **Bundle size budget ≤ 30 KB gzipped when flag OFF** — slice + components tree-shake when `experimental.onboarding === false`.

---

## 6. Concerns / Open questions for user (need answer before plan)

These are NOT blockers for the spec, but **must** be locked before the implementation plan is written (per spec §10):

1. **Q1 — Demo ECU domain mix**: Com + ComM + CanIf + EcuC (proposed in spec §2.5)? Or single module (e.g., just EcuC)? Mix demonstrates cross-module refs but heavier; single is simpler.
2. **Q2 — Suppress window length**: 7 days hardcoded (proposed)? Or configurable in v1.6.0 via settings?
3. **Q3 — Step 4 target**: Current renderer has LeftPanel / ArxmlPanel / ValidationPanel — no standalone "Properties panel". Spec proposes a wrapper or reuse of `ValidationPanel` for `data-tour-id="properties-panel"`. Need user to confirm.
4. **Q4 — Reset menu entry**: Spec scopes W to **IPC only**; U Keyboard spec adds the AppHeader "Help → Reset onboarding" entry. Confirm split.
5. **Q5 — "Load Demo ECU" button placement**: Welcome card **only** (proposed), or also as a NewProjectDialog preset (auto-discovered, both)?

Other minor concerns:

- **No existing `config/` directory** — spec proposes creating `src/config/featureFlags.ts` (or similar). User may prefer keeping with `src/main/arxml-stream/` or `src/shared/`. Decision deferred.
- **Tour step count = 5** matches brainstorm literally; user might want 3-4 (simpler) or 6-7 (more thorough). 5 is locked unless user overrides.

---

## 7. Files referenced / created

- **Created (spec)**: `D:\claude_proj2\claude-AutosarCfg\docs\superpowers\specs\2026-06-21-v1-6-0-W-onboarding-design.md` (~750 lines, 10 sections)
- **Created (this report)**: `D:\claude_proj2\claude-AutosarCfg\docs\superpowers\specs\2026-06-21-v1-6-0-W-onboarding-report.md`

**No source files modified. No git operations performed. No tests/builds run.**