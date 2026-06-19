// Sprint 15 — Phase 2: useArxmlStore mutation actions tests.
//
// Pins the contract for the four ECUC mutation actions and the picker /
// cascade-confirm dialog state. The tests follow the same
// `useArxmlStore.getState()` pattern as the existing store test files
// (useArxmlStore.bswmd.test.ts, useArxmlStore.combined.test.ts) so they
// bypass React entirely and exercise the store directly.
//
// The store action's job (per the spec § 5.2 / § 7) is to:
//   1. Resolve BSWMD module def + parent container def from path
//   2. Wrap the core mutation call
//   3. On Result.ok: set() with new documents + dirtyPaths + revalidation
//   4. On Result.fail: setError() with a localized message keyed by the
//      MutationError kind
//   5. In combined mode: route to the source document via
//      findByPathMultiDoc + stripCombinedPrefix (mirrors updateParam)

import { describe, it, expect, beforeEach } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlModule, ParamValue } from '@core/arxml/types';
import type { BswModuleDef, ContainerDef, ParamDef } from '@core/project/bswmd';

import { useArxmlStore } from '../useArxmlStore';

// ---------------------------------------------------------------------------
// Test fixture builders
// ---------------------------------------------------------------------------

/**
 * Build a minimal ArxmlDocument with a single module under one root package.
 * Mirrors the same shape used in useArxmlStore.combined.test.ts: a
 * `EAS/Adc/AdcConfig` path so combined-mode tests can use it directly.
 */
function makeDoc(
  filePath: string,
  moduleShortName: string,
  containerShortName: string,
  containerParams: Readonly<Record<string, ParamValue>> = {},
): ArxmlDocument {
  const container: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: containerShortName,
    params: containerParams,
    children: [],
  };
  const moduleEl: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: moduleShortName,
    params: {},
    children: [container],
    references: [],
  };
  return {
    path: filePath,
    version: '4.6',
    packages: [
      {
        shortName: 'EAS',
        path: '/EAS',
        elements: [moduleEl],
      },
    ],
  };
}

/**
 * Build a minimal BswModuleDef with a single top-level container and a
 * single sub-container the picker / addContainer flow will target. The
 * module's `path` matches the doc's structure (`/EAS/Adc`) so the store's
 * BSWMD lookup helper resolves it.
 */
function makeBswModule(
  moduleShortName: string,
  topContainerShortName: string,
  subContainerShortName: string,
  paramShortName: string = 'TestParam',
): BswModuleDef {
  const subContainer: ContainerDef = {
    shortName: subContainerShortName,
    path: `/EAS/${moduleShortName}/${topContainerShortName}/${subContainerShortName}`,
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    subContainers: [],
    parameters: [],
    references: [],
    choices: [],
  };
  const topContainer: ContainerDef = {
    shortName: topContainerShortName,
    path: `/EAS/${moduleShortName}/${topContainerShortName}`,
    lowerMultiplicity: 0,
    upperMultiplicity: 1,
    subContainers: [subContainer],
    parameters: [
      {
        shortName: paramShortName,
        path: `/EAS/${moduleShortName}/${topContainerShortName}/${paramShortName}`,
        kind: 'integer',
        defaultValue: 0,
        minValue: 0,
        maxValue: 100,
        minLength: null,
        maxLength: null,
        enumerationLiterals: [],
      } satisfies ParamDef,
    ],
    references: [],
    choices: [],
  };
  return {
    shortName: moduleShortName,
    path: `/EAS/${moduleShortName}`,
    dialect: 'ecuc-module-def',
    moduleId: 0,
    containers: [topContainer],
    providedEntries: [],
    lowerMultiplicity: 0,
    upperMultiplicity: 1,
  };
}

/**
 * Wrap a single BswModuleDef into a BswmdDocument for the store.
 */
function makeBswmd(mod: BswModuleDef) {
  return { version: '4.6', modules: [mod], warnings: [] };
}

beforeEach(() => {
  useArxmlStore.getState().clear();
});

// ---------------------------------------------------------------------------
// Picker state
// ---------------------------------------------------------------------------

