# v1.40.0 MINOR — IPC Size-Cap Parity + Launcher Stale-Closure

**Ship**: 2026-07-09 (TAG PENDING — T5 will fill)

**Baseline**: v1.39.0 MINOR `68183f1` (3092 + 7 SKIP / 0 fail)
**Target**: 3119 + 7 SKIP / 0 fail (+27 net delta from v1.39.0).

4 atomic commits on `main` (T1 + T2 + T3 + T3.5), each scoped to a
single concern, all under the same brief. T3.5 is a single-line
defensive fix that landed between T3 and T4 because the implementer
of T3 caught a NaN silent-propagation vector in the M2 clamp.

| Task | Severity          | Commit    | Files | Tests       |
|------|-------------------|-----------|-------|-------------|
| T1   | H1 + H2 + M4      | `5df6211` | 6 modified + 4 NEW | +12 |
| T2   | H3                | `68643f6` | 2 modified (1 source + 1 test) | +1 |
| T3   | M1 + M2 + M3 + L1  | `e24b90b` | 5 modified + 1 NEW test | +12 |
| T3.5 | (M2 NaN guard)    | `828f806` | 2 modified | +2 |

Round-1 deep code review surfaced **8 actionable items** (2 HIGH +
4 MEDIUM + 2 LOW). This MINOR closes all 8 — and surfaces 2 further
M-series defensive items (M1-M4 in T3 plus M2 NaN guard in T3.5) for
a total of **10 issues closed**.

## What's in this MINOR

### T1 (H1 + H2 + M4): size-cap helper + picker parity (commit `5df6211`)

**Problem**: Two related file-size vulnerabilities across the IPC surface
and a missed M-series defensive tightening — the most serious **PATTERN
gap** of this MINOR.

- **H1 (pickers)**: `openDbcHandler`, `openOdxHandler`,
  `openOdxWithDefaultHandler`, `bswmdPickHandler`, and `register.ts`'s
  `OPEN_ARXML` / `OPEN_ARXML_MULTI` channels each did `fs.readFile` with
  **no upper bound**. A 1 GiB `.dbc` (or worse, a multi-select `.arxml`
  pick with one rogue oversized file) would load fully into memory before
  any downstream parser saw it. On a workstation this is a slow OOM; on
  a CI runner it's a hard kill. The pre-existing `bswmdReadHandler`
  already had a 32 MiB cap, but it was inline and not shared — every
  other picker re-implemented (or omitted) the guard.
- **H2 (dcmConfig)**: `dcmConfigHandler` did **2 synchronous**
  `fs.readFileSync` calls (one for the ODX, one for the BSWMD) with no
  cap on either. Same OOM class as H1, doubled.
- **M4 (register.ts fan-out)**: The `OPEN_ARXML_MULTI` fan-out iterated
  files individually; a single oversized file in the batch returned
  `failed: [{ path, message }]` but the loop did not propagate the
  existing 32 MiB cap uniformly.

**Fix**:

1. NEW `src/main/ipc/sizeCap.ts` (~108 LoC) — `readFileWithCap(path)`
   helper. Exports `DEFAULT_FILE_CAP_BYTES = 32 * 1024 * 1024` (32 MiB)
   + a discriminated-union result `{ kind: 'ok'; data; size } | { kind:
   'too-large'; size; cap } | { kind: 'read-failed'; message }`. Internal
   pipeline: `fs.stat` → cap check → `fs.readFile`.
2. `bswmdReadHandler` refactored to use the helper, preserving the
   `{ok}/{read-failed}` envelope + human-readable `"X MiB, max 32 MiB"`
   message shape (free-rider: -7 LoC net). The inline
   `32 * 1024 * 1024` literal is kept as a display-formatting constant;
   the helper exports the same value via `DEFAULT_FILE_CAP_BYTES` so the
   two stay in lock-step.
3. All 5 picker paths + `dcmConfigHandler`'s 2 reads + `OPEN_ARXML_MULTI`
   fan-out now route through `readFileWithCap`.
