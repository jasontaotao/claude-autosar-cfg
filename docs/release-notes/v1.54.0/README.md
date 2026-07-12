# v1.54.0 — Whole-Project Multi-Agent Review Closure (PATCH)

**Released:** 2026-07-12
**Tag:** [`v1.54.0`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.54.0)
**Cycle type:** PATCH (bug fixes + test coverage; no functional surface changes)

## Summary

Closes 5 confirmed HIGH bugs + 1 MEDIUM + 1 PARTIAL surfaced by the 2026-07-12 evidence-based whole-project review (5 multi-lens agents + 2-verifier adversarial cross-check). All findings had file:line evidence + 2 independent confirmations before being prioritized.

| | v1.53.0 baseline | **v1.54.0** | Delta |
|---|---|---|---|
| `dcmConfigHandler` containment | no check | **isPathInsideReal on caller-supplied bswmdPath** | F-A3-01 (HIGH security) |
| script-handler envelope | raw `ScriptError` throw | **wrapped → `{ok:false, error:{kind,message}}`** | F-A2-02 (HIGH) |
| templates-handler envelope | raw `TemplateError` throw | **duck-typed wrap** | F-A2-03 (HIGH) |
| batch handler tmp filename | `.tmp.{pid}` | **`.tmp-{randomUUID()}`** | F-A2-01 (HIGH collision-safety) |
| verify-test regex | `/kind: 'bridge-failed'/g` (broken) | **matches accessor form** | F-A5-01 (HIGH coverage-mask) |
| `stripBswmdPackageRoot` | 0 unit tests | **5 cases** | F-A5-02 (MEDIUM, overstated) |
| xlsxImportListener cleanup | not asserted | **vi.fn() spy verifies unsubscribe** | F-A4-01 (MEDIUM, 1/3 partial) |
| Tests | 3160 + 7 SKIP | **3167 + 7 SKIP** | +7 net |
| `pnpm verify` | 8-stage GREEN | 8-stage GREEN | maintained |

## Commits

| # | Commit | Title |
|---|---|---|
| T1 | `86339c6` | `fix+test(ipc): v1.54.0 PATCH T1 -- dcmConfigHandler path-containment + escape-reject test` |
| T2+T3 | `dbedb2a` | `fix(ipc): v1.54.0 PATCH T2+T3 -- script-handler + templates-handler IPC envelope wrap` |
| T4 | `7092acf` | `fix(ipc): v1.54.0 PATCH T4 -- batch handler tmp filename randomUUID migration` |
| T5 | `4ff8ba1` | `test(verify): v1.54.0 PATCH T5 -- fix F-3 bridge-failed negative-evidence regex` |
| T6 | `874172c` | `test(core): v1.54.0 PATCH T6 -- stripBswmdPackageRoot unit test (5 cases)` |
| T7 | `8d674f5` | `test(renderer): v1.54.0 PATCH T7 -- xlsxImportListener cleanup assertion` |
| T-ship | (this commit) | `docs(release): v1.54.0 PATCH -- whole-project multi-agent review closure` |

## What's new

### T1 — dcmConfigHandler path-containment (F-A3-01, HIGH)

The handler accepted caller-supplied `bswmdPath` without any path-containment check (asymmetric vs. `register.ts:336` which uses `isPathInsideReal` for `BSWMD_READ`). A tampered preload bridge could request `bswmdPath: '/etc/passwd'` and main would happily read it.

**Fix**: `resolveDcmBswmdPath` is now async and returns `Result<T, {kind, message}>`. Caller-supplied paths are validated against `dirname(odxPath)` — the user-picked ODX file is the trust anchor (it comes from a native `dialog.showOpenDialog`). Manifest-resolved and walk-up paths skip the check (internally derived).

### T2+T3 — IPC envelope contract enforcement (F-A2-02 + F-A2-03, HIGH)

Two handlers were throwing raw exceptions instead of returning the typed envelope `{ok:false, error:{kind,message}}` that 7 other handlers follow:

| Handler | Throw sites | Wrapped at |
|---|---|---|
| `scriptSaveHandler` | 5 (`script-handler.ts:221,226,233,237,258`) | `register.ts:521` |
| `scriptDeleteHandler` | (caller) | `register.ts:524` |
| `templatesCopyHandler` | 3 (`templatesHandler.ts:114,122,128`) | `register.ts:454` |

Both wrappers preserve the handlers' pure-function signatures (wrap is at registration site, not inside). `ScriptError.payload.kind` is propagated to the envelope; plain `TemplateError` objects are duck-typed (must have string `kind` + `message`).

### T4 — Batch handler tmp filename `randomUUID` (F-A2-01, HIGH)

v1.51.0 PATCH T5 migrated `writeAtomic.ts:30` from `.tmp.{pid}` to `.tmp-{randomUUID()}` for collision-safety under long-running Linux electron processes where pid-reuse is common. But the 2 batch handlers — `dbcImportComStackHandler.ts:310-323` and `xlsxEcucBatchImportHandler.ts:413-417` (the riskiest multi-file write paths in the codebase) — were missed in that partial fix. Both now use `randomUUID()`. The 2-phase commit semantics (phase-1 tmp write + phase-2 serial rename + phase-3 snapshot rollback) are unchanged.

