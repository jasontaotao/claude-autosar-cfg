# ODX-D Full Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement reviewed ODX-D full parsing, DIM mapping, preview/commit three-way import, wizard UI, and staging/xlsx migration without regressing the existing ODX viewer or diagnostic-extract IPC contract.

**Architecture:** Add a pure `src/core/odx/` pipeline: full ODX parsing → inheritance/DOP resolution → DIM → BSWMD-backed ECUC mapping → deterministic three-way classification/merge. Main-process IPC owns file IO, provenance manifest, commit/reload; the renderer owns variant selection, row decisions, dirty-state checks, and wizard state. The old viewer summary channel remains independent.

**Tech Stack:** TypeScript, Electron IPC, React + Zustand, Vitest + Testing Library, fast-xml-parser, existing ARXML AST/parser/serializer/patch/atomic-write utilities.

**Spec:** `docs/superpowers/specs/2026-09-02-odx-full-import-design.md`

## Global Constraints

- The spec is normative; where this plan summarizes, implement the spec wording exactly.
- Parse/DIM/mapping/three-way merge are pure functions with zero IO.
- Main process owns all ODX/ECUC/manifest IO and preview/commit orchestration.
- `definitionRef` is authoritative; never emit a guessed or dangling definition-ref in project import.
- New IPC contracts are additive; do not change `odx:parseOdx` or existing `OdxSummary`.
- Existing `ImportPatchOp` set must not be extended.
- All new warning codes must come from spec §11.
- Preview and commit must be deterministic for identical ODX, variant, project, and BSWMD inputs.
- Prettier, two `tsc --noEmit` configs, and targeted Vitest suites must pass before each commit.
- Do not commit `.codegraph/`, `__write_plan.cjs`, mockups, or unrelated plan documents.

## File Structure

Create:

- `src/core/odx/odxDocument.ts` — raw ODX document wrapper and ID index.
- `src/core/odx/layerResolver.ts` — parent-chain flattening.
- `src/core/odx/dopResolver.ts` — DOP / COMPU-METHOD / UNIT resolution.
- `src/core/odx/dim.ts` — DIM types from spec §4.
- `src/core/odx/dimBuilder.ts` — services, params, DTCs, sessions/security.
- `src/core/odx/bswmdDefIndex.ts` — spine-keyed Dcm/Dem BSWMD index.
- `src/core/odx/shortName.ts` — deterministic AUTOSAR short-name legalization.
- `src/core/odx/mapDimToEcuc.ts` — mapping facade and deterministic module assembly.
- `src/core/odx/dcmMapper.ts` — Dcm-specific mapping.
- `src/core/odx/demMapper.ts` — Dem-specific mapping.
- `src/core/odx/dimToDiagnosticExtract.ts` — staging emitter.
- `src/core/odx/threeWayMerge.ts` — provenance hash, six-category classifier, merge.
- `src/main/ipc/odxImportPreviewHandler.ts` — preview orchestration.
- `src/main/ipc/odxImportCommitHandler.ts` — commit orchestration.
- `src/shared/types/odx-import.ts` — additive IPC DTOs.
- `src/renderer/components/OdxImportWizard/` — wizard UI and tests.

Modify:

- `src/main/ipc/register.ts`, `src/shared/ipc-contract.ts`, `src/preload/index.ts`.
- `src/main/ipc/odxImportDiagnosticExtractHandler.ts`.
- `src/core/bridge/dcmConfigPipeline.ts` and related DCM xlsx validation.
- `src/renderer/AppHeader.tsx`, app hooks, i18n files.

---

### Task 1: Raw ODX document and ID index

**Files:**
- Create: `src/core/odx/odxDocument.ts`
- Test: `src/core/odx/__tests__/odxDocument.test.ts`

**Interfaces:**
- Produces: `parseOdxDocument(xml: string): OdxDocument`, types `OdxDocument`, `OdxRawElement`, `OdxVariantInfo`.

- [ ] **Step 1: Write failing tests**

Pin real-fixture facts and raw-shape invariants:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseOdxDocument } from '../odxDocument.js';

const realXml = readFileSync('../../../../ClaudeAutosarWorkSpace/samples/odx/Demo_Cdd.odx-d', 'utf8');

