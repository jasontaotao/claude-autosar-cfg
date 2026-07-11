# v1.43.1 PATCH — Code-Reviewer Hardening Patch

**Released:** 2026-07-11
**Tag:** [`v1.43.1`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.43.1)
**Cycle type:** PATCH (security/stability hardening after rapid-ship cycle review)
**Ship basis:** 4 source commits (T1 fix + T2 cleanup + T4 tests + T5 fireEvent)

## Summary

Closes 1 CRITICAL + 2 HIGH + 1 LOW + 1 NOTE findings from the v1.41.3..v1.43.0 cycle code review. The rapid-ship cycle (5 versions, 26 commits, 1 session) bypassed per-commit code-review; this PATCH surfaces the deferred issues + the strict-mode TypeScript gaps they hid.

| | v1.43.0 baseline | **v1.43.1** | Delta |
|---|---|---|---|
| Runtime crashes shipped to main | 1 (`ReferenceError: setStencilOpen`) | **0** | **-1 CRITICAL** |
| Renderer-side tsc errors | 8 (TS6133 × 7 + TS2552 × 1) | **0** | **-8 HIGH** |
| Tests | 3124 + 7 SKIP | **3128** + 7 SKIP | **+4** |
| Stencil menu open path tested | ❌ (render-only) | **✅ (fireEvent.click + StencilWizard mount)** | ✓ |

## Commits (4)

| # | Commit | Title | LoC |
|---|---|---|---|
| T1 | `6a35183` | `fix(renderer): v1.43.1 PATCH T1 -- fix ReferenceError: setStencilOpen (code-reviewer CRITICAL finding)` | +10 / −1 |
| T2 | `06927a1` | `refactor(renderer): v1.43.1 PATCH T2 -- clean up 6 unused destructure fields (code-reviewer HIGH finding #3)` | +7 / −8 |
| T4 | `c667879` | `test: v1.43.1 PATCH T4 -- add 4 dcmConfig tests for bswmdPaths wire (code-reviewer HIGH finding #2)` | +122 / −0 |
| T5 | `a08dab7` | `test(renderer): v1.43.1 PATCH T5 -- add fireEvent.click for stencil menu entry (code-reviewer LOW finding #6)` | +12 / −0 |

T3 was process-only (no source change) — `pnpm verify` already wires `pnpm type-check` which runs both `tsconfig.json` and `tsconfig.web.json`. The gap was that the rapid-ship cycle ran `tsc --noEmit` (defaults to `tsconfig.json`) instead of `pnpm verify`. Future release-checklist must include `pnpm verify`.

## Code-reviewer findings closed

### [CRITICAL] — `ReferenceError: setStencilOpen is not defined` @ AppHeader.tsx:300

Closed by **T1**. The chunk-replacement script for v1.42.4 T2 (`dc9f606`) anchored on `const [appVersion, setAppVersion]` to closing `}, []);` of the getAppVersion effect, swallowing the 4th shell `useState` (`menuOpen`) and the reference to `setStencilOpen` (which had been moved into `useAppHeaderShell` as a closure-local setter). The click path was untested by `AppHeader.scripts.test.tsx` (which only verified the entry renders).

Fix: dispatch `window.dispatchEvent(new CustomEvent('stencil:open'))` instead — matches the existing listener in `useAppHeaderShell.ts:96-102` (same code path the Cmd-K palette uses).

### [HIGH] — v1.43.0 dcmConfig wire has zero test coverage

Closed by **T4**. 4 new tests added pinning the manifest resolution + IPC forwarding paths.

### [HIGH] — Renderer tsc not run in CI

Closed by **T3 + T2**. The project's `pnpm verify` already includes `pnpm type-check` which runs both tsconfigs — the gap was process-only. T2 also removed the 6 unused destructure fields + unused `useArxmlStore` import so `tsc -p tsconfig.web.json` is clean.

### [LOW] — Stencil menu item never clicked in tests

Closed by **T5**. Added `fireEvent.click(entry)` + `vi.waitFor(() => screen.getByTestId('stencil-overlay'))` to verify the open path end-to-end.

### [MEDIUM] — T4b abandoned commit `759be76` not archived

Closed by **T5** (tag step). `git tag archive/v1.42.0-t4b-wip 759be76` preserves the controlled-pattern BrandMenu design (was the rejected T4b approach; the render-prop pattern that shipped in v1.42.2 PATCH superseded it).

### [MEDIUM] — `DCM_BASENAME` casing inconsistency

**Deferred to future cycle**. Cosmetic only — the constant `'bsw_dcm_bswmd.arxml'` is functionally correct (compared via `toLowerCase()`); renaming to `'Bsw_Dcm_Bswmd.arxml'` is cosmetic.

## NEW lesson observations

### Lesson #14 (3/3 confirmations) — single-session caveat added

`marker-based-text-replacement-must-validate-block-contents-not-line-count` was promoted to standalone after **3 confirmations in a single session** (v1.42.2 T4 R3 + v1.42.3 T2 R2 + v1.42.4 T2 R2). This is suspicious — the same bug pattern repeating 3 times in one session is more likely a **systematic script-template flaw** (the Python `must_replace` function's `find + length window` heuristic in `scripts/tmp-*.py`) than 3 independent observations.

**Lesson text amended** (during v1.43.1 PATCH work) to call out:
- Treat lesson confirmations from a single session with the same observation-count caveat as a single-session confirmation
- The 3/3 evidence may indicate **1 bug pattern × 3 instances** rather than **3 separate observations**

## Rapid-ship cycle retrospective

The v1.41.3 → v1.43.0 cycle (5 versions in 1 session, 26 commits, +10535 / -1365 LoC, 39 files) shipped with **zero functional change**. The code-reviewer cycle revealed that **0 functional change ≠ 0 risk**: the chunk-replacement pattern repeatedly swallowed shell-owned hooks during shell rewrites, and the renderer-side strict tsc was never run because the release-checklist only invoked `tsc --noEmit` without a project flag.

**Process changes for future cycles**:
1. Always run `pnpm verify` (7-stage) before declaring a cycle done — not just `tsc --noEmit`.
2. Always invoke `code-reviewer` agent after each commit before moving to the next T (per CLAUDE.md "改完代码自动审").
3. For Python-driven chunk replacements, count hooks in the source range before applying (lesson #14 fix recommendation) — implement in `scripts/tmp-*.py` template.
4. Resist the urge to ship 5 cycles in a single session; surface risks earlier (CLAUDE.md "挑战判断" principle).

## Test results

**3128 + 7 SKIP / 0 fail** (+4 net from v1.43.0). pnpm verify 7-stage GREEN (renderer-side `tsc.web` clean).

## Related documents

- **T0 spec** (rapid-ship cycle spec): `docs/superpowers/specs/2026-07-11-v1-43-0-minor-dcm-config-bswmd-manifest-resolution.md`
- **CHANGELOG**: top entry of `CHANGELOG.md`
- **Devlog**: see `01-Projects/claude-AutosarCfg/development/devlog.md` 2026-07-11 entries
- **v1.43.0 ship notes** (the cycle being patched): `docs/release-notes/v1.43.0/README.md`
- **Code-reviewer findings** (this PATCH closes): code-reviewer agent `a5b12787125b72698` (run 2026-07-11)

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)