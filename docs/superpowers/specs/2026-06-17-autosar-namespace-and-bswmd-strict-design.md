# AUTOSAR Namespace Compatibility + BSWMD-as-Value Strict Reject

**Date**: 2026-06-17
**Status**: Draft (pending user review)
**Scope**: `claude-AutosarCfg` core parser layer — fix 3 concrete bugs validated against EB tresos + FlexCFG real BSWMD fixtures.

---

## 1. Problem Statement

### Symptom

Loading a real-world BSWMD file from EB tresos via "Open ARXML" or programmatically through `parseArxml` produces one of three failure modes:

1. **`unsupported-version` for R4.4+ AUTOSAR files** — `parser.ts:detectVersion` rejects any file whose `xsi:schemaLocation` uses the 5-digit AUTOSAR form (`AUTOSAR_00046.xsd` / `00048.xsd` / `00049.xsd` / `00050.xsd`) instead of the older dashed form (`AUTOSAR_4-2-2.xsd`). EB tresos R4.4.0 / R19-11 / R20-11 / R21-11 ship exclusively with the 5-digit form; the parser rejects all of them.
2. **BSWMD files that *do* pass version detection produce an empty tree** — the user's `C:\EB\tresos\autosar\4.2.2\AUTOSAR_MOD_ECUConfigurationParameters.arxml` is reported as `version=4.2, packages=1, top-elements=0`. The 252 `ECUC-MODULE-DEF` and 3038 `ECUC-PARAM-CONF-CONTAINER-DEF` schema definitions become empty containers because `classifyElement` does not extract parameters from `*-DEF` children.
3. **Silent confusion on the GUI side** — the user reported "loaded the file but no parameters showed up". There is no error, no warning, no hint that the file was a BSWMD (schema) rather than an ECUC values file. The Tree renders an empty package.

### Validation Evidence (already collected this session)

```
4.2.2:  OK version=4.2 packages=1 top-elements=0
4.4.0:  FAIL unsupported-version  ← bug 1+2
R19-11: FAIL unsupported-version  ← bug 1+2
R20-11: FAIL unsupported-version  ← bug 1+2
R21-11: FAIL unsupported-version  ← bug 1+2
```

Fixtures available locally for regression tests:

| Path | Size | Version | Element kind |
|---|---|---|---|
| `C:\EB\tresos\autosar\4.2.2\AUTOSAR_MOD_ECUConfigurationParameters.arxml` | 12.5 MB | 4.2 | BSWMD |
| `C:\EB\tresos\autosar\4.4.0\AUTOSAR_MOD_ECUConfigurationParameters.arxml` | 15.4 MB | 4.4 | BSWMD |
| `C:\EB\tresos\autosar\R19-11\AUTOSAR_MOD_ECUConfigurationParameters.arxml` | 16.1 MB | 19-11 | BSWMD |
| `C:\EB\tresos\autosar/R20-11\AUTOSAR_MOD_ECUConfigurationParameters.arxml` | 14.4 MB | 20-11 | BSWMD |
| `C:\EB\tresos\autosar/R21-11\AUTOSAR_MOD_ECUConfigurationParameters.arxml` | 15.4 MB | 21-11 | BSWMD |
| `C:\Program Files (x86)\FlexCFG\BSWMD\AUTOSAR_R{18,20,21,22}\**` | ≈400 files | R4.6 schema | BSWMD |

The 4.2.2 file is "supported" only because of the dashed-form `AUTOSAR_4-2-2.xsd` schemaLocation matching the parser's `XSD_PATTERN` fallback. Any EB tresos file beyond 4.2.2 silently fails.

---

## 2. Goals & Non-Goals

### Goals (in scope for this change)

