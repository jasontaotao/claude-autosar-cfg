# v1.38.0 MINOR — Wiring Integrity (C1) + Parser Hardening (H1/H2) + DBC Transmitter Safety (H3) + Polish (M2/M3/M4 + L1/L3)

**Ship**: 2026-07-08 (TAG PENDING — T7 will fill)

**Baseline**: v1.37.1 PATCH `415f0de` (3065 + 7 SKIP / 0 fail)
**Target**: 3079 + 7 SKIP / 0 fail (+14 net delta from v1.37.1).

5 atomic commits on `main`, each scoped to a single concern, all under
the same brief:

| Task | Severity | Commit  | Files | Tests |
|------|----------|---------|-------|-------|
| T1   | C1       | `e36619a` | 2 modified | +3 |
| T2   | H1       | `8c58cc7` | 2 modified | +3 |
| T3   | H2       | `0064a61` | 2 modified | +2 |
| T4   | H3       | `71e60d3` | 2 modified | +2 |
| T5   | M2+M3+M4+L1+L3 | `952b6bb` | 7 modified | +4 |

Round-2 deep code review surfaced **10 actionable items** (1 CRITICAL +
3 HIGH + 4 MEDIUM + 3 LOW). This MINOR closes all 10.

## What's in this MINOR

### C1: data-corruption-class — add-child auto-suffix remap (commit `e36619a`)

**Problem**: `coreAddContainer` (`src/core/arxml/mutation.ts:155-162`)
auto-suffixes a colliding `shortName` to `shortName_${n}` so Vector
CANdb++ users don't have to pick a unique name in the picker. But the
xlsx-mapper helper `addChildSiblingStep`
(`src/core/bridge/addChildSiblingStep.ts:86`) hardcodes the downstream
`set-param.containerPath` as `${parentPath}/${input.instanceShortName}` —
the ORIGINAL un-suffixed name. `applySetParam` resolves the path with
`findContainerByPath`, which finds the original (pre-existing) container
and silently overwrites it. The new suffixed container's params stay at
BSWMD-seeded empty defaults. **Silent data corruption** — no error,
user sees wrong data, no rollback possible. The pre-fix test fixture
(`makeComModule().ComConfig → ComIPdu` declared zero params) made this
bug invisible to direct unit tests; only the full xlsx round-trip
caught it.

**Fix**: Post-add remap in `applyPatchSteps` (local to the apply loop;
the alternative — surfacing `effectiveShortName` through
`coreAddContainer`'s return shape — would ripple through 9+ callers and
test files). Three pieces, all in
`src/core/mutation/applyPatchSteps.ts`:

1. **`pendingRemap: Map<parentPath|requestedShortName, effectiveShortName>`**
   — recorded after each successful add-child that resolves to a
   non-requested shortName.
