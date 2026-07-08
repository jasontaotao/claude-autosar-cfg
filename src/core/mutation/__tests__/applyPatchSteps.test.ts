// core/mutation/__tests__/applyPatchSteps.test.ts
//
// TDD RED-phase contract for the renderer-agnostic CLI patch step
// applier. The CLI uses this function to mutate an `ArxmlDocument`
// for each step in a parsed `PatchDocument`. Lives in `core/` (not
// `cli/`) so future GUI / IPC bridges can reuse it without dragging
// in commander / Node fs deps.
//
// Per step kind coverage (per A+C spec §8 + Sprint 16.1 follow-up):
//   - `add` (RFC 6902 add)              — raw JSON Patch on the doc tree
//   - `remove` (RFC 6902 remove)        — raw JSON Patch on the doc tree
//   - `replace` (RFC 6902 replace)      — raw JSON Patch on the doc tree
//   - `set-param` (AUTOSAR extension)   — set a single param's value
//   - `add-child` (AUTOSAR extension)   — add a sub-container to a parent
//   - `remove-with-cascade` (extension) — remove a container + inbound refs
//
// The function is pure: it takes a doc + a step, returns a new doc
// (or the same ref on a no-op) plus an optional per-step error. It
// does NOT do I/O — the CLI handler is responsible for parsing the
// patch file and writing the result back.
//
// CLI-agnostic: no commander, no electron, no `node:fs`, no `node:path`.
// Importer-friendly from both the CLI and the future GUI bridge.

import { describe, it, expect } from 'vitest';

import type { PatchStep } from '../../../shared/headless/ipc-contract.js';
import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ParamValue,
} from '../../arxml/types.js';
import type { BswModuleDef, ContainerDef, ParamDef } from '../../project/bswmd.js';
import { applyPatchSteps } from '../applyPatchSteps.js';

// ---------------------------------------------------------------------------
// Fixtures — minimal hand-built docs so tests stay focused
// ---------------------------------------------------------------------------

function makeParam(name: string, type: ParamValue['type'], value: ParamValue['value']): ParamDef {
  // The BSWMD ParamDef.kind is the schema-side type tag
  // ('integer' | 'boolean' | 'enumeration' | 'float' | 'string' |
  // 'function-name'); the ArxmlDocument's ParamValue['type'] is the
  // value-side type tag (also includes 'enum' + 'reference'). The
  // BSWMD test fixture uses the value-side tag for simplicity —
  // `makeComModule` is only consulted via the add-child test which
  // doesn't cross-check the param kind, so the runtime
  // `applyPatchSteps` impl doesn't observe the mismatch.
  const bswmdKind = type === 'enum' ? 'enumeration' : type === 'reference' ? 'string' : type;
  return {
    shortName: name,
    kind: bswmdKind,
    path: `/D/${name}`,
    defaultValue: value,
    minValue: null,
    maxValue: null,
    minLength: null,
    maxLength: null,
    enumerationLiterals: [],
  };
}

function makeParamValue(type: ParamValue['type'], value: ParamValue['value']): ParamValue {
  return { type, value } as ParamValue;
}

function makeContainerDef(
  shortName: string,
  params: readonly ParamDef[] = [],
  subContainers: readonly ContainerDef[] = [],
): ContainerDef {
  return {
    shortName,
    path: `/D/${shortName}`,
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    subContainers,
    parameters: params,
    references: [],
    choices: [],
  };
}

function makeComModule(): BswModuleDef {
  return {
    shortName: 'Com',
    path: '/D/Com',
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [
      makeContainerDef('ComGeneral', [
        makeParam('ComVersionInfoApi', 'boolean', false),
        makeParam('ComCancellationSupport', 'boolean', true),
      ]),
      makeContainerDef(
        'ComConfig',
        [],
        [
          // v1.38.0 T1 (C1) — ComIPdu now declares a parameter so the
          // add-child auto-suffix remap test can prove the param lands
          // on the right (suffixed) instance. Pre-fix fixtures
          // deliberately gave ComIPdu zero params, which made the
          // C1 bug invisible (no set-param could follow). The
          // `ComTxIPdu` / `ComRxIPdu` choices still let us exercise
          // the add-child child-def lookup via the `definitionRef`
          // tail (`ComIPdu`).
          makeContainerDef(
            'ComIPdu',
            [makeParam('ComPduDirection', 'enum', 'SEND')],
            [makeContainerDef('ComTxIPdu'), makeContainerDef('ComRxIPdu')],
          ),
        ],
      ),
    ],
    providedEntries: [],
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
  };
}