describe('useArxmlStore — bswmdPicker / pendingDelete state (Sprint 15)', () => {
  it('bswmdPicker defaults to closed', () => {
    const state = useArxmlStore.getState();
    expect(state.bswmdPicker).toEqual({
      open: false,
      parentPath: null,
      kind: null,
    });
  });

  it('pendingDelete defaults to null', () => {
    expect(useArxmlStore.getState().pendingDelete).toBeNull();
  });

  it('openBswmdPicker sets open=true, parentPath, kind', () => {
    // Act
    useArxmlStore.getState().openBswmdPicker({
      parentPath: '/EAS/Adc/AdcConfig',
      kind: 'container',
    });

    // Assert
    expect(useArxmlStore.getState().bswmdPicker).toEqual({
      open: true,
      parentPath: '/EAS/Adc/AdcConfig',
      kind: 'container',
    });
  });

  it('closeBswmdPicker resets the picker state to defaults', () => {
    // Arrange — open it
    useArxmlStore
      .getState()
      .openBswmdPicker({ parentPath: '/EAS/Adc/AdcConfig', kind: 'parameter' });

    // Act
    useArxmlStore.getState().closeBswmdPicker();

    // Assert
    expect(useArxmlStore.getState().bswmdPicker).toEqual({
      open: false,
      parentPath: null,
      kind: null,
    });
  });

  it('setPendingDelete(null) clears the pending delete', () => {
    // Arrange
    useArxmlStore.getState().setPendingDelete({
      path: '/EAS/Adc/AdcConfig',
      references: [],
    });
    expect(useArxmlStore.getState().pendingDelete).not.toBeNull();

    // Act
    useArxmlStore.getState().setPendingDelete(null);

    // Assert
    expect(useArxmlStore.getState().pendingDelete).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// addContainer
// ---------------------------------------------------------------------------

describe('useArxmlStore — addContainer (Sprint 15)', () => {
  it('happy path: adds a sub-container, marks doc dirty, re-runs validation', () => {
    // Arrange
    const doc = makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig');
    useArxmlStore.getState().addDocument(doc, '/tmp/Adc.arxml');
    useArxmlStore.getState().addBswmd('/schemas/Adc.bswmd.arxml', '<mock />');
    // Inject the BSWMD content via setState so the addBswmd parser doesn't
    // need a real XML — we just need bswmdSchemas populated.
    useArxmlStore.setState({
      bswmdSchemas: [makeBswmd(makeBswModule('Adc', 'AdcConfig', 'AdcChannel'))],
      bswmdPaths: ['/schemas/Adc.bswmd.arxml'],
    });
    const before = useArxmlStore.getState().documents[0]!;

    // Act
    useArxmlStore.getState().addContainer('/EAS/Adc/AdcConfig', 'AdcChannel');

    // Assert
    const after = useArxmlStore.getState();
    const mutated = after.documents[0]!;
    expect(mutated).not.toBe(before);
    const mod = mutated.packages[0]!.elements[0]!;
    if (mod.kind !== 'module') throw new Error('expected module');
    const adCfg = mod.children[0]!;
    if (adCfg.kind !== 'container') throw new Error('expected container');
    const newChild = adCfg.children[0];
    expect(newChild).toBeDefined();
    if (newChild?.kind !== 'container') throw new Error('expected new container');
    expect(newChild.shortName).toBe('AdcChannel');
    expect(after.dirtyPaths.has('/tmp/Adc.arxml')).toBe(true);
    // revalidateWithBswmd should have set lastValidatedAt
    expect(after.lastValidatedAt).not.toBeNull();
  });

  it('no-bswmd-for-module: empty bswmdSchemas → setError, no mutation', () => {
    // Arrange
    const doc = makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig');
    useArxmlStore.getState().addDocument(doc, '/tmp/Adc.arxml');
    // No addBswmd call.
    const before = useArxmlStore.getState().documents[0]!;

    // Act
    useArxmlStore.getState().addContainer('/EAS/Adc/AdcConfig', 'AdcChannel');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.documents[0]).toBe(before);
    expect(after.error).not.toBeNull();
    // Localized key: 'mutation.error.no-bswmd-for-module'
    expect(after.error).toContain('BSWMD');
    expect(after.dirtyPaths.size).toBe(0);
  });

  it('name-conflict: parent already has a child with that shortName → setError', () => {
    // Arrange — doc already has AdcChannel as a child of AdcConfig.
    const doc = makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig');
    useArxmlStore.getState().addDocument(doc, '/tmp/Adc.arxml');
    useArxmlStore.setState({
      bswmdSchemas: [makeBswmd(makeBswModule('Adc', 'AdcConfig', 'AdcChannel'))],
      bswmdPaths: ['/schemas/Adc.bswmd.arxml'],
    });
    // Manually add an AdcChannel to the doc so the conflict fires.
    const stateBefore = useArxmlStore.getState();
    const adcConfig = (stateBefore.documents[0]!.packages[0]!.elements[0] as ArxmlModule)
      .children[0]! as ArxmlContainer;
    const conflictDoc: ArxmlDocument = {
      ...stateBefore.documents[0]!,
      packages: [
        {
          ...stateBefore.documents[0]!.packages[0]!,
          elements: [
            {
              ...(stateBefore.documents[0]!.packages[0]!.elements[0] as ArxmlModule),
              children: [
                {
                  ...adcConfig,
                  children: [
                    {
                      kind: 'container',
                      tagName: 'ECUC-CONTAINER-VALUE',
                      shortName: 'AdcChannel',
                      params: {},
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    useArxmlStore.setState({
      documents: [conflictDoc],
      doc: conflictDoc,
      filePath: '/tmp/Adc.arxml',
    });
    const before = useArxmlStore.getState().documents[0]!;

    // Act — try to add AdcChannel again
    useArxmlStore.getState().addContainer('/EAS/Adc/AdcConfig', 'AdcChannel');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.documents[0]).toBe(before); // ref equality preserved
    expect(after.error).not.toBeNull();
    expect(after.error).toContain('AdcChannel');
  });

  it('path-not-found: invalid path → setError', () => {
    // Arrange
    const doc = makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig');
    useArxmlStore.getState().addDocument(doc, '/tmp/Adc.arxml');
    useArxmlStore.setState({
      bswmdSchemas: [makeBswmd(makeBswModule('Adc', 'AdcConfig', 'AdcChannel'))],
      bswmdPaths: ['/schemas/Adc.bswmd.arxml'],
    });
    const before = useArxmlStore.getState().documents[0]!;

    // Act — path with no matching module shortName
    useArxmlStore.getState().addContainer('/EAS/NoSuchModule/AdcConfig', 'AdcChannel');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.documents[0]).toBe(before);
    expect(after.error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// addParameter
// ---------------------------------------------------------------------------

describe('useArxmlStore — addParameter (Sprint 15)', () => {
  it('happy path: adds an integer param with the BSWMD default value', () => {
    // Arrange
    const doc = makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig');
    useArxmlStore.getState().addDocument(doc, '/tmp/Adc.arxml');
    useArxmlStore.setState({
      bswmdSchemas: [makeBswmd(makeBswModule('Adc', 'AdcConfig', 'AdcChannel'))],
      bswmdPaths: ['/schemas/Adc.bswmd.arxml'],
    });
    const before = useArxmlStore.getState().documents[0]!;

    // Act
    useArxmlStore.getState().addParameter('/EAS/Adc/AdcConfig', 'TestParam');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.documents[0]).not.toBe(before);
    const mod = after.documents[0]!.packages[0]!.elements[0] as ArxmlModule;
    const adCfg = mod.children[0]!;
    if (adCfg.kind !== 'container') throw new Error('expected container');
    expect(adCfg.params.TestParam).toBeDefined();
    expect(adCfg.params.TestParam).toEqual({
      type: 'integer',
      value: 0,
      definitionRef: '/EAS/Adc/AdcConfig/TestParam',
    });
    expect(after.dirtyPaths.has('/tmp/Adc.arxml')).toBe(true);
  });

  it('invalid-param-type: param not in BSWMD → setError, no mutation', () => {
    // Arrange
    const doc = makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig');
    useArxmlStore.getState().addDocument(doc, '/tmp/Adc.arxml');
    useArxmlStore.setState({
      bswmdSchemas: [makeBswmd(makeBswModule('Adc', 'AdcConfig', 'AdcChannel'))],
      bswmdPaths: ['/schemas/Adc.bswmd.arxml'],
    });
    const before = useArxmlStore.getState().documents[0]!;

    // Act — 'NoSuchParam' is not in the BSWMD
    useArxmlStore.getState().addParameter('/EAS/Adc/AdcConfig', 'NoSuchParam');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.documents[0]).toBe(before);
    expect(after.error).not.toBeNull();
    // Localized key: 'mutation.error.invalid-param-type'
    expect(after.error).toContain('NoSuchParam');
  });

  it('no-bswmd: empty bswmdSchemas → setError "no-bswmd-for-module"', () => {
    // Arrange
    const doc = makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig');
    useArxmlStore.getState().addDocument(doc, '/tmp/Adc.arxml');
    const before = useArxmlStore.getState().documents[0]!;

    // Act
    useArxmlStore.getState().addParameter('/EAS/Adc/AdcConfig', 'TestParam');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.documents[0]).toBe(before);
    expect(after.error).not.toBeNull();
    expect(after.error).toContain('BSWMD');
  });
});

// ---------------------------------------------------------------------------
// deleteContainer
// ---------------------------------------------------------------------------

describe('useArxmlStore — deleteContainer (Sprint 15)', () => {
  it('happy path (0 references): direct removeContainer, doc mutated, no pendingDelete set', () => {
    // Arrange
    const doc = makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig');
    useArxmlStore.getState().addDocument(doc, '/tmp/Adc.arxml');
    const before = useArxmlStore.getState().documents[0]!;

    // Act — AdcConfig has no references pointing to it
    useArxmlStore.getState().deleteContainer('/EAS/Adc/AdcConfig');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.documents[0]).not.toBe(before);
    expect(after.pendingDelete).toBeNull();
    expect(after.dirtyPaths.has('/tmp/Adc.arxml')).toBe(true);
    const mod = after.documents[0]!.packages[0]!.elements[0]!;
    if (mod.kind !== 'module') throw new Error('expected module');
    // AdcConfig child was removed.
    expect(mod.children).toHaveLength(0);
  });

  it('N references: pendingDelete is set, no doc change yet', () => {
    // Arrange — build a doc that holds a reference pointing at AdcConfig.
    const adcModule: ArxmlModule = {
      kind: 'module',
      tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
      shortName: 'Adc',
      params: {},
      children: [
        {
          kind: 'container',
          tagName: 'ECUC-CONTAINER-VALUE',
          shortName: 'AdcConfig',
          params: {},
          children: [],
        },
        {
          kind: 'container',
          tagName: 'ECUC-CONTAINER-VALUE',
          shortName: 'AdcConfigSet',
          params: {
            // Reference param that points at /EAS/Adc/AdcConfig
            AdcConfigRef: {
              type: 'reference',
              value: '/EAS/Adc/AdcConfig',
              dest: 'ECUC-CONTAINER-VALUE',
            },
          },
          children: [],
        },
      ],
      references: [],
    };
    const doc: ArxmlDocument = {
      path: '/tmp/Adc.arxml',
      version: '4.6',
      packages: [{ shortName: 'EAS', path: '/EAS', elements: [adcModule] }],
    };
    useArxmlStore.getState().addDocument(doc, '/tmp/Adc.arxml');
    const before = useArxmlStore.getState().documents[0]!;

    // Act
    useArxmlStore.getState().deleteContainer('/EAS/Adc/AdcConfig');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.documents[0]).toBe(before); // ref equality preserved
    expect(after.pendingDelete).not.toBeNull();
    expect(after.pendingDelete?.path).toBe('/EAS/Adc/AdcConfig');
    expect(after.pendingDelete?.references).toHaveLength(1);
    expect(after.pendingDelete?.references[0]!.filePath).toBe('/tmp/Adc.arxml');
    expect(after.dirtyPaths.size).toBe(0);
  });

  it('path-not-found: invalid path → setError, no pendingDelete set', () => {
    // Arrange
    const doc = makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig');
    useArxmlStore.getState().addDocument(doc, '/tmp/Adc.arxml');

    // Act
    useArxmlStore.getState().deleteContainer('/EAS/Adc/NoSuchContainer');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.pendingDelete).toBeNull();
    expect(after.error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// confirmDeleteContainer
// ---------------------------------------------------------------------------

describe('useArxmlStore — confirmDeleteContainer (Sprint 15)', () => {
  function setUpWithPendingDelete(): void {
    const adcModule: ArxmlModule = {
      kind: 'module',
      tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
      shortName: 'Adc',
      params: {},
      children: [
        {
          kind: 'container',
          tagName: 'ECUC-CONTAINER-VALUE',
          shortName: 'AdcConfig',
          params: {},
          children: [],
        },
        {
          kind: 'container',
          tagName: 'ECUC-CONTAINER-VALUE',
          shortName: 'AdcConfigSet',
          params: {
            AdcConfigRef: {
              type: 'reference',
              value: '/EAS/Adc/AdcConfig',
              dest: 'ECUC-CONTAINER-VALUE',
            },
          },
          children: [],
        },
      ],
      references: [],
    };
    const doc: ArxmlDocument = {
      path: '/tmp/Adc.arxml',
      version: '4.6',
      packages: [{ shortName: 'EAS', path: '/EAS', elements: [adcModule] }],
    };
    useArxmlStore.getState().addDocument(doc, '/tmp/Adc.arxml');
    useArxmlStore.getState().deleteContainer('/EAS/Adc/AdcConfig');
  }

  it('cancel: pendingDelete cleared, no doc change', () => {
    // Arrange
    setUpWithPendingDelete();
    const before = useArxmlStore.getState().documents[0]!;
    expect(useArxmlStore.getState().pendingDelete).not.toBeNull();

    // Act
    useArxmlStore.getState().confirmDeleteContainer('cancel');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.pendingDelete).toBeNull();
    expect(after.documents[0]).toBe(before);
  });

  it('only: container removed, reference param left dangling, pendingDelete cleared', () => {
    // Arrange
    setUpWithPendingDelete();

    // Act
    useArxmlStore.getState().confirmDeleteContainer('only');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.pendingDelete).toBeNull();
    const mod = after.documents[0]!.packages[0]!.elements[0]!;
    if (mod.kind !== 'module') throw new Error('expected module');
    // AdcConfig removed, AdcConfigSet still has the reference param.
    const shortNames = mod.children.map((c) => c.shortName);
    expect(shortNames).toEqual(['AdcConfigSet']);
    const configSet = mod.children[0]!;
    if (configSet.kind !== 'container') throw new Error('expected container');
    expect(configSet.params.AdcConfigRef).toBeDefined();
    expect(after.dirtyPaths.has('/tmp/Adc.arxml')).toBe(true);
  });

  it('cascade: container + reference param both removed', () => {
    // Arrange
    setUpWithPendingDelete();

    // Act
    useArxmlStore.getState().confirmDeleteContainer('cascade');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.pendingDelete).toBeNull();
    const mod = after.documents[0]!.packages[0]!.elements[0]!;
    if (mod.kind !== 'module') throw new Error('expected module');
    // AdcConfig + AdcConfigSet both gone (cascade deleted the param, but
    // since AdcConfigSet had no other children, it stays as an empty
    // container). Actually, the cascade deletes the REFERENCE PARAM on
    // AdcConfigSet, not AdcConfigSet itself.
    const shortNames = mod.children.map((c) => c.shortName);
    expect(shortNames).toEqual(['AdcConfigSet']);
    const configSet = mod.children[0]!;
    if (configSet.kind !== 'container') throw new Error('expected container');
    expect(configSet.params.AdcConfigRef).toBeUndefined();
    expect(after.dirtyPaths.has('/tmp/Adc.arxml')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// deleteParameter
// ---------------------------------------------------------------------------

describe('useArxmlStore — deleteParameter (Sprint 15)', () => {
  it('happy path: removes the param, marks doc dirty', () => {
    // Arrange
    const doc = makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig', {
      TestParam: { type: 'integer', value: 42 },
    });
    useArxmlStore.getState().addDocument(doc, '/tmp/Adc.arxml');
    const before = useArxmlStore.getState().documents[0]!;

    // Act
    useArxmlStore.getState().deleteParameter('/EAS/Adc/AdcConfig', 'TestParam');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.documents[0]).not.toBe(before);
    const mod = after.documents[0]!.packages[0]!.elements[0] as ArxmlModule;
    const adCfg = mod.children[0]!;
    if (adCfg.kind !== 'container') throw new Error('expected container');
    expect(adCfg.params.TestParam).toBeUndefined();
    expect(after.dirtyPaths.has('/tmp/Adc.arxml')).toBe(true);
  });

  it('path-not-found: invalid path → setError, no mutation', () => {
    // Arrange
    const doc = makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig', {
      TestParam: { type: 'integer', value: 42 },
    });
    useArxmlStore.getState().addDocument(doc, '/tmp/Adc.arxml');
    const before = useArxmlStore.getState().documents[0]!;

    // Act
    useArxmlStore.getState().deleteParameter('/EAS/Adc/NoSuchContainer', 'TestParam');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.documents[0]).toBe(before);
    expect(after.error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Combined-mode dispatch
// ---------------------------------------------------------------------------

describe('useArxmlStore — combined-mode mutation (Sprint 15)', () => {
  it('addContainer in combined mode routes to the correct source document', () => {
    // Arrange — two docs
    const adcDoc = makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig');
    const canDoc = makeDoc('/tmp/Can.arxml', 'Can', 'CanConfig');
    useArxmlStore.getState().addDocument(adcDoc, '/tmp/Adc.arxml');
    useArxmlStore.getState().addDocument(canDoc, '/tmp/Can.arxml');
    useArxmlStore.setState({
      bswmdSchemas: [makeBswmd(makeBswModule('Can', 'CanConfig', 'CanController'))],
      bswmdPaths: ['/schemas/Can.bswmd.arxml'],
    });
    useArxmlStore.getState().setViewMode('combined');
    useArxmlStore.getState().setActiveDocument('/tmp/Adc.arxml');

    // Act — use the combined-mode basename-prefixed path
    useArxmlStore.getState().addContainer('/Can.arxml/EAS/Can/CanConfig', 'CanController');

    // Assert — Can.arxml got the new container, Adc.arxml was not touched.
    const after = useArxmlStore.getState();
    const canAfter = after.documents.find((d) => d.path === '/tmp/Can.arxml')!;
    const adcAfter = after.documents.find((d) => d.path === '/tmp/Adc.arxml')!;
    const canMod = canAfter.packages[0]!.elements[0]!;
    if (canMod.kind !== 'module') throw new Error('expected module');
    const canContainer = canMod.children[0]!;
    if (canContainer.kind !== 'container') throw new Error('expected container');
    expect(canContainer.children[0]?.shortName).toBe('CanController');
    const adcMod = adcAfter.packages[0]!.elements[0]!;
    if (adcMod.kind !== 'module') throw new Error('expected module');
    const adcContainer = adcMod.children[0]!;
    if (adcContainer.kind !== 'container') throw new Error('expected container');
    expect(adcContainer.children).toHaveLength(0);
    // dirty path is the source, not the active doc.
    expect(after.dirtyPaths.has('/tmp/Can.arxml')).toBe(true);
    expect(after.dirtyPaths.has('/tmp/Adc.arxml')).toBe(false);
  });

  it('addParameter in combined mode routes to the correct source document', () => {
    // Arrange
    const adcDoc = makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig');
    const canDoc = makeDoc('/tmp/Can.arxml', 'Can', 'CanConfig');
    useArxmlStore.getState().addDocument(adcDoc, '/tmp/Adc.arxml');
    useArxmlStore.getState().addDocument(canDoc, '/tmp/Can.arxml');
    useArxmlStore.setState({
      bswmdSchemas: [makeBswmd(makeBswModule('Can', 'CanConfig', 'CanController'))],
      bswmdPaths: ['/schemas/Can.bswmd.arxml'],
    });
    useArxmlStore.getState().setViewMode('combined');

    // Act
    useArxmlStore.getState().addParameter('/Can.arxml/EAS/Can/CanConfig', 'TestParam');

    // Assert — Can.arxml got the new param, Adc.arxml was not touched.
    const after = useArxmlStore.getState();
    const canMod = after.documents.find((d) => d.path === '/tmp/Can.arxml')!.packages[0]!
      .elements[0]!;
    if (canMod.kind !== 'module') throw new Error('expected module');
    const canContainer = canMod.children[0]!;
    if (canContainer.kind !== 'container') throw new Error('expected container');
    expect(canContainer.params.TestParam).toEqual({
      type: 'integer',
      value: 0,
      definitionRef: '/EAS/Can/CanConfig/TestParam',
    });
    const adcMod = after.documents.find((d) => d.path === '/tmp/Adc.arxml')!.packages[0]!
      .elements[0]!;
    if (adcMod.kind !== 'module') throw new Error('expected module');
    const adcContainer = adcMod.children[0]!;
    if (adcContainer.kind !== 'container') throw new Error('expected container');
    expect(adcContainer.params.TestParam).toBeUndefined();
    expect(after.dirtyPaths.has('/tmp/Can.arxml')).toBe(true);
    expect(after.dirtyPaths.has('/tmp/Adc.arxml')).toBe(false);
  });
});
