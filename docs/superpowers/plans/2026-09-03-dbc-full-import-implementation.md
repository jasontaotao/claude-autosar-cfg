# DBC Full Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current DBC-to-Com-Stack skeleton import with a deterministic, BSWMD-anchored, field-level full import pipeline for Com, CanIf, and PduR.

**Architecture:** Build a pure DBM intermediate model from DBC, resolve Com/CanIf/PduR definitions through a BSWMD index, map through an AUTOSAR R22 default profile, then classify and merge imports with the generalized ODX three-way merge infrastructure. Main-process IPC owns file, manifest, provenance, atomic-write, and rollback orchestration; the renderer owns target-node selection, policy edits, decisions, dirty-state input, and wizard UX.

**Tech Stack:** TypeScript, Electron IPC, React + Testing Library, Vitest, `@dbc-forge/core`, fast-xml-parser-based ARXML AST/parser/serializer, existing BSWMD parser, import patch utilities, and atomic file writers.

**Spec:** `docs/superpowers/specs/2026-09-03-dbc-full-import-design.md`

## Global Constraints

- The spec is normative. If this plan and the spec disagree, stop and reconcile against the spec before coding.
- DBM construction, BSWMD indexing, profile resolution, transforms, mappers, classification, and merge are pure functions with no file/network IO. `node:crypto` hashing is allowed.
- Main-process IPC owns all DBC, ECUC, project manifest, BSWMD, and provenance file IO.
- Every emitted parameter/reference must resolve to a real BSWMD definition. Do not write unanchored definition refs.
- Reuse `legalizeShortName`, `dedupeShortName`, `hashContainerForProvenance`, and `overwrite-module` patch behavior. Do not create parallel copies.
- Generalize `src/core/odx/threeWayMerge.ts` into `src/core/import/threeWayMerge.ts`; ODX must keep its existing public behavior.
- Do not generate EcuC PduCollection/Pdu entries. References targeting EcuC Pdu remain `Unmapped` with `dbc-reference-missing`.
- Standard R22 ComSignal has no factor, offset, min/max, or unit parameters. Leave them `Unmapped` without warning unless a vendor Profile explicitly declares them.
- Warning kinds are only the 18 values in spec §11. Hard error kinds are only the 11 values in spec §12.
- Old `dbc:importComStack` stays compatible until migration is complete and must not be deleted in this plan.
- Preview and commit must be deterministic for identical DBC, target node, profile, policy, workspace, and BSWMD inputs.
- DBC reads are capped at 32 MiB.
- Commit must write ECUC files, project manifest additions, and provenance in one rollback-able transaction.
- Before every commit, run Prettier on touched files, targeted tests, and both TypeScript configs:
  - `pnpm prettier --write <changed files>`
  - `pnpm vitest run <targeted-tests> --reporter=dot`
  - `pnpm type-check`
- At phase boundaries, run the full suite: `pnpm test`.
- Do not commit `.codegraph/`, `__write_plan.cjs`, mockups, or unrelated untracked plans.

## File Structure

Create:

- `src/core/dbc/dbm.ts` — DBM types and warning-code closed set.
- `src/core/dbc/dbmBuilder.ts` — DBC document wrapper, attribute grouping, DBM builder.
- `src/core/dbc/bswmdDefIndex.ts` — Com/CanIf/PduR module-scoped BSWMD index.
- `src/core/dbc/profile.ts` — Profile schema, policy defaults, built-in R22 profile.
- `src/core/dbc/mappers/types.ts` — mapper context, field diff, and mapper result types.
- `src/core/dbc/mappers/transforms.ts` — bit position, signal type, PduId, UL, enum validation.
- `src/core/dbc/mappers/comMapper.ts` — ComIPdu, ComTxMode chain, and ComSignal mapping.
- `src/core/dbc/mappers/canIfMapper.ts` — relevance filtering, Tx/Rx mapping, PduId, UL.
- `src/core/dbc/mappers/pduRMapper.ts` — PduRRoutingPath, source/destination topology.
- `src/core/dbc/mappers/mapDbmToEcuc.ts` — deterministic mapping facade.
- `src/core/import/threeWayMerge.ts` — generalized provenance hash/classifier/merger.
- `src/shared/types/dbc-import.ts` — additive preview/commit DTOs.
- `src/main/ipc/dbcFullImportRuntime.ts` — shared main-process target/module/BSWMD/manifest helpers.
- `src/main/ipc/dbcFullImportPreviewHandler.ts` — preview orchestration.
- `src/main/ipc/dbcFullImportCommitHandler.ts` — commit/provenance/rollback orchestration.
- `src/renderer/components/DbcImportWizard/steps/SourceTargetStep.tsx`
- `src/renderer/components/DbcImportWizard/steps/MappingPolicyStep.tsx`
- `src/renderer/components/DbcImportWizard/steps/PreviewDecisionsStep.tsx`
- `src/renderer/components/DbcImportWizard/steps/ApplyStep.tsx`

Modify:

- `src/core/odx/bswmdDefIndex.ts` — additive `ReferenceDef` map and exported `spineKey`.
- `src/core/odx/threeWayMerge.ts` — convert to a thin re-export.
- ODX imports that referenced `core/odx/threeWayMerge.js` where necessary.
- `src/shared/ipc-contract.ts`, `src/preload/index.ts`, `src/main/ipc/register.ts`.
- `src/renderer/components/DbcImportWizard/DbcImportWizard.tsx` and CSS.
- `src/renderer/App.tsx`, `src/renderer/app/useWizardHandlers.ts`, and i18n DBC files.
- Existing ODX three-way tests only if import paths/type arguments require mechanical updates.

---

### Task 1: DBM types and DBC parser projection

**Files:**

- Create: `src/core/dbc/dbm.ts`
- Create: `src/core/dbc/dbmBuilder.ts`
- Test: `src/core/dbc/__tests__/dbmBuilder.test.ts`

**Interfaces:**

- Produces: `Dbm`, `DbmMeta`, `DbmDocument`, `DbcWarningCode`, `createDbmDocument(sourcePath: string, xml: string): DbmDocument`, and `buildDbm(document: DbmDocument): Dbm`. The exact type fields follow spec §3.1.

- [ ] **Step 1: Write the failing test**

Create `src/core/dbc/__tests__/dbmBuilder.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createNetwork, createMessage, createSignal } from '@dbc-forge/core';
import { buildDbm, createDbmDocument } from '../dbmBuilder.js';

const xml =
  'VERSION "1.0"\nNS_ :\nBS_:\nBU_: ECM TCM\nBO_ 512 EngineMsg: 8 ECM\n SG_ Speed : 7|16@1+ (0.1,0) [0|100] "km/h" TCM\n';

describe('createDbmDocument and buildDbm', () => {
  it('projects nodes, messages, signals, and source hash', () => {
    const doc = createDbmDocument('C:/fixtures/demo.dbc', xml);
    expect(doc.sourcePath).toBe('C:/fixtures/demo.dbc');
    expect(doc.sourceHash).toBe(`sha256:${createHash('sha256').update(xml).digest('hex')}`);

    const dbm = buildDbm(doc);
    expect(dbm.meta.protocol).toBe('CAN');
    expect(dbm.nodes.map((node) => node.name)).toEqual(['ECM', 'TCM']);
    expect(dbm.messages[0]).toMatchObject({
      shortName: 'EngineMsg',
      messageId: 512,
      isExtended: false,
      dlc: 8,
      transmitter: 'ECM',
    });
    expect(dbm.signals[0]).toMatchObject({
      shortName: 'Speed',
      messageKey: 'EngineMsg',
      startBit: 7,
      length: 16,
      byteOrder: 'little-endian',
      valueType: 'unsigned',
      receivers: ['TCM'],
    });
  });

  it('groups message and signal attributes and preserves multiplex facts', () => {
    const network = createNetwork({ version: '1.0' });
    const signal = createSignal({
      name: 'MuxSignal',
      startBit: 0,
      length: 8,
      byteOrder: 'little-endian',
      valueType: 'unsigned',
      factor: 1,
      offset: 0,
      min: 0,
      max: 255,
      unit: '',
      receivers: ['ECM'],
      multiplexed: { kind: 'Muxed', value: 3 },
    });
    const message = createMessage({
      id: 0x123,
      name: 'MuxMsg',
      dlc: 8,
      transmitter: 'TCM',
      signals: [signal],
    });
    const document = {
      sourcePath: 'memory.dbc',
      sourceHash: 'sha256:test',
      network: {
        ...network,
        nodes: [{ name: 'ECM' }],
        messages: [message],
        attributeAssignments: [
          { name: 'GenMsgCycleTime', target: { kind: 'message', messageId: 0x123 }, value: 100 },
          {
            name: 'GenSigInactiveValue',
            target: { kind: 'signal', messageId: 0x123, signalName: 'MuxSignal' },
            value: 255,
          },
        ],
      },
    } as const;

    const dbm = buildDbm(document);
    expect(dbm.messages[0]?.attributes).toEqual({ GenMsgCycleTime: 100 });
    expect(dbm.signals[0]?.attributes).toEqual({ GenSigInactiveValue: 255 });
    expect(dbm.signals[0]?.multiplex).toEqual({
      kind: 'multiplexed',
      switchValue: 3,
    });
  });

  it('legalizes and deduplicates from _2, not _1', () => {
    const doc = createDbmDocument(
      'dup.dbc',
      [
        'VERSION ""',
        'BS_:',
        'BU_: ECM',
        'BO_ 1 Bad Name!: 8 ECM',
        ' SG_ S : 0|8@1+ (1,0) [0|0] "" ECM',
        'BO_ 2 Bad Name!: 8 ECM',
        ' SG_ S : 0|8@1+ (1,0) [0|0] "" ECM',
      ].join('\n'),
    );
    const dbm = buildDbm(doc);
    expect(dbm.messages.map((message) => message.key)).toEqual(['Bad_Name', 'Bad_Name_2']);
    expect(dbm.signals.map((signal) => signal.key)).toEqual(['S', 'S_2']);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run src/core/dbc/__tests__/dbmBuilder.test.ts --reporter=dot`  