describe('parseOdxDocument', () => {
  it('indexes the real Vector CANdela fixture', () => {
    const doc = parseOdxDocument(realXml);
    expect(doc.importableVariants).toHaveLength(1);
    expect(doc.importableVariants[0]?.kind).toBe('BASE-VARIANT');
    expect(doc.idIndex.size).toBeGreaterThan(0);
    expect(doc.layers.map((x) => x.tag)).toContain('BASE-VARIANT');
  });

  it('preserves repeated child tags in document order', () => {
    const doc = parseOdxDocument(realXml);
    const base = doc.importableVariants[0]!;
    const layer = doc.idIndex.get(base.odxId)!;
    const services = layer.children['DIAG-SERVICE'] ?? [];
    expect(services.length).toBe(95);
  });

  it('rejects malformed XML', () => {
    expect(() => parseOdxDocument('<ODX>')).toThrowError(/ODX parse failed|XML/);
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run: `node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/odxDocument.test.ts --reporter=dot`  
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the parser wrapper**

Reuse the exact `fast-xml-parser` options from `src/main/ipc/parseOdxHandler.ts`, especially `parseTagValue: false`. Normalize every discovered object node into:

```ts
export interface OdxRawElement {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: Readonly<Record<string, readonly OdxRawElement[]>>;
}
```

Build `idIndex` from every node with an `ID` attribute. `layers` must include `PROTOCOL`, `BASE-VARIANT`, `ECU-VARIANT`, and `FUNCTIONAL-GROUP` in document order. `importableVariants` contains only base/ECU variants.

- [ ] **Step 4: Run targeted tests**

Run: `node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/odxDocument.test.ts --reporter=dot`  
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/odx/odxDocument.ts src/core/odx/__tests__/odxDocument.test.ts
git commit -m "feat(odx): add full ODX document parser and id index"
```

---

### Task 2: Inheritance layer resolver

**Files:**
- Create: `src/core/odx/layerResolver.ts`
- Test: `src/core/odx/__tests__/layerResolver.test.ts`

**Interfaces:**
- Consumes: `OdxDocument`, `OdxRawElement`.
- Produces: `resolveLayer(doc: OdxDocument, variantId: string): ResolvedLayer`.

- [ ] **Step 1: Write failing tests**

Cover the exact chain, same-ID override, NOT-INHERITED removal, unresolved parent warning, and cycle hard error:

```ts
const layer = resolveLayer(doc, ecuVariantId);
expect(layer.chain.map((x) => x.tag)).toEqual(['ECU-VARIANT', 'BASE-VARIANT', 'PROTOCOL']);
expect(layer.services.some((x) => x.odxId === inheritedServiceId)).toBe(true);
expect(layer.services.some((x) => x.odxId === excludedServiceId)).toBe(false);
```

- [ ] **Step 2: Run test and verify failure**

Run: `node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/layerResolver.test.ts --reporter=dot`  
Expected: FAIL.

- [ ] **Step 3: Implement parent-chain flattening**

Walk `PARENT-REFS/PARENT-REF` by `ID-REF` through `doc.idIndex`; ignore `xsi:type`. Merge elements recursively by ODX `ID`; child wins. Return warnings in a typed result rather than throwing for unresolved refs.

- [ ] **Step 4: Run targeted tests**

Run: `node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/layerResolver.test.ts --reporter=dot`  
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/odx/layerResolver.ts src/core/odx/__tests__/layerResolver.test.ts
git commit -m "feat(odx): resolve ODX diagnostic layer inheritance"
```

---

### Task 3: DOP resolver

**Files:**
- Create: `src/core/odx/dopResolver.ts`
- Test: `src/core/odx/__tests__/dopResolver.test.ts`

**Interfaces:**
- Consumes: `ResolvedLayer`.
- Produces: `resolveDataObjects(layer: ResolvedLayer): { dataObjects: DimDataObject[]; warnings: DimWarning[] }`.

- [ ] **Step 1: Write failing tests**

Create small ODX fragments for IDENTICAL, LINEAR, TEXTTABLE, SCALE-LINEAR, unsupported RAT-FUNC, standard/min-max coded types, opaque unsupported length types, and DTC-DOPs.

```ts
const dop = result.dataObjects.find((x) => x.odxId === '_uint16')!;
expect(dop.codedType).toEqual({ kind: 'standard', bitLength: 16 });
expect(dop.compuMethod).toEqual({ kind: 'identical' });
```

- [ ] **Step 2: Run test and verify failure**

Run: `node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/dopResolver.test.ts --reporter=dot`  
Expected: FAIL.

- [ ] **Step 3: Implement DOP mapping**

Implement exactly spec §3.3 support matrices. Preserve unsupported DOP fields while setting `compuMethod: undefined`. Never throw for one malformed DOP; emit `odx-element-skipped` when no more specific code applies.

- [ ] **Step 4: Run targeted tests**

Run: `node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/dopResolver.test.ts --reporter=dot`  
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/odx/dopResolver.ts src/core/odx/__tests__/dopResolver.test.ts
git commit -m "feat(odx): resolve ODX data object properties"
```

---

### Task 4: DIM types and builder

**Files:**
- Create: `src/core/odx/dim.ts`, `src/core/odx/dimBuilder.ts`
- Test: `src/core/odx/__tests__/dimBuilder.test.ts`

**Interfaces:**
- Consumes: `resolveLayer`, `resolveDataObjects`.
- Produces: `buildDim(input: { document: OdxDocument; variantId: string; sourcePath: string }): Dim`.
- Types: exact readonly interfaces from spec §4.

- [ ] **Step 1: Write failing tests**

Use real-fixture smoke assertions and synthetic edge cases:

```ts
const dim = buildDim({ document, variantId, sourcePath: 'Demo_Cdd.odx-d' });
expect(dim.services.length).toBe(95);
expect(dim.dataObjects.length).toBe(167);
expect(dim.dtcs.length).toBe(99);
```

Also assert SID 0x80 masking, all service-class mappings, DID/Routine identifier semantics, DTC boundaries, session dedup, security pairing, and session/security dependency derivation.

- [ ] **Step 2: Run test and verify failure**

Run: `node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/dimBuilder.test.ts --reporter=dot`  
Expected: FAIL.

- [ ] **Step 3: Implement DIM assembly**

Copy all readonly type shapes from spec §4 without adding fields. Build request/response parameter trees in byte-position order. Unknown services remain available to warnings and are skipped only by the mapper.

- [ ] **Step 4: Run targeted tests and viewer regression**

```powershell
node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/dimBuilder.test.ts --reporter=dot
node node_modules/vitest/vitest.mjs run src/main/ipc/__tests__/parseOdxHandler.test.ts src/renderer/components/OdxViewer --reporter=dot
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/odx/dim.ts src/core/odx/dimBuilder.ts src/core/odx/__tests__/dimBuilder.test.ts
git commit -m "feat(odx): build diagnostic intermediate model"
```

---

### Task 5: Spine-keyed BSWMD index

**Files:**
- Create: `src/core/odx/bswmdDefIndex.ts`
- Test: `src/core/odx/__tests__/bswmdDefIndex.test.ts`

**Interfaces:**
- Consumes: `BswmdDocument` from `src/core/project/bswmd.js`.
- Produces: `buildBswmdDefIndex(bswmds: ReadonlyMap<string, BswModuleDef>): BswmdDefIndex`.

```ts
export interface BswmdDefIndex {
  readonly containerPath: ReadonlyMap<string, string>;
  readonly paramPath: ReadonlyMap<string, string>;
  readonly refPath: ReadonlyMap<string, string>;
  readonly paramDef: ReadonlyMap<string, ParamDef>;
}
```

- [ ] **Step 1: Write failing tests**

```ts
const key = 'DcmConfigSet/DcmDsp/DcmDspDid';
expect(index.containerPath.get(key)).toBe('/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDid');
expect(index.paramPath.get(`${key}/DcmDspDidIdentifier`)).toBeDefined();
```

Also assert two same-named leaf containers under different spines do not overwrite each other.

- [ ] **Step 2: Run test and verify failure**

Run: `node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/bswmdDefIndex.test.ts --reporter=dot`  
Expected: FAIL.

- [ ] **Step 3: Implement recursive index builder**

Use `ContainerDef.path` as the definition value. Derive keys from the stable spine after the module prefix. Do not use `resolveDefinitionRef` fallback; missing definitions remain missing.

- [ ] **Step 4: Run targeted tests and commit**

Run: `node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/bswmdDefIndex.test.ts --reporter=dot`  
Expected: PASS.

```powershell
git add src/core/odx/bswmdDefIndex.ts src/core/odx/__tests__/bswmdDefIndex.test.ts
git commit -m "feat(odx): build spine-keyed BSWMD definition index"
```

---

### Task 6: Deterministic short-name helper

**Files:**
- Create: `src/core/odx/shortName.ts`
- Test: `src/core/odx/__tests__/shortName.test.ts`

**Interfaces:**
- Produces: `legalizeShortName(raw: string, fallback: string): string`, `dedupeShortName(base: string, taken: ReadonlySet<string>): string`.

- [ ] **Step 1: Write failing tests**

```ts
expect(legalizeShortName('Read DID 0xF1', 'x')).toBe('Read_DID_0xF1');
expect(legalizeShortName('1ABC', 'x')).toBe('N_1ABC');
expect(legalizeShortName('', '_abc')).toBe('Unnamed_abc');
expect(legalizeShortName('x'.repeat(200), 'x')).toHaveLength(128);
expect(dedupeShortName('Foo', new Set(['Foo']))).toBe('Foo_2');
expect(dedupeShortName('Foo', new Set())).toBe('Foo');
```

- [ ] **Step 2: Run test and verify failure**

Run: `node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/shortName.test.ts --reporter=dot`  
Expected: FAIL.

- [ ] **Step 3: Implement spec §6.4.3**

Replace invalid characters, prefix numeric first characters, handle empty names, truncate to 128, and de-duplicate deterministically.

- [ ] **Step 4: Run targeted tests and commit**

Run: `node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/shortName.test.ts --reporter=dot`  
Expected: PASS.

```powershell
git add src/core/odx/shortName.ts src/core/odx/__tests__/shortName.test.ts
git commit -m "feat(odx): add deterministic short-name legalization"
```

---

### Task 7: Dcm mapper

**Files:**
- Create: `src/core/odx/dcmMapper.ts`
- Test: `src/core/odx/__tests__/dcmMapper.test.ts`

**Interfaces:**
- Consumes: `Dim`, `BswmdDefIndex`.
- Produces: `mapDcm(dim: Dim, index: BswmdDefIndex): { module: ArxmlModule; warnings: DimWarning[] }`.

- [ ] **Step 1: Write failing tests**

Use DIM fixtures built from explicit objects. Assert standard AST shapes, not strings:

```ts
const did = module.children
  .flatMap((c) => c.kind === 'container' ? [c] : [])
  .find((c) => c.definitionRef?.endsWith('/DcmDspDid') && c.shortName === 'DID_F186');
expect(did?.params.DcmDspDidIdentifier).toMatchObject({ type: 'integer', value: 0xf186 });
```

Cover every row of spec §6.3.1, including DID pooling, one `DcmDsdService` per SID, sub-service rows, empty service shells, session/security references, memory/tester warnings, unknown skip, datatype normalization, and default parameter warnings.

- [ ] **Step 2: Run test and verify failure**

Run: `node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/dcmMapper.test.ts --reporter=dot`  
Expected: FAIL.

- [ ] **Step 3: Implement Dcm AST mapping**

Build `ArxmlContainer` / `ParamValue` objects only; no XML string construction. Every definition-ref must come from `BswmdDefIndex`. Missing definition => warning `odx-bswmd-def-missing` and skip that item. Sort deterministic output per spec §6.4.4.

- [ ] **Step 4: Run targeted tests and commit**

Run: `node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/dcmMapper.test.ts --reporter=dot`  
Expected: PASS.

```powershell
git add src/core/odx/dcmMapper.ts src/core/odx/__tests__/dcmMapper.test.ts
git commit -m "feat(odx): map DIM to standard Dcm ECUC"
```

---

### Task 8: Dem mapper and mapping facade

**Files:**
- Create: `src/core/odx/demMapper.ts`, `src/core/odx/mapDimToEcuc.ts`
- Test: `src/core/odx/__tests__/demMapper.test.ts`, `src/core/odx/__tests__/mapDimToEcuc.test.ts`

**Interfaces:**
- Produces: exact `mapDimToEcuc(req: MapDimToEcucRequest): MapDimToEcucResult` from spec §6.1.

- [ ] **Step 1: Write failing Dem tests**

Assert DTC containers, event parameters, deterministic event IDs, severity literals, unknown severity warnings, and operation-cycle creation:

```ts
const event = module.children
  .flatMap((c) => c.kind === 'container' ? [c] : [])
  .find((c) => c.definitionRef?.endsWith('/DemEventParameter'));
expect(event?.params.DemEventId).toMatchObject({ type: 'integer', value: 1 });
```

- [ ] **Step 2: Run Dem tests and verify failure**

Run: `node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/demMapper.test.ts --reporter=dot`  
Expected: FAIL.

- [ ] **Step 3: Implement Dem mapper**

Use BSWMD lookup for every definition-ref. Apply defaults from spec §6.6. Skip missing definitions rather than emitting guessed paths.

- [ ] **Step 4: Run Dem tests**

Run: `node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/demMapper.test.ts --reporter=dot`  
Expected: PASS.

- [ ] **Step 5: Write failing facade tests**

```ts
const result = mapDimToEcuc({ dim, bswmdIndex: index });
expect(result.modules.map((m) => m.shortName)).toEqual(['Dcm', 'Dem']);
const a = serializeForTest(mapDimToEcuc({ dim, bswmdIndex: index }).modules);
const b = serializeForTest(mapDimToEcuc({ dim, bswmdIndex: index }).modules);
expect(a).toEqual(b);
```

Also assert missing Dcm or Dem BSWMD causes hard `odx-bswmd-not-loaded` at the project-import boundary.

- [ ] **Step 6: Implement mapping facade**

Compose `mapDcm` and `mapDem`, merge warnings, sort modules by shortName, and preserve deterministic serialization.

- [ ] **Step 7: Run mapping suite and commit**

Run: `node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/demMapper.test.ts src/core/odx/__tests__/mapDimToEcuc.test.ts --reporter=dot`  
Expected: PASS.

```powershell
git add src/core/odx/demMapper.ts src/core/odx/mapDimToEcuc.ts src/core/odx/__tests__/demMapper.test.ts src/core/odx/__tests__/mapDimToEcuc.test.ts
git commit -m "feat(odx): map DIM to Dcm and Dem ECUC modules"
```

---

### Task 9: Staging emitter and old IPC reroute

**Files:**
- Create: `src/core/odx/dimToDiagnosticExtract.ts`
- Modify: `src/main/ipc/odxImportDiagnosticExtractHandler.ts`
- Test: `src/core/odx/__tests__/dimToDiagnosticExtract.test.ts`, `src/main/ipc/__tests__/odxImportDiagnosticExtractHandler.test.ts`

**Interfaces:**
- Produces:

```ts
export function dimToDiagnosticExtract(args: {
  readonly dim: Dim;
  readonly bswmdIndex: BswmdDefIndex;
}): { readonly demContent: string; readonly dcmContent: string };
```

- [ ] **Step 1: Write failing emitter tests**

```ts
expect(output.demContent).toContain('Dem_Extract');
expect(output.dcmContent).toContain('Dcm_Extract');
expect(output.demContent).toContain('/AUTOSAR_R22/EcucDefs/Dem/DemConfigSet/DemEventParameter');
expect(output.dcmContent).not.toContain('/Dcm/DcmDspDid');
```

Also assert valid XML round-trips through the existing parser and contains standard `ECUC-MODULE-CONFIGURATION-VALUES`.

- [ ] **Step 2: Run tests and verify failure**

Run: `node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/dimToDiagnosticExtract.test.ts --reporter=dot`  
Expected: FAIL.

- [ ] **Step 3: Implement emitter**

Wrap each mapped module in the existing `DiagExtract` package envelope and serialize with `serializeArxml`. Keep `AUTOSAR_4-4.xsd` schema location.

- [ ] **Step 4: Reroute old handler**

Replace `odxToDiagnosticExtract` with full parse → DIM → emitter. Preserve request/response fields, 32 MiB cap, output names, snapshot rollback, and degraded BSWMD behavior. Missing staging definitions may omit definition-ref and surface warnings without hard failure.

- [ ] **Step 5: Run old-handler regression**

Run: `node node_modules/vitest/vitest.mjs run src/main/ipc/__tests__/odxImportDiagnosticExtractHandler.test.ts --reporter=dot`  
Expected: PASS after updating only behavior assertions required by standard ECUC output.

- [ ] **Step 6: Commit**

```powershell
git add src/core/odx/dimToDiagnosticExtract.ts src/core/odx/__tests__/dimToDiagnosticExtract.test.ts src/main/ipc/odxImportDiagnosticExtractHandler.ts src/main/ipc/__tests__/odxImportDiagnosticExtractHandler.test.ts
git commit -m "refactor(odx): route staging export through DIM and standard ECUC"
```

---

### Task 10: Provenance hash, classification, and merge

**Files:**
- Create: `src/core/odx/threeWayMerge.ts`
- Test: `src/core/odx/__tests__/threeWayMerge.test.ts`

**Interfaces:**
- Produces:

```ts
export function hashContainerForProvenance(container: ArxmlContainer): string;
export function collectImportContainers(module: ArxmlModule): ReadonlyMap<string, ArxmlContainer>;
export function classifyImportRows(args: ClassifyImportRowsArgs): OdxImportRow[];
export function mergeModuleThreeWay(args: MergeModuleThreeWayArgs): ArxmlModule;
```

- [ ] **Step 1: Write failing classification tests**

Cover all seven rows from spec §7.2:

```ts
const rows = classifyImportRows({ manifestEntries: base, currentContainers, incomingContainers });
expect(rows.find((r) => r.path === '/Dcm/New')?.category).toBe('added');
expect(rows.find((r) => r.path === '/Dcm/OdxChanged')?.category).toBe('updated');
expect(rows.find((r) => r.path === '/Dcm/LocalChanged')?.category).toBe('locally-modified');
expect(rows.find((r) => r.path === '/Dcm/Conflict')?.category).toBe('conflict');
expect(rows.find((r) => r.path === '/Dcm/Converged')?.category).toBe('converged');
expect(rows.find((r) => r.path === '/Dcm/RemovedInOdx')?.category).toBe('removed-in-odx');
```

Assert manual current-only containers produce no row and are never removed.

- [ ] **Step 2: Run tests and verify failure**

Run: `node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/threeWayMerge.test.ts --reporter=dot`  
Expected: FAIL.

- [ ] **Step 3: Implement stable hash**

Canonicalize `ArxmlContainer` through deterministic temporary AST serialization. Exclude XML declaration/envelope; include definition-ref, shortName, params, references, and child containers. Preview and commit must produce the same hash.

- [ ] **Step 4: Implement merge**

Apply decisions by container path. Defaults are exactly the spec table. Preserve current containers that have no import relationship. Sort resulting child containers per spec §6.4.4.

- [ ] **Step 5: Run merge tests and commit**

Run: `node node_modules/vitest/vitest.mjs run src/core/odx/__tests__/threeWayMerge.test.ts --reporter=dot`  
Expected: PASS.

```powershell
git add src/core/odx/threeWayMerge.ts src/core/odx/__tests__/threeWayMerge.test.ts
git commit -m "feat(odx): add provenance classification and three-way merge"
```

---

### Task 11: Additive IPC DTOs and preview handler

**Files:**
- Create: `src/shared/types/odx-import.ts`, `src/main/ipc/odxImportPreviewHandler.ts`
- Modify: `src/shared/ipc-contract.ts`, `src/preload/index.ts`
- Test: `src/main/ipc/__tests__/odxImportPreviewHandler.test.ts`

**Interfaces:**
- Produces IPC:

```ts
export const ODX_IMPORT_PREVIEW = 'odx:importPreview';
export const ODX_IMPORT_COMMIT = 'odx:importCommit';
```

DTOs must match reviewed spec §9.1, including `dirtyDocPaths` on both requests and `previewHash` on preview/commit.

- [ ] **Step 1: Write failing preview tests**

Cover no open project, read/malformed/too-large errors, no variant, variant not found, inheritance cycle, missing BSWMD, dirty target, ambiguous module, fresh-project preview, and deterministic hash:

```ts
const res = await odxImportPreviewHandler({ odxPath, dirtyDocPaths: [] });
expect(res.ok).toBe(true);
if (res.ok) expect(res.value.stats.services).toBe(95);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node node_modules/vitest/vitest.mjs run src/main/ipc/__tests__/odxImportPreviewHandler.test.ts --reporter=dot`  
Expected: FAIL.

- [ ] **Step 3: Implement preview orchestration**

Main flow:

1. Resolve open manifest via `getOpenProjectManifestPath()`.
2. Read ODX with `readFileWithCap`.
3. Parse ODX, resolve variant, build DIM.
4. Read Dcm/Dem BSWMDs from manifest paths and build the spine index.
5. Read existing value ARXMLs and locate exactly one Dcm and one Dem module; multiple matches return `odx-module-ambiguous`.
6. Map DIM and classify rows using `.autosarcfg/odx-import-manifest.json`.
7. Return rows, warnings, stats, target module info, variants, and `previewHash = sha256(canonical JSON of rows + stats + targetModules)`.

Preview must not mutate the workspace.

- [ ] **Step 4: Register IPC and preload API**

Add channels and typed preload methods without renaming old fields.

- [ ] **Step 5: Run IPC/type checks**

```powershell
node node_modules/vitest/vitest.mjs run src/main/ipc/__tests__/odxImportPreviewHandler.test.ts --reporter=dot
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/shared/types/odx-import.ts src/shared/ipc-contract.ts src/preload/index.ts src/main/ipc/odxImportPreviewHandler.ts src/main/ipc/__tests__/odxImportPreviewHandler.test.ts
git commit -m "feat(odx): add deterministic full-import preview IPC"
```

---

### Task 12: Commit handler, manifest persistence, and reload

**Files:**
- Create: `src/main/ipc/odxImportCommitHandler.ts`
- Modify: manifest mutation helper if required by existing architecture.
- Test: `src/main/ipc/__tests__/odxImportCommitHandler.test.ts`

**Interfaces:**
- Consumes: preview pipeline, `mergeModuleThreeWay`, `writeAtomic`, existing patch/serializer utilities.
- Produces: commit response exactly spec §9.1.

- [ ] **Step 1: Write failing commit tests**

Cover mismatched `previewHash`, dirty target, ambiguous module, first import, merge into existing docs, conflict default, explicit delete, write rollback, manifest write failure, and corrupted manifest.

```ts
const res = await odxImportCommitHandler({
  odxPath,
  variantId,
  dirtyDocPaths: [],
  previewHash,
  decisions: [{ path: '/Dcm/Conflict', decision: 'import' }],
});
expect(res.ok).toBe(true);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node node_modules/vitest/vitest.mjs run src/main/ipc/__tests__/odxImportCommitHandler.test.ts --reporter=dot`  
Expected: FAIL.

- [ ] **Step 3: Implement deterministic recompute**

Run the same preview pipeline. Verify recomputed rows/stats/target info hash equals `previewHash`. Apply decisions to the recomputed result and merge modules.

- [ ] **Step 4: Implement safe persistence**

For existing documents, snapshot original text, patch/serialize, and write atomically. For missing module documents, create `<Module>_EcucValues.arxml`, update the manifest, and reload. On write failure, restore snapshots and return `write-failed` with `rolledBack`.

After successful file writes, atomically rewrite `.autosarcfg/odx-import-manifest.json`, then reload affected project documents.

- [ ] **Step 5: Run commit tests and type checks**

```powershell
node node_modules/vitest/vitest.mjs run src/main/ipc/__tests__/odxImportCommitHandler.test.ts --reporter=dot
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/main/ipc/odxImportCommitHandler.ts src/main/ipc/__tests__/odxImportCommitHandler.test.ts
git commit -m "feat(odx): add reviewed ODX import commit and provenance manifest"
```

---

### Task 13: Import wizard UI

**Files:**
- Create: `src/renderer/components/OdxImportWizard/OdxImportWizard.tsx`, `useOdxImportWizard.ts`, `OdxImportWizard.css`, tests
- Modify: `src/renderer/AppHeader.tsx`, app hook wiring, i18n files
- Test: `src/renderer/components/OdxImportWizard/__tests__/OdxImportWizard.test.tsx`

**Interfaces:**
- Consumes: `api.odxImportPreview`, `api.odxImportCommit`, renderer `dirtyPaths`, current project manifest path.
- Produces: user flow file select → variant select → preview/decision → confirm → done.

- [ ] **Step 1: Write failing state-machine tests**

Use Testing Library. Cover:

- entry button `btn-import-odx-full`;
- dirty Dcm/Dem target blocks preview and offers save-first action;
- one variant auto-selected; multiple variants show a variant step;
- preview rows render category badges;
- conflict default is keep-local and requires explicit change plus second confirmation to import;
- locally-modified and converged rows are informational;
- removed-in-odx default keep-local and explicit delete requires confirmation;
- commit success shows counts and manifest path;
- every error kind renders localized copy;
- no raw stack/internal diagnostic text.

- [ ] **Step 2: Run tests and verify failure**

Run: `node node_modules/vitest/vitest.mjs run src/renderer/components/OdxImportWizard --reporter=dot`  
Expected: FAIL.

- [ ] **Step 3: Implement wizard**

Use a small reducer with states `idle | picking | variant | preview | confirming | committing | done | error`. Pass renderer `dirtyPaths` into preview/commit. Commit never receives container content, only decisions.

- [ ] **Step 4: Add AppHeader entry and bilingual i18n**

Add menu item and localized strings under `src/shared/i18n/odx-import.ts`, `src/shared/i18n.en/odx-import.ts`, and `src/shared/i18n.zh-CN/odx-import.ts`.

- [ ] **Step 5: Run UI/type checks**

```powershell
node node_modules/vitest/vitest.mjs run src/renderer/components/OdxImportWizard src/renderer/components/__tests__/AppHeader --reporter=dot
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/renderer/components/OdxImportWizard src/renderer/AppHeader.tsx src/shared/i18n src/shared/i18n.en src/shared/i18n.zh-CN
git commit -m "feat(odx): add reviewed ODX-D import wizard"
```

---

### Task 14: Migrate DCM xlsx pipeline and remove old mapper

**Files:**
- Modify: `src/core/bridge/dcmConfigPipeline.ts`, related DCM handler tests
- Delete: `src/core/bridge/odxToDiagnosticExtract.ts` and its tests
- Test: `src/core/bridge/__tests__/dcmConfigPipeline*.test.ts`, `src/main/ipc/__tests__/dcmConfigHandler.test.ts`

**Interfaces:**
- Consumes: `buildDim`, `Dim.services`, `Dim.dataObjects`.
- Produces: same xlsx DCM output contract, now sourced from DIM.

- [ ] **Step 1: Write failing linkage tests**

Assert xlsx service rows resolve against `dim.services`, DID rows resolve against DID identifiers in service request parameters, and missing links return the existing validation error shape.

- [ ] **Step 2: Run tests and verify failure**

Run: `node node_modules/vitest/vitest.mjs run src/core/bridge src/main/ipc/__tests__/dcmConfigHandler.test.ts --reporter=dot`  
Expected: FAIL for DIM-backed expectations.

- [ ] **Step 3: Replace ODX data source**

Call the new ODX parsing/DIM builder directly in main. Do not add a new IPC channel. Rewrite `validateOdxLinkage` to use DIM without changing user-facing validation semantics.

- [ ] **Step 4: Remove the old mapper**

Delete `src/core/bridge/odxToDiagnosticExtract.ts` and its test only after `rg -n "odxToDiagnosticExtract" src` returns no source references.

- [ ] **Step 5: Run bridge and DCM regressions**

Run: `node node_modules/vitest/vitest.mjs run src/core/bridge src/main/ipc/__tests__/dcmConfigHandler.test.ts --reporter=dot`  
Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/core/bridge src/main/ipc/__tests__/dcmConfigHandler.test.ts
git commit -m "refactor(dcm): source xlsx pipeline from ODX DIM"
```

---

### Task 15: Full verification

**Files:**
- No production changes expected.

- [ ] **Step 1: Run all targeted suites**

```powershell
node node_modules/vitest/vitest.mjs run src/core/odx src/core/bridge src/main/ipc src/renderer/components/OdxImportWizard --reporter=dot
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run the repository's standard full test command. Expected: PASS.

- [ ] **Step 3: Run type checks**

```powershell
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json
```

Expected: both PASS.

- [ ] **Step 4: Run formatter**

Run repository Prettier check/fix command. Expected: clean.

- [ ] **Step 5: Manual E2E smoke**

With the real workspace project:

1. Restart Electron after main/preload changes.
2. Import `Demo_Cdd.odx-d`.
3. Select the single BASE-VARIANT.
4. Review preview counts: 95 services / 99 DTCs / 167 DOPs.
5. Commit import.
6. Confirm Dcm `DcmDsdService`, `DcmDspSessionRow`, `DcmDspSecurityRow`, `DcmDspDid`, and Dem event/DTC containers are visible.
7. Right-click a generated container and verify BSWMD parameters resolve.
8. Re-run import and verify zero unintended conflict rows.

- [ ] **Step 6: Final commit only if verification produced formatting/doc changes**

```powershell
git status --short
git add <only verification-related files>
git commit -m "test(odx): verify full ODX-D import flow"
```
