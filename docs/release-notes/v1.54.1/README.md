# v1.54.1 — Round-12 Fresh-Review Closure (PATCH)

**Released:** 2026-07-13
**Tag:** [`v1.54.1`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.54.1)
**Cycle type:** PATCH (bug fixes + documentation; no functional surface changes)

## Summary

Closes 4 confirmed HIGH bugs + 1 documentation drift surfaced by the 2026-07-13 Round-12 fresh-review (5 multi-lens agents + 2-verifier adversarial cross-check, 100% HIGH survival rate).

| | v1.54.0 baseline | **v1.54.1** | Delta |
|---|---|---|---|
| `TEMPLATES_LIST` `@deprecated` marker | present | **removed** | F-A1-02 (HIGH) — Round-11 audit false negative |
| tmp-leak regression regex | `/tmp[.-]\d+/` | **`/tmp[.-][0-9a-f-]+/`** | F-A2-01 (HIGH) — UUID prefix blind spot |
| `odxImportDiagnosticExtractHandler` size cap | raw `fs.readFile` | **`readFileWithCap` (32 MiB)** | F-1 (HIGH, partial — containment withdrawn) |
| `arxml:open-multi` handler | inline in `register.ts` | **extracted + 4-case test** | F-A5-12 (HIGH) — Round-11 deferred |
| `f1f50cf` source comments | mis-labeled "v1.54.0 PATCH C" | **re-labeled "v1.54.1 PATCH T1"** | F-A1-01 (HIGH) |
| Tests | 3168 + 7 SKIP | **3172 + 7 SKIP** | +4 net from T4 |
| `pnpm verify` | 8-stage GREEN | 8-stage GREEN | maintained |

## Commits

| # | Commit | Title |
|---|---|---|
| T1 | `f6dfd44` | `docs(ipc): v1.54.1 PATCH T1 -- remove erroneous @deprecated from templates:list` |
| T2 | `035fdfc` | `test(verify): v1.54.1 PATCH T2 -- widen tmp-leak regression regex` |
| T3 | `4a32dda` | `fix(ipc): v1.54.1 PATCH T3 -- readFileWithCap in odxImportDiagnosticExtractHandler` |
| T4 | `b39205f` | `refactor+test(ipc): v1.54.1 PATCH T4 -- extract arxml:open-multi handler + 4-case test` |
| T5 | `bfa8000` | `docs(renderer): v1.54.1 PATCH T5 -- re-label f1f50cf commit comments` |
| T-ship | (this commit) | `docs(release): v1.54.1 PATCH -- Round-12 fresh-review closure` |

## What's new

### T1 — Remove erroneous `@deprecated` from `templates:list` (F-A1-02, HIGH)

Round-11 audit claimed `TEMPLATES_LIST` had zero renderer callers and marked it `@deprecated` in v1.53.0 PATCH T3. Round-12 fresh-review caught the false negative: `NewProjectDialog.tsx:178` binds `const api = (globalThis as ...).window?.autosarApi` (local alias) and calls `api.listTemplates()` at line 191. Round-11's grep was scoped to `autosarApi.listTemplates` and missed the shadowed call.

**Why this matters**: test mocks hide the regression because both `NewProjectDialog.test.tsx` and `NewProjectDialog.preview.test.tsx` mock `listTemplates` locally. The planned v1.55.0 channel deletion would have silently broken the dialog (renderer fall-back to Empty-only).

**Fix**: removed `@deprecated` markers from `TEMPLATES_LIST` (ipc-contract.ts) and `listTemplates` (preload/index.ts). `app:ping` and `templates:copy` keep their `@deprecated` markers (verified zero callers).

### T2 — Tmp-leak regression regex fix (F-A2-01, HIGH)

`/tmp[.-]\d+/` required literal digits after `.tmp-`. UUIDv4 ~34% of values start with a-f (lowercase hex digit), which fails the `\d+` quantifier. Those UUIDs produce `.tmp-<UUID>` strings that the original regex does NOT match — so a real tmp leak goes undetected.

**Empirical verification**: 100-iteration `crypto.randomUUID()` Node test produced 34/100 a-f-starting UUIDs.

**Fix**: change character class from `\d+` to `[0-9a-f-]+` at 3 sites in `dbcImportComStackHandler.test.ts` (lines 465, 499, 591). New regex matches both pid-style `.tmp.123` and UUID-style `.tmp-<uuid>` namespaces.

### T3 — `readFileWithCap` in `odxImportDiagnosticExtractHandler` (F-1, HIGH partial closure)

**Closes**: gap #1 (size cap) — replaces raw `fs.readFile(odxPath, 'utf8')` with the shared `readFileWithCap` helper (32 MiB cap, defense-in-depth vs multi-GB ODX payload).