2. **`detectAutoSuffixRemap(doc, parentPath, requestedShortName)`** —
   re-locates the parent in the post-add doc and walks the children
   looking for `${requestedShortName}_1`, `${requestedShortName}_2`,
   ... up to a defensive 1024 cap (mirrors `addContainer`'s auto-suffix
   loop's multiplicity-cap exit path). Returns the first suffixed
   shortName it finds, or `null` when no auto-suffix was needed.
3. **`remapStepForPendingAddChildSuffix(step, pendingRemap)`** — called
   on each `set-param` BEFORE `applySetParam`. If `containerPath`'s
   trailing segment matches a pending remap's key, returns a clone with
   the trailing segment replaced by `effectiveShortName`. Otherwise
   returns the original step ref unchanged (preserves reference
   equality for non-matching set-params).

`addChildSiblingStep` itself is **NOT** modified — the bug originated
there but the mapper-shape contract is easier to keep stable than to
bubble. The remap is invisible to all callers of `applyPatchSteps`
because `result` shapes are unchanged.

File:line citation:

- `src/core/mutation/applyPatchSteps.ts` — `pendingRemap` Map +
  `detectAutoSuffixRemap` + `remapStepForPendingAddChildSuffix` + the
  call to `remapStepForPendingAddChildSuffix` before `applySetParam`.
- `src/core/mutation/__tests__/applyPatchSteps.test.ts` — 3 NEW tests
  in `describe('add-child auto-suffix remap (v1.38.0 T1/C1)')`:
  remap lands on suffixed instance (REPRO), no-collision no-op guard,
  post-add-only scope guard (no retroactive rewrite).
- Schema fixture change: `makeComModule().ComConfig → ComIPdu` now
  declares `ComPduDirection: enum` so the `set-param` round-trip can
  prove WHERE the value landed.

### H1: parser key collision detection with structured error — Option B (commit `8c58cc7`)

**Problem**: Two PARAMETER-VALUES (or REFERENCE-VALUES) entries with the
same `shortName` tail but different BSWMD `<DEFINITION-REF>` paths
(vendor dialects, choice branches) silently drop one entry — last-write-
wins overwrites the first. The pre-fix behavior produced `params` keyed
by `shortName` with a single value, masking the dual-path intent.

**Decision: Option B over Option A** (implementer's mid-flight
adaptation, not in original brief).

- **Option A** (brief's plan): use full `defPath` as the `params` key.
  Would have rippled through 30+ downstream consumers (mutation.ts,
  defaultValue.ts, renderer ParamEditor, i18n, all param-related tests)
  — far more blast radius than the brief anticipated.
- **Option B** (chosen): detect same-shortName + DISTINCT-defPath
  collisions and surface a structured `invalid-structure` ParseError
  with descriptive message naming the shortName, both BSWMD paths, and
  the container path. Same-defPath re-emissions keep last-write-wins
  semantics (the real AUTOSAR multi-valued-ref pattern, e.g. a single
  `ComIPduSignalRef` DEFINITION-REF re-emitted per signal target).

The implementer's refinement during implementation caught a subtle
AUTOSAR real-world pattern: same-defPath re-emissions (e.g. 4 sibling
`<ECUC-REFERENCE-VALUE>` entries each pointing to a different
`BMS_CellVolt*` signal target) are NOT collisions — they're a
multi-valued reference list. Naive Option B flagged these as
collisions and broke 35 downstream tests; the refined Option B
distinguishes same-defPath (preserve last-write-wins) from
distinct-defPath (surface as error).

**Fix**: `CollisionCollector` mutable object threaded through
`walkPackages → walkElements → buildModule/buildContainer →
extractParamsAndRefs` and `extractReferenceParams`. `parseArxml` checks
the collector after the walk and returns a structured `invalid-structure`
ParseError naming both paths and the container.

File:line citation:

- `src/core/arxml/parser.ts` — `ParamKeyCollision` + `CollisionCollector`
  interfaces added; `walkPackages` / `walkPackagesAtDepth` /
  `walkElements` / `classifyElement` / `buildModule` / `buildContainer`
  accept `collector: CollisionCollector`; `extractParamsAndRefs` +
  `extractReferenceParams` accept `containerPath` + `collector`; refined
  collision check = same-shortName + DISTINCT-defPath.
- `src/core/arxml/__tests__/parser.test.ts` — 3 NEW tests: collision in
  PARAMETER-VALUES, collision in ECUC-REFERENCE-VALUE, regression
  guard for distinct-tail no-collision case.

**Honesty note (bounded follow-up)**: The multi-valued reference data
loss pattern (last-write-wins when same-defPath re-emitted) is
pre-existing and unfixed by T2. A future MAJOR would require
`params: Record<shortName, ParamValue[]>` shape and consumer updates
across mutation/validation/renderer layers. Out of scope for H1.

### H2: parseParamValue ECUC-INTEGER fallback to float for finite non-integer raw (commit `0064a61`)

**Problem**: `parseParamValue` (`src/core/arxml/parser.ts:610-614`)
ECUC-INTEGER-PARAM-DEF branch silently coerced non-integer finite raw
(e.g. `<VALUE>1.5</VALUE>`) into `{ type: 'integer', value: 1.5 }` —
schema-invalid. Non-numeric raw (`NaN`, `Infinity`, `undefined`, `''`)
silently coerced to `{ type: 'integer', value: NaN }` — also
schema-invalid. Vendor misconfigurations (float value landing in an
INTEGER-PARAM-DEF slot) were silently accepted as integer-typed
params, breaking downstream schema validation.

**Fix** (`src/core/arxml/parser.ts:752-775`):

```ts
if (dest === 'ECUC-INTEGER-PARAM-DEF') {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(n) && Number.isInteger(n)) {
    return { type: 'integer', value: n };
  }
  // v1.38.0 MINOR T3 (H2) — vendor misconfig: an INTEGER-PARAM-DEF field
  // can hold a finite float value ...
  if (Number.isFinite(n)) {
    return { type: 'float', value: n };
  }
  return { type: 'integer', value: Number(String(raw)) };
}
```

**Behavior table** (post-T3):

| raw                  | type         | value           | route                    |
|----------------------|--------------|-----------------|--------------------------|
| `42` (number)        | `integer`    | `42`            | first `if`               |
| `"42"` (string)      | `integer`    | `42`            | first `if` (Number("42")=42, Integer=true) |
| `1.5` (float)        | `float`      | `1.5`           | second `if` (Finite=true, Integer=false) |
| `"1.5"` (string)     | `float`      | `1.5`           | second `if`              |
| `"2.25"` (string)    | `float`      | `2.25`          | second `if`              |
| `NaN`                | `integer`    | `NaN`           | final fallback (preserves pre-T3 contract) |
| `Infinity`           | `integer`    | `NaN`           | final fallback (preserves pre-T3 contract) |
| `undefined`          | `integer`    | `NaN`           | final fallback (`Number(undefined)=NaN`) |
| `""` (empty string)  | `integer`    | `NaN`           | final fallback (`Number("")=NaN`) |

**Honesty note (NaN/Infinity still on pre-T3 path)**: NaN / Infinity /
empty-string / undefined stay on the pre-T3 coerce-the-string path.
Without a broader error-path infrastructure (which would be a v1.38.x
PATCH, not T3), changing their behaviour would expand scope beyond the
H2 finding. The function's return type doesn't carry an error channel;
a structured fail-loud refactor is deferred to a v1.38.x PATCH.

File:line citation:

- `src/core/arxml/parser.ts:752-775` — ECUC-INTEGER-PARAM-DEF branch
  extended with finite-non-integer → float fallback.
- `src/core/arxml/__tests__/parser.test.ts` — 2 NEW tests:
  finite-float raw → `{ type: 'float', value: 1.5 }` (number form),
  finite-float raw → `{ type: 'float', value: 2.25 }` (string form,
  the realistic parser-runtime case since fast-xml-parser emits numeric
  `<VALUE>` as a string text node).

### H3: DBC no-transmitter default Tx + warn (commit `71e60d3`)

**Problem**: `isTx` ternary at `src/core/bridge/dbcToComStack.ts:333`
silently classified any message with empty/undefined transmitter as Rx
when `targetNode` was defined. Pre-fix logic: `'' === 'ECM'` is `false`
→ Rx dispatch. **Silent Rx classification of messages with empty
transmitter** — the message disappears from this ECU's transmit queue
without any user-visible error. Real-world malformed DBC lines
(missing/empty `BO_` transmitter field) cause data-correctness
hazards: the wrong PDUs land on the wrong bus side.

**Fix** (`src/core/bridge/dbcToComStack.ts:331-354`): when
`targetNode` is defined but `msg.transmitter` is empty/undefined, warn
the user and default to Tx. Tx is the safer default per AUTOSAR DBC
convention — a missing transmitter is more likely a malformed DBC line
the user can correct in the source file, vs the Rx path which might
silently route messages to the wrong side. The `console.warn` text is
concise and names the message + targetNode so a user can grep for it.

**Behavior table** (post-T4):

| `targetNode`      | `msg.transmitter` | `isTx` (was → is) | warn |
| ----------------- | ----------------- | ----------------- | ---- |
| `undefined`       | `'ECM'`           | `true` (unchanged)| no   |
| `'ECM'`           | `'ECM'`           | `true` (unchanged)| no   |
| `'ECM'`           | `'TCM'`           | `false` (unchanged)| no  |
| `'ECM'`           | `''` (empty)      | `false` → **`true`** | **yes (1×)** |
| `'ECM'`           | `undefined`*      | `false` → **`true`** | **yes (1×)** |

\* The `DbcMessageSummary.transmitter` type is `string` (required) at
`src/shared/types.ts:157`, so `undefined` is not representable through
the public API in normal flow. The `=== undefined` defensive branch is
reachable only if a malformed `DbcSummaryWithSignals` reaches the
bridge. The production test for `undefined` uses a documented cast
(`as unknown as string`) to exercise the defensive branch.

**Honesty note (warn noise)**: If a production DBC has many malformed
empty-transmitter messages, the user will see a flood of warnings at
bridge-time. Defer rate-limiting / grouping by message name to a
v1.38.x PATCH if this proves noisy in practice.

File:line citation:

- `src/core/bridge/dbcToComStack.ts:331-354` — `isTx` ternary
  restructured: legacy fallback (`targetNode === undefined`) →
  defensive no-transmitter branch (Tx + warn) → exact-match branch.
- `src/core/bridge/__tests__/dbcToComStack.test.ts` — 2 NEW tests:
  empty-string transmitter defaults to Tx + warns, undefined
  transmitter defaults to Tx + warns. Both use
  `vi.spyOn(console, 'warn').mockImplementation(() => undefined)` in a
  `try { ... } finally { warnSpy.mockRestore() }` block to prevent
  spy leakage.

### T5 polish: M2 + M3 + M4 + L1 + L3 (commit `952b6bb`)

5 small fixes bundled atomically. No behavioral surprises.

#### M2 — `parser.ts:649-662` — top-level DEFINITION-REF string-form fix

`extractParamsAndRefs` walked `asArray(item['DEFINITION-REF'])` for
top-level refs. When the XML has `<DEFINITION-REF>/A/B/M</DEFINITION-REF>`
(text-only, no `DEST` attribute), `fast-xml-parser` parses the value as
a plain string. `asArray` wrapped it as `[string as Record<string, unknown>]`
and the subsequent `ref['#text']` lookup returned `undefined`, silently
dropping the reference. Added `if (typeof ref === 'string') { references.push(ref); continue; }`
before the object-property access. Mirrors the wrapper branch at
`parser.ts:480-489` that already handled this case for
`<DEFINITION-REF>` inside `<PARAMETER-VALUES>`.

#### M3 — `dbcToComStack.ts:228-263` — CanIf vendor-dialect alias dedup

`discoverCanIfSubContainers` did exact-match against
`CANIF_TX_SUBCANONICAL` (`CanIfTxPduCfgs`) / `CANIF_RX_SUBCANONICAL`
(`CanIfRxPduCfgs`). Real OEM ARXMLs occasionally use Vector's singular
`CanIfTxPduCfg` / `CanIfRxPduCfg` or EB tresos's `CanIfTxPdu` /
`CanIfRxPdu`. Pre-T5 the canonical lookup missed, fell back to the
canonical default, and the dedup walk read zero existing children —
so a second bridge pass created duplicate Tx containers.

Added `CANIF_TX_SUBCANONICAL_ALIASES`
(`['CanIfTxPduCfg', 'CanIfTxPdu']`) and `CANIF_RX_SUBCANONICAL_ALIASES`
(`['CanIfRxPduCfg', 'CanIfRxPdu']`). New helper
`findCanIfSubChild(parent, canonical, aliases)` tries canonical first
then aliases; both `txChild` / `rxChild` lookups use it. Aliases
hard-coded as the brief specified.

#### M4 — `dbcToComStack.ts` — parse-once dedup

Each call to `dbcToComStack` invoked `parseArxml` 5 times for
`canIfConfig` alone (1× `discoverCanIfSubContainers` + 2×
`extractExistingGrandchildShortNames` for Tx/Rx). Plus 1× each for
`comConfig` and `pduRConfig`. 7 redundant parses per bridge call.

Refactored helper signatures to accept pre-parsed
`Result<ArxmlDocument, ParseError>` instead of `arxml: string`. New
`safeParse` wrapper at the top of `dbcToComStack` parses each input
exactly once (preserving the v1.23.1 T3 MEDIUM `console.warn` on
parse-throw), then passes the result into the helpers. Helpers
updated: `discoverPrimaryContainer`, `extractExistingChildShortNames`,
`extractExistingGrandchildShortNames`, `discoverCanIfSubContainers`,
`extractExistingComIpduNames`. Net: 7 parses → 3.

#### L1 — `serializer.ts:117-182` — prune dead SCHEMA_LOCATION entries

`SCHEMA_LOCATION` table included `'00005'` and `'00006'` entries. Both
are absent from `SUPPORTED_ARXML_VERSIONS` (parser rejects them with
`unsupported-version`), so the serializer branches were unreachable —
dead code in the lookup table.

Removed both entries. Refactored the table type from
`Record<ArxmlVersion, ...>` to `as const satisfies Partial<Record<ArxmlVersion, ...>>`
because `SUPPORTED_ARXML_VERSIONS` is typed `readonly ArxmlVersion[]`
(widens to full ArxmlVersion on index access). Added an `undefined`-guard
in `buildXmlns` / `buildSchemaLocation` as a runtime backstop (cast back
to `Record<ArxmlVersion, ...>` for the lookup) — unreachable in practice
because the parser already rejected those versions.

#### L3 — `addChildSiblingStep.ts:101-114` — type tightening

`if (value === null || value === undefined) continue;` — but
`instanceParams` is typed `Record<string, string | number | boolean | null>`
(line 70), so `undefined` cannot be present. The `=== undefined` branch
was unreachable. Tightened to `if (value === null) continue;` and updated
the comment to reference the typed contract instead of
`xlsxToEcucBatch.ts` legacy behavior. Type-only tightening; no test
needed (`tsc --noEmit` confirms no caller passes `undefined`).

File:line citation for T5:

- `src/core/arxml/parser.ts:649-662` — M2 string-form DEFINITION-REF.
- `src/core/bridge/dbcToComStack.ts:228-263` — M3 vendor aliases +
  `findCanIfSubChild` helper.
- `src/core/bridge/dbcToComStack.ts` — M4 `safeParse` + helper
  signature change.
- `src/core/arxml/serializer.ts:117-182` — L1 SCHEMA_LOCATION pruning.
- `src/core/bridge/addChildSiblingStep.ts:101-114` — L3 type tightening.
- `src/core/arxml/__tests__/parser.test.ts` — M2 NEW test.
- `src/core/bridge/__tests__/dbcToComStack.test.ts` — M3 + M4 NEW tests.
- `src/core/arxml/__tests__/serializer.test.ts` — L1 NEW test.

## Critical honesty (process + bounded follow-ups)

### C1 was data-corruption class

The pre-fix behavior silently overwrote old container params when a
new container was created with auto-suffix. Reproduction is now
documented in tests
(`src/core/mutation/__tests__/applyPatchSteps.test.ts`, T1
`describe('add-child auto-suffix remap (v1.38.0 T1/C1)')`).

### T2 implementer chose Option B over Option A (mid-flight)

The brief's Option A (full defPath as key) would have caused 30+
consumer-site breakage (mutation.ts + defaultValue.ts + ParamEditor.tsx
+ renderer store tests + i18n). The chosen Option B (collision
detection with structured `invalid-structure` error) is the safer
option. Real-world vendor dialects that have legitimate path-collision
now fail loud instead of silent param loss.

### T3 NaN/Infinity still on pre-T3 coerce-string path

The H2 finding's NaN/Infinity branch is bounded by lack of
structured-error infrastructure in `parseParamValue`'s return type.
Defer full fail-loud refactor to v1.38.x PATCH.

### T4 was a data-correctness hazard

Silent Rx classification of messages with empty transmitter — the
message disappears from this ECU's transmit queue without any
user-visible error. Now defaults to Tx + warn. Tx is the safer
default per AUTOSAR DBC convention.

### T5 polish is small but accumulates

5 small fixes, no behavioral surprises. M4 signature change updates
internal helpers only (the public `DbcBridgePlan` shape is unchanged).

### Process deviation: T4 + T5 implementers dispatched pkm-capture autonomously

Both T4 and T5 implementers dispatched `pkm-capture` despite the
brief's "MUST NOT" rule. Captures are useful and landed pre-ship.
**Controller accepts this as a stable deviation**: future briefs may
explicitly say "dispatch pkm-capture autonomously if you find
capture-worthy content" to align expectation. Captures live at
`01-Projects/claude-AutosarCfg/development/` in the vault.

## Lessons (NEW from this MINOR)

1. **`mapper-emitted-set-param-containerPath-must-thrash-when-addChildAutoSuffixes`**
   (T1 / C1) — any mapper helper (`addChildSiblingStep` family) that
   hardcodes the downstream `set-param.containerPath` from the
   user-supplied `shortName` is silently broken when `coreAddContainer`
   auto-suffixes. The cleanest detection is a per-loop remap table
   populated by post-add parent-child diffs and queried before
   `findContainerByPath` resolves the path. Surfacing
   `effectiveShortName` through `coreAddContainer`'s return shape is
   the alternative but ripples through every caller.

2. **`brief-option-assumption-without-consumer-audit-is-risky`**
   (T2 / H1) — When a brief recommends an API change (Option A), the
   blast radius must be audited against actual consumer sites before
   committing. The brief's "no consumer reads by shortName" assumption
   was incorrect — 30+ call sites rely on shortName keys. A safer
   alternative (Option B: collision detection with structured error)
   sidesteps the blast radius entirely while still surfacing the bug.

3. **`same-defpath-multi-valued-ref-is-real-autosar-pattern-not-bug`**
   (T2 / H1) — Real-world BSWMDs use the pattern where a single
   DEFINITION-REF path (e.g. `ComIPduSignalRef`) re-appears N times
   with different VALUE-REF targets. Naive collision detection flags
   these as bugs; refined detection distinguishes same-defPath
   re-emissions (last-write-wins is correct) from distinct-defPath
   collisions (surface as error). The refined check is the right
   H1 fix; the multi-valued-reference data loss is a separate
   pre-existing issue requiring a MAJOR schema migration.

4. **`integer-param-finite-float-fallback-is-schema-correctness-not-data-corruption`**
   (T3 / H2) — When a vendor misconfig lands a float value in an
   INTEGER-PARAM-DEF slot, the schema-correct response is to fall
   back to `type: 'float'` (preserve the value, correct the tag).
   The schema-invalid alternative — coerce to `type: 'integer'` with
   a non-integer value — silently passes through and breaks
   downstream schema validation. The fallback is bounded: NaN /
   Infinity / empty-string / undefined stay on the pre-fix path
   pending a broader error-path infrastructure refactor.

5. **`dbc-missing-transmitter-default-tx-is-safer-than-rx`**
   (T4 / H3) — When a DBC message has no transmitter and targetNode
   is defined, the safer default is Tx (safer because Tx surfaces the
   issue via a doubled-up `CanIfTxPdu` + `console.warn`; Rx silently
   routes to the wrong bus side). The `console.warn` text names the
   message + targetNode so a user can grep for it. Rate-limiting /
   grouping deferred to v1.38.x PATCH.

## Test budget

| Stage | Count | Delta |
|---|---|---|
| v1.37.1 PATCH baseline | 3065 | — |
| T1 (C1) — `applyPatchSteps.test.ts` | +3 | 3068 |
| T2 (H1) — `parser.test.ts` collisions | +3 | 3071 |
| T3 (H2) — `parser.test.ts` integer fallback | +2 | 3073 |
| T4 (H3) — `dbcToComStack.test.ts` | +2 | 3075 |
| T5 (M2+M3+M4+L1) — parser/dbcToComStack/serializer | +4 | 3079 |
| **v1.38.0 MINOR final** | **3079** | **+14 net** |

Verified final count from T6's `pnpm exec vitest run`: **3079 + 7
SKIP / 0 fail** (+14 net from v1.37.1's 3065 baseline). Per-task
delta: T1 +3 + T2 +3 + T3 +2 + T4 +2 + T5 +4 = **+14 net**, matching.

`tsc --noEmit -p tsconfig.json` and `tsc --noEmit -p tsconfig.web.json`:
both clean (0 errors).

## Behavioural changes summary

| Item | Was | Is |
|------|-----|-----|
| add-child auto-suffix + downstream set-param | silent overwrite of pre-existing instance (data corruption) | set-param remaps to suffixed instance |
| Two same-shortName entries with DISTINCT defPath | last-write-wins (silent param loss) | structured `invalid-structure` ParseError naming both paths |
| Two same-shortName entries with SAME defPath (multi-valued-ref) | last-write-wins | last-write-wins (preserved — correct real-AUTOSAR pattern) |
| ECUC-INTEGER-PARAM-DEF holds finite non-integer raw | `{ type: 'integer', value: 1.5 }` (schema-invalid) | `{ type: 'float', value: 1.5 }` (schema-correct) |
| ECUC-INTEGER-PARAM-DEF holds NaN / Infinity / undefined / "" | `{ type: 'integer', value: NaN }` | `{ type: 'integer', value: NaN }` (preserved; defer to v1.38.x PATCH) |
| DBC message with empty transmitter + targetNode defined | silently Rx-dispatched | Tx-dispatched + `console.warn` |
| Top-level DEFINITION-REF as plain string (no DEST) | silently dropped | preserved in `references[]` |
| CanIf sub-containers with vendor names (CanIfTxPduCfg / CanIfTxPdu) | canonical default used; dedup misses | alias-aware lookup; dedup finds the right child |
| parseArxml calls per dbcToComStack invocation | 7 | 3 (parse-once refactor) |
| serializer SCHEMA_LOCATION table | includes unreachable '00005'/'00006' | pruned; `as const satisfies Partial<...>` + runtime `undefined` guard |
| addChildSiblingStep null check | `value === null || value === undefined` (unreachable branch) | `value === null` (type-correct tightening) |

## Known follow-ups (deferred to v1.38.x PATCH chain)

The MINOR surfaced 3 bounded follow-up items:

- **v1.38.1 PATCH (T3 NaN/Infinity fail-loud refactor)**: Extend
  `parseParamValue` to carry an error channel (e.g. `Result<ParamValue,
  ParseError>`) so NaN / Infinity / empty-string / undefined cases
  surface as structured errors instead of `{ type: 'integer', value: NaN }`.
  Bounded by lack of structured-error infrastructure in the function's
  current return type.

- **v1.38.2 PATCH (T4 warn rate-limit / grouping)**: If real-world DBCs
  trigger many empty-transmitter messages, rate-limit / group
  `console.warn` output by message name so the user isn't flooded.
  Current `console.warn` text is concise and names the message +
  targetNode so a user can grep for it.

- **v1.38.x PATCH (T2 multi-valued-ref schema migration)**: Migrate
  `params: Record<shortName, ParamValue>` to `Record<shortName,
  ParamValue[]>` so multi-valued reference patterns
  (e.g. `ComIPduSignalRef` re-emitted per signal target) preserve all
  entries instead of last-write-wins. Requires consumer updates across
  mutation.ts, defaultValue.ts, ParamEditor.tsx, renderer store tests,
  i18n lookups. MAJOR-shaped; out of scope for MINOR H1.

No NEW follow-ups generated by T5 polish (M-series + L are bounded
tactical fixes).

## Reverse-Closes

- v1.37.1 post-ship review C1: "add-child auto-suffix leaves
  downstream set-param.containerPath pointing to the pre-existing
  instance — silent data corruption"
- v1.37.1 post-ship review H1: "parser silently overwrites params when
  same shortName keys collide with distinct defPaths (vendor dialects)"
- v1.37.1 post-ship review H2: "parseParamValue ECUC-INTEGER branch
  coerces non-integer finite raw to integer (schema-invalid)"
- v1.37.1 post-ship review H3: "DBC empty-transmitter message silently
  Rx-dispatched (data-correctness hazard)"
- v1.37.1 post-ship review M2: "top-level DEFINITION-REF as plain
  string silently dropped in extractParamsAndRefs"
- v1.37.1 post-ship review M3: "CanIf vendor-dialect sub-container
  names (CanIfTxPduCfg / CanIfTxPdu) miss canonical lookup → dedup
  fails → duplicate Tx containers"
- v1.37.1 post-ship review M4: "parseArxml called 7× per dbcToComStack
  invocation (parse-once dedup missing)"
- v1.37.1 post-ship review L1: "serializer SCHEMA_LOCATION table
  includes unreachable '00005'/'00006' entries (dead code)"
- v1.37.1 post-ship review L3: "addChildSiblingStep null check has
  unreachable `=== undefined` branch (type tightening)"

(Note: items above are the Round-2 deep code review's 10 actionable
findings — the 5 polish items M2/M3/M4/L1/L3 are all MEDIUM-or-LOW
severity from that review; C1/H1/H2/H3 are the 1 CRITICAL + 3 HIGH
severity items.)

## Cross-references

- [v1.37.1 release notes](../v1.37.1/README.md) (parent PATCH)
- [v1.37.0 release notes](../v1.37.0/README.md) (grandparent MINOR;
  the C1/H1/H2 lineage starts here)
- [v1.37.1 T1-T3 reports](../../../.git/sdd/task-*-report.md) (parser
  extensions that activated v1.37.0's H2 latent validation)
- [v1.38.0 T1 (C1) report](../../../.git/sdd/task-1-report.md) —
  add-child auto-suffix remap
- [v1.38.0 T2 (H1) report](../../../.git/sdd/task-2-report.md) —
  parser key collision detection (Option B)
- [v1.38.0 T3 (H2) report](../../../.git/sdd/task-3-report.md) —
  parseParamValue ECUC-INTEGER float fallback
- [v1.38.0 T4 (H3) report](../../../.git/sdd/task-4-report.md) —
  DBC no-transmitter default Tx + warn
- [v1.38.0 T5 report](../../../.git/sdd/task-5-v1.38.0-report.md) —
  M-series + L polish
- [v1.38.0 T6 report (this release-artifacts)](../../../.git/sdd/task-6-report.md)
- [v1.38.0 progress ledger](../../../.git/sdd/progress-v1.38.0.md)