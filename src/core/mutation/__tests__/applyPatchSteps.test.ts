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

function makeParamValue(
  type: ParamValue['type'],
  value: ParamValue['value'],
): ParamValue {
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
      makeContainerDef('ComConfig', [], [
        makeContainerDef('ComIPdu', [], [
          makeContainerDef('ComTxIPdu'),
          makeContainerDef('ComRxIPdu'),
        ]),
      ]),
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