1. **G1 — Recognize the 5-digit `AUTOSAR_000NN.xsd` schemaLocation form.** The parser must extract a valid `ArxmlVersion` from both `AUTOSAR_4-X-Y.xsd` (legacy dashed form) and `AUTOSAR_000NN.xsd` (5-digit form).
2. **G2 — Add the supported 5-digit version literals to `SUPPORTED_ARXML_VERSIONS`.** AUTOSAR uses the 5-digit form to encode release versions: `00046` = R4.6, `00047` = R4.7, `00048` = R19-11, `00049` = R20-11, `00050` = R21-11. Add these to the supported set so EB tresos files load.
3. **G3 — Reject BSWMD-as-value at parse time.** When `parseArxml` walks an `AR-PACKAGE` and finds only `ECUC-*-DEF` schema definition elements (zero `ECUC-*-VALUE` instances), return an `invalid-structure` parse error with a localized hint message directing the user to use "Load BSWMD" instead. This is the **strict mode** behavior.
4. **G4 — Preserve all existing tests + add regression fixtures.** Existing 428 tests must continue to pass. Add focused regression fixtures for each bug.
5. **G5 — Mirror the same fix in the serializer.** `serializer.ts:buildSchemaLocation` must produce the appropriate xsd form for whatever version it serializes (5-digit for R4.4+, dashed for R4.2 and earlier).

### Non-Goals (deferred — do NOT do these in this change)

- **N1 — Post-build variant parsing.** R4.2+ files with `<POST-BUILD-VARIANT-CONDITION>` and `<VARIATION-POINT>` continue to be ignored. ParamEditor still does not surface variant choices. (Already documented as "medium risk" in the brainstorm; deferred to a separate spec.)
- **N2 — Multiline / choice container value-side parsing.** Already-documented gaps; separate spec.
- **N3 — AUTOSAR R22-11 / R23-11 / R24-11 explicit version literal support.** The 5-digit form for those releases (`00051` / `00052` / `00053`) is unknown to AUTOSAR officially; defer until a real fixture exists. **Important**: do NOT invent version numbers; only add what is verified to map to an AUTOSAR release.
- **N4 — `parseBswmd` changes.** The BSWMD parser path (`core/project/bswmd.ts`) is separate. G3 (BSWMD-as-value reject) only applies to `parseArxml` (value-side). `parseBswmd` already correctly handles pure BSWMD files because it walks `ECUC-MODULE-DEF` deliberately.
- **N5 — File-size cap changes.** The BSWMD reader's 8 MiB cap is unchanged. The regression fixtures are 12-16 MB; tests must slice them or use smaller synthetic BSWMDs.
- **N6 — Network / XSD validation.** Do not attempt to download or validate against external XSDs. Pure string-level version detection.

---

## 3. Design

### 3.1 Dual-form `XSD_PATTERN` extension (`parser.ts`)

**Current**:
```ts
const NS_PATTERN = /\/schema\/(r\d+\.\d+|\d{5,6})/;
const XSD_PATTERN = /AUTOSAR_(\d)-(\d)-(\d)\.xsd/;
```

**Change**:
```ts
// AUTOSAR uses two schemaLocation forms:
//   1. Dashed: AUTOSAR_4-2-2.xsd, AUTOSAR_4-6-0.xsd, AUTOSAR_4-7-0.xsd
//   2. 5-digit: AUTOSAR_00046.xsd (R4.6), 00047 (R4.7),
//               00048 (R19-11), 00049 (R20-11), 00050 (R21-11)
// The 5-digit literal maps directly to a 4.x release (digits 2-3 are
// minor). We capture the literal as '000NN' so the caller can decide
// how to map it to an ArxmlVersion.
const XSD_PATTERN = /(?:AUTOSAR_(\d)-(\d)-(\d)\.xsd|AUTOSAR_(\d{5})\.xsd)/;
```

**Version extraction logic** in `detectVersion`:
```ts
const xm = XSD_PATTERN.exec(xsi);
if (xm) {
  // Path A — dashed form, e.g. AUTOSAR_4-2-2.xsd
  if (xm[1] !== undefined && xm[2] !== undefined) {
    candidate = `${xm[1]}.${xm[2]}` as ArxmlVersion; // '4.2'
  }
  // Path B — 5-digit form, e.g. AUTOSAR_00046.xsd
  else if (xm[4] !== undefined) {
    candidate = xm[4] as ArxmlVersion; // '00046'
  }
}
```

The `ArxmlVersion` union type must widen to accept `'00046' | '00048' | '00049' | '00050'` literals. We will NOT add `'00047'` even though R4.7 exists in some vendor files, because the existing parser tests already use the dashed form for R4.7 (`AUTOSAR_4-7-0.xsd`) and we have no fixture proving `'00047'` is ever emitted. **Add only what fixtures prove.**

