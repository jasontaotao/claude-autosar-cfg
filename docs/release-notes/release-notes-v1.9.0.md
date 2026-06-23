# v1.9.0 — ECUC vendor-prefix export + container DEFINITION-REF + UI fold

> **Release date**: 2026-06-23
> **Predecessor**: v1.8.5 (`8870566` three correctness bugfixes) SHIPPED 2026-06-22 (HEAD `e27f62a`)
> **Type**: MINOR
> **Branch**: `feature/sprint-x-vendor-prefix` (1 commit behind main `fff92a5`)
> **Commits since v1.8.5**: 7 (4 feature + 2 review-fix + 1 format)

## What's new

Sprint X — three interlocking fixes for vendor-prefix (经纬恒润, EB tresos, Vector, AUTOSAR_R2x, etc.) BSWMD modules. Closes the user's report that exporting `test.autosarcfg.json` (loading `JWQ3399_bswmd.arxml`) produced ARXML that lost the vendor prefix hierarchy and silently dropped container-level `<DEFINITION-REF>` and `<PARAMETER-VALUES>` for multi-instance copies.

### Feature 1 — Skeleton preserves vendor-prefix AR-PACKAGE hierarchy

Previously `src/core/arxml/skeleton.ts:80-98` always emitted a single-layer `<AR-PACKAGE>` whose `<SHORT-NAME>` was the module's `shortName` (e.g. `JWQ3399`), discarding the BSWMD-side module path's vendor wrapper segments (`/JWQ_CDD_PACK/JWQ_Packet/JWQ3399`). The skeleton's internal `DEFINITION-REF` children correctly carried the full vendor-prefixed path (because `BswModuleDef.path` and `ContainerDef.path` accumulate the full hierarchy), but the **document tree itself** was flattened — so the rendered arxml showed only the deepest layer.

For AUTOSAR standard modules (e.g. `/Can` or `/EcuC`) this was harmless. For vendor-prefix modules it produced arxml that opened fine in ClaudeAutosarCfg but failed EB tresos / Vector / Intewell re-import because the parent vendor packages were missing.

Fix: `generateEcucSkeleton` now splits `mod.path` on `/` and builds a nested `ArxmlPackage.packages` chain. Single-segment paths keep the legacy single-layer shape (preserves the 5-fixture round-trip signature). Multi-segment paths emit a bottom-up nested chain where the deepest leaf package carries `elements: [moduleEl]` and intermediate packages are empty wrappers with `elements: []`. The UI folds the chain back to a single top-level node via Feature 3 (below) so users see one `AR-PACKAGE` while the serialized arxml preserves the full hierarchy.

### Feature 2 — Every `ECUC-CONTAINER-VALUE` carries `<DEFINITION-REF>` + filled `<PARAMETER-VALUES>`

Previously the skeleton's seed containers (the first instance of a BSWMD-defined container) had `<PARAMETER-VALUES>` filled from BSWMD defaults but no `<DEFINITION-REF>`, and every container added via the mutation flow (including the `_1`/`_2`/`_N` multi-instance auto-suffix from v1.8.4 Bug 2) had neither `<DEFINITION-REF>` nor `<PARAMETER-VALUES>`. The root cause was three-layered:

1. `ArxmlContainer` had no `definitionRef` field (`src/core/arxml/types.ts:61`).
2. `serializer.renderContainer` (`src/core/arxml/serializer.ts:241`) never emitted a `<DEFINITION-REF>` child element.
3. `mutation.addContainer` (`src/core/arxml/mutation.ts:108`) constructed the new container with `params: {}` and no `definitionRef`.

The skeleton's seed container was half-correct because it called the local `fillParamsFromBswmd` (which filled defaults) but skipped the `definitionRef` stamp.

Fix:

- `types.ts:61` adds `readonly definitionRef?: string | undefined` to `ArxmlContainer` (same `exactOptionalPropertyTypes` pattern as `description`).
- `defaultValue.ts` exports `fillParamsFromBswmd` (extracted from `skeleton.ts:174-190`) so both `skeleton.ts` (seed containers) and `mutation.ts` (`addContainer`) can fill defaults from the BSWMD side.
- `serializer.ts:241` emits `<DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">...</DEFINITION-REF>` (or `ECUC-CHOICE-CONTAINER-DEF` for `isChoiceContainer === true`) whenever `c.definitionRef !== undefined`. Legacy in-memory docs that pre-date the v1.9.0 stamp omit the tag — round-trip stays field-equal for the 5 pre-fix fixtures.
- `skeleton.ts:buildTopContainer` / `buildSubContainerShell` / `buildChoiceShell` stamp `definitionRef: c.path` so every emitted seed container carries the BSWMD-side path.
- `mutation.ts:addContainer` stamps `definitionRef: childContainerDef.path`, fills `params: fillParamsFromBswmd(childContainerDef)`, and carries `description: childContainerDef.desc` — so multi-instance copies match the seed contract end-to-end.