**Partial**: gap #2 (path containment) was originally scoped to `dirname(odxPath)` (mirroring `dcmConfigHandler` trust anchor). Real-OEM test caught this over-strictness: legitimate usage where `outputDir` is a scratch/temp dir (e.g. fixture round-trip tests write to `mkdtempSync`) was rejected. Containment check withdrawn; size cap is the operative defense. **Future work**: if strict containment is needed, add a `projectDir` field to `OdxImportDiagExtractRequest` (mirroring `DbcImportComStackRequest`'s `projectManifestPath`) rather than anchoring on the ODX file's directory.

### T4 — Extract `arxml:open-multi` handler + 4-case test (F-A5-12, HIGH)

The `arxml:open-multi` IPC handler was INLINE in `register.ts:217-260` (44 LoC) with zero direct behavioral test. 32 sibling IPC channels were extracted to independent files with dedicated tests; this was the lone outlier (Round-11 deferred, Round-12 re-verified deferral intact).

**Extract**: NEW `src/main/ipc/openArxmlMultiHandler.ts`. Body bytes moved character-for-character per Lesson #15 (verbatim clip).

**Test**: NEW `src/main/ipc/__tests__/openArxmlMultiHandler.test.ts`. 4 cases pin the discriminated-union contract:
1. canceled: dialog dismissed → `{ kind: 'canceled' }`
2. all-opened: every file reads successfully → `{ kind: 'opened', results }`
3. all-failed: every file fails to read → `{ kind: 'read-failed', message }`
4. partial: some succeed, some fail → `{ kind: 'partial', opened, failed }`

### T5 — Re-label `f1f50cf` source comments (F-A1-01, HIGH)

The Round-12 prep commit `f1f50cf` self-labeled in source comments as "v1.54.0 PATCH C" but post-v1.54.0-ship. CHANGELOG had no entry; `release-notes/` had no `v1.54.1/` or `v1.55.0/`.

**Fix**: re-label in-source comments at `ScriptPanel.test.tsx:38, 218` from "v1.54.0 PATCH C" to "v1.54.1 PATCH T1" since this ScriptPanel cleanup IS now T1 of the v1.54.1 PATCH. Adds parenthetical explaining the post-v1.54.0 origin for future code archaeologists.

## Decisions

- **D1 PATCH not MINOR** — all T1-T5 are bug fixes or test improvements, no tree-touching refactors beyond T4's verbatim-clip extraction. PATCH scope.
- **D2 T1 partial un-deprecation** — removed `@deprecated` from `templates:list` only; `app:ping` and `templates:copy` keep their markers (verified zero callers).
- **D3 T3 partial closure** — size cap closed; containment check withdrawn (legitimate usage rejected). Honest disclosure.
- **D4 T4 verbatim clip** — extracted handler preserves byte-for-byte behavior per Lesson #15. No logic edits.
- **D5 v1.55.0 deletion plan HALTED** — the planned removal of the 3 `@deprecated` channels must be re-audited for the same shadowing trap that F-A1-02 caught.

## Process lessons applied

- **`round-X-review-preflight`** (standalone) — Round-12 review used the preflight protocol + pre-tag verification
- **`string-matching-audit-agent-can-miss-pre-existing-tests-always-cross-check-before-scheduling`** (now **3/3 → STANDALONE**) — Round-12 F-A1-02 is the 3rd confirmation
- **`cleanup-assertion-requires-spy-on-the-unsubscribe-fn`** (now **3/3 → STANDALONE**) — Round-12 A5 directly promoted after verifying T7 + Round-12 prep both genuinely assert spy invocation
- **`negative-evidence-verify-tests-are-fragile-to-regex-shape`** (now 2/3) — Round-12 F-A2-01 is the textbook case
- **`multi-agent-adversarial-verify-survival-rate-is-quality-signal`** (now 2/3) — Round-12's 100% HIGH survival rate (5/5) is the textbook quality signal (no rubber-stamping, empirical evidence like Node 34% UUID distribution)
- **`release-checklist-must-verify-package.json-bump-on-every-version-ship`** (standalone, 5th application) — package.json 1.54.0 → 1.54.1 verified pre-tag

## Test results

- vitest 358/358 files / **3172 + 7 SKIP / 0 fail** (+4 net from v1.54.0's 3168)
- tsc `--noEmit -p tsconfig.json` + `--noEmit -p tsconfig.web.json` both clean
- prettier check clean (2 auto-fixes during T4)
- eslint `--max-warnings 0` clean (3 auto-fixes: import/order, no-unused-vars, import/no-duplicates)
- `pnpm verify` **8-stage GREEN** — python-self-test 8/8 PASS

## Related documents

- **CHANGELOG**: top entry of `CHANGELOG.md`.
- **Round-12 review report**: `.review/round-12/FINAL.md` (the synthesis that prioritized these fixes).
- **v1.54.0 ship notes** (predecessor): `docs/release-notes/v1.54.0/README.md`.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)