4. `dcmConfigHandler`'s two `readFileSync` calls become `await
   readFileWithCap(...)` (function was already `async`); the
   `odx-unreadable` / `bswmd-unreadable` envelopes are preserved.

**Renderer-side folding**: the picker paths fold `too-large` and
`read-failed` at the IPC boundary into the existing `{ kind: 'read-failed'
}` envelope. The discriminator is preserved at the helper boundary so a
future feature can introduce a distinct "file too large" hint additively
(per the `additive-ipc-channels-over-extending-args` lesson).

File:line citation:

- `src/main/ipc/sizeCap.ts` — NEW shared helper + `DEFAULT_FILE_CAP_BYTES`.
- `src/main/ipc/bswmdReadHandler.ts` — refactored to helper.
- `src/main/ipc/openDbcHandler.ts` — `fs.readFile` → `readFileWithCap`.
- `src/main/ipc/openOdxHandler.ts` — `fs.readFile` → `readFileWithCap`.
- `src/main/ipc/openOdxWithDefaultHandler.ts` — `fs.readFile` → `readFileWithCap`.
- `src/main/ipc/bswmdPickHandler.ts` — `fs.readFile` → `readFileWithCap`.
- `src/main/ipc/register.ts` — `OPEN_ARXML` + `OPEN_ARXML_MULTI` → `readFileWithCap`.
- `src/main/ipc/dcmConfigHandler.ts` — both `readFileSync` → `await readFileWithCap`.
- `src/main/ipc/__tests__/sizeCap.test.ts` — NEW 3 helper tests (1-byte ok / 33 MiB too-large / non-existent read-failed).
- `src/main/ipc/__tests__/openDbcHandler.test.ts` — NEW 5 unit tests for the previously-uncovered handler.
- `src/main/ipc/__tests__/bswmdPickHandler.test.ts` — +1 parity test (33 MiB → `canceled` envelope).
- `src/main/ipc/__tests__/openOdxWithDefaultHandler.test.ts` — +1 parity test (33 MiB → `read-failed` envelope).
- `src/main/ipc/__tests__/dcmConfigHandler.test.ts` — +2 parity tests (33 MiB ODX → `odx-unreadable`; 33 MiB BSWMD → `bswmd-unreadable`).

**Critical callout — H1 family is the most serious PATTERN gap of this MINOR**: A shared 32 MiB cap was already present in `bswmdReadHandler` (inlined) but **not extracted** into a helper. Every other picker path silently re-implemented (or omitted) the guard, and `OPEN_ARXML_MULTI` had no per-file cap at all. The pattern: a defensive measure exists in one place, but other call sites don't learn from it because the helper was never created. The fix here is structural: `sizeCap.ts` makes the cap a first-class concern, and the picker paths use it by default. **Future file-read call sites MUST use `readFileWithCap`; the inline `fs.readFile` pattern is a code-smell regression risk.**

### T2 (H3): `useDcmConfigLauncher` lastOdxPathRef for re-fire correctness (commit `68643f6`)

**Problem**: `useDcmConfigLauncher.handleGenerateNew` captured
`state.lastOdxPath` at the success-state render. If the user closed the
Generate-New dialog, switched active documents, then re-fired
`handleGenerateNew`, the **captured** value silently shadowed the new
`activeDocumentPath`. Pre-fix this meant a `.arxml` doc could be
re-emitted using the previous `.odx`'s path — silent wrong-doc
generation with no error surfaced to the user.

**Fix**: Introduces a `lastOdxPathRef` ref-mirror of the captured path,
mirrors the existing state copy in the success / error / bridge-throw
branches of `open()`, and changes `handleGenerateNew` to read from the
ref with a doc-switch resolution rule that aligns with the pre-existing
`isActiveOdx` shortcut contract.

Resolution order in `handleGenerateNew`:

1. If user has a current `.odx` active document → use it.
2. Otherwise → use the ref-mirror of the last success.
3. Last resort → `activeDocumentPath` (which may be `null`).

**Plan drift**: The plan brief prescribed `lastOdxPathRef.current ??
activeDocumentPath` (ref first, then active fallback). The implementer
caught a brief bug when testing the "user switched docs after success"
scenario: the ref is **only refreshed on the next `open()` success** —
not on doc switches. The corrected pattern is
`isActiveOdx ? active : ref ?? active`, aligning with the pre-existing
`isActiveOdx` shortcut contract used by `promptAndOpen` at lines
487-498.

File:line citation:

- `src/renderer/hooks/useDcmConfigLauncher.ts` — `lastOdxPathRef`
  introduced + mirrored in all 3 reset paths of `open()` +
  `handleGenerateNew` resolution rule + `isActiveOdx` added to dep array.
- `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` — 1 NEW
  test pinning the doc-switch re-fire uses the new active doc, NOT
  the stale captured `state.lastOdxPath`.

### T3 (M1 + M2 + M3 + L1): validators + race polish (commit `e24b90b`)

5 small fixes bundled atomically. All are defensive tightening at the
IPC trust boundary.

#### M1 — `script-handler.ts` — `validateName` (≤ 80 chars, no NUL/control, no whitespace-only)

`scriptSaveHandler` accepted `req.name` of arbitrary length. A tampered
preload bridge could smuggle a 1-MB string. Added `validateName` helper
that returns `ScriptError | null` (mirroring the existing
`validateShortName` pattern) and is thrown by the handler. Renderer
pre-validates but a tampered preload could still bypass.

#### M2 — `script-handler.ts` — `timeoutMs` clamp to [1000, 60_000] ms

`scriptRunHandler` passed `req.timeoutMs` to V8's `setTimeout`. V8
treats `0` (and negative) as "no timeout" — a tampered caller could
wedge the graceful-shutdown drain that wraps `runInSandbox`. Clamped
via `Math.max(MIN, Math.min(value, MAX))`. **T3.5 supersedes** this
implementation to add the NaN guard (see below).

#### M3 — `projectSaveHandler.ts` — manifest shape probe

`projectSaveHandler` wrote whatever `req.manifest` payload the caller
handed it. A tampered preload could supply a missing-fields object that
silently persisted a corrupt `<userData>/project.json`. Added a probe
via `loadManifest(saveManifest(req.manifest), dirname(...))` BEFORE the
disk write. Tampered payloads now reject with `write-failed` and the
JSON-stringified `ManifestError` variant in the message (5-variant
discriminated union: `json-parse` / `invalid-shape` / `invalid-field`
with `message`; `version-mismatch` / `invalid-path` with structured
data).

#### L1 — `xlsxEcucBatchImportHandler.ts` — push after persist

`XLSX_IMPORT_COMPLETE` push was broadcast BEFORE
`xlsxHistorySaveHandler` resolved. If persistence failed, the renderer
showed "import complete" with no project file on disk. Now push fires
AFTER persistence resolves. Push payload gains `persisted: boolean` so
the listener can surface a warning toast when persistence failed.

File:line citation for T3:

- `src/main/ipc/script-handler.ts` — `validateName` helper + `nameErr` throw + `clampedTimeoutMs`.
- `src/main/ipc/projectSaveHandler.ts` — `loadManifest(saveManifest(...))` probe before `writeAtomic`.
- `src/main/ipc/xlsxEcucBatchImportHandler.ts` — push reordered + `persisted: boolean` threaded.
- `src/renderer/store/xlsxImportListener.ts` — `XlsxImportCompletePayload` gains `persisted: boolean`.
- `src/preload/index.ts` — `onXlsxImportComplete` bridge type gains `persisted: boolean`.
- `src/main/ipc/__tests__/script-handler.test.ts` — +6 tests (3 for M1: length / NUL / whitespace; 3 for M2: 0 / Infinity / MAX_SAFE_INTEGER).
- `src/main/ipc/__tests__/projectSaveHandler.tamper.test.ts` — NEW file, 4 tests (well-formed / missing id / missing name / no-overwrite).
- `src/main/ipc/__tests__/xlsxEcucBatchImportHandler.test.ts` — +2 tests (push order + persisted=false); +electron mock via `vi.hoisted` (BrowserWindow + `app.getPath`).

### T3.5 (M2 NaN guard): non-finite/non-positive short-circuit (commit `828f806`)

**Problem**: The implementer of T3 caught a brief bug mid-task —
`Math.max(1000, Math.min(NaN, 60_000))` returns `NaN` because
`Math.min(NaN, anything)` propagates NaN. The pre-fix T3 M2 clamp did
NOT guard against NaN, and `Number.NaN` passed through to V8's
`setTimeout(NaN)` which V8 coerces to `0` — same wedge vector the M2
clamp was trying to close. T3's tests covered `Infinity`, `-Infinity`,
`0`, `MAX_SAFE_INTEGER` — but not `NaN`.

**Fix**: Replace the M2 clamp with
`Number.isFinite(rawTimeoutMs) && rawTimeoutMs > 0 ? clamp :
SAFE_FALLBACK` where `SAFE_FALLBACK = 5000`. Non-finite and
non-positive values short-circuit to the 5-second fallback.

File:line citation:

- `src/main/ipc/script-handler.ts` — `SAFE_TIMEOUT_FALLBACK_MS = 5000` +
  `Number.isFinite(rawTimeoutMs) && rawTimeoutMs > 0` guard around the
  min/max + block comment now says "v1.40.0 MINOR T3.5 (M2)" with the
  NaN silent-propagation vector documented.
- `src/main/ipc/__tests__/script-handler.test.ts` — +2 tests (NaN literal
  + `parseInt('not-a-number')`). Pre-existing M2 tests for `Infinity` /
  `0` / `MAX_SAFE_INTEGER` retained.

## Critical honesty (process + bounded follow-ups)

### T1's H1 family is a PATTERN gap, not a one-off bug

The structural root cause is that `bswmdReadHandler`'s 32 MiB cap was
inline rather than extracted. Every subsequent picker handler that
needed to read a user file had to re-implement (or omit) the guard.
T1's fix is structural: `sizeCap.ts` makes the cap a first-class concern
with a typed discriminated-union result. **Future file-read call sites
MUST use `readFileWithCap`** — the inline `fs.readFile` pattern at a
picker boundary is a code-smell regression risk.

### T2's plan drift is documented and intentional

The brief prescribed `lastOdxPathRef.current ?? activeDocumentPath`,
which fails the doc-switch test (ref only refreshes on next `open()`
success). The corrected pattern aligns with the pre-existing
`isActiveOdx` shortcut contract used by `promptAndOpen`. The lesson
`plan-prescribed-ternary-must-be-tested-against-doc-switch-scenario`
captures this.

### T3.5 supersedes T3 M2

T3.5 supersedes T3 M2 with the NaN guard. T3 M2's `Infinity` /
`MAX_SAFE_INTEGER` / `0` tests remain unchanged. The block comment in
`script-handler.ts` now attributes M2 to T3.5.

### M3's `ManifestError` is a discriminated union

`ManifestError` has 5 variants. Only some carry a `message` field
(`json-parse` / `invalid-shape` / `invalid-field`); others
(`version-mismatch` / `invalid-path`) carry structured data
(`expected` / `found` / `field` / `path` / `reason`). The probe failure
path stringifies via `JSON.stringify` so the user sees all context
regardless of variant.

### L1's `vi.hoisted` for shared monotonic counter

The L1 test records `webContents.send` calls across both the `electron`
mock and the wrapped `xlsxHistorySaveHandler` mock. Both share a
single monotonic counter via `vi.hoisted` (regular `vi.fn` references
inside `vi.mock` factories cannot be accessed from the test body
because `vi.mock` is hoisted above regular declarations).

### T6 polish is small but accumulates

5 small fixes (T3: 4 + T3.5: 1), no behavioral surprises for the happy
path. All are defensive tightening at the IPC trust boundary.

## Lessons (NEW from this MINOR)

1. **`shared-file-size-cap-helper-closes-uniform-picker-OOM-vector`** (T1 / H1) — A defensive measure present in one call site must be extracted into a shared helper as soon as a second call site needs it. Inline defensive measures don't scale across the IPC surface. The T1 fix extracts `readFileWithCap` from `bswmdReadHandler`'s inline 32 MiB guard into a first-class helper that all picker paths now route through. Future picker call sites MUST use the helper.

2. **`renderer-folded-error-envelope-preserves-contract-on-size-cap-addition`** (T1 / H1 + H2) — When adding a new failure mode (`too-large`) to a read pipeline, fold it into the existing `read-failed` envelope at the IPC boundary. The discriminator stays at the helper boundary (`kind: 'too-large'`) so a future feature can distinguish additively (per `additive-ipc-channels-over-extending-args`), but the IPC contract remains unchanged. Renderer-side classification regex matches on `error.kind` + `error.message` only.

3. **`real-on-disk-33MiB-fixture-is-fast-enough-for-cap-test`** (T1 / H1) — A 33 MiB sparse file via `Buffer.alloc(33 * ONE_MIB + 1)` + `writeFileSync` runs in <100ms. No need to mock `fs.stat` or use `fs.truncate`. The on-disk fixture is closer to the production vector (real user-uploaded files) and runs fast enough for `pnpm vitest run` to stay sub-60s.

4. **`launcher-stale-closure-on-re-fire-with-multi-source-of-truth`** (T2 / H3, plan drift promoted to VALIDATED) — A `useCallback` closure capturing `state.lastOdxPath` will silently shadow a new `activeDocumentPath` if the user has switched docs between the success-state render and the re-fire. The fix: a ref-mirror of the captured path with a doc-switch resolution rule aligned to the pre-existing `isActiveOdx` shortcut contract. The pre-existing `state` copy stays for potential UI affordances; only the re-fire arg path uses the ref.

5. **`validate-throw-must-mirror`** (T3 / M1) — A `validateX` helper that returns `ScriptError | null` and is thrown by the caller must follow the existing `validateShortName` pattern exactly. Pre-fix the brief showed `validateName` returning `string | null` and the handler returning `{ kind: 'invalid-name', message }`. Staying consistent with the existing throw-pattern means the renderer's `try/catch` surfaces `e.message` as a string — no consumer changes needed.

6. **`clamp-number-to-bounded-range-must-coerce-nan`** (T3.5 / M2 supersedes) — `Math.max(MIN, Math.min(NaN, MAX))` returns `NaN` (because `Math.min(NaN, anything)` propagates NaN). The clamp must be wrapped in `Number.isFinite(value) && value > 0 ? clamp : SAFE_FALLBACK`. Non-finite and non-positive values short-circuit to the fallback before V8's `setTimeout` sees the NaN (which V8 coerces to `0` — same wedge vector the clamp was trying to close).

7. **`manifest-error-discriminated-union`** (T3 / M3) — `ManifestError` is a 5-variant discriminated union where some variants carry `message` and others carry structured data (`expected` / `found` / `field` / `path` / `reason`). The probe failure path must JSON-stringify the full error so the user sees all context regardless of variant. A `string | null` failure surface would silently lose the structured fields.

8. **`push-after-side-effect-payload`** (T3 / L1) — A push event that announces a side effect (XLSX_IMPORT_COMPLETE) must fire AFTER the side effect resolves and carry a `persisted: boolean` (or equivalent success/failure field) so the listener can surface a warning when persistence failed. Pre-fix: the push was broadcast first, persist second, and persistence failure was silent. The push payload must be honest about the side effect's actual outcome.

9. **`vi-hoisted-required`** (T3 / L1 test infrastructure) — When a test needs to share a mutable counter between a `vi.mock` factory (hoisted above regular declarations) and the test body, `vi.hoisted` is the only correct primitive. Regular `vi.fn` references inside `vi.mock` factories cannot be accessed from the test body because `vi.mock` is hoisted above regular declarations. The save mock is installed per-test via `vi.mocked(handler).mockImplementation` so the recording happens inside the same `callLog` array.

10. **`plan-prescribed-ternary-must-be-tested-against-doc-switch-scenario`** (T2 / plan drift, VALIDATED lesson) — A `ref ?? active` ternary that "looks correct" by inspection fails when the ref is only refreshed on the next `open()` success — not on doc switches. The corrected pattern is `isActiveOdx ? active : ref ?? active`. The lesson: when a plan prescribes a literal pattern, the implementer MUST test it against the realistic user flow (here: doc switch between success and re-fire), not just the immediate-success flow.

## Test budget

| Stage | Count | Delta |
|---|---|---|
| v1.39.0 MINOR baseline | 3092 | — |
| T1 (H1+H2+M4) — `sizeCap.ts` helper + 6 picker paths + dcmConfigHandler | +12 | 3104 |
| T2 (H3) — `useDcmConfigLauncher` lastOdxPathRef | +1 | 3105 |
| T3 (M1+M2+M3+L1) — script-handler + projectSaveHandler + xlsxEcucBatchImportHandler | +12 | 3117 |
| T3.5 (M2 NaN guard) — 2 NaN vectors | +2 | 3119 |
| **Plan delta total** | | **+27 net** |
| **Final achieved** | **3119** | **+27 net** |

Verified final count from T3.5's `pnpm exec vitest run`: **3119 + 7
SKIP / 0 fail** (+27 net from v1.39.0's 3092 baseline). Per-task
delta: T1 +12 + T2 +1 + T3 +12 + T3.5 +2 = **+27 net**, matching
exactly.

`tsc --noEmit -p tsconfig.json` and `tsc --noEmit -p tsconfig.web.json`:
both clean (0 errors).

## Behavioural changes summary

| Item | Was | Is |
|------|-----|-----|
| `openDbcHandler` file size limit | unbounded (`fs.readFile`) | 32 MiB cap (helper) |
| `openOdxHandler` file size limit | unbounded | 32 MiB cap (helper) |
| `openOdxWithDefaultHandler` file size limit | unbounded | 32 MiB cap (helper) |
| `bswmdPickHandler` file size limit | unbounded | 32 MiB cap (helper) |
| `OPEN_ARXML` (single) file size limit | unbounded | 32 MiB cap (helper) |
| `OPEN_ARXML_MULTI` per-file size limit | unbounded | 32 MiB cap (helper) |
| `dcmConfigHandler` ODX + BSWMD reads | `fs.readFileSync` x 2, no cap | `await readFileWithCap` x 2, 32 MiB cap each |
| `bswmdReadHandler` inline cap | inlined `32 * 1024 * 1024` | uses `readFileWithCap` (helper exports same value) |
| `useDcmConfigLauncher` re-fire after doc switch | stale `state.lastOdxPath` shadowed new doc | ref-mirror + `isActiveOdx` resolution rule uses new active doc |
| `scriptSaveHandler.name` validation | any string | ≤ 80 chars, no NUL/control, no whitespace-only |
| `scriptRunHandler.timeoutMs` validation | passed through (0/negative = no timeout) | clamped [1000, 60_000] ms (T3) → +NaN guard to 5000ms fallback (T3.5) |
| `projectSaveHandler` tamper detection | write whatever caller hands us | probe `loadManifest(saveManifest(...))` before `writeAtomic` |
| `XLSX_IMPORT_COMPLETE` push ordering | broadcast before persist | fires after persist resolves; carries `persisted: boolean` |

## Known follow-ups (deferred to v1.40.x PATCH chain)

The MINOR surfaced 4 bounded follow-up items:

- **`renderer-side 'too-large' UI affordance` (L2 deferred from T1)**: The `sizeCap.ts` helper exposes `kind: 'too-large'` at its boundary, but the IPC envelope folds it into the existing `read-failed`. If a future feature wants a distinct "file is too large" toast or a "Try a smaller file" hint, the helper discriminator is ready for an additive IPC envelope kind. Out of scope for v1.40.0.

- **`xlsxImportListener` electron mock scope (L3 deferred from T3 L1)**: `xlsxEcucBatchImportHandler.test.ts` now mocks the `electron` module. The `app.getPath` stub returns `/tmp/claude-autosarcfg-test-userdata`. If any other test in the same file triggers a real `xlsxHistorySave` call (instead of mocking it), the test will write to a real `/tmp` JSON file. The risk is the same as the existing test structure (which also doesn't clean up that path); a future PATCH should isolate the userData path per-test or clean up on teardown.

- **`scriptRunHandler.timeoutMs` is unreachable in production today (L4 deferred from T3 M2)**: The renderer sends a number from a slider bounded in the UI, so the `Number.NaN` / `parseInt('not-a-number')` vectors are reachable only via a tampered preload bridge. The T3.5 fix is defense-in-depth, not user-facing. A future PATCH may add a preload-side guard to fail-fast before the IPC call rather than relying on the main-side clamp.

- **`plan-prescribed-ternary-must-be-tested-against-doc-switch-scenario` precedent (N1 deferred from T2)**: The brief's literal `ref ?? active` pattern was tested by the implementer before landing and corrected in-flight. Future plan briefs that prescribe literal ref/state patterns should include "and test it against the realistic user flow" as an explicit acceptance criterion, not just "verify the immediate-success path works."

## Reverse-Closes

- Round-1 deep code review **H1**: "picker paths lack 32 MiB size cap (per-surface application of `bswmdReadHandler`'s inlined cap)"
- Round-1 deep code review **H2**: "`dcmConfigHandler` 2x `fs.readFileSync` with no cap (OOM vector)"
- Round-1 deep code review **H3**: "`useDcmConfigLauncher.handleGenerateNew` stale-closure on doc-switch re-fire"
- Round-1 deep code review **M1**: "`scriptSaveHandler` name validation missing (tampered preload could smuggle 1-MB string)"
- Round-1 deep code review **M2**: "`scriptRunHandler.timeoutMs` clamp missing (0/negative = V8 'no timeout' wedge)"
- Round-1 deep code review **M3**: "`projectSaveHandler` lacks manifest shape probe (tampered payload could persist corrupt file)"
- Round-1 deep code review **M4**: "`OPEN_ARXML_MULTI` per-file size cap missing"
- Round-1 deep code review **L1**: "`XLSX_IMPORT_COMPLETE` push fires before persist (silent corruption on persist failure)"
- Round-1 deep code review **M2-supersede**: "NaN silent-propagation in M2 clamp (caught by T3 implementer)"
- Round-1 deep code review **L2 / L3 / L4**: deferred to v1.40.x PATCH (see Known Follow-ups)

(Note: items above are the Round-1 deep code review's 8 actionable
findings + 1 supersede + 3 deferred = 12 total. 9 of 12 closed in this
MINOR, 3 deferred to PATCH.)

## Cross-references

- [v1.39.0 release notes](../v1.39.0/README.md) (parent MINOR)
- [v1.40.0 implementation plan](../../superpowers/plans/2026-07-09-v1-40-0-minor-ipc-size-cap-parity-and-launcher-stale-closure.md)
- [v1.40.0 implementation spec](../../superpowers/specs/2026-07-09-v1-40-0-minor-ipc-size-cap-parity-and-launcher-stale-closure.md)
- `.git/sdd/progress-v1.40.0.md` (local progress ledger — T5 ship)
- `.git/sdd/task-1-report.md` (T1 size-cap helper + picker parity)
- `.git/sdd/task-2-report.md` (T2 useDcmConfigLauncher lastOdxPathRef)
- `.git/sdd/task-3-v1.40.0-report.md` (T3 M1+M2+M3+L1 validators + race polish)
- `.git/sdd/task-3.5-report.md` (T3.5 M2 NaN guard)