### Feature 3 — UI folds vendor-prefix AR-PACKAGE hierarchy

ProjectPanel's Tree now collapses vendor-private wrapper layers (`JWQ_CDD_PACK`, `JWQ_Packet`, `EAS`, `EcucDefs`, `AUTOSAR_R22`, etc.) so users see one `AR-PACKAGE` node per real module. The collapse happens in the store selector layer (`src/renderer/store/helpers/combinedDoc.ts:foldVendorPackages`), not in the renderer — so Tree / LeftPanel / ProjectPanel / ContextMenu / ParamEditor all automatically follow without per-component changes.

Detection rule (depth-first, bottom-up):

1. **Primary**: top-level `pkg` with exactly one nested `pkg1`, `pkg.elements.length === 0`, and `pkg1.shortName` matches a loaded BSWMD module — fold (hoist `pkg1`).
2. **Trusted vendor pack fallback**: `pkg.shortName` matches `^JWQ_.*_PACK$` (and after hoisting `pkg1` carries the BSWMD match in the recursive walk) — fold. The `JWQ_.*_PACK` pattern is specific enough to a vendor-pack naming convention that false-positives on user-defined packages are unlikely.
3. **Generic prefix**: `pkg.shortName` matches `^(EAS|EcucDefs|AUTOSAR(_.*)?)$` requires the inner to ALSO be a BSWMD match — fold only when both conditions hold. This prevents accidentally folding a user-defined `EcucDefs` wrapper that has no BSWMD coverage.

Path rewriting uses the same pattern as `wrapPackageUnderSegment` (`combinedDoc.ts:433-468`): the hoisted package's `path` is rewritten to the collapsed prefix (`/JWQ3399` rather than `/JWQ_CDD_PACK/JWQ_Packet/JWQ3399`), and every descendant `ArxmlElement.path` is rewritten via `wrapElement` so `selectedPath` resolves consistently across the fold.

`computeDisplayDoc` accepts a new optional `bswmdSchemas?: readonly BswmdDocument[]` parameter, threaded through 7 mutator call sites (`ecucSlice.ts:130, 198, 241, 264, 313, 346`; `mutationSlice.ts:469`; `projectSlice.ts:186`; `uiSlice.ts:205`) plus 2 post-mutation rebuild helpers (`mutationErrors.ts:applyMutationResultToSource/Active`) so the fold has up-to-date BSWMD coverage at every state transition.

### Feature 4 — Parser captures container-level `<DEFINITION-REF>` (round-trip safety)

Closing a regression Feature 2 introduced: `buildContainer` (`src/core/arxml/parser.ts:380`) used to ignore `<DEFINITION-REF>` children of `ECUC-CONTAINER-VALUE`. The serializer (Feature 2) now stamps the field on every emit, but if a user saved the file and reopened it, the parser would silently drop the field — so the second save-reload cycle would lose all container-level `<DEFINITION-REF>` again.

Fix: `buildContainer` now reads the `DEFINITION-REF` child (string / `{ @_DEST, #text }` / array variants, mirroring the existing module-level pattern) and stamps `definitionRef` on the resulting `ArxmlContainer`. Also restores `isChoiceContainer: true` when `DEST="ECUC-CHOICE-CONTAINER-DEF"` so a choice shell round-trips with its branch-list marker intact.

### Feature 5 — `findByPath` resolves through vendor-prefix nested roots (CRITICAL follow-up)

Reviewer caught this as a single-mode mutation routing bug after Feature 3: with vendor-prefix nested source docs, `state.doc.packages[0]` is `JWQ_CDD_PACK` (not the post-fold `JWQ3399`). Tree selections land on `selectedPath = '/JWQ3399/...'`; the mutation slice called `coreAddContainer(state.doc, '/JWQ3399/...', ...)` which fed `findByPath(state.doc, '/JWQ3399/...')` — but `findRootPackageByShortName` only walked the top level, so the lookup returned null and every mutation silently failed `path-not-found`.