Expected: FAIL because `../dbmBuilder.js` does not exist.

- [ ] **Step 3: Implement DBM and builder**

Create `src/core/dbc/dbm.ts` with the exact spec §3 types and this closed set:

```ts
export const DBC_WARNING_CODES = [
  'dbc-duplicate-message-name',
  'dbc-duplicate-signal-name',
  'dbc-invalid-can-id',
  'dbc-invalid-dlc',
  'dbc-message-missing-transmitter',
  'dbc-unsupported-byte-order',
  'dbc-unsupported-value-type',
  'dbc-attribute-unavailable',
  'dbc-bswmd-def-missing',
  'dbc-param-type-mismatch',
  'dbc-enum-unmapped',
  'dbc-reference-missing',
  'dbc-policy-default-used',
  'dbc-policy-unmapped',
  'dbc-pdu-id-conflict',
  'dbc-short-name-legalized',
  'dbc-multiplexed-signal',
  'dbc-manifest-ignored',
] as const;

export type DbcWarningCode = (typeof DBC_WARNING_CODES)[number];
```

Create `src/core/dbc/dbmBuilder.ts`. Use `parseDbc` from `@dbc-forge/core`, `legalizeShortName` and `dedupeShortName` from `../../core/odx/shortName.js`, and `createHash` from `node:crypto`.

Implementation requirements:

- `createDbmDocument` calls `parseDbc(xml)`, wraps parse failure as `Error('dbc-malformed: ...')`, and computes `sha256:<hex>` from raw XML.
- Message keys and signal keys use `dedupeShortName(legalizeShortName(rawName, rawName), taken)`.
- Signal deduplication scope is the owning message.
- The generated `key` becomes the future ECUC instance shortName without a second legalization.
- Group `network.attributeAssignments` by target into `DbmMessage.attributes`, `DbmSignal.attributes`, and `DbmNode.attributes`.
- Resolve `Signal.valueTable` through `network.valueTables` into `DbmSignal.valueTable`.
- Project dbc-forge multiplexing as: `Plain` → `{ kind: 'plain' }`; `Multiplexor` → `{ kind: 'multiplexor' }`; `Muxed` → `{ kind: 'multiplexed', switchValue }`; `ExtendedMuxed` → `{ kind: 'extended-multiplexed', switchValue }`.
- Emit `dbc-short-name-legalized` only when the input raw name differs from the legalized form.
- Emit `dbc-duplicate-message-name` / `dbc-duplicate-signal-name` for each deduplicated collision.
- Emit `dbc-invalid-can-id` when `messageId < 0 || messageId > 0x1fffffff`.
- Emit `dbc-invalid-dlc` when `dlc < 0 || dlc > 8`.
- Emit `dbc-message-missing-transmitter` when `transmitter` is empty.
- Preserve document order. Do not sort messages or signals.

- [ ] **Step 4: Run targeted tests**

Run: `pnpm vitest run src/core/dbc/__tests__/dbmBuilder.test.ts --reporter=dot`  
Expected: PASS.

- [ ] **Step 5: Format and type-check**

```powershell
pnpm prettier --write src/core/dbc src/core/dbc/__tests__/dbmBuilder.test.ts
pnpm type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/core/dbc/dbm.ts src/core/dbc/dbmBuilder.ts src/core/dbc/__tests__/dbmBuilder.test.ts
git commit -m "feat(dbc): add DBM intermediate model"
```

---

### Task 2: Module-scoped Com/CanIf/PduR BSWMD index

**Files:**

- Modify: `src/core/odx/bswmdDefIndex.ts`
- Create: `src/core/dbc/bswmdDefIndex.ts`
- Test: `src/core/dbc/__tests__/bswmdDefIndex.test.ts`

**Interfaces:**

- Consumes: `BswModuleDef`, `ContainerDef`, `ParamDef`, and `ReferenceDef` from `../../core/project/bswmd/types.js`.
- Produces:

```ts
export interface ModuleBswmdDefIndex {
  readonly moduleShortName: DbcImportModule;
  readonly containerPath: ReadonlyMap<string, string>;
  readonly paramPath: ReadonlyMap<string, string>;
  readonly refPath: ReadonlyMap<string, string>;
  readonly paramDef: ReadonlyMap<string, ParamDef>;
  readonly referenceDef: ReadonlyMap<string, ReferenceDef>;
}

export type DbcBswmdDefIndex = Readonly<Record<'Com' | 'CanIf' | 'PduR', ModuleBswmdDefIndex>>;
export function buildDbcBswmdDefIndex(bswmds: ReadonlyMap<string, BswModuleDef>): DbcBswmdDefIndex;
```

- [ ] **Step 1: Extend the ODX index and write the failing test**

First update `src/core/odx/bswmdDefIndex.ts` additively by exporting its existing key function:

```ts
export function spineKey(modulePath: string, definitionPath: string): string {
  const normalizedModule = modulePath.replace(/^\/+|\/+$/g, '');
  const normalizedDefinition = definitionPath.replace(/^\/+|\/+$/g, '');
  if (normalizedDefinition === normalizedModule) return '';
  const prefix = `${normalizedModule}/`;
  return normalizedDefinition.startsWith(prefix)
    ? normalizedDefinition.slice(prefix.length)
    : normalizedDefinition;
}
```

Add `referenceDef: ReadonlyMap<string, ReferenceDef>;` to `BswmdDefIndex`, index `container.references` with its full `ReferenceDef`, and update `buildBswmdDefIndex` to return it. This is an additive change; existing ODX consumers remain valid.

Create `src/core/dbc/__tests__/bswmdDefIndex.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { BswModuleDef, ContainerDef, ReferenceDef } from '../../project/bswmd/types.js';
import { buildDbcBswmdDefIndex } from '../bswmdDefIndex.js';

const reference: ReferenceDef = {
  shortName: 'PduRDestPduRef',
  path: '/AUTOSAR_R22/EcucDefs/PduR/PduRRoutingPaths/PduRRoutingPath/PduRDestPdu/PduRDestPduRef',
  destKind: 'ECUC-CONTAINER-VALUE',
  lowerMultiplicity: 0,
  upperMultiplicity: 1,
};

const destContainer: ContainerDef = {
  shortName: 'PduRDestPdu',
  path: '/AUTOSAR_R22/EcucDefs/PduR/PduRRoutingPaths/PduRRoutingPath/PduRDestPdu',
  lowerMultiplicity: 0,
  upperMultiplicity: 'infinite',
  subContainers: [],
  parameters: [],
  references: [reference],
  choices: [],
};

const routingPath: ContainerDef = {
  shortName: 'PduRRoutingPath',
  path: '/AUTOSAR_R22/EcucDefs/PduR/PduRRoutingPaths/PduRRoutingPath',
  lowerMultiplicity: 0,
  upperMultiplicity: 'infinite',
  subContainers: [destContainer],
  parameters: [],
  references: [],
  choices: [],
};

const routingPaths: ContainerDef = {
  shortName: 'PduRRoutingPaths',
  path: '/AUTOSAR_R22/EcucDefs/PduR/PduRRoutingPaths',
  lowerMultiplicity: 1,
  upperMultiplicity: 1,
  subContainers: [routingPath],
  parameters: [],
  references: [],
  choices: [],
};

const pduR: BswModuleDef = {
  shortName: 'PduR',
  path: '/AUTOSAR_R22/EcucDefs/PduR',
  containers: [routingPaths],
  references: [],
} as BswModuleDef;

describe('buildDbcBswmdDefIndex', () => {
  it('uses module-relative spine keys and indexes reference definitions', () => {
    const index = buildDbcBswmdDefIndex(new Map([['PduR', pduR]]));
    const moduleIndex = index.PduR;
    expect(moduleIndex.moduleShortName).toBe('PduR');
    expect(moduleIndex.containerPath.get('PduRRoutingPaths/PduRRoutingPath/PduRDestPdu')).toBe(
      destContainer.path,
    );
    expect(
      moduleIndex.referenceDef.get('PduRRoutingPaths/PduRRoutingPath/PduRDestPdu/PduRDestPduRef')
        ?.destKind,
    ).toBe('ECUC-CONTAINER-VALUE');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run src/core/dbc/__tests__/bswmdDefIndex.test.ts --reporter=dot`  
Expected: FAIL because `buildDbcBswmdDefIndex` is missing.

- [ ] **Step 3: Implement the DBC index**

Create `src/core/dbc/bswmdDefIndex.ts` with:

```ts
import type { BswModuleDef, ContainerDef, ParamDef, ReferenceDef } from '../project/bswmd/types.js';
import { spineKey } from '../odx/bswmdDefIndex.js';

export type DbcImportModule = 'Com' | 'CanIf' | 'PduR';

function indexContainer(
  container: ContainerDef,
  modulePath: string,
  containerPath: Map<string, string>,
  paramPath: Map<string, string>,
  refPath: Map<string, string>,
  paramDef: Map<string, ParamDef>,
  referenceDef: Map<string, ReferenceDef>,
): void {
  const containerKey = spineKey(modulePath, container.path);
  if (containerKey) containerPath.set(containerKey, container.path);
  for (const parameter of container.parameters) {
    const key = `${containerKey}/${parameter.shortName}`;
    paramPath.set(key, parameter.path);
    paramDef.set(key, parameter);
  }
  for (const reference of container.references) {
    const key = `${containerKey}/${reference.shortName}`;
    refPath.set(key, reference.path);
    referenceDef.set(key, reference);
  }
  for (const child of container.subContainers) {
    indexContainer(child, modulePath, containerPath, paramPath, refPath, paramDef, referenceDef);
  }
  for (const child of container.choices) {
    indexContainer(child, modulePath, containerPath, paramPath, refPath, paramDef, referenceDef);
  }
}
```

