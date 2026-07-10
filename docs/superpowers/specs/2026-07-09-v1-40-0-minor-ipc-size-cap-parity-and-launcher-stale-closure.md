# v1.40.0 MINOR — IPC Size-Cap Parity + Launcher Stale-Closure

**Author**: claude-AutosarCfg post-ship review controller
**Date**: 2026-07-09
**Status**: design (awaiting spec self-review + user approval)
**Baseline**: v1.39.0 MINOR `68183f1` (3092 + 7 SKIP / 0 fail)
**Target**: 3102 + 7 SKIP / 0 fail (+10 net: 3 size-cap + 1 launcher + 3 validator + 3 polish)

## Goal

Close the **3 HIGH + 4 MEDIUM + 4 LOW** Round-4 deep code review findings (file:line verified) on `src/main/ipc/` + `src/renderer/store/` + `src/main/script/` + `src/renderer/hooks/`. The 3 HIGHs are:

- H1: 6 dialog-driven read handlers (openDbc, openOdx, openOdxWithDefault, bswmdPick, OPEN_ARXML, OPEN_ARXML_MULTI) skip the 32 MiB cap that every parse-path handler enforces.
- H2: dcmConfigHandler reads ODX + BSWMD with no cap (worst case — long-running pipeline + sync read = OOM during ODX parse).
- H3: useDcmConfigLauncher.handleGenerateNew reads `state.lastOdxPath` from a stale closure; user closes dialog + switches doc → re-fire uses the OLD odxPath silently.

**LOW/NOTE findings (L1 + L2 + L3 + N1)**: deferred to v1.40.x PATCH chain (L1 stale-closure style hazard is a code-quality note, not a runtime bug; N1 is latent feature-flag drift).

## Background — what's actually broken

**H1 — Size-cap parity gap** (6 handlers, single root cause):
The codebase established the 32 MiB cap pattern in Sprint 12-13 for parse paths (`parseArxmlHandler.ts:42`, `parseDbcHandler.ts:39`, `parseOdxHandler.ts:43`, `bswmdReadHandler.ts:40`, `bswmd:parse` in `register.ts:113`). The picker/dialog paths — the user-facing entry points that show a file dialog with no extension-based size pre-filter — were overlooked. `fs.readFile(path, 'utf8')` reads the entire file into a single V8 string with no upper bound. A 4-GB binary blob named `.dbc` would OOM the main process.

The fix is a single shared helper (`readFileWithCap(path, capBytes?)`) that the picker handlers call. The parse handlers can also be refactored to use the helper (eliminates 4 copies of the same 12-line cap logic).

**H2 — dcmConfigHandler bypass** (1 handler, async-pipeline OOM):
`dcmConfigHandler.ts:184,217` calls `readFileSync(args.odxPath, 'utf-8')` and `readFileSync(dcmBswmdPath, 'utf-8')` with no cap. The downstream `parseOdxHandler` has the 32 MiB cap, but by then the sync read has already OOM'd. Plus, the ODX+BSWMD+BSWMD-driven pipeline is the longest-running handler in the project (v1.30.0 MINOR — multi-second pipeline); an OOM here is especially hard to recover from.

**H3 — useDcmConfigLauncher stale closure** (1 hook, Round-1 H1 class defect):

```ts
const handleGenerateNew = useCallback(async (): Promise<void> => {
  if (inFlightRef.current) return;
  const r = await window.autosarApi.bswmdPick();
  ...
  const odxPath = state.lastOdxPath ?? activeDocumentPath;  // line 556 — reads `state` from closure
  ...
  await open({ odxPath, ... });
}, [state.lastOdxPath, activeDocumentPath, open, locale]);
```