### 3.2 `SUPPORTED_ARXML_VERSIONS` extension (`types.ts`)

**Current**:
```ts
export const SUPPORTED_ARXML_VERSIONS: readonly ArxmlVersion[] = [
  '4.2', '4.4', '4.6', '4.7', '5.0',
] as const;
```

**Change**:
```ts
export const SUPPORTED_ARXML_VERSIONS: readonly ArxmlVersion[] = [
  // Dashed form (legacy)
  '4.2', '4.4', '4.6', '4.7', '5.0',
  // 5-digit form (AUTOSAR standard for R4.4+)
  // 00046 = R4.6, 00048 = R19-11, 00049 = R20-11, 00050 = R21-11
  '00046', '00048', '00049', '00050',
] as const;
```

Rationale for omitting `'00047'`: We have no fixture proving R4.7 ships with the 5-digit form. EB tresos R4.7.0 files (if they exist) might use either form. Wait until a fixture proves it before adding.

### 3.3 `serializer.ts:buildSchemaLocation` mirror

**Current** (approximation — actual code may vary):
```ts
function buildSchemaLocation(version: ArxmlVersion): string {
  return `http://autosar.org/schema/r${version} AUTOSAR_${version.replace('.', '-')}.xsd`;
}
```

**Change**: A small lookup table that maps each `ArxmlVersion` to its canonical xsd filename. For 5-digit literals, use the literal directly:

```ts
const XSD_FOR_VERSION: Record<ArxmlVersion, string> = {
  '4.2': 'AUTOSAR_4-2-2.xsd',
  '4.4': 'AUTOSAR_4-4-0.xsd',
  '4.6': 'AUTOSAR_4-6-0.xsd',
  '4.7': 'AUTOSAR_4-7-0.xsd',
  '5.0': 'AUTOSAR_5-0-0.xsd',
  '00046': 'AUTOSAR_00046.xsd',
  '00048': 'AUTOSAR_00048.xsd',
  '00049': 'AUTOSAR_00049.xsd',
  '00050': 'AUTOSAR_00050.xsd',
};
```

### 3.4 BSWMD-as-value strict reject (`parser.ts:walkPackages`)

**Current behavior**: A BSWMD-shaped file (only `*-DEF` schema elements, zero `*-VALUE` instances) parses successfully but produces an empty tree. The user sees an empty Package node.

**New behavior**: Detect this shape during walking and fail loudly.

**Where**: After `walkPackages` returns the package array, check whether any package contains a `ECUC-MODULE-CONFIGURATION-VALUES` element (the value-side root). If none across the whole tree AND the file contains at least one `ECUC-MODULE-DEF`, return an `invalid-structure` error.

```ts
// After walkPackages, in parseArxml:
const hasValues = packages.some(pkg => pkgHasValueInstance(pkg));
const hasDefs = packages.some(pkg => pkgHasDefInstance(pkg));
if (!hasValues && hasDefs) {
  return {
    ok: false,
    error: {
      kind: 'invalid-structure',
      path: '/',
      message: 'Loaded file is a BSW Module Description (BSWMD, schema only). '
             + 'Open it via "Load BSWMD" instead of "Open ARXML".',
    },
  };
}
```

Helpers `pkgHasValueInstance` / `pkgHasDefInstance` walk the package tree (including nested `packages` and `elements`) looking for `kind === 'module'` vs a heuristic marker for `-DEF` containers. Implementation detail deferred to the plan.

**Backward compatibility**: Files that mix both (real-world vendor ARXML with schema + values in the same ELEMENTS block) pass through unchanged. Only **pure DEF** files fail. The existing parser tests use value-only files and continue to pass.

### 3.5 Test coverage

**New test file**: `src/core/arxml/__tests__/parser-namespace.test.ts` — covers:

1. **Regex unit tests** for `XSD_PATTERN` matching both forms.
2. **`detectVersion` tests** for each of: 4.2 dashed, 4.6 dashed, 00046, 00048, 00049, 00050, unknown literal, missing schemaLocation.
3. **Round-trip tests**: parse a synthetic R20-11 arxml → serialize → parse again → version preserved.

**Updated test file**: `src/core/arxml/__tests__/parser.test.ts` — add:

1. BSWMD-as-value reject: a synthetic file with only `<ECUC-MODULE-DEF>` returns `invalid-structure` with the hint message.
2. Mixed file (one module-value + one module-def) still parses successfully.

**Regression fixtures**: place at `tests/fixtures/arxml/parser-namespace/`:

- `r4.2-dashed.min.arxml` — minimal value file, R4.2 dashed xsd (positive)
- `r4.6-dashed.min.arxml` — minimal value file, R4.6 dashed xsd (positive)
- `r4.6-5digit.min.arxml` — minimal value file, `AUTOSAR_00046.xsd` (positive, validates G1+G2)
- `r20-11-5digit.min.arxml` — minimal value file, `AUTOSAR_00049.xsd` (positive, validates G1+G2 for new format)
- `bswmd-pure.min.arxml` — file with only `<ECUC-MODULE-DEF>`, zero `<ECUC-MODULE-CONFIGURATION-VALUES>` (negative, validates G3)

The 12-16 MB EB tresos fixtures stay on disk as **integration-only** fixtures (referenced from a separate slow-test file with `[.slow]` tag if needed). The unit-test fixtures are hand-crafted, ≤ 100 lines each.

---

## 4. Failure Modes & Edge Cases

| Case | Current behavior | New behavior |
|---|---|---|
| File uses `r20-11` literal namespace (no AUTOSAR vendor does this currently) | `unsupported-version` | `unsupported-version` (unchanged — we have no fixture proving this format exists) |
| File uses `r4.0` namespace + `AUTOSAR_00048.xsd` schemaLocation (EB tresos R19-11) | `unsupported-version` | OK, version=`00048` (G1+G2) |
| File uses `r4.2` namespace + `AUTOSAR_4-2-2.xsd` schemaLocation | OK | OK (unchanged) |
| File uses dashed `AUTOSAR_4-4-0.xsd` (theoretical) | OK | OK (unchanged) |
| BSWMD file (only `*-DEF`) | OK, empty tree | `invalid-structure` with hint (G3) |
| Mixed file (one value + one def) | OK | OK (unchanged) |
| File with no `xsi:schemaLocation` and `r4.0` namespace | OK via namespace fallback | OK (unchanged) |
| File with no namespace at all | `unsupported-version` | `unsupported-version` (unchanged) |

---

## 5. Risks

- **R1 — `ArxmlVersion` type widening may break other call sites.** Need to grep for `ArxmlVersion` usage to confirm all consumers handle the new literals. Mitigation: the writing-plans step will include a `Grep` task before code changes.
- **R2 — Adding `00048` etc. may interact with i18n / locale-driven error messages.** `t()` lookups for `'app.error.unsupportedVersion'` may expect `'4.2'`-style literals. Mitigation: keep error messages version-agnostic; show the literal as-is.
- **R3 — Strict reject may regress an existing test that loads a BSWMD via `parseArxml`.** Mitigation: review existing 428 tests for any test fixture with `ECUC-MODULE-DEF` only; if found, mark as expected-error or migrate to `parseBswmd`.
- **R4 — Serializer may emit a schemaLocation the parser doesn't accept on round-trip.** Mitigation: the round-trip test in §3.5 catches this immediately.

---

## 6. Out of Scope (explicit)

- Anything that touches the GUI layer (Tree / ParamEditor / ProjectPanel). G3 produces a parse error that surfaces as the existing `app.error.parseArxmlFailed` toast — no UI changes needed.
- `parseBswmd` (N4). BSWMD path is correct as-is; only the value-side parser is changing.
- Post-build variant parsing (N1). Already-documented; separate spec.
- AUTOSAR R22-11 / R23-11 / R24-11 (N3). Wait for fixtures.

---

## 7. Success Criteria

1. `parseArxml` accepts EB tresos R4.4.0, R19-11, R20-11, R21-11 BSWMD files at the value-side entry point (in the sense of returning a parse result without `unsupported-version`).
2. Loading a pure-BSWMD file via `parseArxml` returns `invalid-structure` with the hint message.
3. Existing 428 tests still pass.
4. Five new unit-test files pass.
5. Round-trip test: `parseArxml(serializeArxml(doc))` for a `version=00049` document returns the same version.