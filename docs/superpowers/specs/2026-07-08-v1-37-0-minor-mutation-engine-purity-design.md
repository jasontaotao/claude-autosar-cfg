# v1.37.0 MINOR — Mutation Engine Purity + Reference Correctness + BSWMD Module-Level Validation

**Author**: claude-AutosarCfg post-ship review controller
**Date**: 2026-07-08
**Status**: design (awaiting spec self-review + user approval)
**Baseline**: v1.36.1 PATCH `c661a13` (3048 + 7 SKIP / 0 fail)
**Target**: 3053 + 7 SKIP / 0 fail (+5 net: 2 mutation engine tests + 1 idempotent test + 2 BSWMD module-level validation tests)

## Goal

Close the **3 HIGH-severity findings** from the v1.36.1 post-ship core review (single-thread, file:line verified) on `core/arxml/` + `core/mutation/` + `core/project/`:

1. **C1 (CRITICAL → HIGH per reviewer downgrade)** — `setParamInDocument` / `addChildInDocument` / `removeChildInDocument` mutate `doc.packages[].elements[]` in place via `spliceContainer` (setters.ts:212/219). `applyPatchSteps.ts:8-21` documents that mutation semantics require `replaceElement` immutability but the helpers bypass that contract. Today's 2 callsites both guard the throw paths via pre-flight checks, so the contract breach is latent — but the next op / next caller will silently mutate the caller's doc.
2. **H1** — `addReference` idempotent-overwrite branch (mutation.ts:719-726) hard-codes `value: ''` while its comment claims it "carries the user-supplied target path". The function signature accepts no path value; the comment is documentary fraud. Pure-write tests cover the fresh case (value='') but the seeded-then-addReference branch is untested + semantically broken.
3. **H2** — `addParameter` (mutation.ts:554-569) + `addReference` (mutation.ts:690-701) skip their BSWMD validation when `subPath === ''` (module-level container path). The `containerPathToSubPath` helper returns `''` when the container path ends at a module segment, so adding a parameter/reference at module-level injects any shortName without checking the BSWMD declares it. Defence-in-depth breach — a stale `paramDef` could slip through.

**MEDIUM/LOW findings (M1/M3/M4/L1/L2)**: deferred to v1.37.x PATCH chain (separate MINORs by theme: equality semantics, fallback/coercion edge cases).

## Background — current state

**`core/project/setters.ts` — public API (top of file):**

```ts
export function setParamInDocument(doc, containerPath, paramName, newValue): void;
export function addChildInDocument(doc, containerPath, newShortName): void;
export function removeChildInDocument(doc, containerPath, shortName): void;
export function spliceContainer(doc, path, container): void; // ← ALSO EXPORTED, in the same file before the mutation engine grows
```

These three are void-returning. `spliceContainer` mutates `pkg.elements` via `.splice(0, pkg.elements.length, ...)` at line 212 / 219 — confirmed by reviewer file:line citation. The `walk()` helper at setters.ts:60-68 walks `pkg.elements` + `pkg.packages[*].elements` only — it does NOT recurse into deeper-nested packages (setters.ts:73-79). For deeply nested vendor packages (e.g. `/Vendor/Pkg1/Pkg2/Pkg3/SomeModule`), the helpers return `null` / throw path-not-reachable.

**`core/arxml/mutation.ts` — `addReference` (line 690-754) idempotent branch:**

```ts
// Line 719-726 — DOCUMENTED as "carries user-supplied target path"
// but the code hard-codes value: '':
const nextValue: ParamValue =
  refDef.path !== ''
    ? ({ ...existing, value: '', definitionRef: refDef.path } as ParamValue)
    : existing;
```

The `refDef` parameter (input at line 690) has a `.path: string` field but `refDef.path` is only used for `definitionRef`, never for `value`. The function takes no `value` arg. A user who picks a target path (`refDef.path === '/ar_pkg/PduR/PduRBswmd/...'`) gets `value: ''` and `definitionRef: refDef.path` — the comment promised the user-supplied path goes into `value`; it actually goes into `definitionRef`. The downstream renderer that reads `record.value` to display the picked target will see `''` not the picked path.

**`core/arxml/mutation.ts` — module-level sub-path empty branch (line 554-569 + 690-701):**