After a successful dcm:config + close SuccessDialog + switch active doc, `state.lastOdxPath` is preserved from the previous success (the dialog doesn't clear it). The `confirmDestructive` gate (v1.36.0 T5) shows the picked BSWMD path (correct) but not the resolved ODX path (stale). The user clicks Confirm thinking "yes, generate with this BSWMD for the doc I see in the tree" when in fact `lastOdxPath` may point at a different doc.

The Round-1 H1 was the same class of defect (stale data in a re-fire callback). The fix is a `useRef` synced in the `open` success branch (mirrors v1.36.0 lesson `store-as-source-of-truth-for-async-args`).

## Architecture

### T1 — Size-cap helper + parity refactor

Create a single shared helper `src/main/ipc/sizeCap.ts` exporting:

```ts
export const DEFAULT_FILE_CAP_BYTES = 32 * 1024 * 1024; // 32 MiB

export interface ReadFileWithCapResult {
  ok: true;
  content: string;
}
export interface ReadFileWithCapFailure {
  ok: false;
  kind: 'too-large' | 'read-failed';
  message: string;
}
export function readFileWithCap(
  path: string,
  capBytes: number = DEFAULT_FILE_CAP_BYTES,
): Promise<ReadFileWithCapResult | ReadFileWithCapFailure>;
```

Pattern (mirrors `bswmdReadHandler.ts:50-77`):

1. `fs.stat(path)` — get the size
2. If size > capBytes: return `{ ok: false, kind: 'too-large', message: ... }`
3. `fs.readFile(path, 'utf-8')` — read the file
4. If read fails: return `{ ok: false, kind: 'read-failed', message: ... }`
5. Return `{ ok: true, content: ... }`

Then:

- Refactor `bswmdReadHandler.ts:50-77` to use the helper (eliminates duplicate logic).
- Replace `fs.readFile(path, 'utf8')` in `openDbcHandler.ts:41`, `openOdxHandler.ts:47`, `openOdxWithDefaultHandler.ts:37`, `bswmdPickHandler.ts:41`, `register.ts:141` (OPEN_ARXML), `:225` (OPEN_ARXML_MULTI).
- Replace `readFileSync(args.odxPath, 'utf-8')` + `readFileSync(dcmBswmdPath, 'utf-8')` in `dcmConfigHandler.ts:184,217`. The async helper replaces the sync read; the handler becomes async at the relevant section (handler is already async via the `async` keyword at the top of the function — check before the change).

**Tests** (3 NEW, all in `src/main/ipc/__tests__/sizeCap.test.ts`):

- Test 1: a 1-byte file reads OK.
- Test 2: a 33-MiB file rejects with `too-large`.
- Test 3: a non-existent file rejects with `read-failed`.

For Test 2, use a tmp file at exactly 33 MiB (`fs.writeFileSync` with a `Buffer.alloc(33 * 1024 * 1024)`). Or use `fs.stat` on a sparse file. Verify the test runs in <1 second (no actual 33 MB write to disk if possible — use sparse files or a non-existent path with mocked `fs.stat`).

### T2 — Launcher stale-closure fix

`src/renderer/hooks/useDcmConfigLauncher.ts`:

1. Add `const lastOdxPathRef = useRef<string | null>(null);` near `inFlightRef` and `memoRef`.
2. In the `open()` success branch (where `state.lastOdxPath` is currently set), also set `lastOdxPathRef.current = result.lastOdxPath ?? null`.
3. Change `const odxPath = state.lastOdxPath ?? activeDocumentPath;` to `const odxPath = lastOdxPathRef.current ?? activeDocumentPath;`.
4. Remove `state.lastOdxPath` from the `useCallback` dep array (the ref doesn't need to be a dep).

**Test** (1 NEW, in `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts`):

- The "close dialog + switch doc + click Generate New → uses new activeDocumentPath" scenario:
  1. Seed `state.lastOdxPath = '/old/Odx-A.odx'` and `state.activeDocumentPath = '/old/Odx-A.odx'`.
  2. Mock `bswmdPick` to return opened.
  3. Mock `confirmDestructive` to return 'confirm'.
  4. Trigger `handleGenerateNew`.
  5. Assert the `open()` call received `odxPath === '/old/Odx-A.odx'` (current active doc, NOT lastOdxPath).
  6. Then: change `state.activeDocumentPath = '/new/Odx-B.odx'`.
  7. Trigger `handleGenerateNew` again.
  8. Assert the `open()` call received `odxPath === '/new/Odx-B.odx'` (new active doc, NOT the cached lastOdxPath from a previous success).

### T3 — 1-line validators + race polish

**M1 (script-handler.ts:190-241)** — add `validateName` helper:

```ts
function validateName(name: string): string | null {
  if (name.length > 80) return 'name too long (max 80 chars)';
  if (/[\x00-\x1f]/.test(name)) return 'name contains control character';
  if (name.trim().length === 0) return 'name is whitespace';
  return null;
}
```

Apply to `req.name` before persisting. Return `{ kind: 'invalid-name', message }` on failure.

**M2 (script-handler.ts:325)** — clamp `req.timeoutMs`:

```ts
const SAFE_TIMEOUT_MS = 60_000;
const timeoutMs = Math.min(Math.max(req.timeoutMs ?? 5000, 1000), SAFE_TIMEOUT_MS);
```

Use the clamped value in the `runInSandbox` options.

**M3 (projectSaveHandler.ts:67)** — add manifest shape probe:

```ts
import { loadManifest } from '../../core/project/manifest.js';
const probe = loadManifest(saveManifest(req.manifest), dirname(req.manifestPath));
if (!probe.ok) {
  return { kind: 'write-failed', message: `Manifest invalid: ${probe.error.kind}` };
}
await writeAtomic(req.manifestPath, saveManifest(req.manifest));
```

**L1 (xlsxEcucBatchImportHandler.ts:481-514)** — reorder push after save:

- Move the `webContents.send(XLSX_IMPORT_COMPLETE, ...)` block to AFTER the `await xlsxHistorySaveHandler(...)` call.
- If `xlsxHistorySaveHandler` returns `ok: false`, push a SECOND broadcast (or extend the payload with a `persisted: false` flag) so the renderer can show a warning toast.

**Tests** (3 NEW):

- Test M1: scriptSaveHandler rejects a 1-MB name string.
- Test M2: scriptRunHandler clamps timeoutMs > 60_000 to 60_000.
- Test M3: projectSaveHandler rejects a tampered manifest (e.g. `{ schemaVersion: 'x' }` without the rest of the required fields).

### T4 — Docs + ship

- `docs/release-notes/v1.40.0/README.md` (NEW) + `CHANGELOG.md` (modify)
- 2 NEW lessons already captured by Round-4 review (size-cap-parity + launcher-stale-closure)
- Tag v1.40.0 + gh release create + push (2 separate pushes per the `follow-tags-unreliable-separate-push-tag` lesson)

## Components & Files Touched

| Layer          | File                                                                 | Change                                   |
| -------------- | -------------------------------------------------------------------- | ---------------------------------------- |
| core/ipc       | `src/main/ipc/sizeCap.ts` (NEW)                                      | shared helper                            |
| core/ipc       | `src/main/ipc/bswmdReadHandler.ts`                                   | refactor to use helper                   |
| core/ipc       | `src/main/ipc/openDbcHandler.ts`                                     | use helper                               |
| core/ipc       | `src/main/ipc/openOdxHandler.ts`                                     | use helper                               |
| core/ipc       | `src/main/ipc/openOdxWithDefaultHandler.ts`                          | use helper                               |
| core/ipc       | `src/main/ipc/bswmdPickHandler.ts`                                   | use helper                               |
| core/ipc       | `src/main/ipc/register.ts`                                           | OPEN_ARXML + OPEN_ARXML_MULTI use helper |
| core/ipc       | `src/main/ipc/dcmConfigHandler.ts`                                   | H2 use helper (async read)               |
| core/ipc       | `src/main/ipc/script-handler.ts`                                     | M1 + M2 (validateName + clamp)           |
| core/ipc       | `src/main/ipc/projectSaveHandler.ts`                                 | M3 (manifest shape probe)                |
| core/ipc       | `src/main/ipc/xlsxEcucBatchImportHandler.ts`                         | L1 (reorder push)                        |
| renderer/hooks | `src/renderer/hooks/useDcmConfigLauncher.ts`                         | T2 (useRef for lastOdxPath)              |
| tests          | `src/main/ipc/__tests__/sizeCap.test.ts` (NEW)                       | 3 NEW tests                              |
| tests          | `src/main/ipc/__tests__/script-handler.test.ts` (UPDATE)             | 2 NEW tests (M1 + M2)                    |
| tests          | `src/main/ipc/__tests__/projectSaveHandler.test.ts` (UPDATE)         | 1 NEW test (M3)                          |
| tests          | `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` (UPDATE) | 1 NEW test (T2)                          |
| docs           | `docs/release-notes/v1.40.0/README.md` (NEW)                         | release notes                            |
| docs           | `CHANGELOG.md`                                                       | v1.40.0 row                              |

## Key Design Decisions

| #   | Decision                                                           | Rationale                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Single shared helper** (`readFileWithCap`) vs inline per-handler | The cap pattern is established; the helper enforces parity. Every new picker path that uses the helper gets the cap for free.                                                                                                                       |
| D2  | **`fs.stat` then `fs.readFile`** vs streaming                      | `fs.stat` is fast (a stat syscall); streaming is overkill for a 32 MiB cap. The pattern is what every other handler already does.                                                                                                                   |
| D3  | **Helper returns a discriminated union** vs throws                 | Matches the project's `Result<T, E>` pattern. Throws would force every caller to wrap in try/catch; the union lets the caller branch on `kind`.                                                                                                     |
| D4  | **T2 useRef synced in success branch** vs clear on dialog close    | The ref captures the "real" value at the moment it was decided. Clearing on dialog close loses the value if the user re-fires immediately (e.g. clicks Generate New, cancels, clicks Generate New again — the second click needs the cached value). |
| D5  | **M1 validateName cap 80 chars**                                   | Mirrors the i18n bundle's longest label (76 chars in en.json) + headroom. Reject NUL + control chars per Round-3 H1 pattern.                                                                                                                        |
| D6  | **M2 timeoutMs clamp 1000-60000**                                  | Spec says "up to 60s". Floor at 1000ms prevents accidental 0-arg (which V8 interprets as "no timeout").                                                                                                                                             |
| D7  | **L1 reorder push after save** vs add `persisted: false` flag      | Both — the push still fires so the renderer can update the in-memory slice; a `persisted: false` field on the payload lets the renderer show a warning toast.                                                                                       |
| D8  | **T4 docs single commit**                                          | v1.40.0's scope is small enough (10 fixes, ~5 files) that the release-notes commit can be the only docs commit.                                                                                                                                     |

## Testing Strategy

| Test surface                                                         | Coverage                                               | Δ tests                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------- |
| `src/main/ipc/__tests__/sizeCap.test.ts` (NEW)                       | 1-byte OK, 33-MiB too-large, non-existent read-failed  | +3                                      |
| `src/main/ipc/__tests__/script-handler.test.ts` (UPDATE)             | validateName rejects long name, timeoutMs clamp        | +2                                      |
| `src/main/ipc/__tests__/projectSaveHandler.test.ts` (UPDATE)         | tampered manifest rejected                             | +1                                      |
| `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` (UPDATE) | T2 scenario (close + switch doc + re-fire)             | +1                                      |
| Other affected handler tests                                         | 7 handlers using the new helper — verify no regression | +3 (parity tests in handler test files) |
| **Total**                                                            |                                                        | **+10 net**                             |

Baseline 3092 + 7 → **3102 + 7 SKIP / 0 fail**.

## Risks & Mitigations

| Risk                                                                                | Mitigation                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `readFileWithCap` requires async — `dcmConfigHandler` may have a sync call site     | Read `dcmConfigHandler.ts` first to verify; the function is already `async`, so async-ifying one read is just `await`.                                                                                        |
| 33-MiB test fixture is slow to write to disk                                        | Use a sparse file (Linux: `truncate -s 33M`; Windows: `fs.ftruncate` on an existing fd). Or use `vi.mock` to mock `fs.stat` and skip the actual file write.                                                   |
| T2 useRef pattern interacts with `useCallback` dep array                            | The ref doesn't need to be a dep. But removing `state.lastOdxPath` from the deps changes the callback identity on each render — verify the renderer's use of `handleGenerateNew` doesn't care about identity. |
| M1 validateName length cap (80) breaks an existing test that uses a long name       | Read existing tests first; bump the cap if necessary (or update the test).                                                                                                                                    |
| M3 loadManifest round-trip probe reads the saved manifest back from disk — adds I/O | Use `saveManifest` + `loadManifest(JSON.stringify(req.manifest))` in-memory (no disk). Same probe, no I/O.                                                                                                    |
| L1 reorder changes the existing push timing                                         | The renderer (`xlsxImportListener.ts`) handles push before or after save identically (the push payload is `{rows, source, importedAt}`). The new `persisted` field is additive.                               |

## Tasks (4 + 1 ship)

```
T1: readFileWithCap helper + 6 picker handlers + dcmConfigHandler (H1 + H2 + M4)
T2: useDcmConfigLauncher lastOdxPathRef (H3)
T3: validateName + timeoutMs clamp + manifest shape probe + push reorder (M1 + M2 + M3 + L1)
T4: docs release artifacts
T5: ship (2 separate pushes + tag + gh release)
```

5 tasks total, Subagent-Driven execution.

## Global Constraints

(Inherit from v1.39.x + v1.38.x + v1.37.x series.)

- All modified/new files end with trailing newline.
- No `console.log` in production code; `console.warn` allowed for defensive warnings.
- 中文 for user-facing/business comments; 英文 for technical API/comments per CLAUDE.md.
- Subagent-driven execution; one implementer per task, one task reviewer per task.
- Each task ends with its own test running and passing.
- Exact values (file paths, error kind strings, function signatures) MUST match this spec verbatim.
- Implementer MUST dispatch `pkm-capture` autonomously when work is capture-worthy (per v1.38.0 lesson `brief-explicit-must-not-clause-is-overridden-by-implementer-judgment-when-content-is-genuinely-capture-worthy`).
- Implementer MUST NOT make destructive git operations (`reset --hard`, `push --force`) on `origin/main`.

## Out of Scope (deferred to v1.40.x PATCH chain)

- L2 (ecucSlice.removeDocument stale-state reads) — style note, not a runtime bug
- L3 (pickDirHandler locale validation) — defense-in-depth, not a current bug
- L4 (bswmdPickHandler duplicate-load) — downgraded to NOTE (intentional Override flow contract)
- N1 (featureFlagsGetHandler all-OFF) — latent feature-flag drift; flag for the first flag-enable PATCH
- round-trip-mutation.test.ts fixtures (deferred since v1.37.1) — populate parameters/references
- NaN/Infinity hard-fail in parseParamValue (deferred since v1.38.0) — needs structured-error infra
- Multi-valued-reference schema migration (deferred since v1.38.0) — Record<shortName, ParamValue[]>
- Tier 3 ship script hardening (deferred since v1.37.0) — pre-reset guard
- 6 file > 800 LoC split (deferred since v1.36.0 L8)

## Reverse-Closes

Closes Round-4 deep code review's 7 actionable findings (3 HIGH + 4 MEDIUM + 1 of 4 LOW). 2 LOW + 1 NOTE deferred to v1.40.x PATCH chain.

## Lessons (NEW from this MINOR, candidates)

1. `size-cap-parity-required-across-all-picker-read-paths` (H1 + H2 + M4) — pre-captured by Round-4 review.
2. `launcher-stale-closure-on-re-fire-with-multi-source-of-truth` (H3) — pre-captured by Round-4 review.

## Cross-references

- Round-4 review topic: `01-Projects/claude-AutosarCfg/development/code-review-round-4-deep-dive-2026-07-09.md`
- v1.39.0 plan: `docs/superpowers/plans/2026-07-08-v1-39-0-minor-generator-output-correctness-and-cli-stubs.md` (parent MINOR; closes Round-3 findings)
- v1.36.0 lesson `store-as-source-of-truth-for-async-args` (referenced by T2)