Implement `buildModuleBswmdDefIndex(moduleDef: BswModuleDef): ModuleBswmdDefIndex` by creating five Maps and recursively indexing every top-level container. Implement `buildDbcBswmdDefIndex` so that:

- Required modules are exactly `['Com', 'CanIf', 'PduR']`.
- Missing modules throw `Error('dbc-bswmd-not-loaded: missing ...')`.
- Keys are module-relative and never include the module root prefix.
- Choices are indexed as addable container definitions.

- [ ] **Step 4: Run targeted and ODX regression tests**

Run: `pnpm vitest run src/core/dbc/__tests__/bswmdDefIndex.test.ts src/core/odx --reporter=dot`  
Expected: PASS.

- [ ] **Step 5: Format, type-check, and commit**

```powershell
pnpm prettier --write src/core/odx/bswmdDefIndex.ts src/core/dbc/bswmdDefIndex.ts src/core/dbc/__tests__/bswmdDefIndex.test.ts
pnpm type-check
git add src/core/odx/bswmdDefIndex.ts src/core/dbc/bswmdDefIndex.ts src/core/dbc/__tests__/bswmdDefIndex.test.ts
git commit -m "feat(dbc): add module-scoped BSWMD definition index"
```

---

### Task 3: Mapping Profile schema and built-in R22 policy

**Files:**

- Create: `src/core/dbc/profile.ts`
- Test: `src/core/dbc/__tests__/profile.test.ts`

**Interfaces:**

- Consumes: `DbmAttributeValue` and `DbcImportModule`.
- Produces: the exact Profile schema from spec §5.2, plus:

```ts
export const AUTOSAR_R22_CAN_PROFILE_ID = 'autosar-r22-can';
export const AUTOSAR_R22_CAN_PROFILE: DbcImportProfile;
export const DEFAULT_PDU_ID_POLICY: PduIdPolicy;
export const DEFAULT_UPPER_LAYER_NAMING: UpperLayerNamingPolicy;
export const DEFAULT_COM_TX_MODE_ENUM_MAP: Readonly<Record<string, string>>;
export function applyDbcPolicyOverrides(
  profile: DbcImportProfile,
  pduIdPolicy?: Partial<PduIdPolicy>,
  upperLayerNaming?: Partial<UpperLayerNamingPolicy>,
): DbcImportProfile;
export function resolveDbcProfile(profileId: string): DbcImportProfile;
```

- [ ] **Step 1: Write the failing test**

Create `src/core/dbc/__tests__/profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { AUTOSAR_R22_CAN_PROFILE, applyDbcPolicyOverrides, resolveDbcProfile } from '../profile.js';

describe('DBC import profile', () => {
  it('exposes the built-in R22 profile and deterministic default policy', () => {
    expect(AUTOSAR_R22_CAN_PROFILE.profileId).toBe('autosar-r22-can');
    expect(AUTOSAR_R22_CAN_PROFILE.schemaVersion).toBe(1);
    expect(AUTOSAR_R22_CAN_PROFILE.modules.Com.ipduContainerKeys).toContain('ComConfig/ComIPdu');
    expect(AUTOSAR_R22_CAN_PROFILE.modules.CanIf.pduIdPolicy).toEqual({
      scope: 'perDirection',
      txBase: 0x0000,
      rxBase: 0x1000,
      step: 1,
      order: 'document-order',
    });
    expect(AUTOSAR_R22_CAN_PROFILE.modules.CanIf.upperLayerNaming.enabled).toBe(false);
  });

  it('applies overrides immutably', () => {
    const overridden = applyDbcPolicyOverrides(
      AUTOSAR_R22_CAN_PROFILE,
      { txBase: 16, order: 'shortName-order' },
      { enabled: true, txTemplate: '{module}_{pdu}_TxConfirmation' },
    );
    expect(overridden.modules.CanIf.pduIdPolicy.txBase).toBe(16);
    expect(overridden.modules.CanIf.pduIdPolicy.rxBase).toBe(0x1000);
    expect(overridden.modules.CanIf.upperLayerNaming.enabled).toBe(true);
    expect(AUTOSAR_R22_CAN_PROFILE.modules.CanIf.upperLayerNaming.enabled).toBe(false);
  });

  it('rejects unknown profiles', () => {
    expect(() => resolveDbcProfile('vendor-unknown')).toThrowError('dbc-profile-not-found');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run src/core/dbc/__tests__/profile.test.ts --reporter=dot`  
Expected: FAIL because `profile.ts` is missing.

- [ ] **Step 3: Implement profile schema and defaults**

Create `src/core/dbc/profile.ts` with the schema from spec §5.2 and these defaults:

```ts
export const DEFAULT_PDU_ID_POLICY: PduIdPolicy = {
  scope: 'perDirection',
  txBase: 0x0000,
  rxBase: 0x1000,
  step: 1,
  order: 'document-order',
};

export const DEFAULT_UPPER_LAYER_NAMING: UpperLayerNamingPolicy = {
  enabled: false,
};

export const DEFAULT_COM_TX_MODE_ENUM_MAP = {
  CYCLIC: 'PERIODIC',
  EVENT: 'DIRECT',
  EVENT_AND_CYCLIC: 'MIXED',
  NONE: 'DIRECT',
} as const;
```

Use candidate container keys, not hard-coded layout flags:

```ts
Com: ipduContainerKeys: ['ComConfig/ComIPdu'];
signalContainerKeys: ['ComConfig/ComIPdu/ComSignal', 'ComConfig/ComSignal'];
importMultiplexedAsPlain: false;

CanIf: txPduContainerKeys: [
  'CanIfInitCfg/CanIfTxPduCfg',
  'CanIfInitCfg/CanIfTxPduCfgs/CanIfTxPduCfg',
  'CanIfConfig/CanIfTxPdu',
];
rxPduContainerKeys: [
  'CanIfInitCfg/CanIfRxPduCfg',
  'CanIfInitCfg/CanIfRxPduCfgs/CanIfRxPduCfg',
  'CanIfConfig/CanIfRxPdu',
];
pduIdPolicy: DEFAULT_PDU_ID_POLICY;
upperLayerNaming: DEFAULT_UPPER_LAYER_NAMING;

PduR: routingPathContainerKeys: ['PduRRoutingPaths/PduRRoutingPath'];
sourceReferenceKey: 'PduRRoutingPaths/PduRRoutingPath/PduRSrcPdu/PduRSrcPduRef';
destinationReferenceKey: 'PduRRoutingPaths/PduRRoutingPath/PduRDestPdu/PduRDestPduRef';
```

The built-in `parameters` arrays must declare the deterministic and policy rules named by spec §7. Use a local `rule(...)` helper. At minimum include:

- Com IPdu: `ComIPduDirection`, `IPduDLC`, `ComIPduType` fallback `NORMAL`, `ComHandleId`.
- Com Tx mode: `ComTxModeMode` with the enum map and `ComTxModeTimePeriod`.
- Com Signal: `ComBitPosition` transform `bitPosition`, `ComBitSize`, `ComSignalEndianness` transform `endianness`, `ComSignalType`, `ComSignalDataInvalidValue`, and `ComTransferProperty` fallback `TRIGGERED`.
- CanIf Tx/Rx: `*CanId`, `*CanIdType`, `*Dlc`, `*Id`, `*Type`; set Tx/Rx PDU type fallback to `STATIC`; include both `*UserTxConfirmationUL` and `*UserRxIndicationUL` policy rules.
- PduR: `PduRSrcPduHandleId`, `PduRDestPduHandleId`, and the source/destination reference keys above. Do not declare EcuC Pdu references.

`resolveDbcProfile(profileId)` returns the built-in profile only when `profileId === AUTOSAR_R22_CAN_PROFILE_ID`; otherwise throw `Error('dbc-profile-not-found: ...')`. `applyDbcPolicyOverrides` must return a new profile object and preserve all unchanged nested data.

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/core/dbc/__tests__/profile.test.ts --reporter=dot`  
Expected: PASS.

- [ ] **Step 5: Format, type-check, and commit**

```powershell
pnpm prettier --write src/core/dbc/profile.ts src/core/dbc/__tests__/profile.test.ts
pnpm type-check
git add src/core/dbc/profile.ts src/core/dbc/__tests__/profile.test.ts
git commit -m "feat(dbc): add mapping profile and R22 default policy"
```

---

### Task 4: Additive shared IPC DTOs and channel names

**Files:**

- Create: `src/shared/types/dbc-import.ts`
- Modify: `src/shared/ipc-contract.ts`
- Test: `src/shared/types/__tests__/dbc-import.types.test.ts`

**Interfaces:**

- Consumes: `DbcImportProfile`, `DbmWarning`, `DbcWarningCode`, and the reusable `ImportDecision`.
- Produces: all DTOs in spec §8.1 and §10.1 exactly, including `DbcImportRow`, `DbcImportStats`, `DbcFullImportPreviewRequest`, `DbcFullImportPreview`, `DbcFullImportCommitRequest`, `DbcFullImportCommitResponse`, and `DbcImportError`.

- [ ] **Step 1: Add channel constants**

In `src/shared/ipc-contract.ts`, add inside `IPC_CHANNELS` next to the ODX import channels:

```ts
DBC_FULL_IMPORT_PREVIEW: 'dbc:fullImportPreview',
DBC_FULL_IMPORT_COMMIT: 'dbc:fullImportCommit',
```

Keep the existing `DBC_IMPORT_COM_STACK` untouched.

- [ ] **Step 2: Add shared types**

Create `src/shared/types/dbc-import.ts` with the exact DTO field names, optionality, and unions from the spec. Reuse `ImportDecision`; do not define a second decision type. The error union must contain exactly the hard error kinds in spec §12, with `write-failed` carrying `rolledBack: boolean`.

- [ ] **Step 3: Write a compile-shape regression test**

Create `src/shared/types/__tests__/dbc-import.types.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  DbcFullImportPreview,
  DbcImportDecision,
  DbcImportError,
  DbcImportRow,
} from '../dbc-import.js';