Fix: `findRootPackageByShortName` (`src/core/arxml/path.ts:125`) now recurses through `pkg.packages` at any depth, returning the deepest matching nested package as the "root" for the remainder of the walk. Pattern mirrors v1.4.1 bug2c's 3-segment compressed-shape fallback but generalized to any nesting depth.

## Internal changes

| File | Change | Lines |
|---|---|---|
| `src/core/arxml/types.ts` | `ArxmlContainer.definitionRef?: string \| undefined` field | +16 |
| `src/core/arxml/defaultValue.ts` | `export fillParamsFromBswmd(c: ContainerDef)` | +50/-0 |
| `src/core/arxml/serializer.ts` | `renderContainer` emits `<DEFINITION-REF DEST="...">` | +21/-0 |
| `src/core/arxml/skeleton.ts` | `buildTopContainer` / `buildSubContainerShell` / `buildChoiceShell` stamp `definitionRef: c.path` + `generateEcucSkeleton` builds nested vendor-prefix chain | +108/-13 |
| `src/core/arxml/mutation.ts` | `addContainer` stamps `definitionRef` + fills params + carries description | +12/-3 |
| `src/core/arxml/parser.ts` | `buildContainer` reads `<DEFINITION-REF>` + restores `isChoiceContainer` from DEST | +51/-0 |
| `src/core/arxml/path.ts` | `findRootPackageByShortName` nested-fallback recursion | +23/-0 |
| `src/renderer/store/helpers/combinedDoc.ts` | `computeDisplayDoc` accepts `bswmdSchemas` + new `foldVendorPackages` + regex split (`TRUSTED_VENDOR_PACK_RE` / `GENERIC_VENDOR_PREFIX_RE`) | +199/-14 |
| `src/renderer/store/helpers/mutationErrors.ts` | `applyMutationResultToSource` / `applyMutationResultToActive` thread `state.bswmdSchemas` | +2/-0 |
| 9 mutator / slice call sites | pass `get().bswmdSchemas` to `computeDisplayDoc` | +9/-0 |
| 7 new test files / 5 updated test files | `path.test.ts`, `parser-container-defref.test.ts`, `combinedDoc.test.ts`, `mutationErrors.test.ts`, `defaultValue.test.ts`, `mutation-multi-instance.test.ts`, `skeleton.test.ts`, `serializer.test.ts`, `bug-bswmd-multicity-and-addchild.test.ts`, `bug2-skeleton-roundtrip.test.ts`, `Tree.test.tsx`, `useArxmlStore.mutation.test.ts` | +1480/-0 |

## Test count delta

**+39 tests** (2167 + 1 skip vs v1.8.5 2128 + 1 skip). Distribution:

- Types + serializer + helper (Phase 1): +6
- Skeleton + mutation (Phase 2): +6
- UI fold + mutation routing (Phase 3): +10
- Skeleton vendor-prefix nesting (Phase 4): +5
- Review followups CRITICAL + HIGH + MEDIUM (Phase 5b): +10
- UI fold regression carve-out (Phase 5c): +2

Test files: 211 → 214 (3 new test files: `path.test.ts`, `parser-container-defref.test.ts`, `mutationErrors.test.ts`).

## Spec / Plan / Reviews

- Plan: `C:\Users\13777\.claude\plans\glowing-dazzling-flamingo.md` (committed pre-implementation)
- Code-reviewer (whole-branch vs v1.8.5): initially **BLOCK** on 1 CRITICAL + 2 HIGH. After CRITICAL fix + 2 HIGH fixes + MEDIUM #2 carve-out + LOW cleanup → **APPROVE_WITH_NOTES** (1 regression found + fixed in 5c). Net: 0 unremediated CRITICAL / HIGH.
- `pnpm verify` (all 7 stages): EXIT=0 / format ✓ / lint ✓ / type-check ✓ / test (2167 + 1 skip) ✓ / coverage (≥95.5% / ≥87% preserved) ✓ / build:renderer ✓ / build:main ✓ / build:preload ✓.

## User-visible behaviour changes

1. **Multi-instance container copies now have full ECUC value-side structure** — previously `_1`/`_2`/`_N` siblings were skeletons with only `<SHORT-NAME>`; they now carry `<DEFINITION-REF>` + `<PARAMETER-VALUES>` matching the seed container's contract. EB tresos / Vector / Intewell re-import of a v1.9.0-generated arxml no longer rejects multi-instance containers as malformed.

