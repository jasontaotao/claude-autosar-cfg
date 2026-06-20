// Sprint 12 #2 — schemaLayer integration tests for validateProject + validate.
//
// Pins the contract the renderer store depends on after layer integration:
//   1. `validate(doc, layer)` / `validateProject(documents, layer)` accept
//      an optional layer; omitting it makes every param silent-skip.
//   2. With a layer, the layer is the authoritative source for
//      param-level constraints.
//   3. With a layer, paths under known modules that are not catalogued
//      anywhere emit a 'schema-unknown' violation (BSWMD-declared
//      module has no schema for this path).
//   4. The 5 baseline fixtures continue to validate with 0 errors when
//      no layer is provided — the regression gate for backward
//      compatibility.
//   5. The /EAS → /EcucDefs namespace collapse happens before layer
//      lookup, so BSWMD paths in the `/EAS/` namespace are attributed
//      to the same module root the layer knows.
//
// All cases use synthetic in-memory BswmdDocument / ArxmlDocument
// literals — no fs, no parser — so failures point at the layer contract,
// not at fixture quirks.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ParamValue,
} from '../../arxml/types.js';
import type { BswModuleDef, BswmdDocument, ContainerDef, ParamDef } from '../../project/bswmd.js';
import { buildSchemaLayer } from '../runtimeSchema.js';
import { validate, validateProject } from '../validate.js';

// ---------------------------------------------------------------------------
// Synthetic builders
// ---------------------------------------------------------------------------

function param(overrides: Partial<ParamDef> & Pick<ParamDef, 'shortName' | 'path'>): ParamDef {
  return {
    shortName: overrides.shortName,
    path: overrides.path,
    kind: overrides.kind ?? 'integer',
    defaultValue: overrides.defaultValue ?? null,
    minValue: overrides.minValue ?? null,
    maxValue: overrides.maxValue ?? null,
    minLength: overrides.minLength ?? null,
    maxLength: overrides.maxLength ?? null,
    enumerationLiterals: overrides.enumerationLiterals ?? [],
  };
}

function container(
  overrides: Partial<ContainerDef> & Pick<ContainerDef, 'shortName' | 'path'>,
): ContainerDef {
  return {
    shortName: overrides.shortName,
    path: overrides.path,
    lowerMultiplicity: overrides.lowerMultiplicity ?? 0,
    upperMultiplicity: overrides.upperMultiplicity ?? 1,
    subContainers: overrides.subContainers ?? [],
    parameters: overrides.parameters ?? [],
    references: overrides.references ?? [],
    choices: overrides.choices ?? [],
    multiplicityConfigClasses: overrides.multiplicityConfigClasses ?? [],
  };
}

function module(
  overrides: Partial<BswModuleDef> & Pick<BswModuleDef, 'shortName' | 'path'>,
): BswModuleDef {
  return {
    shortName: overrides.shortName,
    path: overrides.path,
    dialect: overrides.dialect ?? 'ecuc-module-def',
    moduleId: overrides.moduleId ?? null,
    containers: overrides.containers ?? [],
    providedEntries: overrides.providedEntries ?? [],
    lowerMultiplicity: overrides.lowerMultiplicity ?? 0,
    upperMultiplicity: overrides.upperMultiplicity ?? 1,
    multiplicityConfigClasses: overrides.multiplicityConfigClasses ?? [],
  };
}

function makeDoc(modules: readonly BswModuleDef[]): BswmdDocument {
  return { version: '4.6', modules, warnings: [] };
}

const PKG_PATH = '/EcucDefs';

function makeArxmlDoc(...elements: readonly ArxmlElement[]): ArxmlDocument {
  return {
    path: '',
    version: '4.6',
    packages: [
      {
        shortName: 'EcucDefs',
        path: PKG_PATH,
        elements,
      },
    ],
  };
}

function makeModuleEl(
  shortName: string,
  params: Readonly<Record<string, ParamValue>> = {},
  children: readonly ArxmlElement[] = [],
): ArxmlModule {
  return {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName,
    params,
    children,
    references: [],
  };
}

function makeContainerEl(
  shortName: string,
  params: Readonly<Record<string, ParamValue>> = {},
  children: readonly ArxmlElement[] = [],
): ArxmlContainer {
  return {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName,
    params,
    children,
  };
}

