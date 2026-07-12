# v1.53.0 — IPC Dead-Code Audit Closure + Handler Test Coverage (PATCH)

**Released:** 2026-07-12
**Tag:** [`v1.53.0`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.53.0)
**Cycle type:** PATCH (coverage closure + documentation markers; no functional changes)

## Summary

Closes the IPC-connectivity-audit gaps surfaced by the 2026-07-12 evidence-based review (Round-11 methodology): one coverage gap (`bswmd:open` had no main-side handler test) and three dead-code channels (`app:ping` / `templates:list` / `templates:copy`) marked `@deprecated` for future removal.

| | v1.52.0 baseline | **v1.53.0** | Delta |
|---|---|---|---|
| `bswmdOpenHandler.ts` | absent (inline at register.ts:429) | **NEW ~48 LoC** | extracted for direct testability |
| `bswmdOpenHandler.test.ts` | absent | **NEW 4 cases** | closes audit gap 1 |
| `IPC_CHANNELS.PING / TEMPLATES_*` `@deprecated` markers | absent | **NEW JSDoc** | audit gap 2 (3 channels) |
| Preload bridge `@deprecated` markers | absent | **NEW JSDoc** | audit gap 2 (3 surfaces) |
| Tests | 3157 + 7 SKIP | **3160 + 7 SKIP** | +3 net from T1 |
| `pnpm verify` | 8-stage GREEN | 8-stage GREEN | maintained |

## Commits

| # | Commit | Title |
|---|---|---|
| T1 | `632cde2` | `refactor+test(ipc): v1.53.0 PATCH T1 -- bswmd:open handler extracted + 4-case test` |
| T3 | `66402a8` | `docs(ipc): v1.53.0 PATCH T3 -- mark app:ping + templates:list + templates:copy @deprecated` |
| T-ship | (this commit) | `docs(release): v1.53.0 PATCH -- IPC dead-code audit closure + handler test coverage` |

## What's new

### T1 — bswmd:open handler extracted + tested

The `bswmd:open` IPC handler (channel `IPC_CHANNELS.BSWMD_OPEN`) was the only file-picker channel with no main-side test. Pre-v1.53.0 it shipped as an inline `ipcMain.handle(...)` block at `src/main/ipc/register.ts:429-443` — testable only through indirect integration paths.

**Extraction**: NEW `src/main/ipc/bswmdOpenHandler.ts` (~48 LoC) holds the dialog logic verbatim (lesson `#15`) and exports `openBswmdDialog()` + `registerBswmdOpenHandler()`. Mirrors the `openDbcHandler.ts` / `openOdxHandler.ts` / `openOdxWithDefaultHandler.ts` / `bswmdPickHandler.ts` extraction pattern.

**Test**: NEW `src/main/ipc/__tests__/bswmdOpenHandler.test.ts` with 4 cases:
1. `canceled` — dialog dismissed → `{ kind: 'canceled' }`
2. `ok` — user picked a file → `{ kind: 'ok', path }` (path-only; no read inline)
3. **Defensive guard** — `canceled: false` with empty `filePaths` → still returns `canceled` (some Electron versions do this on system-menu dismiss)
4. Dialog options pin — title `'Load BSWMD'` + filters `[BSWMD/.arxml, XML/.xml, All/*]`

### T3 — `@deprecated` markers on 3 dead-code channels

The Round-11 IPC connectivity audit verified (via actual `pnpm test` + grep, not just string matching) that the following channels have **zero renderer callers** in `src/renderer/`:

| Channel | Status |
|---|---|
| `app:ping` (`IPC_CHANNELS.PING`) | Health-check channel for early scaffolding; external headless harnesses may rely on it. Marked `@deprecated` at the IPC_CHANNELS definition + preload bridge. Removal candidate v1.55.0. |
| `templates:list` (`IPC_CHANNELS.TEMPLATES_LIST`) | Sprint 13 #2's "template picker" UI was never built; users create projects via `project:new` directly. Marked `@deprecated`. Removal candidate v1.55.0 unless the picker UI is built first. |
| `templates:copy` (`IPC_CHANNELS.TEMPLATES_COPY`) | Same rationale as `templates:list`. Marked `@deprecated`. |

The markers are **documentation-only** — no code was removed, no IPC contract surface was deleted, no handler tests were deleted. This preserves backwards compatibility while signaling to future contributors that these surfaces are intentional dead-by-design, not forgotten wiring.

## Already-covered (no change needed)

- `xlsx:import-complete` push emit contract test **already exists** at `src/main/ipc/__tests__/xlsxEcucBatchImportHandler.test.ts:443-518`. The v1.40.0 MINOR T3 L1 fix added two cases:
  1. Push fires AFTER `xlsxHistorySaveHandler` resolves (ordering); payload carries `persisted: true`.
  2. Push payload reports `persisted: false` when persistence fails (with `console.warn` of the failure).
- The Round-11 verification agent's report flagged this as a gap, but direct grep confirmed it was already covered. The methodology-review lesson: **string-matching audit agents can miss pre-existing tests** — always cross-check before scheduling new test work.

## Decisions

- **D1 PATCH-not-MINOR** — T1 is a code extraction (testability-only, no behavior change) + T3 is documentation-only. PATCH scope per the v1.45.0 D1 convention complement.
- **D2 @deprecated over deletion** — YAGNI against deletion. `app:ping` may have external headless-script callers; `templates:*` may need to come back when the Sprint 13 #2 picker UI is built. Marking `@deprecated` is the lower-cost signal that future cleanup cycles can act on.
- **D3 markers at both IPC_CHANNELS AND preload bridge** — two surfaces, both authoritative. A renderer-only caller search would miss `IPC_CHANNELS.PING` (no caller), but a future code-search for `IPC_CHANNELS.PING` should also surface the removal plan. Mirrors the Round-10 F-2 fix (FEATURE_FLAGS_GET hoisted to both).
- **D4 T2 cancelled before scheduling** — `xlsx:import-complete` contract test already existed (verified by direct grep against the verification agent's report); no new work needed.

## Process lessons applied

- **Lesson #11** (pkm-capture-stub-topic-file-recovery) — applied proactively; capture-decisions file written inline via Write tool.
- **`round-X-review-preflight`** (standalone since v1.48.1) — the verification-agent run is itself a Round-11 audit, but it was a **methodology review** (string-match-vs-evidence), not a code-quality review. No code changes resulted from the agent's correctness findings; only its coverage-gap findings led to T1/T3.

## Test results

- vitest **3160 + 7 SKIP / 0 fail** (+3 net from v1.52.0's 3157).
- tsc `--noEmit -p tsconfig.json` + `--noEmit -p tsconfig.web.json` both clean.
- prettier check clean (2 auto-fixes during T1).
- eslint `--max-warnings 0` clean.
- `pnpm verify` **8-stage GREEN** — python-self-test 8/8 PASS.

## Related documents

- **CHANGELOG**: top entry of `CHANGELOG.md`.
- **v1.52.0 ship notes** (predecessor): `docs/release-notes/v1.52.0/README.md`.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)