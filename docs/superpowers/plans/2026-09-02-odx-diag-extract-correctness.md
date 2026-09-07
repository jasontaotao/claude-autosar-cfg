# ODX-D → Diagnostic Extract Correctness Fix — Implementation Plan (v2, revised)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **v2 revision (2026-09-02):** Revised after plan review against the real Vector
> sample and the workspace BSWMDs. Three factual errors in v1 were corrected:
> (1) Routine identifier uses `SEMANTIC="ID"`, not `"DATA-ID"` (0 occurrences of
> `DATA-ID` in `samples/odx/`); (2) `TROUBLE-CODE` is decimal in real Vector
> exports, not `0x`-hex; (3) the DTC container is `DemConfigSet/DemDTC`, not
> `DemConfigSet/DemDTCAttributes` (the `DemDtcValue` param belongs to `DemDTC`).
> Structural changes: the resolver is built BEFORE the mapper fixes (no
> write-then-rewrite), the `<DCM-DSP-DID-DATA>` block is KEPT (pinned by a
> ship-blocking real-fixture test), and the DBC→COM stack adoption was split
> into `2026-09-02-definition-ref-resolver-adoption.md`.

**Goal:** Fix the ODX-D → Diagnostic Extract pipeline so generated DcmDspDid / DcmDspRoutine / DemDTC containers carry standard ECUC parameter values with correct BSWMD definition-ref paths that the ARXML tree and parameter editor can resolve and display.

**Architecture:** Three layers: (1) `definitionRefResolver` — a central helper that resolves definition-ref paths by walking the BSWMD container tree (with standard-prefix fallback when no BSWMD is threaded); (2) the ODX parser (`parseOdxHandler.ts`) extracts numeric DID / Routine identifiers from the ODX-D XML; (3) the bridge mapper (`odxToDiagnosticExtract.ts`) replaces wrong `DEST`/`/Dcm/...` refs and the bare `<DEM-EVENT-PARAMETER>` blocks with canonical `<ECUC-CONTAINER-VALUE>` + `<PARAMETER-VALUES>` elements whose definition-refs come from the resolver.

**Tech Stack:** TypeScript, fast-xml-parser (parsing), Vitest (testing), no new dependencies.

**Spec:** Inline — derived from the user's report that generated DID/Routine shells in `DiagExtract/Dcm` have no numeric IDs and use wrong definition-ref paths, making them unresolvable in the ARXML tree and parameter editor. Dem extract is invisible because `DEM-EVENT-PARAMETER` is not an `ECUC-*` tag and gets classified as `kind: 'unknown'` by `classifyElement()` (`src/core/arxml/parser/walk.ts:202`).

**Real-file evidence (verified 2026-09-02 against `samples/odx/Demo_Cdd.odx-d`, Vector CANdelaStudio export):**

- DID identifier: `PARAM SEMANTIC="ID"` (SHORT-NAME `RecordDataIdentifier`), decimal `CODED-VALUE` — e.g. `RQ_CellVolt_JG_Read` → 258 (file line 10154).
- Routine identifier: `PARAM SEMANTIC="ID"` (SHORT-NAME `RoutineIdentifier`), decimal `CODED-VALUE` — e.g. `RQ_checkProgrammingPreconditions_Start` → 515 (file line 12166). **`SEMANTIC="DATA-ID"` does not exist in any sample file.**
- `TROUBLE-CODE` is **decimal, no `0x` prefix** — e.g. `687361` = 0xA7D01 (file line 116). Legacy hand-crafted fixtures use `0x`-hex; both shapes must parse.
- Counts (pinned by `parseOdxHandler.real.test.ts`): 99 DTCs / 34 DIDs / 4 Routines.