### T5 — Verify-test regex fix (F-A5-01, HIGH)

`error-path-coverage-round-9.verify.test.ts:127` used `/kind: 'bridge-failed'/g` which does NOT match the accessor form `.kind).toBe('bridge-failed')` (the closing paren breaks the literal-text match). The pin asserted `count === 0` (expected NO exercise) and PASSED by accident — even though F-3 was closed by v1.52.0 T3 at `dbcImportComStackHandler.test.ts:566`.

Without this fix, a future cycle that re-introduces F-3 would NOT be caught by the verify-test (it would still pass by accident). Updated regex matches both literal AND accessor forms; assertion flipped from negative-evidence (count=0) to positive-evidence (count≥1) to reflect the now-closed state.

### T6 — `stripBswmdPackageRoot` unit test (F-A5-02, MEDIUM)

A 28-LoC single-export module that underpins every xlsx mapper's parent-path target, with **zero direct unit test** — only transitive coverage via `xlsxToEcucBatch.ts:78`. 5 cases pin the regex behavior including a tolerant-passthrough case that documents the actual behavior for paths without leading slash (no match = return verbatim).

### T7 — `xlsxImportListener` cleanup assertion (F-A4-01, MEDIUM, partial 1/3)

The bridge returns an unsubscribe fn from `onXlsxImportComplete`. The existing test called cleanup in `afterEach` but never asserted it was actually invoked. New case uses a `vi.fn()` spy to verify the unsubscribe fn is invoked on cleanup. Remaining 2 listeners deferred:
- `xlsxImportHistoryBootstrap` — does NOT subscribe (one-shot `xlsxHistoryLoad` at app mount), no cleanup concept
- `useScriptActions` — no test file at all, out of scope

## Decisions

- **D1 PATCH not MINOR** — All T1-T4 are bug fixes (not feature additions or tree-touching refactors). PATCH scope.
- **D2 Containment trust anchor = odxPath** — User-picked ODX file (via native `dialog.showOpenDialog`) is the trust anchor. Caller-supplied `bswmdPath` must live in the same directory tree. No IPC contract change required.
- **D3 Wrap at registration site, not inside handler** — Preserves the handlers' pure-function signatures for direct unit testing (consistent with how `scriptRunHandler` is wrapped at `register.ts:537` for shutdown drain).
- **D4 T7 partial closure** — Honest disclosure: 1 of 3 listener cleanup findings closed. The other 2 are deferred because they need more than test additions (useScriptActions needs extraction into a testable shape).
- **D5 `.review/` gitignored** — Added `.review/` to `.prettierignore` so the review artifacts don't pollute the verify pipeline. Ephemeral scratch, regenerated each audit.

## Process lessons applied

- **`round-X-review-preflight`** (standalone since v1.48.1) — applied in this cycle (the review itself used the preflight protocol + the shipped commits each passed pre-tag verification).
- **`release-checklist-must-verify-package.json-bump-on-every-version-ship`** (STANDALONE) — applied; package.json 1.53.0 → 1.54.0 verified pre-tag.
- **Lesson #11** (pkm-capture-stub-topic-file-recovery) — applied proactively; capture-decisions file written inline via Write tool.
- **Lesson #13** (per-flow prereq analysis) — applied to each T: T1 traced sibling handler pattern at `register.ts:336`; T2/T3 traced envelope convention from `saveArxmlHandler.ts:65-107`; T4 traced `writeAtomic` migration in v1.51.0 PATCH T5.

## NEW lesson candidate observations

- **`multi-agent-adversarial-verify-survival-rate-is-quality-signal`** — 6 of 8 HIGH findings survived 2-verifier adversarial cross-check (75% survival rate). The 2 refuted findings (`vi.spyOn` on frozen namespace, `@deprecated` grep glob error) were methodological mistakes by the agents, not bugs. The survival rate is itself a methodology-quality metric for future audits.
- **`negative-evidence-verify-tests-are-fragile-to-regex-shape`** — F-A5-01 demonstrates that verify-test assertions on the ABSENCE of code patterns can pass accidentally when the regex shape doesn't match the actual code shape. Always prefer positive-evidence assertions when the closure state is known.

## Test results

- vitest 357/357 files / **3167 + 7 SKIP / 0 fail** (+7 net from v1.53.0's 3160)
- tsc `--noEmit -p tsconfig.json` + `--noEmit -p tsconfig.web.json` both clean
- prettier check clean (12 auto-fixes during T1-T7)
- eslint `--max-warnings 0` clean (3 auto-fixes: import/order)
- `pnpm verify` **8-stage GREEN** — python-self-test 8/8 PASS

## Related documents

- **CHANGELOG**: top entry of `CHANGELOG.md`.
- **Whole-project review report**: `.review/whole-project/FINAL.md` (the synthesis that prioritized these fixes).
- **v1.53.0 ship notes** (predecessor): `docs/release-notes/v1.53.0/README.md`.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)