describe('DBC full-import shared DTOs', () => {
  it('keeps decisions reusable and errors closed', () => {
    expectTypeOf<DbcImportDecision>().toEqualTypeOf<'import' | 'keep-local' | 'delete'>();
    const row: DbcImportRow = {
      module: 'Com',
      path: '/Com/ComConfig/ComIPdu/EngineMsg',
      shortName: 'EngineMsg',
      category: 'added',
      defaultDecision: 'import',
      fieldDiffs: [],
    };
    expect(row.category).toBe('added');

    const value: DbcFullImportPreview['stats'] = {
      messages: 1,
      signals: 2,
      skippedIrrelevantMessages: 0,
      skippedMultiplexedSignals: 1,
    };
    expect(value.skippedMultiplexedSignals).toBe(1);

    const error: DbcImportError = { kind: 'dbc-target-dirty', message: 'save first' };
    expect(error.kind).toBe('dbc-target-dirty');
  });
});
```

- [ ] **Step 4: Run targeted checks**

```powershell
pnpm vitest run src/shared/types/__tests__/dbc-import.types.test.ts --reporter=dot
pnpm type-check
```

Expected: PASS. If type-check fails because `threeWayMerge` is not yet generalized, complete Task 5 before committing this task.

- [ ] **Step 5: Commit**

```powershell
git add src/shared/types/dbc-import.ts src/shared/types/__tests__/dbc-import.types.test.ts src/shared/ipc-contract.ts
git commit -m "feat(dbc): add full-import IPC contracts"
```

---

### Task 5: Generalize ODX three-way merge into core/import

**Files:**

- Move: `src/core/odx/threeWayMerge.ts` → `src/core/import/threeWayMerge.ts`
- Modify: `src/core/odx/threeWayMerge.ts`
- Modify: ODX source imports that require mechanical path/type updates
- Test: `src/core/import/__tests__/threeWayMerge.test.ts`

**Interfaces:**

- Consumes: `ArxmlContainer`, `ArxmlModule`.
- Produces:

```ts
export interface ImportManifestEntry {
  readonly module: string;
  readonly containerPath: string;
  readonly contentHash: string;
}

export type ImportDecision = 'import' | 'keep-local' | 'delete';

export function hashContainerForProvenance(container: ArxmlContainer): string;

export function classifyImportRows<Category extends string>(args: {
  readonly module: string;
  readonly removedCategoryLabel: Category;
  readonly manifestEntries:
    | ReadonlyMap<string, string | ImportManifestEntry>
    | Iterable<readonly [string, string | ImportManifestEntry]>;
  readonly currentContainers: ReadonlyMap<string, string>;
  readonly incomingContainers: ReadonlyMap<string, string>;
}): readonly {
  readonly path: string;
  readonly module: string;
  readonly shortName: string;
  readonly category: 'added' | 'updated' | 'locally-modified' | 'conflict' | 'converged' | Category;
  readonly defaultDecision: ImportDecision;
  readonly conflictDetail?: { readonly localHash: string; readonly incomingHash: string };
}[];

export function mergeModuleThreeWay(args: {
  readonly existing: ArxmlModule | null;
  readonly incoming: ArxmlModule;
  readonly baseContainers?: ReadonlyMap<string, string | ImportManifestEntry>;
  readonly currentContainers?: ReadonlyMap<string, string>;
  readonly incomingContainers?: ReadonlyMap<string, string>;
  readonly decisions: ReadonlyMap<string, ImportDecision>;
  readonly removedCategoryLabel?: string;
}): ArxmlModule;
```

- [ ] **Step 1: Write failing generalized tests**

Create `src/core/import/__tests__/threeWayMerge.test.ts`. Include this removed-category case:

```ts
const rows = classifyImportRows({
  module: 'Com',
  removedCategoryLabel: 'removed-in-dbc',
  manifestEntries: new Map([['/Com/ComConfig/ComIPdu/OldMsg', hashA]]),
  currentContainers: new Map([['/Com/ComConfig/ComIPdu/OldMsg', hashA]]),
  incomingContainers: new Map(),
});
expect(rows.map((row) => row.category)).toEqual(['removed-in-dbc']);
expect(rows[0]?.defaultDecision).toBe('keep-local');
```

Also cover:

- added → `import`
- incoming changed and local unchanged → `updated`
- local changed and incoming unchanged → `locally-modified` / `keep-local`
- both changed → `conflict` / `keep-local`
- incoming returns to base → `converged`
- current-only containers are not classified
- `mergeModuleThreeWay` does not resurrect a container the user explicitly deleted
- ODX-compatible `removedCategoryLabel: 'removed-in-odx'`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run src/core/import/__tests__/threeWayMerge.test.ts --reporter=dot`  
Expected: FAIL because the generalized module is missing.

- [ ] **Step 3: Move and generalize the implementation**

Use `git mv src/core/odx/threeWayMerge.ts src/core/import/threeWayMerge.ts`. Update relative imports to `../arxml/types.js`. Replace every hardcoded `'Dcm' | 'Dem'` and `as 'Dcm' | 'Dem'` with generic/string module parameters. Add `removedCategoryLabel` as shown. Preserve category order, default decision table, and merge semantics from the existing implementation.

Convert `src/core/odx/threeWayMerge.ts` into a thin re-export:

```ts
export {
  hashContainerForProvenance,
  classifyImportRows,
  collectImportContainers,
  mergeModuleThreeWay,
} from '../import/threeWayMerge.js';
export type { ImportManifestEntry, OdxImportRow } from '../import/threeWayMerge.js';
```

If `OdxImportRow` becomes too generic, keep this compatibility alias in the generalized file:

```ts
export type OdxImportRow = {
  readonly path: string;
  readonly module: 'Dcm' | 'Dem';
  readonly shortName: string;
  readonly category:
    | 'added'
    | 'updated'
    | 'locally-modified'
    | 'conflict'
    | 'converged'
    | 'removed-in-odx';
  readonly defaultDecision: ImportDecision;
  readonly conflictDetail?: { readonly localHash: string; readonly incomingHash: string };
};
```

ODX IPC callers pass `removedCategoryLabel: 'removed-in-odx'`.

- [ ] **Step 4: Run merge and ODX regression tests**

Run: `pnpm vitest run src/core/import src/core/odx src/main/ipc/__tests__ --reporter=dot`  
Expected: PASS.

- [ ] **Step 5: Format, type-check, and commit**

```powershell
pnpm prettier --write src/core/import src/core/odx src/main/ipc
pnpm type-check
git add src/core/import/threeWayMerge.ts src/core/import/__tests__/threeWayMerge.test.ts src/core/odx/threeWayMerge.ts src/main/ipc
git commit -m "refactor(import): generalize three-way merge infrastructure"
```

---

### Task 6: Shared mapper helpers and deterministic transforms

**Files:**

- Create: `src/core/dbc/mappers/types.ts`
- Create: `src/core/dbc/mappers/transforms.ts`
- Test: `src/core/dbc/__tests__/mapperTransforms.test.ts`

**Interfaces:**

- Consumes: `ModuleBswmdDefIndex`, `DbcImportProfile`, `Dbm`, `DbmWarning`.
- Produces:

```ts
export interface MapperFieldDiff {
  readonly moduleName: DbcImportModule;
  readonly containerPath: string;
  readonly paramKey: string;
  readonly local?: string | number | boolean;
  readonly incoming?: string | number | boolean;
  readonly source: 'Auto' | 'Derived' | 'Profile-default' | 'Unmapped' | 'Error';
  readonly warningCodes?: readonly DbcWarningCode[];
}

export interface MapperResult<T> {
  readonly value: T;
  readonly warnings: readonly DbmWarning[];
  readonly fieldDiffs: readonly MapperFieldDiff[];
}

export interface DbcMapperContext {
  readonly dbm: Dbm;
  readonly targetNode: string;
  readonly index: DbcBswmdDefIndex;
  readonly profile: DbcImportProfile;
  readonly warnings: DbmWarning[];
}

export function convertComBitPosition(
  startBit: number,
  length: number,
  byteOrder: 'little-endian' | 'big-endian',
): number;
export function comSignalType(
  valueType: DbmSignal['valueType'],
  length: number,
): { readonly value?: string; readonly warningCode?: DbcWarningCode };
export function assignPduIds(args: {
  readonly messageKeys: readonly string[];
  readonly policy: PduIdPolicy;
  readonly existingIds: ReadonlyMap<'Com' | 'CanIf', ReadonlySet<number>>;
}): { readonly ids: ReadonlyMap<string, number>; readonly warnings: readonly DbmWarning[] };
export function upperLayerName(args: {
  readonly pduShortName: string;
  readonly template: string;
}): string;
export function resolveContainerKey(
  candidates: readonly string[],
  index: ModuleBswmdDefIndex,
): string | undefined;
```