// ---------------------------------------------------------------------------
// Layer is the authoritative source
// ---------------------------------------------------------------------------

describe('validate(doc, layer) — layer is authoritative', () => {
  // CanIf BSWMD declares one boolean param: CanIfDevErrorDetect at
  // /EcucDefs/CanIf/CanIfGeneral/CanIfDevErrorDetect. The layer is the
  // only source of param-level schema now that ECUC_SUBSET_SCHEMA has
  // been retired; without it, every CanIf param would silent-skip.
  const canIfGeneral = container({
    shortName: 'CanIfGeneral',
    path: '/EcucDefs/CanIf/CanIfGeneral',
    parameters: [
      param({
        shortName: 'CanIfDevErrorDetect',
        path: '/EcucDefs/CanIf/CanIfGeneral/CanIfDevErrorDetect',
        kind: 'integer',
        minValue: 0,
        maxValue: 1,
      }),
    ],
  });
  const canIf = module({
    shortName: 'CanIf',
    path: '/EcucDefs/CanIf',
    containers: [canIfGeneral],
  });
  const layer = buildSchemaLayer([makeDoc([canIf])]);

  it('applies layer constraint (integer 0..1) instead of static fallback', () => {
    const containerEl = makeContainerEl('CanIfGeneral', {
      CanIfDevErrorDetect: { type: 'integer', value: 5 }, // > max → range error
    });
    const moduleEl = makeModuleEl('CanIf', {}, [containerEl]);
    const doc = makeArxmlDoc(moduleEl);

    const errors = validate(doc, layer);
    expect(errors.some((e) => e.kind === 'range' && e.path.endsWith('/CanIfDevErrorDetect'))).toBe(
      true,
    );
  });

  it('with layer provided, no range error when value is within layer bounds', () => {
    const containerEl = makeContainerEl('CanIfGeneral', {
      CanIfDevErrorDetect: { type: 'integer', value: 0 },
    });
    const moduleEl = makeModuleEl('CanIf', {}, [containerEl]);
    const doc = makeArxmlDoc(moduleEl);

    expect(validate(doc, layer)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// schema-unknown emission
// ---------------------------------------------------------------------------

describe('validate(doc, layer) — schema-unknown for unknown paths under known modules', () => {
  const canIfGeneral = container({
    shortName: 'CanIfGeneral',
    path: '/EcucDefs/CanIf/CanIfGeneral',
    parameters: [
      param({
        shortName: 'CanIfDevErrorDetect',
        path: '/EcucDefs/CanIf/CanIfGeneral/CanIfDevErrorDetect',
        kind: 'boolean',
      }),
    ],
  });
  const canIf = module({
    shortName: 'CanIf',
    path: '/EcucDefs/CanIf',
    containers: [canIfGeneral],
  });
  const layer = buildSchemaLayer([makeDoc([canIf])]);

  it('emits schema-unknown for an ARXML param under a known module but not in layer', () => {
    // ARXML declares CanIfGeneral/MysteryParam — layer only knows
    // CanIfDevErrorDetect. Path is under /EcucDefs/CanIf → emit.
    const containerEl = makeContainerEl('CanIfGeneral', {
      MysteryParam: { type: 'integer', value: 7 },
    });
    const moduleEl = makeModuleEl('CanIf', {}, [containerEl]);
    const doc = makeArxmlDoc(moduleEl);

    const errors = validate(doc, layer);
    const schemaUnknown = errors.filter((e) => e.kind === 'schema-unknown');
    expect(schemaUnknown).toHaveLength(1);
    expect(schemaUnknown[0]!.path).toBe('/EcucDefs/CanIf/CanIfGeneral/MysteryParam');
    expect(schemaUnknown[0]!.message).toMatch(/CanIf/);
    expect(schemaUnknown[0]!.message).toMatch(/no schema for/);
  });

  it('does not emit schema-unknown for paths outside any known module', () => {
    // ARXML declares Det/FooBar (Det module not in the layer at all).
    // Even if the param path is not in any layer/sourcePaths, the
    // "no module" branch must skip silently — the validator can't
    // attribute the path to any BSWMD-declared module.
    const containerEl = makeContainerEl('DetGeneral', {
      FooBar: { type: 'integer', value: 7 },
    });
    const moduleEl = makeModuleEl('Det', {}, [containerEl]);
    const doc = makeArxmlDoc(moduleEl);

    const errors = validate(doc, layer);
    expect(errors.filter((e) => e.kind === 'schema-unknown')).toEqual([]);
  });

  it('does not emit schema-unknown for a path that IS in sourcePaths but has no constraint', () => {
    // Layer declares CanIfInitConfiguration container but no params.
    // ARXML adds a param under it — but the layer didn't declare it.
    // That's a "BSWMD-declared module but no schema for this param"
    // case → emit.
    const canIfInit = container({
      shortName: 'CanIfInitConfiguration',
      path: '/EcucDefs/CanIf/CanIfInitConfiguration',
    });
    const canIfLayer = module({
      shortName: 'CanIf',
      path: '/EcucDefs/CanIf',
      containers: [canIfInit],
    });
    const localLayer = buildSchemaLayer([makeDoc([canIfLayer])]);

    const containerEl = makeContainerEl('CanIfInitConfiguration', {
      MysteryParam: { type: 'integer', value: 0 },
    });
    const moduleEl = makeModuleEl('CanIf', {}, [containerEl]);
    const doc = makeArxmlDoc(moduleEl);

    const errors = validate(doc, localLayer);
    const schemaUnknown = errors.filter((e) => e.kind === 'schema-unknown');
    expect(schemaUnknown).toHaveLength(1);
    expect(schemaUnknown[0]!.path).toBe('/EcucDefs/CanIf/CanIfInitConfiguration/MysteryParam');
  });

  it('does not emit schema-unknown for a path the layer DOES declare', () => {
    // Layer declares CanIfGeneral/CanIfDevErrorDetect. ARXML uses it
    // with a valid boolean value → no schema-unknown.
    const containerEl = makeContainerEl('CanIfGeneral', {
      CanIfDevErrorDetect: { type: 'boolean', value: true },
    });
    const moduleEl = makeModuleEl('CanIf', {}, [containerEl]);
    const doc = makeArxmlDoc(moduleEl);

    expect(validate(doc, layer).filter((e) => e.kind === 'schema-unknown')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// /EAS namespace collapse before layer lookup
// ---------------------------------------------------------------------------

describe('validate(doc, layer) — /EAS namespace collapse before layer lookup', () => {
  // Layer declares a module under the standard /EcucDefs namespace.
  // ARXML uses /EAS for the same module (vendor convention). Without
  // the namespace collapse, the layer would never match → false
  // 'schema-unknown' fires. With the collapse, the validator should
  // see the ARXML param as belonging to a known module and emit
  // schema-unknown only for the *specific* param that isn't declared.
  const canIfGeneral = container({
    shortName: 'CanIfGeneral',
    path: '/EcucDefs/CanIf/CanIfGeneral',
    parameters: [
      param({
        shortName: 'CanIfDevErrorDetect',
        path: '/EcucDefs/CanIf/CanIfGeneral/CanIfDevErrorDetect',
        kind: 'boolean',
      }),
    ],
  });
  const canIf = module({
    shortName: 'CanIf',
    path: '/EcucDefs/CanIf',
    containers: [canIfGeneral],
  });
  const layer = buildSchemaLayer([makeDoc([canIf])]);

  it('finds layer constraints when ARXML uses /EAS namespace (same module)', () => {
    // The layer catalogues the path under /EcucDefs. The ARXML emits
    // the same path under /EAS. After normalizePath collapses the
    // namespace, the lookup matches.
    //
    // To test this without relying on a real /EAS fixture, we use a
    // synthetic stub: feed a path that the layer DOESN'T know
    // (because the layer has no /EAS entries) but feed it from inside
    // a module the layer DOES know. The collapse proves it works
    // because *without* the collapse the layer would attribute the
    // path to an unknown module and skip; *with* the collapse the
    // layer attributes it to the known /EcucDefs module.
    //
    // Simulate /EAS by feeding a "EAS" package shortName so the ARXML
    // path starts with /EAS. After collapse the lookup checks the
    // /EcucDefs module — which exists.
    const doc: ArxmlDocument = {
      path: '',
      version: '4.6',
      packages: [
        {
          shortName: 'EAS',
          path: '/EAS',
          elements: [
            makeModuleEl('CanIf', {}, [
              makeContainerEl('CanIfGeneral', {
                MysteryParam: { type: 'integer', value: 0 },
              }),
            ]),
          ],
        },
      ],
    };

    const errors = validate(doc, layer);
    const schemaUnknown = errors.filter((e) => e.kind === 'schema-unknown');
    expect(schemaUnknown).toHaveLength(1);
    expect(schemaUnknown[0]!.path).toBe('/EAS/CanIf/CanIfGeneral/MysteryParam');
    // The message should name the /EcucDefs module root (the canonical
    // form post-collapse), not the /EAS variant.
    expect(schemaUnknown[0]!.message).toContain('/EcucDefs/CanIf');
  });
});

// ---------------------------------------------------------------------------
// Baseline 5/5 regression gate — layer=null preserves 0 errors
// ---------------------------------------------------------------------------

describe('baseline 5/5 regression gate — validate() with no layer', () => {
  const FIXTURES = [
    'Det_Det.arxml',
    'EcuC_EcuC.arxml',
    'Com_Com.arxml',
    'PduR_PduR.arxml',
    'WdgIf_WdgIf.arxml',
  ] as const;

  // Avoid a hard import dependency on the parser module by lazily
  // importing it inside the test — keeps this file a pure validator
  // contract test.
  for (const name of FIXTURES) {
    it(`${name}: validate(doc) returns 0 errors (no layer)`, async () => {
      const path = join(process.cwd(), 'tests', 'fixtures', 'arxml', name);
      const xml = readFileSync(path, 'utf-8');
      const { parseArxml } = await import('../../arxml/parser.js');
      const parsed = parseArxml(xml);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      // Without a layer, every param is silent-skip (no schema entry to
      // check against), so validate() returns 0 errors. Container
      // multiplicity still consults the static ECUC_CONTAINER_SCHEMA
      // table, but the 5 fixtures sit within those bounds.
      expect(validate(parsed.value)).toEqual([]);
    });

    it(`${name}: validateProject([doc]) returns 0 errors (no layer)`, async () => {
      const path = join(process.cwd(), 'tests', 'fixtures', 'arxml', name);
      const xml = readFileSync(path, 'utf-8');
      const { parseArxml } = await import('../../arxml/parser.js');
      const parsed = parseArxml(xml);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      // Without a layer, validateProject() cannot emit 'schema-unknown'
      // (that kind only fires when a layer is provided). Sprint 12 #1
      // baseline: 782 cross-ref errors on the 5-fixture suite from
      // intentional orphan-VALUE-REFs; we don't re-pin that number here,
      // we just check the schema-unknown negative.
      const errors = validateProject([parsed.value]);
      expect(errors.some((e) => e.kind === 'schema-unknown')).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Layer + project pipeline (validateProject thread)
// ---------------------------------------------------------------------------

describe('validateProject(documents, layer) — threads layer into single-doc checks', () => {
  it('emits schema-unknown for one document under a known module', () => {
    const canIfGeneral = container({
      shortName: 'CanIfGeneral',
      path: '/EcucDefs/CanIf/CanIfGeneral',
      parameters: [
        param({
          shortName: 'CanIfDevErrorDetect',
          path: '/EcucDefs/CanIf/CanIfGeneral/CanIfDevErrorDetect',
          kind: 'boolean',
        }),
      ],
    });
    const canIf = module({
      shortName: 'CanIf',
      path: '/EcucDefs/CanIf',
      containers: [canIfGeneral],
    });
    const layer = buildSchemaLayer([makeDoc([canIf])]);

    const arxml: ArxmlDocument = makeArxmlDoc(
      makeModuleEl('CanIf', {}, [
        makeContainerEl('CanIfGeneral', {
          MysteryParam: { type: 'integer', value: 0 },
        }),
      ]),
    );

    const errors = validateProject([arxml], layer);
    expect(errors.some((e) => e.kind === 'schema-unknown')).toBe(true);
  });

  it('with no layer, project pipeline never emits schema-unknown', () => {
    const arxml: ArxmlDocument = makeArxmlDoc(
      makeModuleEl('CanIf', {}, [
        makeContainerEl('CanIfGeneral', {
          MysteryParam: { type: 'integer', value: 0 },
        }),
      ]),
    );

    expect(validateProject([arxml]).some((e) => e.kind === 'schema-unknown')).toBe(false);
  });
});
