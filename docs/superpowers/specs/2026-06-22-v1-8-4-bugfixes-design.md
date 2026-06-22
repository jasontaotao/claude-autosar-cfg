# v1.8.4 Bugfixes — Design Spec

> **Date**: 2026-06-22
> **Target**: v1.8.4 PATCH (after v1.8.3 SHIPPED)
> **Scope**: 3 HIGH/MEDIUM correctness bugs. Defer 2 optimization items.
> **Authoritative verification**: code at `c47b546`..`f36648b` (v1.8.3 SHIPPED)

## Background

Three bugs verified against the current `main` branch (v1.8.3). All have
clear root causes; no architectural change required. The two remaining
items (Opt 1 = Tree single-module package layer UX; Opt 2 = cross-version
BSWMD collision policy) are deferred to a future brainstorm sprint per
their scope (renderer change + design-level schema-layer change).

## Bug 1 — `generateEcucSkeleton` hardcodes `version: '4.6'`

### Symptom

`src/core/arxml/skeleton.ts:88` returns `version: '4.6'` for **every**
generated ECUC skeleton, regardless of the source `BswmdDocument`'s
declared version. A BSWMD with `xmlns=".../schema/r5.0"` or
`.../schema/00051` produces a skeleton written with the r4.6 namespace +
`AUTOSAR_4-6-0.xsd` `schemaLocation`, which is invalid for the source.

### Root cause

`generateEcucSkeleton(doc: BswmdDocument, moduleShortName: string)` reads
`doc.modules.find(...)` and `mod.shortName` but **never reads
`doc.version`**. The literal `'4.6'` is the original v1.5.1 implementation
choice (when only r4.6 fixtures existed); subsequent r4.2/r4.4/r4.7/r5.0
support in the BSWMD parser (v1.5.x) was never wired through to the
skeleton factory.

### Fix

1. **Add a typed version mapping helper** at
   `src/core/arxml/version.ts` (new file):

   ```ts
   export function mapBswmdVersionToArxml(v: string): ArxmlVersion | null;
   ```

   Maps the BSWMD accept set (`'4.0' | '4.2' | '4.4' | '4.6' | '4.7' |
'5.0' | '00005' | '00006' | '00046' | '00051'`) to the ARXML emit
   set (`ArxmlVersion`). The two sets overlap but are not identical:

   | BSWMD `doc.version` | ARXML `ArxmlVersion`                      | Notes                                          |
   | ------------------- | ----------------------------------------- | ---------------------------------------------- |
   | `'4.0'`             | `'4.2'` (closest supported, with warning) | BSWMD allows 4.0; ARXML serializer doesn't yet |
   | `'4.2'`             | `'4.2'`                                   | exact match                                    |
   | `'4.4'`             | `'4.4'`                                   | exact match                                    |
   | `'4.6'`             | `'4.6'`                                   | exact match                                    |
   | `'4.7'`             | `'4.7'`                                   | exact match                                    |
   | `'5.0'`             | `'5.0'`                                   | exact match                                    |
   | `'00005'`           | `'00005'`                                 | numeric form, R5.0                             |
   | `'00006'`           | `'00006'`                                 | numeric form, R6.0                             |
   | `'00046'`           | `'00046'`                                 | numeric form, R4.6                             |
   | `'00051'`           | `'00051'`                                 | numeric form, R22-11                           |

   `'4.0'` is the only BSWMD value without a direct ARXML match.
   Strategy: fall back to `'4.2'` (closest supported minor) and emit a
   `BswmdWarning` (the same warning kind the parser already uses for
   `<MULTIPLICITY-CONFIG-CLASSES>` etc.) so the user knows the skeleton
   was generated at a different minor than the BSWMD declared.

2. **Replace the literal** in `skeleton.ts:88`:

   ```ts
   const arxmlVersion = mapBswmdVersionToArxml(doc.version);
   if (arxmlVersion === null) {
     throw new Error(
       `BSWMD document version "${doc.version}" is not representable ` +
       `in any supported ARXML schema (skeleton generation refused).`
     );
   }
   return {
     path: '',
     version: arxmlVersion,
     packages: [...],
   };
   ```

3. **Plumb the warning** for the `'4.0'` fallback case so the caller can
   surface it in the BSWMD toast. The current `generateEcucSkeleton`
   return type is just `ArxmlDocument`; widen it to
   `{ readonly doc: ArxmlDocument; readonly warnings: readonly BswmdWarning[] }`
   so callers can decide whether to display the warning. Update the
   single caller (currently `App.tsx`'s `onAddEcuc` handler, which
   delegates to `addDocumentWithSource` in `bswmdSlice.ts`) to merge
   the warnings into the existing `state.warnings` channel.

### Affected files