2. **Vendor-prefix modules export with full `<AR-PACKAGE>` hierarchy** — `/JWQ_CDD_PACK/JWQ_Packet/JWQ3399` modules now emit `<AR-PACKAGES><AR-PACKAGE><SHORT-NAME>JWQ_CDD_PACK</SHORT-NAME>...<AR-PACKAGES><AR-PACKAGE><SHORT-NAME>JWQ_Packet</SHORT-NAME>...<AR-PACKAGES><AR-PACKAGE><SHORT-NAME>JWQ3399</SHORT-NAME>` (3 layers) rather than `<AR-PACKAGES><AR-PACKAGE><SHORT-NAME>JWQ3399</SHORT-NAME>` (1 layer). Standard AUTOSAR modules (`/Can`, `/EcuC`, etc.) remain single-layer — backward-compatible.

3. **Tree view collapses vendor-prefix hierarchies to one node per real module** — when a BSWMD declares a 3-segment path like `/JWQ_CDD_PACK/JWQ_Packet/JWQ3399` and the deepest segment is a loaded module, the Tree shows only `JWQ3399` (the user clicks it like any other module node). Vendor wrapper packages are visible in the underlying arxml file but hidden in the UI.

4. **Save-reload cycles preserve container-level `<DEFINITION-REF>`** — previously a save-reload of a v1.9.0-generated arxml would lose all container-level `<DEFINITION-REF>` tags (parser dropped the field). Now the parser captures and the serializer re-emits the field; round-trip is loss-less.

## Known issues (carry-over, not blockers)

- **M1 (LOW, carry from v1.8.1)**: `.error-banner-action` CSS class has no specific rule. Deferred.
- **CSS @import ordering** (pre-existing): cosmetic Vite warning.
- **Chunk size** (pre-existing): renderer bundle ~830 kB. Code-splitting deferred to a future MAJOR.
- **3 pre-existing TS2322** in `removeBswmd.fullFlow.test.tsx` (carry since v1.7.1). Deferred.
- **README onboarding** (LOW from v1.8.3 code-review): no `git clone --recurse-submodules` hint. Deferred to v1.9.1+ follow-up.
- **BSWMD chip count vs Tree top-level node count divergence** (MEDIUM from Sprint X review): BSWMD chip in ProjectPanel shows `N/M` modules loaded; Tree may show fewer top-level nodes when vendor-fold is active. Cosmetic; not blocking. Deferred to v1.9.1+ polish.
- **Parser-only `description` field for `<ECUC-CHOICE-CONTAINER-DEF>`** (LOW): `buildContainer` restores `isChoiceContainer` from DEST but not the choice branch list. The branch list is reconstructed from `ContainerDef.choices` at skeleton build time, so a skeleton→save→reload→save cycle will see the same branches but won't preserve the original BSWMD order if the BSWMD diverges. Acceptable for current flows.

## Why MINOR and not MAJOR?

New functionality (3 user-facing features + 1 round-trip safety fix + 1 critical-bug fix), all behind behavior changes that **enhance** rather than **replace** existing behaviour:

- Standard AUTOSAR modules (`/Can`, `/EcuC`, etc.) see identical serialized arxml and identical Tree view — no behavior change.
- Vendor-prefix modules gain 3 new capabilities (full hierarchy export, full DEFINITION-REF + PARAMETER-VALUES on every container, vendor-folded Tree view) but no existing capability is removed.
- v1.8.5 consumers see no behavior regression; vendor-prefix BSWMD users (经纬恒润, EB tresos, Vector, AUTOSAR_R2x) see strict improvements on the previously-broken flows.

The 5 existing round-trip fixtures (Det / EcuC / Com / PduR / WdgIf) all continue to produce field-equal serialize→re-parse output.

## Migration notes

No migration steps required. v1.8.5 projects open unchanged in v1.9.0. Loading a v1.9.0-generated arxml in v1.8.5 will silently drop container-level `<DEFINITION-REF>` (the v1.8.5 parser doesn't capture the field) — but the v1.8.5 serializer also doesn't emit the field, so re-saving in v1.8.5 produces a file structurally equivalent to a v1.9.0 save minus the field. No data loss for projects that don't reopen-and-resave across versions.