**BSWMD references (verified 2026-09-02 against `D:\claude_proj2\ClaudeAutosarWorkSpace\bswmd\`):**

- `Dcm_bswmd.arxml` — module path `/AUTOSAR_R22/EcucDefs/Dcm`; hierarchy `DcmConfigSet` (line 32) → `DcmDsp` (1462) → `DcmDspDid` (3629) → param `DcmDspDidIdentifier` (3727); `DcmDspRoutine` (7192) → param `DcmDspRoutineIdentifier` (7246).
- `Dem_bswmd.arxml` — module path `/AUTOSAR_R22/EcucDefs/Dem`; hierarchy `DemConfigSet` (line 32) → **`DemDTC`** (148) → param **`DemDtcValue`** (229, ECUC-INTEGER-PARAM-DEF, MIN=256, MAX=16777214). `DemDTCAttributes` (389) is a _sibling_ container referenced via `DemDTCAttributesRef` — it does NOT contain `DemDtcValue`.
- **Package roots differ across BSWMD sets**: this workspace uses `/AUTOSAR_R22/EcucDefs/...`, but the real-OEM fixture used by `dcmConfigPipeline.test.ts` uses `/AUTOSAR/Dcm/...` and the demo-ecu fixture uses `/Dcm/...`. This is why definition-refs must be resolved from the loaded BSWMD, not hardcoded — the fallback prefix only matches this one workspace.

## Global Constraints

- **Resolver first.** Task 3 builds `definitionRefResolver`; Tasks 4–5 consume it. No hardcoded definition-ref is written and then rewritten.
- **Resolver contract:** when a `BswModuleDef` is provided, walk its container tree (leaf segment may name a parameter or reference, not just a container). When absent, fall back to `/AUTOSAR_R22/EcucDefs/{module}/...`. When a BSWMD IS provided but the path is NOT found, invoke the optional `onMiss` callback (surfaced as a warning) and fall back — never silently.
- **`<DCM-DSP-DID-DATA>` is KEPT.** It carries DID encoding metadata (DIAG-CODED-TYPE / BASE-TYPE-ENCODING / BIT-LENGTH) and is pinned by the SHIP-BLOCKING real-fixture test (`odxImportDiagnosticExtractHandler.real.test.ts:73-91`). Dropping it is a separate product decision, out of scope here.
- **`identifier` is OPTIONAL** on `OdxDidSummary` / `OdxRoutineSummary` — backward compat with hand-crafted fixtures and with DID-OBJECT declarations (which carry no PARAMS, so no coded-value; those DIDs get correct refs but no numeric param — documented degradation).
- **DTC value parsing:** `0x`-prefixed → hex; otherwise → decimal. Unparseable → omit the `PARAMETER-VALUES` block entirely (never emit a raw string into an ECUC-NUMERICAL `<VALUE>` — that is a schema violation).
- **ECUC instance hierarchy uses the FLAT strategy**: ECUC-CONTAINER-VALUE instances sit directly under the module's `<CONTAINERS>` (no `DcmConfigSet`/`DcmDsp` wrapper instances). The tree's `groupSiblingsForCollection()` groups by `definitionRef`, so flat placement with correct full-path definition-refs renders correctly. NOTE: this is a tool-internal staging convention, not AUTOSAR-conformant ECUC nesting — fine for in-tool staging (the declared workflow is "user merges with their BSWMD post-export"), but record it if these files are ever exported to external toolchains.
- All mutations remain pure functions (no IO in the mapper).
- Existing IPC contracts must not change (additive only).
- **Any test fixture change must be validated against `samples/odx/Demo_Cdd.odx-d`** — hand-crafted fixtures have caused three fixture-vs-reality bugs in this pipeline's history (documented in `parseOdxHandler.ts` comments). Every task that touches extraction or mapping must keep the `*.real.test.ts` suites green.
- Test runner: `node node_modules\vitest\vitest.mjs run <path> --reporter=dot`
- TypeScript checks: `node node_modules\typescript\bin\tsc --noEmit -p tsconfig.json` and `node node_modules\typescript\bin\tsc --noEmit -p tsconfig.web.json`

---

### Task 1: Add `identifier` field to ODX types

**Files:**

- Modify: `src/shared/types/odx.ts`

**Interfaces:**

- Produces: `OdxDidSummary.identifier?: number` and `OdxRoutineSummary.identifier?: number`

- [ ] **Step 1: Add `identifier` to `OdxDidSummary`**

In `src/shared/types/odx.ts`, add after the `data` field:

```typescript
export interface OdxDidSummary {
  // ... existing fields ...
  /**
   * Numeric DID identifier (e.g. 258 for RQ_CellVolt_JG_Read) extracted
   * from the 0x22 REQUEST's PARAM with SEMANTIC="ID" CODED-VALUE
   * (decimal in Vector exports). Optional for backward compat — absent
   * for legacy hand-crafted fixtures and for DID-OBJECT declarations,
   * which carry no PARAMS.
   */
  readonly identifier?: number;
}
```

- [ ] **Step 2: Add `identifier` to `OdxRoutineSummary`**

```typescript
export interface OdxRoutineSummary {
  // ... existing fields ...
  /**
   * Numeric routine identifier (e.g. 515 for
   * RQ_checkProgrammingPreconditions_Start) extracted from the 0x31
   * REQUEST's PARAM with SEMANTIC="ID" CODED-VALUE. Optional for
   * backward compat.
   */
  readonly identifier?: number;
}
```

- [ ] **Step 3: Run TypeScript to verify type compilation**

Run: `node node_modules\typescript\bin\tsc --noEmit -p tsconfig.json`
Expected: PASS (new optional fields are additive)

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/odx.ts
git commit -m "feat(odx): add optional numeric identifier to Did/Routine summaries"
```

---

### Task 2: Extract numeric identifiers in ODX parser

**Files:**

- Modify: `src/main/ipc/parseOdxHandler.ts`
- Test: `src/main/ipc/__tests__/parseOdxHandler.odx.test.ts` (hand-crafted fixtures)
- Test: `src/main/ipc/__tests__/parseOdxHandler.real.test.ts` (real Vector sample — SHIP-BLOCKING)

**Interfaces:**

- Consumes: `OdxDidSummary.identifier` and `OdxRoutineSummary.identifier` (from Task 1)
- Produces: populated `identifier` field on parsed `OdxDidSummary` / `OdxRoutineSummary` output

**Key correction from v1:** Both DID and Routine identifiers use `SEMANTIC="ID"` (verified: `Demo_Cdd.odx-d:10154` and `:12166`). One shared helper serves both — do NOT write two near-identical functions keyed on different semantics.

- [ ] **Step 1: Write failing test — DID + Routine identifier extraction (hand-crafted)**

In `parseOdxHandler.odx.test.ts`, add tests with an ODX snippet whose 0x22 REQUEST carries `<PARAM SEMANTIC="ID"><CODED-VALUE>258</CODED-VALUE>` and whose 0x31 REQUEST carries `<PARAM SEMANTIC="ID"><CODED-VALUE>515</CODED-VALUE>`; assert `identifier: 258` / `identifier: 515` on the summaries. Also assert a REQUEST whose ID param has no CODED-VALUE yields `identifier: undefined`.

- [ ] **Step 2: Write failing test — real-fixture identifiers**

In `parseOdxHandler.real.test.ts`, add:

```typescript
it('extracts numeric identifiers from every DID and Routine in Demo_Cdd.odx-d', () => {
  const result = parseOdxHandler({ content: fixtureContent });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  // All 34 DIDs are 0x22 REQUESTs with SEMANTIC="ID" params.
  expect(result.value.dids.every((d) => d.identifier !== undefined)).toBe(true);
  // All 4 Routines are 0x31 REQUESTs with SEMANTIC="ID" params.
  expect(result.value.routines.every((r) => r.identifier !== undefined)).toBe(true);
  // Concrete pins (Demo_Cdd.odx-d:10154, :12166):
  expect(result.value.dids.find((d) => d.shortName === 'RQ_CellVolt_JG_Read')?.identifier).toBe(
    258,
  );
  expect(
    result.value.routines.find((r) => r.shortName === 'RQ_checkProgrammingPreconditions_Start')
      ?.identifier,
  ).toBe(515);
});
```

(Adapt to the file's existing fixture-loading pattern.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `node node_modules\vitest\vitest.mjs run src/main/ipc/__tests__/parseOdxHandler.odx.test.ts src/main/ipc/__tests__/parseOdxHandler.real.test.ts --reporter=dot`
Expected: FAIL — `identifier` is undefined

- [ ] **Step 4: Implement the shared extraction helper**

In `parseOdxHandler.ts`, add ONE helper (uses the existing `attrOf`, mirroring `serviceIdOf`'s style):

```typescript
/** Extract the numeric identifier from a 0x22 (DID) or 0x31 (Routine)
 *  REQUEST. Both model their identifier as the PARAM with
 *  SEMANTIC="ID" (RecordDataIdentifier / RoutineIdentifier) — verified
 *  against samples/odx/Demo_Cdd.odx-d (DID: line 10154, Routine: line
 *  12166). CODED-VALUE is decimal in Vector exports. Returns undefined
 *  when no ID param or no parseable CODED-VALUE is found. */
function extractIdParam(params: unknown): number | undefined {
  if (typeof params !== 'object' || params === null) return undefined;
  const paramsObj = params as Record<string, unknown>;
  for (const param of asArray(paramsObj['PARAM'])) {
    if (typeof param !== 'object' || param === null) continue;
    const p = param as Record<string, unknown>;
    if (p['@_SEMANTIC'] !== 'ID') continue;
    const coded = attrOf(p, 'CODED-VALUE');
    if (coded.length === 0) return undefined;
    const n = Number.parseInt(coded, 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }
  return undefined;
}
```

Wire it into the 0x22 REQUEST collection inside `extractDids` (next to the existing `data` capture):

```typescript
const identifier = extractIdParam(el['PARAMS']);
if (data !== null) {
  out.push({ id, shortName: attrOf(el, 'SHORT-NAME'), data, identifier });
} else {
  out.push({ id, shortName: attrOf(el, 'SHORT-NAME'), identifier });
}
```

And into the Routine collection inside `extractRoutines`:

```typescript
out.push({ id, shortName: attrOf(el, 'SHORT-NAME'), identifier: extractIdParam(el['PARAMS']) });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node node_modules\vitest\vitest.mjs run src/main/ipc/__tests__/parseOdxHandler.odx.test.ts src/main/ipc/__tests__/parseOdxHandler.real.test.ts --reporter=dot`
Expected: PASS — including the new real-fixture pins (258 / 515)

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/parseOdxHandler.ts src/main/ipc/__tests__/parseOdxHandler.odx.test.ts src/main/ipc/__tests__/parseOdxHandler.real.test.ts
git commit -m "feat(odx): extract numeric DID/Routine identifiers via SEMANTIC=ID params"
```

---

### Task 3: Create `definitionRefResolver`

**Files:**

- Create: `src/core/bridge/definitionRefResolver.ts`
- Test: `src/core/bridge/__tests__/definitionRefResolver.test.ts`

**Root cause:** Bridge mappers hardcode definition-ref paths as string literals, and each invents its own prefix (`/Dcm/`, `/AUTOSAR/Com/`). But package roots differ across BSWMD sets (`/AUTOSAR_R22/EcucDefs/...` in the user workspace, `/AUTOSAR/Dcm/...` in the real-OEM fixture, `/Dcm/...` in demo-ecu) — no hardcoded prefix is correct in general. Resolve from the loaded BSWMD; fall back to the standard R22 prefix only when no BSWMD is threaded.

**Interfaces:**

- Consumes: `BswModuleDef` / `ContainerDef` / `ParamDef` / `ReferenceDef` from `src/core/project/bswmd/types.ts`
- Produces: `resolveDefinitionRef(moduleName, containerPath, bswmd?, onMiss?): string`

- [ ] **Step 1: Write failing tests**

Use a typed fixture builder (no `as unknown as` casts):

```typescript
import { describe, it, expect } from 'vitest';
import { resolveDefinitionRef } from '../definitionRefResolver.js';
import type { BswModuleDef, ContainerDef, ParamDef } from '../../project/bswmd/types.js';

function container(
  shortName: string,
  path: string,
  over: Partial<ContainerDef> = {},
): ContainerDef {
  return {
    shortName,
    path,
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    subContainers: [],
    parameters: [],
    references: [],
    choices: [],
    ...over,
  };
}
function intParam(shortName: string, path: string): ParamDef {
  return {
    shortName,
    path,
    kind: 'integer',
    defaultValue: null,
    minValue: null,
    maxValue: null,
    minLength: null,
    maxLength: null,
    enumerationLiterals: [],
  };
}

// Dcm > DcmConfigSet > DcmDsp > DcmDspDid (+ param DcmDspDidIdentifier)
const dcmDspDid = container(
  'DcmDspDid',
  '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDid',
  {
    parameters: [
      intParam(
        'DcmDspDidIdentifier',
        '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidIdentifier',
      ),
    ],
  },
);
const dcmBswmd = {
  shortName: 'Dcm',
  path: '/AUTOSAR_R22/EcucDefs/Dcm',
  dialect: 'ecuc-module-def',
  moduleId: null,
  containers: [
    container('DcmConfigSet', '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet', {
      subContainers: [
        container('DcmDsp', '/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp', {
          subContainers: [dcmDspDid],
        }),
      ],
    }),
  ],
  providedEntries: [],
  lowerMultiplicity: 1,
  upperMultiplicity: 1,
} as BswModuleDef;
```

Tests:

1. resolves a nested container path via tree walk (`['DcmConfigSet','DcmDsp','DcmDspDid']` → full path)
2. resolves a **parameter leaf** (`['DcmConfigSet','DcmDsp','DcmDspDid','DcmDspDidIdentifier']` → param path) — v1's resolver design missed this case
3. resolves the module itself when `containerPath` is `[]` → `bswmd.path`
4. falls back to `/AUTOSAR_R22/EcucDefs/{module}/...` when `bswmd` is undefined
5. falls back AND fires `onMiss` when bswmd is provided but the path is not found

- [ ] **Step 2: Run test to verify it fails**

Run: `node node_modules\vitest\vitest.mjs run src/core/bridge/__tests__/definitionRefResolver.test.ts --reporter=dot`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `definitionRefResolver.ts`**

```typescript
// definitionRefResolver — central definition-ref path resolver.
//
// Bridge mappers must NOT hardcode DEFINITION-REF literals: package
// roots differ across BSWMD sets (/AUTOSAR_R22/EcucDefs/... in the
// user workspace, /AUTOSAR/Dcm/... in the real-OEM fixture, /Dcm/...
// in demo-ecu). Given a module shortName and a container path
// (shortNames from module root; the leaf may name a sub-container,
// parameter, or reference), resolve the BSWMD-accurate ref by
// walking the container tree. When no BswModuleDef is threaded
// (standalone extract), fall back to the standard AUTOSAR R22
// EcucDefs prefix. When a BSWMD IS provided but the path is not
// found, fire `onMiss` (callers surface a warning) and fall back —
// a miss with a loaded BSWMD means a mapper bug or a nonstandard
// BSWMD, and must not pass silently.

import type { BswModuleDef, ContainerDef } from '../project/bswmd/types.js';

const STANDARD_PREFIX = '/AUTOSAR_R22/EcucDefs';

export interface DefinitionRefMiss {
  readonly moduleName: string;
  readonly containerPath: readonly string[];
}

export function resolveDefinitionRef(
  moduleName: string,
  containerPath: readonly string[],
  bswmd?: BswModuleDef | undefined,
  onMiss?: (miss: DefinitionRefMiss) => void,
): string {
  if (bswmd !== undefined) {
    if (containerPath.length === 0) return bswmd.path;
    const resolved = findPathInTree(bswmd.containers, containerPath, 0);
    if (resolved !== null) return resolved;
    onMiss?.({ moduleName, containerPath });
  }
  const segments = [moduleName, ...containerPath].filter(Boolean);
  return `${STANDARD_PREFIX}/${segments.join('/')}`;
}

function findPathInTree(
  candidates: readonly ContainerDef[],
  path: readonly string[],
  index: number,
): string | null {
  if (index >= path.length) return null;
  const target = path[index];
  for (const candidate of candidates) {
    if (candidate.shortName !== target) continue;
    if (index === path.length - 1) return candidate.path;
    const nested = findPathInTree(
      [...candidate.subContainers, ...candidate.choices],
      path,
      index + 1,
    );
    if (nested !== null) return nested;
    // The final segment may name a parameter or reference on this
    // container (e.g. DcmDspDid/DcmDspDidIdentifier), not a
    // sub-container.
    if (index === path.length - 2) {
      const leafName = path[index + 1];
      const leaf = [...candidate.parameters, ...candidate.references].find(
        (l) => l.shortName === leafName,
      );
      if (leaf !== undefined) return leaf.path;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node node_modules\vitest\vitest.mjs run src/core/bridge/__tests__/definitionRefResolver.test.ts --reporter=dot`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/bridge/definitionRefResolver.ts src/core/bridge/__tests__/definitionRefResolver.test.ts
git commit -m "feat(bridge): add central definitionRefResolver for BSWMD-accurate definition-refs"
```

---

### Task 4: Fix `buildDcmContent` via resolver + thread BSWMDs

**Files:**

- Modify: `src/core/bridge/odxToDiagnosticExtract.ts`
- Test: `src/core/bridge/__tests__/odxToDiagnosticExtract.test.ts`
- Modify: `src/core/bridge/dcmConfigPipeline.ts` (one-line: pass its existing `request.bswmds`)
- Test: `src/core/bridge/__tests__/dcmConfigPipeline.test.ts` (regression — must stay green)

**Interfaces:**

- Consumes: `resolveDefinitionRef` (Task 3), `identifier` (Tasks 1–2)
- `OdxToDiagnosticExtractRequest` gains `readonly bswmds?: ReadonlyMap<string, BswModuleDef>` (additive)

**Decisions recorded:**

- KEEP `<DCM-DSP-DID-DATA>` (encoding metadata round-trip; pinned by SHIP-BLOCKING real test).
- KEEP the `<ECUC-MODULE-CONFIGURATION-VALUES>` wrapper (required by the v1.27.0 xlsx apply step's `findByPath('/DiagExtract/Dcm')`).
- The standalone extract handler (`odxImportDiagnosticExtractHandler`) is NOT threaded in this plan — it resolves via the fallback prefix (correct for the R22 workspace). Threading it is Task 3 of the follow-up plan.

- [ ] **Step 1: Write failing tests**

```typescript
it('emits full-path DcmDspDid definition-ref including DcmConfigSet/DcmDsp', () => {
  const result = odxToDiagnosticExtract({ odx: sampleOdx });
  expect(result.dcmContent).toContain(
    '<DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDid</DEFINITION-REF>',
  );
  expect(result.dcmContent).not.toContain('DEST="DCM-DSP-DID"');
});

it('emits full-path DcmDspRoutine definition-ref', () => {
  const result = odxToDiagnosticExtract({ odx: sampleOdx });
  expect(result.dcmContent).toContain(
    '<DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspRoutine</DEFINITION-REF>',
  );
});

it('emits ECUC-NUMERICAL-PARAM-VALUE for DID identifier with full param path', () => {
  const odxWithId: OdxSummary = {
    ...sampleOdx,
    dids: [{ id: 'DID_001', shortName: 'DID_F186', identifier: 62342 }],
  };
  const result = odxToDiagnosticExtract({ odx: odxWithId });
  expect(result.dcmContent).toContain(
    '<DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidIdentifier</DEFINITION-REF>',
  );
  expect(result.dcmContent).toContain('<VALUE>62342</VALUE>');
});

it('emits ECUC-NUMERICAL-PARAM-VALUE for Routine identifier with full param path', () => {
  const odxWithRoutineId: OdxSummary = {
    ...sampleOdx,
    routines: [{ id: 'REQ_ERASE', shortName: 'REQ_EraseMemory', identifier: 61184 }],
  };
  const result = odxToDiagnosticExtract({ odx: odxWithRoutineId });
  expect(result.dcmContent).toContain(
    '<DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspRoutine/DcmDspRoutineIdentifier</DEFINITION-REF>',
  );
  expect(result.dcmContent).toContain('<VALUE>61184</VALUE>');
});

it('does NOT emit PARAMETER-VALUES when identifier is absent (backward-compat)', () => {
  const result = odxToDiagnosticExtract({ odx: sampleOdx });
  expect(result.dcmContent).not.toContain('<ECUC-NUMERICAL-PARAM-VALUE>');
});

it('emits module definition-ref /AUTOSAR_R22/EcucDefs/Dcm', () => {
  const result = odxToDiagnosticExtract({ odx: sampleOdx });
  expect(result.dcmContent).toContain(
    '<DEFINITION-REF DEST="ECUC-MODULE-DEF">/AUTOSAR_R22/EcucDefs/Dcm</DEFINITION-REF>',
  );
});

it('resolves refs from a threaded BSWMD instead of the fallback prefix', () => {
  // BSWMD fixture with a NON-standard package root (e.g. /AUTOSAR/Dcm/...).
  const result = odxToDiagnosticExtract({
    odx: sampleOdx,
    bswmds: new Map([['Dcm', customRootDcmBswmd]]),
  });
  expect(result.dcmContent).toContain('/AUTOSAR/Dcm/DcmConfigSet/DcmDsp/DcmDspDid');
  expect(result.dcmContent).not.toContain('/AUTOSAR_R22/EcucDefs/Dcm');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node node_modules\vitest\vitest.mjs run src/core/bridge/__tests__/odxToDiagnosticExtract.test.ts --reporter=dot`
Expected: FAIL — current output uses `/Dcm/...` paths and no PARAMETER-VALUES

- [ ] **Step 3: Implement the fix**

Extend the request interface and thread through:

```typescript
import type { BswModuleDef } from '../project/bswmd/types.js';
import { resolveDefinitionRef } from './definitionRefResolver.js';

export interface OdxToDiagnosticExtractRequest {
  readonly odx: OdxSummary;
  /** Optional BSWMD lookup keyed by module shortName. When present,
   *  definition-refs resolve from the BSWMD tree; otherwise the
   *  standard R22 prefix fallback is used. */
  readonly bswmds?: ReadonlyMap<string, BswModuleDef>;
}
```

Rewrite `buildDcmContent` (keep the DATA block and the module wrapper; resolve all refs):

```typescript
function buildDcmContent(odx: OdxSummary, bswmds?: ReadonlyMap<string, BswModuleDef>): string {
  const dcmBswmd = bswmds?.get('Dcm');
  const moduleRef = resolveDefinitionRef('Dcm', [], dcmBswmd);
  const didRef = resolveDefinitionRef('Dcm', ['DcmConfigSet', 'DcmDsp', 'DcmDspDid'], dcmBswmd);
  const didIdRef = resolveDefinitionRef(
    'Dcm',
    ['DcmConfigSet', 'DcmDsp', 'DcmDspDid', 'DcmDspDidIdentifier'],
    dcmBswmd,
  );
  const routineRef = resolveDefinitionRef(
    'Dcm',
    ['DcmConfigSet', 'DcmDsp', 'DcmDspRoutine'],
    dcmBswmd,
  );
  const routineIdRef = resolveDefinitionRef(
    'Dcm',
    ['DcmConfigSet', 'DcmDsp', 'DcmDspRoutine', 'DcmDspRoutineIdentifier'],
    dcmBswmd,
  );

  const dids = odx.dids
    .map((did) => {
      const dataBlock = did.data
        ? `\n        <DCM-DSP-DID-DATA>\n          <DIAG-CODED-TYPE>${escapeXmlText(did.data.dataType)}</DIAG-CODED-TYPE>\n          <BASE-TYPE-ENCODING>${escapeXmlText(did.data.encoding)}</BASE-TYPE-ENCODING>${did.data.bitLength !== undefined ? `\n          <BIT-LENGTH>${did.data.bitLength}</BIT-LENGTH>` : ''}\n        </DCM-DSP-DID-DATA>`
        : '';
      const paramsBlock =
        did.identifier !== undefined
          ? `\n        <PARAMETER-VALUES>\n          <ECUC-NUMERICAL-PARAM-VALUE>\n            <DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">${didIdRef}</DEFINITION-REF>\n            <VALUE>${did.identifier}</VALUE>\n          </ECUC-NUMERICAL-PARAM-VALUE>\n        </PARAMETER-VALUES>`
          : '';
      return `      <ECUC-CONTAINER-VALUE>
        <SHORT-NAME>${escapeXmlText(did.shortName)}</SHORT-NAME>
        <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">${didRef}</DEFINITION-REF>${paramsBlock}${dataBlock}
      </ECUC-CONTAINER-VALUE>`;
    })
    .join('\n');
  const routines = odx.routines
    .map((r) => {
      const paramsBlock =
        r.identifier !== undefined
          ? `\n        <PARAMETER-VALUES>\n          <ECUC-NUMERICAL-PARAM-VALUE>\n            <DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">${routineIdRef}</DEFINITION-REF>\n            <VALUE>${r.identifier}</VALUE>\n          </ECUC-NUMERICAL-PARAM-VALUE>\n        </PARAMETER-VALUES>`
          : '';
      return `      <ECUC-CONTAINER-VALUE>
        <SHORT-NAME>${escapeXmlText(r.shortName)}</SHORT-NAME>
        <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">${routineRef}</DEFINITION-REF>${paramsBlock}
      </ECUC-CONTAINER-VALUE>`;
    })
    .join('\n');
  const containersXml = [dids, routines].filter(Boolean).join('\n');
  const dcmModule = `    <ECUC-MODULE-CONFIGURATION-VALUES>
      <SHORT-NAME>Dcm</SHORT-NAME>
      <DEFINITION-REF DEST="ECUC-MODULE-DEF">${moduleRef}</DEFINITION-REF>
      <CONTAINERS>
${containersXml}
      </CONTAINERS>
    </ECUC-MODULE-CONFIGURATION-VALUES>`;
  return wrapWithEnvelope(dcmModule);
}
```

Note: the `<DCM-DSP-ROUTINE>` inner data-spec block is dropped (it carried only a duplicate SHORT-NAME — no information loss, unlike the DID DATA block).

Update `odxToDiagnosticExtract` to pass `request.bswmds` into both builders, and update `dcmConfigPipeline.ts`:

```typescript
const extract = odxToDiagnosticExtract({ odx: request.odx, bswmds: request.bswmds });
```

- [ ] **Step 4: Fix pre-existing tests that assert the old paths**

Update any test expecting `/Dcm/DcmDspDid` or `DEST="DCM-DSP-DID"` to the new shape. **Keep** the `<DCM-DSP-DID-DATA>` assertions — the block is retained.

- [ ] **Step 5: Run mapper + pipeline tests to verify they pass**

Run: `node node_modules\vitest\vitest.mjs run src/core/bridge/__tests__/odxToDiagnosticExtract.test.ts src/core/bridge/__tests__/dcmConfigPipeline.test.ts --reporter=dot`
Expected: PASS. The pipeline test's `/AUTOSAR/Dcm/DcmDspDid` assertion (real-OEM xlsx half) stays green — and with BSWMDs now threaded, the ODX half resolves against the same real-OEM BSWMD, making the stitched document internally consistent for the first time.

- [ ] **Step 6: Commit**

```bash
git add src/core/bridge/odxToDiagnosticExtract.ts src/core/bridge/__tests__/odxToDiagnosticExtract.test.ts src/core/bridge/dcmConfigPipeline.ts
git commit -m "fix(odx): emit standard ECUC params with BSWMD-resolved definition-refs in Dcm extract"
```

---

### Task 5: Fix `buildDemContent` — standard ECUC structure for tree visibility

**Files:**

- Modify: `src/core/bridge/odxToDiagnosticExtract.ts` (the `buildDemContent` function)
- Test: `src/core/bridge/__tests__/odxToDiagnosticExtract.test.ts`
- Test: `src/main/ipc/__tests__/odxImportDiagnosticExtractHandler.real.test.ts` (SHIP-BLOCKING — deliberate format-change updates)

**Root cause:** `DEM-EVENT-PARAMETER` is not an `ECUC-*` tag, so `classifyElement()` (`src/core/arxml/parser/walk.ts:202`) classifies it as `kind: 'unknown'` and the tree refuses to render it.

**Key corrections from v1 (all verified against the workspace BSWMD + real sample):**

1. The DTC container is **`DemConfigSet/DemDTC`** with param **`DemDtcValue`** (Dem_bswmd.arxml:148/229) — NOT `DemDTCAttributes` (a sibling container holding event attributes, referenced via `DemDTCAttributesRef`).
2. `TROUBLE-CODE` is decimal in real Vector exports (`687361`, Demo_Cdd.odx-d:116) — parse `0x`-prefixed as hex, everything else as decimal.
3. DTC text maps to `<LONG-NAME><L-4>` on the container (no `DemEventDescription` param exists in the BSWMD). Note `dtc.text` is the `buildDtcText` combined form (`"P0A7D01 — …"`), so the J2012 code survives in the LONG-NAME.

- [ ] **Step 1: Write failing tests (hand-crafted)**

```typescript
it('wraps DTC events in ECUC-MODULE-CONFIGURATION-VALUES (not bare DEM-EVENT-PARAMETER)', () => {
  const result = odxToDiagnosticExtract({ odx: sampleOdx });
  expect(result.demContent).toContain('<ECUC-MODULE-CONFIGURATION-VALUES>');
  expect(result.demContent).toContain(
    '<DEFINITION-REF DEST="ECUC-MODULE-DEF">/AUTOSAR_R22/EcucDefs/Dem</DEFINITION-REF>',
  );
  expect(result.demContent).not.toContain('<DEM-EVENT-PARAMETER>');
});

it('emits DemDTC container with DemDtcValue numeric param (full path)', () => {
  const result = odxToDiagnosticExtract({ odx: sampleOdx });
  expect(result.demContent).toContain(
    '<DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/AUTOSAR_R22/EcucDefs/Dem/DemConfigSet/DemDTC</DEFINITION-REF>',
  );
  expect(result.demContent).toContain(
    '<DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/AUTOSAR_R22/EcucDefs/Dem/DemConfigSet/DemDTC/DemDtcValue</DEFINITION-REF>',
  );
  // fixture troubleCode '0x123456' → hex → 1193046
  expect(result.demContent).toContain('<VALUE>1193046</VALUE>');
});

it('parses decimal TROUBLE-CODE (real Vector shape) as decimal', () => {
  const odxDecimal: OdxSummary = {
    ...sampleOdx,
    dtcs: [
      {
        id: 'D',
        shortName: 'DTC0A7D01',
        troubleCode: '687361',
        displayCode: 'P0A7D01',
        text: 'P0A7D01',
      },
    ],
  };
  const result = odxToDiagnosticExtract({ odx: odxDecimal });
  expect(result.demContent).toContain('<VALUE>687361</VALUE>');
});

it('omits PARAMETER-VALUES when TROUBLE-CODE is unparseable (never emits raw strings into NUMERICAL VALUE)', () => {
  const odxBad: OdxSummary = {
    ...sampleOdx,
    dtcs: [{ id: 'D', shortName: 'D', troubleCode: '', displayCode: '', text: '' }],
  };
  const result = odxToDiagnosticExtract({ odx: odxBad });
  expect(result.demContent).not.toContain('<ECUC-NUMERICAL-PARAM-VALUE>');
});

it('preserves DTC text as LONG-NAME on the container (not as a param)', () => {
  const result = odxToDiagnosticExtract({ odx: sampleOdx });
  expect(result.demContent).toContain('<LONG-NAME>');
});

it('does NOT emit LONG-NAME when DTC text is empty', () => {
  const odxNoText: OdxSummary = {
    ...sampleOdx,
    dtcs: [{ id: 'D', shortName: 'D', troubleCode: '0x1', displayCode: '1', text: '' }],
  };
  const result = odxToDiagnosticExtract({ odx: odxNoText });
  expect(result.demContent).not.toContain('<LONG-NAME>');
});
```

- [ ] **Step 2: Update the SHIP-BLOCKING real-fixture test for the deliberate format change**

`odxImportDiagnosticExtractHandler.real.test.ts` asserts `<DTC-VALUE>687361</DTC-VALUE>` and `<DISPLAY-CODE>P0A7D01</DISPLAY-CODE>` — elements this task removes **by design**. This is an intentional format change (the file's "fix the mapper, NOT the test" rule covers regressions, not format migrations). Update the DTC test to assert the new shape against the same real values:

```typescript
expect(demContent).toContain('<SHORT-NAME>DTC0A7D01</SHORT-NAME>');
expect(demContent).toContain(
  '<DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/AUTOSAR_R22/EcucDefs/Dem/DemConfigSet/DemDTC/DemDtcValue</DEFINITION-REF>',
);
expect(demContent).toContain('<VALUE>687361</VALUE>');
// J2012 code survives via LONG-NAME (buildDtcText combined form).
expect(demContent).toMatch(/<L-4 L="EN">P0A7D01/);
expect(demContent).not.toContain('<DEM-EVENT-PARAMETER>');
```

The count assertions (99/34/4) and the `<DCM-DSP-DID-DATA>` tests stay UNTOUCHED.

- [ ] **Step 3: Run tests to verify they fail**

Run: `node node_modules\vitest\vitest.mjs run src/core/bridge/__tests__/odxToDiagnosticExtract.test.ts src/main/ipc/__tests__/odxImportDiagnosticExtractHandler.real.test.ts --reporter=dot`
Expected: FAIL — current output uses bare `DEM-EVENT-PARAMETER`

- [ ] **Step 4: Implement the fix**

```typescript
/** Parse a TROUBLE-CODE string to its numeric value. Real Vector
 *  exports are decimal with no prefix ("687361" = 0xA7D01, verified
 *  at samples/odx/Demo_Cdd.odx-d:116); legacy hand-crafted fixtures
 *  use 0x-prefixed hex. Returns undefined when unparseable — callers
 *  must then omit the numeric param entirely (a raw string in an
 *  ECUC-NUMERICAL <VALUE> is a schema violation). */
function parseTroubleCode(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const isHex = /^0[xX]/.test(trimmed);
  const n = Number.parseInt(isHex ? trimmed.slice(2) : trimmed, isHex ? 16 : 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function buildDemContent(odx: OdxSummary, bswmds?: ReadonlyMap<string, BswModuleDef>): string {
  const demBswmd = bswmds?.get('Dem');
  const moduleRef = resolveDefinitionRef('Dem', [], demBswmd);
  const dtcRef = resolveDefinitionRef('Dem', ['DemConfigSet', 'DemDTC'], demBswmd);
  const dtcValueRef = resolveDefinitionRef(
    'Dem',
    ['DemConfigSet', 'DemDTC', 'DemDtcValue'],
    demBswmd,
  );
  const events = odx.dtcs
    .map((dtc) => {
      const dtcValue = parseTroubleCode(dtc.troubleCode);
      const longNameBlock = dtc.text
        ? `\n        <LONG-NAME>\n          <L-4 L="EN">${escapeXmlText(dtc.text)}</L-4>\n        </LONG-NAME>`
        : '';
      const paramsBlock =
        dtcValue !== undefined
          ? `\n        <PARAMETER-VALUES>\n          <ECUC-NUMERICAL-PARAM-VALUE>\n            <DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">${dtcValueRef}</DEFINITION-REF>\n            <VALUE>${dtcValue}</VALUE>\n          </ECUC-NUMERICAL-PARAM-VALUE>\n        </PARAMETER-VALUES>`
          : '';
      return `      <ECUC-CONTAINER-VALUE>
        <SHORT-NAME>${escapeXmlText(dtc.shortName)}</SHORT-NAME>
        <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">${dtcRef}</DEFINITION-REF>${longNameBlock}${paramsBlock}
      </ECUC-CONTAINER-VALUE>`;
    })
    .join('\n');
  const demModule = `    <ECUC-MODULE-CONFIGURATION-VALUES>
      <SHORT-NAME>Dem</SHORT-NAME>
      <DEFINITION-REF DEST="ECUC-MODULE-DEF">${moduleRef}</DEFINITION-REF>
      <CONTAINERS>
${events}
      </CONTAINERS>
    </ECUC-MODULE-CONFIGURATION-VALUES>`;
  return wrapWithEnvelope(demModule);
}
```

Also update `odxToDiagnosticExtract` to pass `request.bswmds` into `buildDemContent`.

- [ ] **Step 5: Fix pre-existing hand-crafted tests that assert the old bare DEM-EVENT-PARAMETER shape**

Update `odxToDiagnosticExtract.test.ts` assertions on `<EVENT-KIND>` / `<DISPLAY-CODE>` / `<DTC-VALUE>` / `<TEXT>` to the new shape (EVENT-KIND is dropped — no such param on DemDTC; DISPLAY-CODE survives via LONG-NAME).

- [ ] **Step 6: Run all mapper + handler tests to verify they pass**

Run: `node node_modules\vitest\vitest.mjs run src/core/bridge/__tests__/odxToDiagnosticExtract.test.ts src/main/ipc/__tests__/odxImportDiagnosticExtractHandler.real.test.ts --reporter=dot`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/bridge/odxToDiagnosticExtract.ts src/core/bridge/__tests__/odxToDiagnosticExtract.test.ts src/main/ipc/__tests__/odxImportDiagnosticExtractHandler.real.test.ts
git commit -m "fix(odx): wrap Dem DTCs in standard ECUC structure with BSWMD-resolved refs"
```

---

### Task 6: End-to-end verification

**Files:**

- No new files — integration verification

- [ ] **Step 1: Run the full affected test suites**

Run: `node node_modules\vitest\vitest.mjs run src/core/bridge/ src/main/ipc/__tests__/parseOdxHandler.odx.test.ts src/main/ipc/__tests__/parseOdxHandler.real.test.ts src/main/ipc/__tests__/odxImportDiagnosticExtractHandler.real.test.ts --reporter=dot`
Expected: ALL PASS

- [ ] **Step 2: Run TypeScript checks**

Run: `node node_modules\typescript\bin\tsc --noEmit -p tsconfig.json`
Run: `node node_modules\typescript\bin\tsc --noEmit -p tsconfig.web.json`
Expected: PASS (0 errors)

- [ ] **Step 3: Manual smoke test (user-driven)**

Ask the user to:

1. Open their workspace project (`ClaudeAutosarWorkSpace`)
2. Import `samples/odx/Demo_Cdd.odx-d` (or their own ODX-D file)
3. Run Diagnostic Extract → "Open in workspace"
4. Verify: `Dem_Extract.arxml` tree shows `Dem > DemDTC` containers with DTC values (e.g. 687361) — not blank, not invisible
5. Verify: `Dcm_Extract.arxml` tree shows `Dcm > DcmDspDid` / `DcmDspRoutine` containers with numeric identifiers in the parameter editor (e.g. 258 / 515) — not shells
6. Verify: DID containers with encoding data still show the `<DCM-DSP-DID-DATA>` metadata without breaking tree rendering
7. **Acceptance gate: zero "找不到BSWMD ref" warnings in either file's tree**
8. Regression: run the Dcm config pipeline (ODX + xlsx) end-to-end and confirm the stitched output still generates

---

### Task 7 (Deferred): UI semantics cleanup

**Files:**

- Modify: `src/renderer/components/DiagnosticExtractSuccessDialog.tsx`
- Modify: `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx`
- Modify: i18n resource files

**Scope:** Rename "Import ODX-D → Diagnostic Extract" to clarify it only extracts staging files; add explicit warning that `DcmDsdService` is NOT auto-generated; consider a separate "Generate DcmDsdService from ODX-D" feature.

This task is deferred — it does not block the correctness fix above and should be planned separately after the user validates the data flow works.

---

### Follow-up plan (separate file)

`2026-09-02-definition-ref-resolver-adoption.md` — adopts the Task-3 resolver in `dbcToComStack` (Com/CanIf/PduR), threads BSWMD loading into the DBC import handler and the standalone ODX extract handler, and adds a post-generation definition-ref validation contract test. Execute it after this plan ships and the user confirms the smoke test.