- `src/core/arxml/version.ts` (new, ~30 lines)
- `src/core/arxml/skeleton.ts` (1 line at :88 + return-type widening)
- `src/core/arxml/__tests__/skeleton-version.test.ts` (new, ≥6 cases:
  4.0/4.2/4.4/4.6/4.7/5.0 + numeric-form equivalence + 4.0 fallback
  warning)
- One caller path through `addDocumentWithSource` in
  `src/renderer/store/slices/bswmdSlice.ts:442-445` (forward warnings
  into `state.warnings` on commit)
- `src/shared/i18n.ts:1559` add `'ecuc.warning.bswmdVersionFallback':
'BSWMD is r4.0; skeleton generated at r4.2 (closest supported).'`
  (zh-CN + en-US)

### Acceptance gates

- `pnpm exec vitest run src/core/arxml/__tests__/skeleton-version.test.ts`
  passes all cases.
- Existing `bug2-skeleton-roundtrip.test.ts` still passes (round-trip
  r4.6 unchanged).
- Existing `mutation.test.ts` and `round-trip-mutation.test.ts` still
  pass (no change to mutation paths).
- Manual smoke: load JWQ3399 (r4.x vendor) and
  AUTOSAR_MOD_ECUConfigurationParameters (R21-11/r4.6); confirm each
  skeleton's `<AR-PACKAGE>` root has the matching `xmlns` +
  `xsi:schemaLocation`.
- `pnpm verify` all 7 stages green (same gate as v1.8.3).

## Bug 2 — `addContainer` blocks all multi-instance containers

### Symptom

`src/core/arxml/mutation.ts:143-147` rejects adding a 2nd same-named
container even when `ContainerDef.upperMultiplicity` is `'infinite'`
(or a finite value >1). AUTOSAR ECUC spec allows multiple instances
(e.g. multiple `Pdu` under one `Com`, multiple `DemEventParameter`
under one `DemEventSet`), but the current implementation prevents all
multi-instance scenarios. Step 2 (multiplicity check) is correct for
`'infinite'`; Step 3 (name-conflict check) is overzealous.

### Root cause

Step 3 fires unconditionally on `hasChildWithShortName(parent, shortName)`.
The intent was to disallow `parameter` duplicates (parameters MUST have
unique shortNames within a container), but the same check is applied to
`container` shortNames too — where multi-instance is legal and even
required by some BSWMDs.

The correct disambiguation lives in the BSWMD's
`MULTIPLICITY-CONFIG-CLASSES` element (parsed but unused at this site):
`<UPPER-MULTIPLICITY-INFINITE>true</UPPER-MULTIPLICITY-INFINITE>` or a
finite `upperMultiplicity > 1` permits duplicate shortNames for
containers; the multiplicity check at Step 2 already enforces the
ceiling. Step 3 must **not** apply to containers.

### Fix

1. **Drop the name-conflict guard for containers** in `mutation.ts:145-147`:

   ```ts
   // Step 3 removed. Container shortNames are NOT required to be unique
   // when the parent def permits multi-instance; Step 2's
   // multiplicity-exceeded check already enforces the ceiling. Parameter
   // uniqueness is preserved by `addParameter` (separate code path).
   ```