function makeComDoc(): ArxmlDocument {
  const moduleEl: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'Com',
    params: {},
    children: [
      {
        kind: 'container',
        tagName: 'ECUC-CONTAINER-VALUE',
        shortName: 'ComGeneral',
        params: {
          ComVersionInfoApi: makeParamValue('boolean', false),
          ComCancellationSupport: makeParamValue('boolean', true),
        },
        children: [],
      },
      {
        kind: 'container',
        tagName: 'ECUC-CONTAINER-VALUE',
        shortName: 'ComConfig',
        params: {},
        children: [
          {
            kind: 'container',
            tagName: 'ECUC-CONTAINER-VALUE',
            shortName: 'ComIPdu',
            params: {},
            children: [],
          },
        ],
      },
    ],
    references: [],
  };
  return {
    path: 'Com.arxml',
    version: '4.2',
    packages: [
      {
        shortName: 'EcucDefs',
        path: '/EcucDefs',
        elements: [moduleEl],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Step dispatch contract — the function is keyed by `op` discriminant
// ---------------------------------------------------------------------------

describe('applyPatchSteps', () => {
  describe('idempotency on empty steps', () => {
    it('returns the same doc ref + 0 applied + no errors for an empty step list', () => {
      const doc = makeComDoc();
      const result = applyPatchSteps(doc, []);
      expect(result.doc).toBe(doc);
      expect(result.applied).toBe(0);
      expect(result.errors).toEqual([]);
    });
  });

  describe('set-param (AUTOSAR extension)', () => {
    it('updates an existing param value + bumps applied counter', () => {
      const doc = makeComDoc();
      const step: PatchStep = {
        op: 'set-param',
        containerPath: '/EcucDefs/Com/ComGeneral',
        paramName: 'ComVersionInfoApi',
        value: true,
      };
      const result = applyPatchSteps(doc, [step]);
      expect(result.errors).toEqual([]);
      expect(result.applied).toBe(1);
      // The new doc carries the updated value at the expected path.
      const comGeneral = findChild(result.doc, 'Com', 'ComGeneral');
      expect(comGeneral).toBeDefined();
      if (comGeneral === undefined) {
        throw new Error('expected ComGeneral container');
      }
      expect(comGeneral.params['ComVersionInfoApi']).toEqual({ type: 'boolean', value: true });
      // Untouched param preserved.
      expect(comGeneral.params['ComCancellationSupport']).toEqual({
        type: 'boolean',
        value: true,
      });
    });

    it('returns path-not-found when the container does not exist', () => {
      const doc = makeComDoc();
      const step: PatchStep = {
        op: 'set-param',
        containerPath: '/EcucDefs/Com/Nonexistent',
        paramName: 'ComVersionInfoApi',
        value: true,
      };
      const result = applyPatchSteps(doc, [step]);
      expect(result.applied).toBe(0);
      expect(result.errors).toHaveLength(1);
      const err = result.errors[0];
      expect(err?.stepIndex).toBe(0);
      expect(err?.kind).toBe('path-not-found');
    });

    it('returns param-not-found when the param key is not on the container', () => {
      const doc = makeComDoc();
      const step: PatchStep = {
        op: 'set-param',
        containerPath: '/EcucDefs/Com/ComGeneral',
        paramName: 'NoSuchParam',
        value: 42,
      };
      const result = applyPatchSteps(doc, [step]);
      expect(result.applied).toBe(0);
      expect(result.errors).toHaveLength(1);
      const err = result.errors[0];
      expect(err?.stepIndex).toBe(0);
      expect(err?.kind).toBe('param-not-found');
    });
  });

  describe('add-child (AUTOSAR extension)', () => {
    it('appends a new sub-container + bumps applied counter', () => {
      const doc = makeComDoc();
      const moduleDef = makeComModule();
      const step: PatchStep = {
        op: 'add-child',
        parentPath: '/EcucDefs/Com/ComConfig',
        shortName: 'ComIPdu_Tx_New',
        definitionRef: '/D/Com/ComConfig/ComIPdu',
      };
      const result = applyPatchSteps(doc, [step], { moduleDef });
      expect(result.errors).toEqual([]);
      expect(result.applied).toBe(1);
      // The new doc has a new sub-container under ComConfig → ComIPdu.
      const comConfig = findChild(result.doc, 'Com', 'ComConfig');
      expect(comConfig).toBeDefined();
      if (comConfig === undefined) {
        throw new Error('expected ComConfig container');
      }
      const comIPdu = findChildByShortName(comConfig, 'ComIPdu_Tx_New');
      expect(comIPdu).toBeDefined();
      expect(comIPdu?.kind).toBe('container');
    });

    it('returns path-not-found when the parent path is missing', () => {
      const doc = makeComDoc();
      const moduleDef = makeComModule();
      const step: PatchStep = {
        op: 'add-child',
        parentPath: '/EcucDefs/Com/Nonexistent',
        shortName: 'Whatever',
      };
      const result = applyPatchSteps(doc, [step], { moduleDef });
      expect(result.applied).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.kind).toBe('path-not-found');
    });

    it('returns no-bswmd-for-module when no moduleDef is supplied', () => {
      const doc = makeComDoc();
      const step: PatchStep = {
        op: 'add-child',
        parentPath: '/EcucDefs/Com/ComConfig',
        shortName: 'ComIPdu_Tx_New',
      };
      const result = applyPatchSteps(doc, [step]); // no moduleDef
      expect(result.applied).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.kind).toBe('no-bswmd-for-module');
    });

    // v1.27.3 PATCH — regression lock-in for the v1.27.2 1-segment
    // synthetic-parent fallback boundary (code-review MEDIUM).
    //
    // The v1.27.2 PATCH extended `findParentContainerDef` with a
    // 1-segment synthetic-parent fallback so the Dcm mapper can add
    // module-level siblings via `parentPath: 'Dcm'` (see
    // `xlsxDcmServicesToEcucBatch.ts:50-150` + release notes §"Why
    // module-level add over leaf-parent add"). The fallback condition
    // is STRICT equality on `moduleDef.shortName` — a 1-segment
    // `parentPath` that names a different module must NOT silently
    // resolve through it. If the fallback ever softened to
    // `startsWith` or any prefix-tolerant match, a cross-vendor
    // project could mis-attribute sibling containers to the wrong
    // module — silent data corruption on the merged ARXML output.
    //
    // We exercise the boundary through the public `applyPatchSteps`
    // API rather than the unexported `findParentContainerDef`
    // directly. With `makeComModule().shortName === 'Com'` and a
    // 1-segment `parentPath: 'PduR'`, the resolved path must fall
    // through `findParentContainerDef`'s `segments.length < 2 →
    // return null` branch (line ~737) and surface as
    // `kind: 'path-not-found'` with the offending path in the
    // message (set at `applyAddChild` line 320).
    // v1.27.4 PATCH — positive control for the 1-segment /
    // 2-segment `parentPath` synthetic-parent fallback boundary
    // (sibling of the v1.27.3 cross-module negative test).
    //
    // Pins the SUCCESS path for the synthetic-parent fallback:
    // when `parentPath` reduces (via segment matching + module
    // shortName check) to the module-level form, the fallback
    // surface at `applyPatchSteps.ts:725-758` must expose the
    // module's top-level `subContainers` so the follow-up
    // `findChildDefForAdd` step can resolve the child's
    // `definitionRef` tail. If the synthetic-parent fallback ever
    // drops its `subContainers` exposure (e.g. by refactor that
    // "simplifies" the empty `subContainers: []` branch) this
    // test breaks loud; mapper integration tests would also break
    // but the failure would be more diffuse. The unit test pins
    // the contract directly.
    //
    // We exercise via the 2-segment `/EcucDefs/Com` form rather
    // than the 1-segment `'Com'` form because makeComDoc places
    // the Com module under the `EcucDefs` package — the 2-segment
    // path resolves the module via `findContainerByPath` and
    // triggers the synthetic-parent via the
    // `subSegments.length === 0` branch (line 746-758).
    it('exercises module-level synthetic-parent fallback when 2-segment parentPath resolves to module (v1.27.4 positive control)', () => {
      const doc = makeComDoc();
      const moduleDef = makeComModule(); // .shortName === 'Com'
      const step: PatchStep = {
        op: 'add-child',
        parentPath: '/EcucDefs/Com',
        shortName: 'ComGeneral_NewSibling',
        definitionRef: '/D/Com/ComGeneral',
      };
      const result = applyPatchSteps(doc, [step], { moduleDef });
      expect(result.errors).toEqual([]);
      expect(result.applied).toBe(1);
      // The new doc carries the new sibling container under Com,
      // alongside the existing ComGeneral / ComConfig children.
      const comModule = findChild(result.doc, 'Com');
      expect(comModule).toBeDefined();
      if (comModule === undefined) {
        throw new Error('expected Com module');
      }
      const newSibling = findChildByShortName(comModule, 'ComGeneral_NewSibling');
      expect(newSibling).toBeDefined();
      expect(newSibling?.kind).toBe('container');
    });

    it('returns path-not-found when 1-segment parentPath does not match moduleDef.shortName (v1.27.3 cross-module negative)', () => {
      const doc = makeComDoc();
      const moduleDef = makeComModule(); // .shortName === 'Com'
      const step: PatchStep = {
        op: 'add-child',
        parentPath: 'PduR', // 1-segment, intentionally does NOT match moduleDef.shortName
        shortName: 'PduRRoutingPath_Test',
        definitionRef: '/PduR/PduRRoutingPath',
      };
      const result = applyPatchSteps(doc, [step], { moduleDef });
      expect(result.applied).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.kind).toBe('path-not-found');
      expect(result.errors[0]?.message).toMatch(/PduR/);
    });
  });

  describe('remove-with-cascade (AUTOSAR extension)', () => {
    it('removes a sub-container and bumps applied counter', () => {
      const doc = makeComDoc();
      const step: PatchStep = {
        op: 'remove-with-cascade',
        containerPath: '/EcucDefs/Com/ComConfig/ComIPdu',
        cascade: true,
      };
      const result = applyPatchSteps(doc, [step]);
      expect(result.errors).toEqual([]);
      expect(result.applied).toBe(1);
      // ComConfig.children should no longer contain ComIPdu.
      const comConfig = findChild(result.doc, 'Com', 'ComConfig');
      expect(comConfig).toBeDefined();
      if (comConfig === undefined) {
        throw new Error('expected ComConfig container');
      }
      expect(findChildByShortName(comConfig, 'ComIPdu')).toBeUndefined();
    });

    it('returns path-not-found when the target does not exist', () => {
      const doc = makeComDoc();
      const step: PatchStep = {
        op: 'remove-with-cascade',
        containerPath: '/EcucDefs/Com/Nonexistent',
        cascade: true,
      };
      const result = applyPatchSteps(doc, [step]);
      expect(result.applied).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.kind).toBe('path-not-found');
    });
  });

  describe('RFC 6902 add / remove / replace (JSON Patch subset)', () => {
    it('add inserts a new sub-container at the given path (delegates to add-child)', () => {
      // RFC 6902 `add` for AUTOSAR paths = "insert a sub-container at
      // the parent path". The implementation delegates to applyAddChild;
      // without BSWMD context, the delegation returns
      // `no-bswmd-for-module` — that's the contract for v1.6.1 loose
      // mode. Tests with BSWMD context (in the AUTOSAR extension
      // section above) cover the successful insert path.
      const doc = makeComDoc();
      const step: PatchStep = {
        op: 'add',
        path: '/EcucDefs/Com/ComConfig',
        value: {
          shortName: 'ComIPdu_New',
          params: {},
          children: [],
        },
      };
      const result = applyPatchSteps(doc, [step]);
      // Without moduleDef context the engine returns the canonical
      // "no bswmd for module" error — the test pins that contract.
      expect(result.applied).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.kind).toBe('no-bswmd-for-module');
    });

    it('add returns patch-invalid when value is missing shortName', () => {
      const doc = makeComDoc();
      const step: PatchStep = {
        op: 'add',
        path: '/EcucDefs/Com/ComConfig',
        value: { params: {} },
      };
      const result = applyPatchSteps(doc, [step]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.kind).toBe('patch-invalid');
      expect(result.errors[0]?.message).toMatch(/shortName/);
    });

    it('add returns patch-invalid when value is null or non-object', () => {
      const doc = makeComDoc();
      const step: PatchStep = {
        op: 'add',
        path: '/EcucDefs/Com/ComConfig',
        value: null,
      };
      const result = applyPatchSteps(doc, [step]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.kind).toBe('patch-invalid');
    });

    it('remove strips a sub-container when the path resolves', () => {
      const doc = makeComDoc();
      const step: PatchStep = {
        op: 'remove',
        path: '/EcucDefs/Com/ComConfig/ComIPdu',
      };
      const result = applyPatchSteps(doc, [step]);
      expect(result.errors).toEqual([]);
      expect(result.applied).toBe(1);
      const comConfig = findChild(result.doc, 'Com', 'ComConfig');
      expect(comConfig).toBeDefined();
      if (comConfig === undefined) {
        throw new Error('expected ComConfig container');
      }
      expect(findChildByShortName(comConfig, 'ComIPdu')).toBeUndefined();
    });

    it('replace updates the value at the given path', () => {
      const doc = makeComDoc();
      // Replace an existing param on the ComGeneral container.
      const step: PatchStep = {
        op: 'replace',
        path: '/EcucDefs/Com/ComGeneral/ComVersionInfoApi',
        value: true,
      };
      const result = applyPatchSteps(doc, [step]);
      expect(result.errors).toEqual([]);
      expect(result.applied).toBe(1);
      const comGeneral = findChild(result.doc, 'Com', 'ComGeneral');
      expect(comGeneral).toBeDefined();
      if (comGeneral === undefined) {
        throw new Error('expected ComGeneral container');
      }
      expect(comGeneral.params['ComVersionInfoApi']).toEqual({ type: 'boolean', value: true });
    });
  });

  describe('error aggregation', () => {
    it('collects one error per failing step and continues', () => {
      const doc = makeComDoc();
      const steps: PatchStep[] = [
        // 0: succeeds
        {
          op: 'set-param',
          containerPath: '/EcucDefs/Com/ComGeneral',
          paramName: 'ComVersionInfoApi',
          value: true,
        },
        // 1: fails (bad path)
        {
          op: 'set-param',
          containerPath: '/EcucDefs/Com/Nope',
          paramName: 'ComVersionInfoApi',
          value: 1,
        },
        // 2: succeeds
        {
          op: 'set-param',
          containerPath: '/EcucDefs/Com/ComGeneral',
          paramName: 'ComCancellationSupport',
          value: false,
        },
      ];
      const result = applyPatchSteps(doc, steps);
      expect(result.applied).toBe(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.stepIndex).toBe(1);
    });

    it('preserves the doc ref unchanged when ALL steps fail', () => {
      const doc = makeComDoc();
      const steps: PatchStep[] = [
        {
          op: 'set-param',
          containerPath: '/EcucDefs/Com/Nope',
          paramName: 'X',
          value: 1,
        },
        {
          op: 'set-param',
          containerPath: '/EcucDefs/Com/AlsoNope',
          paramName: 'Y',
          value: 2,
        },
      ];
      const result = applyPatchSteps(doc, steps);
      expect(result.doc).toBe(doc);
      expect(result.applied).toBe(0);
      expect(result.errors).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // v1.38.0 MINOR T1 (C1) — add-child auto-suffix remap to downstream
  // set-param `containerPath`.
  //
  // Background (see C1 review finding, MD PKM capture):
  //   `coreAddContainer` (src/core/arxml/mutation.ts:155-162) auto-suffixes
  //   `shortName` to `shortName_${n}` when a sibling with the same
  //   shortName already exists. `addChildSiblingStep` (the xlsx-mapper
  //   helper) hardcodes the downstream `set-param.containerPath` as
  //   `${parentPath}/${input.instanceShortName}` — the ORIGINAL
  //   (un-suffixed) name. `applySetParam` then resolves
  //   `containerPath` via `findContainerByPath`, which finds the
  //   ORIGINAL container and silently overwrites its params. The new
  //   (suffixed) container's params stay at the BSWMD-seeded empty
  //   defaults. SILENT DATA CORRUPTION — no error, user sees wrong data.
  //
  // The fix: `applyPatchSteps` detects the auto-suffix shift after a
  // successful `add-child` and remaps the trailing
  // `${parentPath}/${requestedShortName}` → `${parentPath}/${effectiveShortName}`
  // for any following `set-param` whose `containerPath` matches the
  // requested form. This bounds the fix to the one stack that emits
  // `[add-child, set-param×N]` from `addChildSiblingStep` — the
  // `addContainer` API itself is unchanged (no breaking surface for
  // renderer consumers).
  // -----------------------------------------------------------------------
  describe('add-child auto-suffix remap (v1.38.0 T1/C1)', () => {
    it('remaps downstream set-param containerPath from <parent>/Foo to <parent>/Foo_1 when add-child auto-suffixes', () => {
      // Arrange — seed one ComIPdu with a known param value so we can
      // prove the SECOND (suffixed) container is targeted, not the
      // first.
      const moduleDef = makeComModule();
      // First add-child seeds ComIPdu_Existing with
      // ComPduDirection='ORIGINAL'. Then a SECOND add-child requests
      // shortName='ComIPdu_Existing' — which collides and triggers
      // the v1.8.4 auto-suffix path → installs as
      // 'ComIPdu_Existing_1'. The downstream set-param (emitted by
      // `addChildSiblingStep` line 86 verbatim) targets
      // containerPath='/EcucDefs/Com/ComConfig/ComIPdu_Existing',
      // which pre-fix would resolve to the FIRST container and
      // overwrite its 'ORIGINAL' value. Post-fix the set-param must
      // be remapped to '/EcucDefs/Com/ComConfig/ComIPdu_Existing_1'.
      //
      // We pick distinct literal values ('ORIGINAL', 'COLLIDING')
      // so no `noChange: true` short-circuits flatten the bug into
      // the seam between add-child and set-param.
      const seedSteps: PatchStep[] = [
        {
          op: 'add-child',
          parentPath: '/EcucDefs/Com/ComConfig',
          shortName: 'ComIPdu_Existing',
          definitionRef: '/D/Com/ComConfig/ComIPdu',
        },
        {
          op: 'set-param',
          containerPath: '/EcucDefs/Com/ComConfig/ComIPdu_Existing',
          paramName: 'ComPduDirection',
          value: 'ORIGINAL',
        },
      ];
      const seeded = applyPatchSteps(makeComDoc(), seedSteps, { moduleDef });
      expect(seeded.errors).toEqual([]);
      expect(seeded.applied).toBe(2);

      // Act — request another add-child with the SAME requested
      // shortName, then a set-param targeting the original path.
      // This is the exact emission pattern
      // `addChildSiblingStep` produces (see C1 capture): the
      // mapper does NOT know that an earlier row already installed
      // 'ComIPdu_Existing'.
      const collidingSteps: PatchStep[] = [
        {
          op: 'add-child',
          parentPath: '/EcucDefs/Com/ComConfig',
          shortName: 'ComIPdu_Existing',
          definitionRef: '/D/Com/ComConfig/ComIPdu',
        },
        {
          op: 'set-param',
          containerPath: '/EcucDefs/Com/ComConfig/ComIPdu_Existing',
          paramName: 'ComPduDirection',
          value: 'COLLIDING',
        },
      ];
      const result = applyPatchSteps(seeded.doc, collidingSteps, { moduleDef });

      // Assert — no errors (the colliding add-child + remapped
      // set-param both succeed).
      expect(result.errors).toEqual([]);

      // The set-param must land on the SUFFIXED container
      // ('ComIPdu_Existing_1'), NOT the original ('ComIPdu_Existing').
      const comConfig = findChild(result.doc, 'Com', 'ComConfig');
      expect(comConfig).toBeDefined();
      if (comConfig === undefined) {
        throw new Error('expected ComConfig container');
      }
      const firstInstance = findChildByShortName(comConfig, 'ComIPdu_Existing');
      expect(firstInstance).toBeDefined();
      const secondInstance = findChildByShortName(comConfig, 'ComIPdu_Existing_1');
      expect(secondInstance).toBeDefined();

      // First instance (the seeded one) must be UNCHANGED — the
      // whole point of the fix: silent overwrite = data corruption.
      // `toMatchObject` (NOT `toEqual`) because `fillParamsFromBswmd`
      // stamps a `definitionRef` on the seeded enum param; the
      // remapped set-param carries only `{type, value}` (the typed
      // shape the mapper emits). We assert the {type, value} keys
      // match — the `definitionRef` is irrelevant to the bug.
      if (
        firstInstance?.kind !== 'container' ||
        secondInstance?.kind !== 'container'
      ) {
        throw new Error('expected both instances to be containers');
      }
      expect(firstInstance.params['ComPduDirection']).toMatchObject({
        type: 'enum',
        value: 'ORIGINAL',
      });
      // Second instance must carry the colliding-row's value 'COLLIDING'.
      expect(secondInstance.params['ComPduDirection']).toMatchObject({
        type: 'enum',
        value: 'COLLIDING',
      });
    });

    it('does NOT remap when no collision — set-param lands on the requested shortName unchanged', () => {
      // Arrange — no collision: first instance will install as
      // exactly 'ComIPdu_NoCollision'. The set-param
      // containerPath remains '/EcucDefs/Com/ComConfig/ComIPdu_NoCollision'
      // and resolves the same way it always did. Remap must be a
      // NO-OP when there's no actual shortName conflict.
      const moduleDef = makeComModule();
      const steps: PatchStep[] = [
        {
          op: 'add-child',
          parentPath: '/EcucDefs/Com/ComConfig',
          shortName: 'ComIPdu_NoCollision',
          definitionRef: '/D/Com/ComConfig/ComIPdu',
        },
        {
          op: 'set-param',
          containerPath: '/EcucDefs/Com/ComConfig/ComIPdu_NoCollision',
          paramName: 'ComPduDirection',
          value: 'SEND',
        },
      ];
      const result = applyPatchSteps(makeComDoc(), steps, { moduleDef });
      expect(result.errors).toEqual([]);
      const comConfig = findChild(result.doc, 'Com', 'ComConfig');
      expect(comConfig).toBeDefined();
      if (comConfig === undefined) {
        throw new Error('expected ComConfig container');
      }
      const added = findChildByShortName(comConfig, 'ComIPdu_NoCollision');
      expect(added).toBeDefined();
      if (added?.kind !== 'container') {
        throw new Error('expected ComIPdu_NoCollision to be a container');
      }
      expect(added.params['ComPduDirection']).toMatchObject({ type: 'enum', value: 'SEND' });
    });

    it('remap only applies to set-param steps AFTER the colliding add-child (does not retroactively rewrite earlier set-params)', () => {
      // Arrange — pre-seed one ComIPdu under ComConfig so the
      // second add-child below will collide and trigger auto-suffix.
      // Then do two consecutive (add-child, set-param) pairs on
      // /EcucDefs/Com/ComConfig: the first with a non-colliding
      // shortName (no remap) and the second with the colliding
      // shortName (remap must fire ONLY for the second set-param).
      const moduleDef = makeComModule();
      const seed = applyPatchSteps(
        makeComDoc(),
        [
          {
            op: 'add-child',
            parentPath: '/EcucDefs/Com/ComConfig',
            shortName: 'ComIPdu_PreExisting_Existing',
            definitionRef: '/D/Com/ComConfig/ComIPdu',
          },
        ],
        { moduleDef },
      );
      expect(seed.errors).toEqual([]);

      // Act — apply both pairs on top of the seeded doc.
      const doc2 = applyPatchSteps(
        seed.doc,
        [
          // Pair 1 — non-colliding; no remap.
          {
            op: 'add-child',
            parentPath: '/EcucDefs/Com/ComConfig',
            shortName: 'ComIPdu_Fresh',
            definitionRef: '/D/Com/ComConfig/ComIPdu',
          },
          {
            op: 'set-param',
            containerPath: '/EcucDefs/Com/ComConfig/ComIPdu_Fresh',
            paramName: 'ComPduDirection',
            value: 'PAIR1',
          },
          // Pair 2 — colliding (with the seeded sibling); remap
          // must kick in for THIS set-param only.
          {
            op: 'add-child',
            parentPath: '/EcucDefs/Com/ComConfig',
            shortName: 'ComIPdu_PreExisting_Existing',
            definitionRef: '/D/Com/ComConfig/ComIPdu',
          },
          {
            op: 'set-param',
            containerPath: '/EcucDefs/Com/ComConfig/ComIPdu_PreExisting_Existing',
            paramName: 'ComPduDirection',
            value: 'PAIR2',
          },
        ],
        { moduleDef },
      );

      // Assert — both add-children + both set-params landed; no errors.
      expect(doc2.errors).toEqual([]);

      const comConfig = findChild(doc2.doc, 'Com', 'ComConfig');
      expect(comConfig).toBeDefined();
      if (comConfig === undefined) {
        throw new Error('expected ComConfig container');
      }
      const fresh = findChildByShortName(comConfig, 'ComIPdu_Fresh');
      const original = findChildByShortName(
        comConfig,
        'ComIPdu_PreExisting_Existing',
      );
      const suffixed = findChildByShortName(
        comConfig,
        'ComIPdu_PreExisting_Existing_1',
      );
      expect(fresh).toBeDefined();
      expect(original).toBeDefined();
      expect(suffixed).toBeDefined();
      if (
        fresh?.kind !== 'container' ||
        original?.kind !== 'container' ||
        suffixed?.kind !== 'container'
      ) {
        throw new Error('expected all three to be containers');
      }
      // Pair 1 — non-colliding set-param landed exactly where it
      // targeted.
      expect(fresh.params['ComPduDirection']).toMatchObject({ type: 'enum', value: 'PAIR1' });
      // Original sibling was untouched by pair 2 (default 'SEND'
      // from BSWMD seed — we don't care about it, the remap
      // property is "originals are NOT overwritten").
      expect(original.params['ComPduDirection']).toMatchObject({ type: 'enum', value: 'SEND' });
      // Pair 2 — set-param landed on the SUFFIXED instance.
      expect(suffixed.params['ComPduDirection']).toMatchObject({
        type: 'enum',
        value: 'PAIR2',
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Find a top-level module or container in the test fixture. The
 * fixture has a single `EcucDefs` package containing one module
 * (`Com`) which in turn carries the test containers
 * (`ComGeneral`, `ComConfig`). `moduleShortName` selects the
 * module; `childShortName` (when supplied) descends into that
 * module's children. Without `childShortName` the function
 * returns the module itself.
 */
function findChild(
  doc: ArxmlDocument,
  moduleShortName: string,
  childShortName?: string,
): ArxmlModule | ArxmlContainer | undefined {
  const pkg = doc.packages[0];
  if (pkg === undefined) return undefined;
  const moduleEl = pkg.elements.find((e) => {
    if (e.kind === 'unknown') return false;
    return e.shortName === moduleShortName;
  });
  if (moduleEl === undefined) return undefined;
  if (moduleEl.kind !== 'module' && moduleEl.kind !== 'container') return undefined;
  if (childShortName === undefined) return moduleEl;
  const child = moduleEl.children.find((c) => {
    if (c.kind === 'reference' || c.kind === 'unknown') return false;
    return c.shortName === childShortName;
  });
  if (child === undefined) return undefined;
  if (child.kind === 'module' || child.kind === 'container') return child;
  return undefined;
}

/** Find a child element by shortName, skipping reference + unknown leaves. */
function findChildByShortName(
  parent: ArxmlModule | ArxmlContainer,
  shortName: string,
): ArxmlElement | undefined {
  return parent.children.find((c) => {
    if (c.kind === 'reference' || c.kind === 'unknown') return false;
    return c.shortName === shortName;
  });
}