```ts
// For both addParameter and addReference:
const subPath = containerPathToSubPath(containerPath, moduleDef);
if (subPath === null) return { ok: false, error: { kind: 'path-not-found', ... } };
if (subPath !== '') {
  const parentContainerDef = getContainerDefByPath(moduleDef, subPath);
  if (parentContainerDef === null || !parentContainerDef.parameters.some((p) => p.shortName === paramDef.shortName)) {
    return { ok: false, error: { kind: 'invalid-param-type', ... } };
  }
}
// ELSE: subPath === '' — skip BSWMD validation entirely
```

The comment notes "modules rarely carry parameters" as the justification. But "rarely" ≠ "never":

- AUTOSAR `BswModuleEntry` containers (entries) DO have parameters (like `BswEntryKind`, `BswEntryArType`) and a user might legitimately want to add them to a module entry that is the deepest declared container.
- For multi-vendor modules: a vendor-specific paramDef not in the base BSWMD but in a downstream override should also be rejected.

The clean fix is to look up the parent containerDef at the module level too — for `EcuC` modules in particular, the module's own `parameters[]` array is the right validation target.

## Architecture

### C1 — mutation engine purity (3 helpers → return new doc)

Refactor the 3 void-returning helpers in `core/project/setters.ts` to return `ArxmlDocument` (immutable update pattern that mirrors `core/arxml/mutation.ts`'s `addReference` at line 723-735 which already uses `replaceElement` to build `nextParent` then `replaceElement(doc, pkg, parent, nextParent)` to get a new doc ref):

```ts
// BEFORE:
export function setParamInDocument(doc, containerPath, paramName, newValue): void;

// AFTER (returns new doc, caller's ref unchanged):
export function setParamInDocument(doc, containerPath, paramName, newValue): ArxmlDocument;
```

Caller updates:

- `applyPatchSteps.applySetParam` (applyPatchSteps.ts:243-272) — assign the returned doc + add noChange short-circuit (return early without throwing).
- `applyPatchSteps.applyReplaceOp` (applyPatchSteps.ts:492-... — same pattern).

`spliceContainer` is **demoted** from `export` to internal; tests that imported it directly (`__tests__/setters.test.ts`) must use the now-pure public API. If `spliceContainer` is no longer reachable from tests after the rewrite, the file's `// Internal helper exposed for tests; avoid spreading to the wider API.` comment (line 235) gets the opposite treatment: removed with the export. The `exports: { ... }` testability can be replaced by asserting through the public API (write `setParamInDocument` → observe doc + return value match).

To **eliminate** the in-place `.splice()` calls, the new `spliceContainer` (renamed `replaceContainer`) must use the `findContainerByPath` walk + `replaceElement` pattern from `core/arxml/mutation.ts`. That's a deeper reach into the existing engine — but it's the same primitive `addReference` uses (line 735), so the pattern already exists in this codebase.

To **eliminate** the layered walk + sub-package limitation, `spliceContainer` should be replaced with `findContainerByPath` (already exists at line 56-81) which only walks 2 levels — so we need to add a deeper-walking `findReachableContainerByPath` (or just port `findReachableContainerByPath` from the mutation engine, which already has the recurse-into-subpackages behavior per setters.ts:73-79).

**Decision C1-A: limit the scope of the rewrite.** Do NOT try to also fix the layered-package walk limitation (that's L2 in the review — separate concern). Keep `findContainerByPath` 2-layer, copy the existing pattern, return new doc. The error-throw behavior stays (caller already pre-flights).

### H1 — addReference value parameter

The function signature change:

```ts
// BEFORE:
export function addReference(doc, pkg, parent, containerPath, moduleDef, refDef): MutationResult;
// AFTER:
export function addReference(
  doc,
  pkg,
  parent,
  containerPath,
  moduleDef,
  refDef,
  options?: { value?: string },
): MutationResult;
```

The idempotent branch (line 719-726) uses `options?.value ?? ''` as the new `value`. The fresh-write branch (line 738-753) gets the same treatment. This matches the documentary intent in the existing comment ("carries the user-supplied target path").

**Side callers affected:**

- Renderer side: `useArxmlStore`'s reference-pick flow (need to verify it passes user path; if not, this fix is moot for renderer today — but the function is part of the public API and a future pick path could pass user path through it).
- CLI side: `core/mutation/applyPatchSteps.ts` does NOT call `addReference` directly (it routes through `set-param` op), so no CLI callsite to update.

The patch should also add a test covering the seeded-then-addReference branch passing a non-`''` value — that's the regression-proof for H1.

### H2 — module-level BSWMD validation

For `subPath === ''` (container path is the module itself), the relevant validation is the **module's own** `parameters[]` / `references[]`, NOT a sub-container's. AUTOSAR modules DO have top-level parameters/references (think: `<EcuC>` has `<ModuleId>`, `<VendorId>` parameters; `<PduR>` has `<PduRGeneral>` etc., but `PduR`'s module root itself has `BswImplementation` reference).

The fix:

```ts
if (subPath !== '') {
  // existing path: validate against sub-container def
  const parentContainerDef = getContainerDefByPath(moduleDef, subPath);
  if (parentContainerDef === null || ...) return error;
} else {
  // NEW: validate against module-root def (moduleDef is the module-level)
  if (!moduleDef.parameters.some((p) => p.shortName === paramDef.shortName)) {
    return { ok: false, error: { kind: 'invalid-param-type', ... } };
  }
}
```

Same for `addReference` — check `moduleDef.references.some(r => r.shortName === refDef.shortName)` when `subPath === ''`.

The "rarely" comment gets reworded to "module-level `parameters[]` / `references[]` is the module def's own declarations (rare but present) — validate against those when subPath is empty".

## Components & Files Touched

| Layer | File                                                 | Change                                                                                                                                                                                                                                                                                                                 |
| ----- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| core  | `src/core/project/setters.ts`                        | 3 helpers return `ArxmlDocument` instead of `void`. `spliceContainer` renamed `replaceContainer`, demoted to non-export. Bottom comment about export-for-tests removed. New private helper `replaceContainer(doc, path, container): ArxmlDocument`. `findContainerByPath` retained (2-layer walk stays — L2 separate). |
| core  | `src/core/mutation/applyPatchSteps.ts`               | `applySetParam` + `applyReplaceOp` use returned new doc instead of relying on in-place mutation. `applied` counter unchanged (pre/post value comparison still works). Top comment block (lines 8-21) updated: "All ops immutable, ref-equality safe." remove the "MUST use `applied`" warning.                         |
| core  | `src/core/arxml/mutation.ts`                         | `addReference` signature accepts `options?: { value?: string }`; idempotent + fresh-write branches use the value (default `''` for backward compat). `addParameter` + `addReference` both add `else { moduleDef.parameters.some(...) }` branch when subPath === ''.                                                    |
| core  | `src/core/arxml/__tests__/mutation.test.ts`          | +1 test: seeded-then-addReference with non-empty value. +2 tests: addParameter/addReference at module-level path with declared paramDef passes; with undeclared paramDef returns error.                                                                                                                                |
| core  | `src/core/project/__tests__/setters.test.ts`         | +2 tests: setParamInDocument returns new ref; addChildInDocument returns new ref. The test file's import of `spliceContainer` is removed (or rewired via a tiny re-export; preference is remove and use public API).                                                                                                   |
| docs  | `docs/release-notes/v1.37.0/README.md`               | NEW                                                                                                                                                                                                                                                                                                                    |
| docs  | `CHANGELOG.md`                                       | v1.37.0 row                                                                                                                                                                                                                                                                                                            |
| vault | `01-Projects/claude-AutosarCfg/development/lessons/` | 3 NEW lesson files                                                                                                                                                                                                                                                                                                     |
| vault | `01-Projects/claude-proj2/MEMORY.md`                 | entry                                                                                                                                                                                                                                                                                                                  |

## Data Flow (concrete example — C1 set-param user flow)

**Renderer calls `useArxmlStore.updateParam(...)` which eventually calls:**

```ts
applyPatchSteps(doc, [...steps]); // wire-level
// inside applySetParam:
const target = findContainerByPath(doc, containerPath); // null pre-check
const existing = target.params[paramName]; // pre-check existing === undefined
const preValue = existing.value;
const nextDoc = setParamInDocument(doc, containerPath, paramName, coerced); // ← RETURNS NEW DOC
const postTarget = findContainerByPath(nextDoc, containerPath);
const postValue = postTarget?.params[paramName]?.value;
if (preValue === postValue) return { noChange: true };
return { nextDoc, applied: 1 };
```

**Old behavior:** `setParamInDocument` voids → caller has the SAME `doc` reference mutated. `nextDoc` was `doc` (same ref). `applied` count was incremented but the doc ref-equality was a lie.

**New behavior:** `setParamInDocument` returns new doc → caller can use ref-equality to short-circuit re-renders (`if (nextDoc === doc) return`). `applied` count stays the same number (1), but the doc ref-equality is now truthful.

## Key Design Decisions

| #   | Decision                                                             | Rationale                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **3 helpers all return ArxmlDocument (atomic refactor)**             | Symmetric API — easier to reason about; matches `addReference` line 735 pattern that's already immutable; future callers don't need to know which helpers are pure vs mutable.                                                                                                                                                                                                              |
| D2  | **`spliceContainer` → `replaceContainer` + non-export**              | The current name implies mutation; renaming to `replaceContainer` reflects the new immutable semantics. Demoting from export prevents future callers from re-introducing the violation.                                                                                                                                                                                                     |
| D3  | **Keep 2-layer `findContainerByPath` walk (NOT fix L2 here)**        | L2 (deeply nested vendor packages) is a separate concern that requires a deeper refactor of `findContainerByPath` to recurse into `pkg.packages[*].packages` transitively. Different scope, different PATCH. v1.37.0 only does C1 (immutability), not L2 (walk depth). The 2 current `findContainerByPath` callers (`setters.ts` + `applyPatchSteps.ts`) handle the 2-layer case correctly. |
| D4  | **`addReference` `value` parameter via options bag, NOT positional** | Backward compat: existing callers passing positional args break. Options bag is additive: `{ value?: string }` default `''` = current behavior.                                                                                                                                                                                                                                             |
| D5  | **`moduleDef.parameters.some(...)` as module-level validation**      | Mirror the sub-path validation logic for module-level — checks the module's own declared params/references. If `paramDef` shortName isn't on the module root, error. Matches D5's existing comment intent ("modules rarely carry parameters" → "validate against module def").                                                                                                              |
| D6  | **TDD-red-first at each sub-task**                                   | Following the project TDD pattern (RED → GREEN → IMPROVE). For C1 specifically, write a ref-equality test BEFORE the helper change (will fail with `===` because of in-place mutation); only turn green after the immutable rewrite.                                                                                                                                                        |
| D7  | **Top comment block in applyPatchSteps.ts updated**                  | The contract definition MUST match the implementation. The reviewer noted "actually-lying documentation" is a maintenance trap. Update block 8-21 to say "All ops immutable, ref-equality safe." and remove the "MUST use `applied`" excuse for callers.                                                                                                                                    |

## Testing Strategy

| Test surface                 | Coverage                                                                                                                                                                                                                                                                                                                                                                     | Δ tests    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `setters.test.ts` (UPDATED)  | `setParamInDocument` returns new doc ref (not === input) → 1 test. `addChildInDocument` returns new doc ref → 1 test. The existing test suite that used `spliceContainer` import rewires to public API → no count delta.                                                                                                                                                     | +2         |
| `mutation.test.ts` (UPDATED) | `addReference` seeded-then-addReference with non-empty `value` propagates to stored ParamValue → 1 test. Module-level `addParameter` with declared param passes → 1 test. Module-level `addParameter` with undeclared param errors → 1 test. Module-level `addReference` with declared ref passes → 1 test. Module-level `addReference` with undeclared ref errors → 1 test. | +5         |
| **Total**                    |                                                                                                                                                                                                                                                                                                                                                                              | **+7 net** |

Baseline 3048 + 7 → **3055 + 7 SKIP / 0 fail**.

(Plan predicts +5; revise to +7 after TDD adds the module-level validation tests.)

## Risks & Mitigations

| Risk                                                                                                 | Mitigation                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ref-equality assumption is widespread (renderer Zustand selectors may rely on previous behavior)     | Search for `=== doc` and `=== arxmlDoc` selectors before the refactor. The renderer's `useArxmlStore` primarily uses shallow equality / structural — verify that no selector compares doc refs directly. |
| New `replaceContainer` helper still has `if (path === '/Module')` quirk from the old spliceContainer | The 2-layer walk limitation stays. The mutation engine has a deeper-walk helper — porting it to setters is a separate concern (deferred to v1.37.x L2 PATCH).                                            |
| `addReference` value parameter breaks a caller that ignores the third arg                            | `options?.value` defaults to `''`. Zero changes needed at any existing callsite.                                                                                                                         |
| Module-level validation breaks a legitimate "ECUC reference at module root" flow                     | The BSWMD must declare the reference. If a real-world project needs an undeclared reference at module root, that's a BSWMD enrichment task — and it would now fail loudly (which is what H2 wants).      |

## Tasks (4 + 1 ship)

```
T1 (C1): setParamInDocument / addChildInDocument / removeChildInDocument → return new doc (no signature change to callers in callers' signature; only the return type changes)
T2 (H1): addReference value parameter via options bag + 1 test
T3 (H2): module-level BSWMD validation in addParameter + addReference + 4 tests
T4: applyPatchSteps top comment update + release-notes + CHANGELOG + progress ledger
T5: ship (tag + 2 separate pushes + gh release)
```

5 tasks total, Subagent-Driven execution.

## Global Constraints

(Inherit from v1.36.x series.)

- All modified/new files end with trailing newline.
- No `console.log` in production code; `console.warn` allowed for defensive warnings.
- 中文 for user-facing/business comments; 英文 for technical API/protocol/comments per CLAUDE.md.
- Subagent-driven execution; one implementer per task, one task reviewer per task (T3 reviewer highest importance because it touches a security-relevant validation path).
- Each task ends with its own test running and passing.
- Exact values (i18n key names, kind strings, file paths) MUST match the spec verbatim.
- Implementer MUST NOT dispatch `pkm-capture` (parent controller's job).
- Implementer MUST NOT make destructive git operations (`reset --hard`, `push --force`) on `origin/main`.

## Out of Scope (deferred to v1.37.x + PATCH chain)

- L2 (deeply nested vendor package walk — needs separate `findReachableContainerByPath` deeper walker)
- M1 (number/string equality boundary in `applyPatchSteps` preValue===postValue) → PATCH
- M3 (`paramValueEquals` ignores dest/definitionRef) → PATCH
- M4 (`findChildDefForAdd` permissive fallback at line 692-697) → PATCH
- L1 (`coerceToParamValue` raw===null unsound cast) → PATCH
- Multi-BSWMD project override (architectural; deferred since v1.33.0)
- Cross-IPC envelope kind standardization (separate MINOR)
- History filter / search / export / per-entry delete / clear-all (UX; deferred)
- Wizard / cross-window sync (far-term)

## Reverse-Closes

This MINOR does NOT reverse-close any specific deferred promise (it's a contract-correctness PATCH, not a feature-delivery PATCH). Instead, it closes the review findings flagged by the user in the v1.36.1 post-ship core review session.

## Lessons (NEW from this MINOR, candidates)

1. `legacy-mutation-helper-bypasses-documented-immutable-contract` — when a public API documents "immutable, return new refs" but a legacy helper still mutates in place, the helper is the contract-breaker. Refactor the helper to return new refs (cheap, mechanical, mirrors the immutable engines in the same file).
2. `api-comment-vs-implementation-divergence-is-a-symptom-of-an-api-gap` — when a code comment says "carries the user-supplied target path" but the implementation hard-codes `value: ''`, the function signature is missing a parameter. Add the parameter (defaults to current behavior for backward compat) and let the comment become true.
3. `conditional-validation-skip-with-justification-still-skips-validation` — "rarely" ≠ "never". When a BSWMD-validation guard has a `if (subPath !== '')` branch with a justification, the else branch should validate against the right other-def (module-root for module-level paths), not skip.

## Cross-references

- v1.36.1 PATCH plan: `docs/superpowers/plans/2026-07-08-v1-36-1-patch-tfix-importedAt-source-validate-and-offstub-removal.md` (parent)
- `core/mutation/applyPatchSteps.ts:8-21` — top contract block being made truthful
- `core/project/setters.ts:212, 219, 225` — spliceContainer in-place mutations + throw
- `core/arxml/mutation.ts:690-754` — `addReference` value / module-level subPath branches
- `core/arxml/mutation.ts:554-569` — `addParameter` module-level subPath branch
- `core/arxml/__tests__/mutation.test.ts:893-949` — existing fresh-write + name-conflict coverage (no seeded-then-addReference coverage)