2. **Generate unique shortNames on collision** in the picker UI so the
   `BswmdPickerDialog` doesn't present a single-row picker that resolves
   to an ambiguous path. The picker currently shows one row per BSWMD
   `AllowedSubElement` (each row carries one `shortName`). When the user
   adds a 2nd instance, the store action needs a stable unique
   shortName.

   Three options for uniqueness:
   - **A. Server-side numeric suffix** (recommended): the core layer
     auto-suffixes when collision is detected during `addContainer`.
     Pattern: `${shortName}_${n}` where `n` starts at `1` and walks up
     until no collision. This matches the Vector CANdb++ default naming
     and requires no UI change. Caveat: the user can't predict the name
     from the picker; they discover it post-add.
   - **B. Inline rename prompt**: picker shows a name input next to the
     shortName; user types a unique name. Higher friction, explicit.
   - **C. Auto + post-add rename affordance**: hybrid — auto-suffix at
     add, then if the user wants to rename they right-click → rename
     (rename UX doesn't exist yet; deferred).

   For v1.8.4 we ship **Option A only**. The unique-name auto-suffix is
   a 5-line change inside `coreAddContainer`:

   ```ts
   // After multiplicity check, before insert.
   const baseShortName = shortName;
   let attempt = 0;
   let effectiveShortName = baseShortName;
   while (hasChildWithShortName(parent, effectiveShortName)) {
     attempt += 1;
     effectiveShortName = `${baseShortName}_${attempt}`;
     // Defensive upper bound to avoid infinite loops on pathologically
     // large existing sibling counts (1M would be enough for any sane
     // project; the BSWMD upper bound is checked at Step 2 anyway).
     if (attempt > 1000) {
       return {
         ok: false,
         error: { kind: 'name-conflict', shortName: baseShortName },
       };
     }
   }
   ```

   The new element is constructed with `effectiveShortName` instead of
   `shortName`. The picker UX is unchanged — user picks a row, the core
   guarantees a unique path.

3. **Add a test** for the suffix loop: add 3 instances of `CanConfigSet`
   (upper=infinite), assert they appear as `CanConfigSet`,
   `CanConfigSet_1`, `CanConfigSet_2` in that order.

### Affected files

- `src/core/arxml/mutation.ts` (~15-line change at Step 3 + suffix loop)
- `src/core/arxml/__tests__/mutation-multi-instance.test.ts` (new, ≥4
  cases: single OK; 2nd adds `_1` suffix; 3rd adds `_2`; finite
  upper=2 → 3rd returns `multiplicity-exceeded` with the suffixed name
  NOT attempted because Step 2 fires first)
- `src/shared/i18n.ts` add `'mutation.error.name-conflict'` body tweak
  (now only fires for pathologically-saturated parents; keep wording)

### Acceptance gates

- New test file passes.
- Existing `mutation.test.ts` and `round-trip-mutation.test.ts` still
  pass.
- Existing name-conflict test (if any) still passes — the 1000-attempt
  upper bound is wide enough that real projects never hit it.
- Manual smoke: open `/Can/CanConfigSet`, right-click → Add container →
  pick `Pdu` (upper=infinite), confirm; add a 2nd `Pdu`, confirm it
  appears as `Pdu_1` with its own sub-tree; add a 3rd, appears as
  `Pdu_2`.

## Bug 3 — `ProjectPanel` chip `📋 N/M` shows BSWMD-enabled count, not ECUC-instantiated count

### Symptom

`src/renderer/components/ProjectPanel.tsx:338-340`:

```tsx
const totalCount = schema !== undefined ? schema.modules.length : 0;
const activeModules = schema !== undefined ? getActiveModules(schema) : [];
const activeCount = activeModules.length;
// ... later renders `{activeCount}/{totalCount}` with title
// `ecuc.fromBswmd.modulesActive` and emoji 📋
```

`getActiveModules(schema)` filters `disabledModules` (BSWMD-side
per-module enable toggle). The chip is rendered next to the "+" button
the user clicks to **create an ECUC from this BSWMD** — so the user
reads "📋 5/5" and infers "5 ECUC docs exist", but in reality zero ECUC
docs may exist; the chip is just saying "5 of 5 BSWMD modules are
enabled".

### Root cause

The chip was added in v1.7.x (Sprint 14) to surface BSWMD-side state.
The intended semantic shifted when Sprint 14 added the "+" button
adjacent to it — the chip became visually adjacent to a creation
control but kept its old semantics.

### Fix

1. **Derive the count from the store's loaded documents** (per the user's
   suggested fix):

   ```tsx
   const documents = useArxmlStore((s) => s.documents);
   const instantiatedCount = useMemo(
     () => documents.filter((d) => d.sourceBswmdPath === bswmdPath).length,
     [documents, bswmdPath],
   );
   const totalCount = schema !== undefined ? schema.modules.length : 0;
   // ... renders `{instantiatedCount}/{totalCount}`
   ```

   `useMemo` keeps the chip from re-rendering the whole ProjectPanel on
   every store update — only when `documents` or `bswmdPath` change.

2. **Update the i18n string** in both `en-US` and `zh-CN` to
   `Modules ({active}/{total} instantiated)` /
   `模块（{active}/{total} 已创建）`. Rename the key from
   `modulesActive` to `modulesInstantiated` so future readers aren't
   misled by the legacy name. (Keep the legacy key as an alias for one
   release so existing translations aren't silently dropped — eslint
   custom check would flag the un-used alias in v1.8.5.)

   Actually — since the legacy key was only consumed in
   `ProjectPanel.tsx:347` (one call site), rename in the same commit
   without the alias. Two files to update: `src/shared/i18n.ts:425` +
   the two locale blocks at lines 959 / 1457.

3. **Update the chip's tooltip** to clarify what "instantiated" means:

   - en-US: `Modules ({active}/{total} instantiated)` (the count is the
     tooltip itself; the chip just shows the badge)
   - Title attr: `t(locale, 'ecuc.fromBswmd.modulesInstantiated', { active, total })`

### Affected files

- `src/renderer/components/ProjectPanel.tsx` (~10 lines: add memoized
  count + render swap + key rename)
- `src/shared/i18n.ts:425` (key rename)
- `src/shared/i18n.ts:959` (en-US string)
- `src/shared/i18n.ts:1457` (zh-CN string)
- `src/renderer/components/__tests__/ProjectPanel.chip-count.test.tsx`
  (new, ≥3 cases: empty store → `0/N`; create one ECUC from BSWMD-A →
  `1/N` for BSWMD-A row; create second from BSWMD-A → `2/N`; chip for
  BSWMD-B still `0/M`)