- [ ] **Step 1: Write the failing transform tests**

Create `src/core/dbc/__tests__/mapperTransforms.test.ts`. Include the exact spec §7.2.1 anchor table:

```ts
describe('convertComBitPosition', () => {
  it.each([
    [0, 8, 'little-endian', 0],
    [7, 8, 'big-endian', 0],
    [7, 12, 'big-endian', 12],
    [15, 4, 'big-endian', 12],
    [16, 1, 'big-endian', 16],
  ])('converts start %i length %i %s to %i', (start, length, order, expected) => {
    expect(convertComBitPosition(start, length, order)).toBe(expected);
  });
});
```

Also test `comSignalType` for every row in spec §7.2.2 and invalid combinations `signed length 1`, `float length 16`, and `double length 32`. Test PduId policy for:

- per-direction `txBase=0`, `rxBase=0x1000`
- global ignores `rxBase`
- `step=2`
- document-order vs `shortName-order`
- generated duplicate conflict
- conflict with an existing id in another container

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run src/core/dbc/__tests__/mapperTransforms.test.ts --reporter=dot`  
Expected: FAIL.

- [ ] **Step 3: Implement transforms**

For big-endian bit conversion:

```ts
function linearBit(bit: number): { readonly byte: number; readonly bitInByte: number } {
  return { byte: Math.floor(bit / 8), bitInByte: bit % 8 };
}

export function convertComBitPosition(
  startBit: number,
  length: number,
  byteOrder: 'little-endian' | 'big-endian',
): number {
  if (byteOrder === 'little-endian') return startBit;
  let current = startBit;
  for (let step = 0; step < length - 1; step += 1) {
    const { bitInByte } = linearBit(current);
    current = bitInByte > 0 ? current - 1 : current + 15;
  }
  return current;
}
```

For `comSignalType`, implement the full table from spec §7.2.2. Invalid combinations return `warningCode: 'dbc-unsupported-value-type'` and no value.

In `types.ts`, add BSWMD validation helpers:

```ts
export function makeParam(
  context: DbcMapperContext,
  moduleShortName: DbcImportModule,
  definitionKey: string,
  value: string | number | boolean,
  source: MapperFieldDiff['source'],
): ParamValue | undefined;

export function makeReference(
  context: DbcMapperContext,
  moduleShortName: DbcImportModule,
  definitionKey: string,
  value: string,
  source: MapperFieldDiff['source'],
): ParamValue | undefined;

export function makeContainer(
  context: DbcMapperContext,
  moduleShortName: DbcImportModule,
  containerKey: string,
  shortName: string,
): ArxmlContainer | undefined;
```

Rules:

- Missing container/param/reference definition emits `dbc-bswmd-def-missing`, returns `undefined`, and records a field diff with source `Unmapped` or `Error`.
- Integer maps to `integer`, float to `float`, boolean to `boolean`, enumeration to `enum`, string/function-name to `string`.
- Enumeration value not in `enumerationLiterals` emits `dbc-enum-unmapped`, records source `Error`, and returns `undefined`.
- Parameter type mismatch emits `dbc-param-type-mismatch`, records source `Error`, and returns `undefined`.
- Never create a `ParamValue` without its BSWMD `definitionRef`.
- Record field diffs for every attempted field, including successful ones and `Unmapped` policy fields.
- `DbcImportFieldDiff` in shared types must remain structurally compatible with `MapperFieldDiff`.

- [ ] **Step 4: Run transforms and type checks**

```powershell
pnpm vitest run src/core/dbc/__tests__/mapperTransforms.test.ts --reporter=dot
pnpm type-check
```

Expected: PASS.

- [ ] **Step 5: Format and commit**

```powershell
pnpm prettier --write src/core/dbc/mappers src/core/dbc/__tests__/mapperTransforms.test.ts
git add src/core/dbc/mappers src/core/dbc/__tests__/mapperTransforms.test.ts
git commit -m "feat(dbc): add deterministic mapper transforms"
```

---

### Task 7: Com mapper

**Files:**

- Create: `src/core/dbc/mappers/comMapper.ts`
- Test: `src/core/dbc/__tests__/comMapper.test.ts`

**Interfaces:**

- Consumes: `DbcMapperContext`, `MapperResult`, `assignPduIds`, `convertComBitPosition`, `comSignalType`, `makeContainer`, `makeParam`.
- Produces:

```ts
export interface ComMapperInput {
  readonly relevantMessages: readonly DbmMessage[];
  readonly signalsByMessageKey: ReadonlyMap<string, readonly DbmSignal[]>;
  readonly directionByMessageKey: ReadonlyMap<string, 'SEND' | 'RECEIVE'>;
  readonly handleIds: ReadonlyMap<string, number>;
}

export function mapCom(context: DbcMapperContext, input: ComMapperInput): MapperResult<ArxmlModule>;
```

- [ ] **Step 1: Write the failing Com mapper tests**

Create `src/core/dbc/__tests__/comMapper.test.ts` with synthetic Com BSWMD fixtures and assert:

1. One `ComIPdu` per relevant message; instance shortName equals DBM `message.key`.
2. `SEND` message gets `ComIPduDirection = SEND`.
3. `RECEIVE` message gets `ComIPduDirection = RECEIVE` and does not create a ComTxMode chain.
4. Tx `GenMsgSendType = CYCLIC` + `GenMsgCycleTime = 100` creates:
   - `ComIPdu/ComTxIPdu`
   - `ComIPdu/ComTxIPdu/ComTxModeTrue`
   - `ComIPdu/ComTxIPdu/ComTxModeTrue/ComTxMode`
   - `ComTxModeMode = PERIODIC`
   - `ComTxModeTimePeriod = 0.1` as float
5. `EVENT` maps to `DIRECT`; `EVENT_AND_CYCLIC` maps to `MIXED`; missing cycle time on `PERIODIC`/`MIXED` emits `dbc-attribute-unavailable` and leaves period `Unmapped`.
6. Signal fields:
   - `startBit=7`, `length=12`, big-endian → `ComBitPosition=12`
   - `length=16` → `ComBitSize=16`
   - little-endian → `ComSignalEndianness=LITTLE_ENDIAN`
   - big-endian → `BIG_ENDIAN`
   - unsigned length 16 → `ComSignalType=UINT16`
   - float length 32 → `FLOAT32`
7. Signals are nested under the selected signal container candidate when present.
8. Multiplexor is imported; muxed signals are skipped with one `dbc-multiplexed-signal` warning each; `importMultiplexedAsPlain=true` imports them and still warns.
9. Unmapped factor/offset/min/max/unit produce field diffs with source `Unmapped` and no warning.
10. Every generated param has a valid `definitionRef`; missing BSWMD definition produces no param.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run src/core/dbc/__tests__/comMapper.test.ts --reporter=dot`  
Expected: FAIL.

- [ ] **Step 3: Implement Com mapper**

- Resolve the IPdu container key from `profile.modules.Com.ipduContainerKeys` by taking the first present key.
- Resolve the signal container key from `profile.modules.Com.signalContainerKeys`.
- For each relevant message, build the IPdu and attach its signal containers in DBM document order.
- Add `ComIPduDirection`, `ComIPduType`, `ComHandleId`, and, when BSWMD declares it, `IPduDLC`.
- Build the ComTxMode chain only for Tx messages and only when every chain container definition exists. If one link is missing, emit one `dbc-bswmd-def-missing` warning for the chain and do not partially create it.
- Map `GenMsgSendType` using `DEFAULT_COM_TX_MODE_ENUM_MAP`; if the attribute is missing, use `Profile-default` only when the rule has a fallback, otherwise `Unmapped`.
- Compute cycle time only for `PERIODIC` or `MIXED`; divide milliseconds by `1000` and emit as float.
- For each signal, apply multiplex policy before field mapping. Return muxed skip count in a mapper stats object or expose it through field/warning metadata so the facade can aggregate it.
- Apply `convertComBitPosition`, `comSignalType`, endianness, `ComBitSize`, and `ComSignalDataInvalidValue`.
- Do not emit physical conversion parameters in the R22 profile.
- Preserve message/signal document order inside containers.

- [ ] **Step 4: Run Com tests**

Run: `pnpm vitest run src/core/dbc/__tests__/comMapper.test.ts --reporter=dot`  
Expected: PASS.

- [ ] **Step 5: Format, type-check, and commit**

```powershell
pnpm prettier --write src/core/dbc/mappers/comMapper.ts src/core/dbc/__tests__/comMapper.test.ts
pnpm type-check
git add src/core/dbc/mappers/comMapper.ts src/core/dbc/__tests__/comMapper.test.ts
git commit -m "feat(dbc): add BSWMD-backed Com mapper"
```

---

### Task 8: CanIf mapper, relevance filter, PduId policy, and UL policy

**Files:**

- Create: `src/core/dbc/mappers/canIfMapper.ts`
- Test: `src/core/dbc/__tests__/canIfMapper.test.ts`

**Interfaces:**

- Consumes: `DbcMapperContext`, `assignPduIds`, `upperLayerName`, `resolveContainerKey`.
- Produces:

```ts
export interface CanIfDirectionResult {
  readonly relevantMessages: readonly DbmMessage[];
  readonly directionByMessageKey: ReadonlyMap<string, 'SEND' | 'RECEIVE'>;
  readonly skippedIrrelevantMessages: number;
}

export function filterMessagesForTargetNode(dbm: Dbm, targetNode: string): CanIfDirectionResult;

export function mapCanIf(
  context: DbcMapperContext,
  input: {
    readonly relevantMessages: readonly DbmMessage[];
    readonly directionByMessageKey: ReadonlyMap<string, 'SEND' | 'RECEIVE'>;
    readonly pduIds: ReadonlyMap<string, number>;
    readonly existingTxIds: ReadonlySet<number>;
    readonly existingRxIds: ReadonlySet<number>;
  },
): MapperResult<ArxmlModule>;
```

- [ ] **Step 1: Write failing CanIf tests**

Create `src/core/dbc/__tests__/canIfMapper.test.ts` and assert:

1. Target ECM transmitter → Tx; target ECM receiver → Rx; unrelated message is absent.
2. `skippedIrrelevantMessages` equals unrelated-message count.
3. Tx uses `CanIfTxPduCanId`, `CanIfTxPduCanIdType`, `CanIfTxPduDlc`, `CanIfTxPduId`.
4. Rx uses the Rx equivalents.
5. `isExtended=true` → `EXTENDED_CAN`; `false` → `STANDARD_CAN`, but only when the BSWMD enum contains the literal.
6. DLC maps exactly for 0–8.
7. Tx PDU type fallback is `STATIC`.
8. Default UL disabled → both UL fields are `Unmapped` field diffs; emit grouped `dbc-policy-unmapped` only once per field family.
9. Enabled template generates `CanIf_EngineMsg_TxConfirmation` / `CanIf_EngineMsg_RxIndication`, then legalizes the result.
10. PduId conflicts with existing ids emit `dbc-pdu-id-conflict` and no duplicate assignment.
11. Container candidate selection picks the first key present in BSWMD.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run src/core/dbc/__tests__/canIfMapper.test.ts --reporter=dot`  
Expected: FAIL.

- [ ] **Step 3: Implement CanIf mapper**

- Do not substitute EcuC ECU instance names for `targetNode`.
- Use exact relevance logic from spec §7.3.1.
- Resolve Tx/Rx container keys independently from their candidate arrays.
- Generate one Tx or Rx container per relevant message, never both.
- Apply PduId policy at the preview/facade level before calling `mapCanIf`; pass the generated map into the mapper.
- Do not guess HRH/HTH, software filtering, CAN FD, or FD mode fields.
- UL naming is generated only when `upperLayerNaming.enabled === true`. The generated result must pass through `legalizeShortName`.

- [ ] **Step 4: Run CanIf tests**

Run: `pnpm vitest run src/core/dbc/__tests__/canIfMapper.test.ts --reporter=dot`  
Expected: PASS.

- [ ] **Step 5: Format, type-check, and commit**

```powershell
pnpm prettier --write src/core/dbc/mappers/canIfMapper.ts src/core/dbc/__tests__/canIfMapper.test.ts
pnpm type-check
git add src/core/dbc/mappers/canIfMapper.ts src/core/dbc/__tests__/canIfMapper.test.ts
git commit -m "feat(dbc): add CanIf mapping and relevance filtering"
```

---

### Task 9: PduR mapper and full mapping facade

**Files:**

- Create: `src/core/dbc/mappers/pduRMapper.ts`
- Create: `src/core/dbc/mappers/mapDbmToEcuc.ts`
- Test: `src/core/dbc/__tests__/mapDbmToEcuc.test.ts`

**Interfaces:**

- Consumes: all previous mappers.
- Produces:

```ts
export interface MapDbmToEcucRequest {
  readonly dbm: Dbm;
  readonly targetNode: string;
  readonly index: DbcBswmdDefIndex;
  readonly profile: DbcImportProfile;
  readonly currentIds: ReadonlyMap<'Com' | 'CanIf', ReadonlySet<number>>;
}

export interface MapDbmToEcucResult {
  readonly modules: ReadonlyMap<DbcImportModule, ArxmlModule>;
  readonly warnings: readonly DbmWarning[];
  readonly stats: DbcImportStats;
  readonly fieldDiffsByModule: ReadonlyMap<DbcImportModule, readonly MapperFieldDiff[]>;
  readonly containerPathByModule: ReadonlyMap<DbcImportModule, ReadonlyMap<string, string>>;
}

export function mapDbmToEcuc(request: MapDbmToEcucRequest): MapDbmToEcucResult;
```

- [ ] **Step 1: Write failing PduR/facade tests**

Create `src/core/dbc/__tests__/mapDbmToEcuc.test.ts` and assert:

1. Tx path topology:
   - `PduRSrcPduRef` → generated `/Com/ComConfig/ComIPdu/<Msg>`
   - `PduRDestPduRef` → generated CanIf Tx container
2. Rx path topology:
   - `PduRSrcPduRef` → generated CanIf Rx container
   - `PduRDestPduRef` → generated `/Com/ComConfig/ComIPdu/<Msg>`
3. Reference destKind mismatch emits `dbc-reference-missing`, omits the reference, and marks field diff `Error`.
4. EcuC Pdu destKind (for example a synthetic `ComPduIdRef`) is not generated and emits `dbc-reference-missing`.
5. If only `PduRSrcPduHandleId` / `PduRDestPduHandleId` exist, generate those handle IDs and mark references `Unmapped`.
6. `stats` has parsed `messages` and `signals` totals, plus `skippedIrrelevantMessages` and `skippedMultiplexedSignals` as filtered counts.
7. The returned map contains exactly Com, CanIf, and PduR modules.
8. Same input yields the same module/field/order output on repeated calls.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run src/core/dbc/__tests__/mapDbmToEcuc.test.ts --reporter=dot`  
Expected: FAIL.

- [ ] **Step 3: Implement PduR mapper and facade**

- Run relevance filtering once.
- Order messages according to the effective PduId policy: `document-order` preserves DBM order; `shortName-order` sorts message keys by code-unit dictionary order.
- Assign PduIds once, then pass the same IDs to CanIf, Com `ComHandleId`, and PduR handle fallback.
- Generate Com, CanIf, and PduR modules.
- Build reference target paths from the actual generated container paths returned by the first two mappers.
- Validate `ReferenceDef.destKind` before emitting.
- Emit `dbc-reference-missing` for invalid or EcuC Pdu references; do not silently omit the field diff.
- Support standard source/destination sub-containers and profile-declared direct reference keys.
- Return stats and field diffs so preview does not re-walk ASTs.

- [ ] **Step 4: Run full mapping tests**

Run: `pnpm vitest run src/core/dbc/__tests__ --reporter=dot`  
Expected: PASS.

- [ ] **Step 5: Format, type-check, and commit**

```powershell
pnpm prettier --write src/core/dbc/mappers src/core/dbc/__tests__/mapDbmToEcuc.test.ts
pnpm type-check
git add src/core/dbc/mappers/pduRMapper.ts src/core/dbc/mappers/mapDbmToEcuc.ts src/core/dbc/__tests__/mapDbmToEcuc.test.ts
git commit -m "feat(dbc): add PduR mapper and full DBM mapping"
```

---

### Task 10: Preview IPC and read-only orchestration

**Files:**

- Create: `src/main/ipc/dbcFullImportRuntime.ts`
- Create: `src/main/ipc/dbcFullImportPreviewHandler.ts`
- Test: `src/main/ipc/__tests__/dbcFullImportPreviewHandler.test.ts`

**Interfaces:**

- Consumes: shared DTOs, DBM builder, BSWMD index, profile, mapper facade, generalized merge.
- Produces:

```ts
export async function dbcFullImportPreviewHandler(
  request: DbcFullImportPreviewRequest,
): Promise<DbcFullImportPreviewResponse>;

export async function computeDbcFullImportPreview(
  request: DbcFullImportPreviewRequest,
): Promise<DbcFullImportPreviewResponse>;

export async function computeDbcFullImportMappedModules(
  request: DbcFullImportPreviewRequest,
): Promise<ReadonlyMap<DbcImportModule, ArxmlModule>>;
```

- [ ] **Step 1: Write failing preview tests**

Create `src/main/ipc/__tests__/dbcFullImportPreviewHandler.test.ts` with a temporary project fixture or the existing ODX IPC test pattern. Cover:

1. No open project → `{ ok: false, error: { kind: 'read-failed' } }`.
2. Missing/too-large DBC → `dbc-malformed` / `dbc-too-large`.
3. DBC without messages → `dbc-no-messages`.
4. Discovery-only request without `targetNode` returns `nodes`, `targetModules`, and empty `rows`, but does not require BSWMD mapping.
5. Invalid mapping `targetNode` → `dbc-target-node-invalid`.
6. Missing Com/CanIf/PduR BSWMD → `dbc-bswmd-not-loaded`.
7. Same module in multiple value files → `dbc-module-ambiguous`.
8. Dirty target from `dirtyDocPaths` → `dbc-target-dirty`.
9. Unknown profile → `dbc-profile-not-found`.
10. Preview does not write any project file.
11. Two identical preview calls return the same `previewHash`.
12. Policy override changes `previewHash`.
13. Preview rows are sorted by module then path.
14. Field diffs carry source labels and warning codes.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run src/main/ipc/__tests__/dbcFullImportPreviewHandler.test.ts --reporter=dot`  
Expected: FAIL.

- [ ] **Step 3: Implement preview orchestration**

Use the ODX preview handler as the orchestration pattern, but do not copy old DBC bridge path resolution.

Main-process sequence:

1. Get project from `getOpenProjectManifestPath()`.
2. Read and validate manifest.
3. Read DBC with `readFileWithCap(request.dbcPath, DBC_MAX_BYTES)`.
4. Create DBM document and build DBM.
5. Return discovery-only preview when `targetNode` is omitted.
6. Validate `targetNode` against DBM nodes.
7. Read all `manifest.bswmdPaths`, parse BSWMDs, build the module map, and call `buildDbcBswmdDefIndex`.
8. Resolve profile and apply `pduIdPolicy` / `upperLayerNaming` overrides.
9. Collect target modules from all `manifest.valueArxmlPaths` using ARXML `collectModules`, not regex/basename fallback.
10. Reject ambiguous or dirty targets.
11. Call `mapDbmToEcuc`.
12. Load `.autosarcfg/dbc-import-manifest.json`; malformed or wrong-version manifest emits `dbc-manifest-ignored` and is treated as empty.
13. Compute current and incoming container hashes using generalized `hashContainerForProvenance`.
14. For each module call generalized `classifyImportRows` with `removedCategoryLabel: 'removed-in-dbc'`.
15. Treat a container owned by another DBC source as `conflict`.
16. Merge mapper field diffs into rows.
17. Sort rows by `module`, then `path`.
18. Compute `previewHash` with a fixed field object:

```ts
function dbcPreviewHash(input: {
  readonly dbmSourceHash: string;
  readonly targetNode: string;
  readonly profile: DbcImportProfile;
  readonly pduIdPolicy: PduIdPolicy;
  readonly upperLayerNaming: UpperLayerNamingPolicy;
  readonly rows: readonly DbcImportRow[];
  readonly targetModules: DbcFullImportPreview['targetModules'];
}): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
```

All errors must use the closed `DbcImportError` union.

- [ ] **Step 4: Run preview tests**

Run: `pnpm vitest run src/main/ipc/__tests__/dbcFullImportPreviewHandler.test.ts --reporter=dot`  
Expected: PASS.

- [ ] **Step 5: Format, type-check, and commit**

```powershell
pnpm prettier --write src/main/ipc/dbcFullImportRuntime.ts src/main/ipc/dbcFullImportPreviewHandler.ts src/main/ipc/__tests__/dbcFullImportPreviewHandler.test.ts
pnpm type-check
git add src/main/ipc/dbcFullImportRuntime.ts src/main/ipc/dbcFullImportPreviewHandler.ts src/main/ipc/__tests__/dbcFullImportPreviewHandler.test.ts
git commit -m "feat(dbc): add full-import preview orchestration"
```

---

### Task 11: Commit IPC, provenance, atomic write, and rollback

**Files:**

- Create: `src/main/ipc/dbcFullImportCommitHandler.ts`
- Test: `src/main/ipc/__tests__/dbcFullImportCommitHandler.test.ts`

**Interfaces:**

- Consumes: `computeDbcFullImportPreview`, `computeDbcFullImportMappedModules`, `applyPatchesToDocument`, `writeAtomic`, `mergeModuleThreeWay`.
- Produces:

```ts
export async function dbcFullImportCommitHandler(
  request: DbcFullImportCommitRequest,
): Promise<DbcFullImportCommitResponse>;
```

- [ ] **Step 1: Write failing commit tests**

Create `src/main/ipc/__tests__/dbcFullImportCommitHandler.test.ts` and cover:

1. Preview hash mismatch → `dbc-commit-mismatch`.
2. Unknown decision path → `dbc-commit-mismatch`.
3. Existing module → emits one `overwrite-module` patch and preserves current-only containers.
4. Missing module → creates `<Module>_EcucValues.arxml`, appends a relative POSIX path to `valueArxmlPaths`, and rejects paths outside the project.
5. Added row defaults to import; locally modified row defaults to keep-local; conflict defaults to keep-local; explicit `delete` removes the container.
6. Success writes `.autosarcfg/dbc-import-manifest.json`.
7. Same `sourceId` replaces all of its entries and leaves other source entries untouched.
8. A container owned by another DBC source is treated as conflict.
9. ECUC write failure rolls back already-written ECUC files and does not update project manifest/provenance.
10. Provenance write failure rolls back ECUC and project manifest writes.
11. New-module manifest write failure rolls back ECUC files and leaves original files intact.
12. Success response returns applied/kept/deleted counts and `manifestPath`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run src/main/ipc/__tests__/dbcFullImportCommitHandler.test.ts --reporter=dot`  
Expected: FAIL.

- [ ] **Step 3: Implement commit orchestration**

Follow the ODX commit transaction order with DBC provenance semantics:

1. Re-run `computeDbcFullImportPreview` with the same request fields. Do not accept preview rows from the renderer.
2. Compare `request.previewHash`.
3. Reject unknown decision paths.
4. Build a decision map keyed by row `path`; also validate decision `module` matches the row.
5. Re-run mapping with `computeDbcFullImportMappedModules`.
6. For each Com/CanIf/PduR module, merge three-way using provenance base, current hashes, incoming hashes, and decisions.
7. For existing modules, emit `overwrite-module` through `applyPatchesToDocument`.
8. For missing modules, use `uniqueNewModulePath(manifestDir, moduleShortName)` producing:
   - `Com_EcucValues.arxml`
   - `CanIf_EcucValues.arxml`
   - `PduR_EcucValues.arxml`
     and append `_N` only on collision.
9. Verify every new path with `isPathInsideReal`.
10. Write in this order: existing/new ECUC files → project manifest (only if changed) → DBC provenance.
11. Maintain a pending-write snapshot list and roll back in reverse order on any failure.
12. Compute DBC source ID exactly as:

```ts
const sourceId = createHash('sha256')
  .update(
    JSON.stringify({
      sourceFile: request.dbcPath,
      sourceHash: dbm.meta.sourceHash,
      targetNode: request.targetNode,
      profileId: effectiveProfile.profileId,
    }),
  )
  .digest('hex');
```

13. Replace the source’s `entries` array with committed containers owned by this source. Keep entries from other sources unchanged.
14. Record `contentHash` using `hashContainerForProvenance` on the post-merge container.
15. Treat malformed/old-version provenance input as empty and replace it.
16. Return `{ applied, kept, deleted, manifestPath }`.

- [ ] **Step 4: Run commit tests**

Run: `pnpm vitest run src/main/ipc/__tests__/dbcFullImportCommitHandler.test.ts src/main/ipc/__tests__/dbcFullImportPreviewHandler.test.ts --reporter=dot`  
Expected: PASS.

- [ ] **Step 5: Format, type-check, and commit**

```powershell
pnpm prettier --write src/main/ipc/dbcFullImportCommitHandler.ts src/main/ipc/__tests__/dbcFullImportCommitHandler.test.ts
pnpm type-check
git add src/main/ipc/dbcFullImportCommitHandler.ts src/main/ipc/__tests__/dbcFullImportCommitHandler.test.ts
git commit -m "feat(dbc): add transactional full-import commit"
```

---

### Task 12: Register IPC channels and preload APIs

**Files:**

- Modify: `src/main/ipc/register.ts`
- Modify: `src/preload/index.ts`
- Test: nearest existing preload test file; create `src/preload/__tests__/dbc-full-import.test.ts` if none exists.

**Interfaces:**

- Consumes: new handlers and DTOs.
- Produces:

```ts
window.autosarApi.dbcFullImportPreview(
  request: DbcFullImportPreviewRequest,
): Promise<DbcFullImportPreviewResponse>;

window.autosarApi.dbcFullImportCommit(
  request: DbcFullImportCommitRequest,
): Promise<DbcFullImportCommitResponse>;
```

- [ ] **Step 1: Write failing wiring tests**

Assert that:

1. New channel names are exactly `dbc:fullImportPreview` and `dbc:fullImportCommit`.
2. Preload methods invoke `ipcRenderer.invoke` with those constants.
3. Existing `dbcImportComStack` remains unchanged.
4. New request/response types are exported for renderer use.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run src/preload src/main/ipc/__tests__ --reporter=dot`  
Expected: FAIL for missing APIs.

- [ ] **Step 3: Wire main and preload**

In `register.ts`, import both handlers and add:

```ts
ipcMain.handle(IPC_CHANNELS.DBC_FULL_IMPORT_PREVIEW, (_event, request) =>
  dbcFullImportPreviewHandler(request),
);
ipcMain.handle(IPC_CHANNELS.DBC_FULL_IMPORT_COMMIT, (_event, request) =>
  dbcFullImportCommitHandler(request),
);
```

In `preload/index.ts`, add additive methods only. Do not alter the old `dbcImportComStack` method.

- [ ] **Step 4: Run wiring tests**

```powershell
pnpm vitest run src/preload src/main/ipc/__tests__ --reporter=dot
pnpm type-check
```

Expected: PASS.

- [ ] **Step 5: Format and commit**

```powershell
pnpm prettier --write src/main/ipc/register.ts src/preload/index.ts
git add src/main/ipc/register.ts src/preload/index.ts
git commit -m "feat(dbc): expose full-import IPC APIs"
```

---

### Task 13: Upgrade DbcImportWizard to the four-step flow

**Files:**

- Modify: `src/renderer/components/DbcImportWizard/DbcImportWizard.tsx`
- Modify: `src/renderer/components/DbcImportWizard/DbcImportWizard.css`
- Create: `src/renderer/components/DbcImportWizard/steps/SourceTargetStep.tsx`
- Create: `src/renderer/components/DbcImportWizard/steps/MappingPolicyStep.tsx`
- Create: `src/renderer/components/DbcImportWizard/steps/PreviewDecisionsStep.tsx`
- Create: `src/renderer/components/DbcImportWizard/steps/ApplyStep.tsx`
- Modify: `src/renderer/App.tsx`, `src/renderer/app/useWizardHandlers.ts`
- Modify: `src/shared/i18n/dbc.ts`, `src/shared/i18n.en/dbc.ts`, `src/shared/i18n.zh-CN/dbc.ts`
- Test: `src/renderer/components/DbcImportWizard/__tests__/DbcImportWizard.test.tsx`

**Interfaces:**

- Consumes: new preload APIs and DTOs.
- Produces:

```ts
export interface DbcImportWizardProps {
  readonly onClose: () => void;
  readonly locale?: Locale;
  readonly dirtyDocPaths: readonly string[];
  readonly onPickDbc?: () => void;
  readonly onPreview: (
    request: DbcFullImportPreviewRequest,
  ) => Promise<DbcFullImportPreviewResponse>;
  readonly onCommit: (request: DbcFullImportCommitRequest) => Promise<DbcFullImportCommitResponse>;
  readonly onImported?: () => void;
}
```

The old `onApply(dbcContent, targetNode)` and `initialDbc` props are removed only after host callers are migrated. Keep old IPC unchanged.

- [ ] **Step 1: Write failing wizard state-machine tests**

Replace/augment `DbcImportWizard.test.tsx` with Testing Library tests for:

1. Step flow: Source & Target → Mapping Policy → Preview & Decisions → Apply.
2. Picking a DBC calls preview without `targetNode`; node select comes only from `preview.nodes`.
3. Selecting a node calls preview again with that node.
4. PduId base/step/order changes and UL enablement call preview again; stale preview responses are discarded.
5. Current `profileId` is displayed.
6. Rows are grouped by Com/CanIf/PduR and sorted by path.
7. Expanding a row shows field-level diff and source badge.
8. Warnings are grouped by code with localized label, count, and expandable detail.
9. Warnings and rows scroll; commit button remains visible when content is long.
10. Added/updated default to import; locally-modified/conflict/removed-in-dbc default to keep-local.
11. Commit sends only `module`, `path`, and `decision`; never DBM/AST data.
12. Busy commit disables close, Escape, and backdrop click.
13. Success calls `onImported` and shows applied/kept/deleted counts.
14. Preview/commit errors render localized messages and no raw stack text.
15. Stats display `messages`, `signals`, `skippedIrrelevantMessages`, and `skippedMultiplexedSignals`.

- [ ] **Step 2: Run UI tests and verify they fail**

Run: `pnpm vitest run src/renderer/components/DbcImportWizard --reporter=dot`  
Expected: FAIL.

- [ ] **Step 3: Implement the wizard reducer and steps**

Use a reducer with states:

```ts
type DbcWizardStep = 'source-target' | 'policy' | 'preview' | 'apply';
type DbcWizardStatus = 'idle' | 'discovering' | 'previewing' | 'committing' | 'done' | 'error';

interface DbcWizardState {
  readonly step: DbcWizardStep;
  readonly status: DbcWizardStatus;
  readonly dbcPath?: string;
  readonly discovery?: DbcFullImportPreview;
  readonly preview?: DbcFullImportPreview;
  readonly targetNode?: string;
  readonly pduIdPolicy?: Partial<PduIdPolicy>;
  readonly upperLayerNaming?: Partial<UpperLayerNamingPolicy>;
  readonly decisions: ReadonlyMap<string, DbcImportDecision>;
  readonly error?: DbcImportError;
}
```

UI requirements:

- Discovery preview request has `targetNode` omitted.
- Mapping preview request includes `targetNode`.
- Every policy change increments a request sequence and drops stale responses.
- Field diff source badges are exactly `Auto`, `Derived`, `Profile-default`, `Unmapped`, `Error`.
- All scroll containers use existing app CSS tokens and keyboard-accessible controls.
- Busy state prevents modal dismissal.
- The wizard calls `onImported` only after commit succeeds; the host reloads the project.

- [ ] **Step 4: Migrate host and i18n**

In `App.tsx` / `useWizardHandlers.ts`:

- Supply `dirtyDocPaths` from the renderer’s open document state.
- Wrap `window.autosarApi.dbcFullImportPreview` and `...Commit` as wizard callbacks.
- On success, call the existing project reload path.
- Remove use of the old wizard callback only after all callers are migrated.

Add bilingual i18n for every visible label, step name, button, error, and all 18 warning codes under `dbc.import.*`.

- [ ] **Step 5: Run UI, host, and type checks**

```powershell
pnpm vitest run src/renderer/components/DbcImportWizard src/renderer --reporter=dot
pnpm type-check
```

Expected: PASS.

- [ ] **Step 6: Format and commit**

```powershell
pnpm prettier --write src/renderer/components/DbcImportWizard src/renderer/App.tsx src/renderer/app/useWizardHandlers.ts src/shared/i18n src/shared/i18n.en src/shared/i18n.zh-CN
git add src/renderer/components/DbcImportWizard src/renderer/App.tsx src/renderer/app/useWizardHandlers.ts src/shared/i18n src/shared/i18n.en src/shared/i18n.zh-CN
git commit -m "feat(dbc): add four-step full-import wizard"
```

---

### Task 14: Old-channel compatibility and behavior migration check

**Files:**

- Modify: `src/main/ipc/dbcImportComStackHandler.ts` only to add a doc comment, if needed.
- Modify: `src/preload/index.ts` only to add the same doc comment.
- Test: existing `src/core/bridge` and `src/main/ipc/__tests__` DBC tests remain.

**Interfaces:**

- Consumes: unchanged old handler.
- Produces: no wire-contract change.

- [ ] **Step 1: Run existing old DBC bridge tests**

Run: `pnpm vitest run src/core/bridge src/main/ipc/__tests__ --reporter=dot`  
Expected: PASS.

- [ ] **Step 2: Search for incomplete renderer migration**

Run:

```powershell
rg -n "onApply\(|initialDbc|dbcImportComStack" src/renderer src/preload src/main
```

Expected:

- Renderer no longer calls old wizard `onApply` / `initialDbc`.
- Preload/main old IPC may remain for external compatibility.
- If any renderer old path remains, migrate it before continuing.

- [ ] **Step 3: Mark old path as migration-only**

Add this concise comment to the old handler and old preload method:

```ts
/**
 * @deprecated Renderer flow uses dbc:fullImportPreview / dbc:fullImportCommit.
 * Keep this channel for external compatibility during the migration window.
 */
```

- [ ] **Step 4: Type-check and commit**

```powershell
pnpm type-check
pnpm prettier --write src/main/ipc/dbcImportComStackHandler.ts src/preload/index.ts
git add src/main/ipc/dbcImportComStackHandler.ts src/preload/index.ts
git commit -m "docs(dbc): mark legacy import channel as deprecated"
```

---

### Task 15: Full verification and manual acceptance

**Files:**

- No production changes expected.

- [ ] **Step 1: Run all DBC and import suites**

Run: `pnpm vitest run src/core/dbc src/core/import src/core/odx src/main/ipc src/renderer/components/DbcImportWizard --reporter=dot`  
Expected: PASS.

- [ ] **Step 2: Run the full suite**

Run: `pnpm test`  
Expected: PASS.

- [ ] **Step 3: Run both type configs, lint, and formatting**

```powershell
pnpm type-check
pnpm lint
pnpm format:check
```

Expected: PASS. If repository has pre-existing lint failures unrelated to this work, record them explicitly and do not mix unrelated fixes into this feature.

- [ ] **Step 4: Manual smoke with a real project**

1. Start the app with a project containing Com, CanIf, and PduR BSWMDs and value files.
2. Open the existing DBC import entry.
3. Select a DBC; confirm node discovery appears from `BU_`.
4. Select the target ECU node.
5. Confirm profile shows `autosar-r22-can`.
6. Change PduId order/base/step and confirm preview refreshes.
7. Confirm unrelated messages are not imported and the skipped count is shown.
8. Confirm muxed signals are skipped and the grouped warning is shown.
9. Expand at least one Tx and one Rx row; verify field diffs, BSWMD paths, and source badges.
10. Commit.
11. Confirm project reload, new manifest paths if modules were missing, and provenance file.
12. Select imported Com/CanIf/PduR containers in the ARXML tree and inspect/add parameters; confirm BSWMD definitions resolve.
13. Re-run import against the same DBC; confirm no unexpected conflict rows.
14. Modify one imported value locally and re-run import; confirm `locally-modified` / `keep-local` behavior.
15. Restart the app and confirm committed project state loads correctly.

- [ ] **Step 5: Final commit only for verification artifacts**

```powershell
git status --short
git add <only verification-related files>
git commit -m "test(dbc): verify full DBC import flow"
```

---

## Plan Self-Review

- Spec §3 DBM → Task 1.
- Spec §4 BSWMD index/referenceDef → Task 2.
- Spec §5 Profile and policy overrides → Tasks 3, 10, 13.
- Spec §6 module discovery, missing modules, patch, transaction → Tasks 10, 11.
- Spec §7 Com/CanIf/PduR/multiplex/PduId/UL mapping → Tasks 6–9.
- Spec §8 field diffs, stats, default decisions, hash → Tasks 4, 10.
- Spec §9 generalized merge/provenance → Tasks 5, 11.
- Spec §10 IPC and wizard → Tasks 4, 10–13.
- Spec §11/§12 closed sets → Tasks 1, 4, 6–11.
- Spec §13 test matrix → distributed through tasks and consolidated in Task 15.
- Spec §14 phases → Tasks 1–2 (Phase 1), 6–10 (Phase 2), 3/9/10 (Phase 3 integration), 5/11–13 (Phase 4).
- Every implementation task has a failing-test step, implementation requirements, verification, and scoped commit.