### Acceptance gates

- New test passes.
- Existing `ProjectPanel.path-normalize.test.tsx` still passes.
- Manual smoke: load one BSWMD (say 3 modules), confirm chips all show
  `0/3`; click "+" → pick one module → Confirm; reload chip shows `1/3`.

## Cross-cutting

### Type changes

- `BswmdDocument.version` (currently `readonly string`) → no change. The
  mapping helper accepts `string` and returns `ArxmlVersion | null`. We
  don't narrow the type because the parser already has a 12-entry string
  union set (BSWMD's `SUPPORTED_VERSIONS`) that overlaps with but is not
  identical to `ArxmlVersion` (10 entries vs 12). Narrowing would
  require touching `parseBswmd` and every consumer; out of scope for this
  PATCH.

### Test isolation

- All 3 bugfix tests live in `__tests__/` next to the production files
  they cover (project convention). No new test infrastructure needed.

### Test count delta

Estimated **+13 tests** (Bug 1: ~7, Bug 2: ~4, Bug 3: ~3). With current
2097 baseline → ~2110 pass + 1 skip.

### Cross-test fixups for `generateEcucSkeleton` return-type widening

Bug 1's signature widening from `ArxmlDocument` to `{ doc, warnings }`
is a breaking change at the call boundary. Existing callers must be
updated in the same commit:

- `src/renderer/store/slices/bswmdSlice.ts:444` (`addDocumentWithSource`)
  destructures `{ doc }` and forwards `warnings` to `state.warnings`.
- `src/core/arxml/__tests__/bug2-skeleton-roundtrip.test.ts` (if it
  calls `generateEcucSkeleton` directly) updates its assertions to
  read `.doc` instead of the raw return value. The plan
  implementation will check and patch as needed.

## Out of scope (deferred)

### Opt 1 — Tree single-module package layer UX (LOW)

`renderPackage` in `src/renderer/components/tree/Tree.tsx:176-239`
unconditionally renders the package as a `TreeNode`. For single-module
ECUC docs (every BSWMD-generated skeleton), the package layer is visual
noise.

Defer to v1.8.5. The fix is renderer-only and small (~30 lines) but
touches user-visible tree layout, which warrants a dedicated spec + a
visual regression test (Playwright snapshot per `web/testing.md` rule).
Bundling into this PATCH would inflate scope and require the visual
regression infrastructure to be set up first.

### Opt 2 — Cross-version BSWMD schema-layer collision (MEDIUM design)

`src/core/validation/runtimeSchema.ts:26-29` explicitly states the
"last-write-wins" collision policy. `buildSchemaLayer` flattens all
loaded BSWMDs into a single map; loading JWQ3399 (r4.x vendor) +
AUTOSAR_MOD_ECUConfigurationParameters (R21-11/r4.6) silently overrides
any shared module paths.

This is a real design defect acknowledged in the source. The fix
requires:

- A per-version schema layer (separate `params`/`containers` maps per
  detected version) OR an explicit provenance map on every entry.
- A UI surface for the user to choose which version wins on conflict
  (modal? toast with action?).
- Updates to all layer consumers: `lookupSchema`,
  `lookupSchemaAcrossModuleRoots`, validator multiplicity checks.

Defer to a dedicated brainstorm sprint. The runtimeSchema.ts:29 comment
already flags this as "Sprint 13+ tracks per-source provenance for
conflict diagnostics" — it's been a roadmap item since Sprint 13 and
deserves its own spec + plan rather than being scoped into a bugfix
PATCH.

## Risk

Low. Three isolated fixes in three different layers (core arxml / core
arxml / renderer). Each fix is gated by a new failing test before the
production change. No cross-cutting type changes; no migration; no new
dependencies.

The biggest residual risk is Bug 2's auto-suffix naming: a user who
expects `Pdu` will see `Pdu_1`. If they add 3, they get `Pdu`,
`Pdu_1`, `Pdu_2`. Document this in the release notes (not in the
spec — release notes are user-facing; spec is developer-facing).

## Rollback

Per-file revert. Each fix is in a separate file (`skeleton.ts`,
`mutation.ts`, `ProjectPanel.tsx`) — `git revert <commit>` on the
release commit removes all three.

## Why PATCH (not MINOR)?

- No new feature
- No API surface change for existing users (the auto-suffix is observable
  but doesn't add a new parameter or config)
- No schema change
- Three focused correctness fixes that are well-bounded by failing tests

## Why not bundle with v1.8.5?

v1.8.5 is currently empty. If we bundle Bug 1+2+3 + Opt 1 into one
release, the changelog conflates "core correctness fixes that need to
ship" with "UX polish that can wait". Splitting keeps the rollback
granularity clean and the release notes honest.
