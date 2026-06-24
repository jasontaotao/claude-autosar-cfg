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

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlPackage,
  ParamValue,
} from '@core/arxml/types';

import { useArxmlStore } from '../useArxmlStore';

// v1.11.4 PATCH-C — BSWMD builders extracted to ./__fixtures__/bswmd.ts.
// `makeBswModuleWithSubContainer` is aliased as `makeBswModule` here
// because every call site in this file passes 3-4 args targeting the
// "topContainer + subContainer + TestParam param" shape (addContainer
// tests). The simpler `makeBswModule` (no subContainer) lives in
// addparam.test.ts / deleteModule.test.ts.
import { makeBswmd, makeBswModuleWithSubContainer as makeBswModule } from './__fixtures__/bswmd.js';

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
 * BSWMD fixture builders (extracted to ./__fixtures__/bswmd.ts in v1.11.4
 * PATCH-C). The previous local `makeBswModule` here built the
 * "topContainer + subContainer + TestParam" shape; that helper is now
 * `makeBswModuleWithSubContainer` in the fixtures module, imported above
 * as `makeBswModule` for call-site compatibility.
 */

beforeEach(() => {
  useArxmlStore.getState().clear();
});

// ---------------------------------------------------------------------------
// Sprint X T7+T8 — vendor-prefix fold + mutation routing compatibility.
//
// After the store's `computeDisplayDoc` folds a 3-segment vendor chain
// (e.g. `/JWQ_CDD_PACK/JWQ_Packet/JWQ3399` → `/JWQ3399`), the
// `displayDoc` carries the post-fold path. Tree rows call
// `select(/JWQ3399)` and then the user invokes an action via
// ContextMenu / ParamEditor — the action's containerPath is the
// post-fold path, but the source doc still carries the original
// 3-segment structure. The store action must therefore route through
// `resolveContainerTarget` (which already falls back to per-doc
// `findByPath` for non-prefixed paths) and apply the mutation against
// the source doc. This test pins that contract.
//
// We feed the store a doc whose `EAS/Can/CanConfig` path mirrors the
// flat shape so we don't depend on the parser recognising nested
// packages. The mutation route must still resolve the post-fold
// `/EAS/Can/CanConfig` path to the source doc.
// ---------------------------------------------------------------------------
describe('useArxmlStore — vendor-fold + combined-mode mutation (Sprint X T8)', () => {
  it('addContainer routes through the post-fold path to the source doc in combined mode', () => {
    // Arrange — one source doc with the flat EAS/Can/CanConfig shape
    const canDoc = makeDoc('/tmp/Can.arxml', 'Can', 'CanConfig');
    useArxmlStore.getState().addDocument(canDoc, '/tmp/Can.arxml');
    useArxmlStore.setState({
      bswmdSchemas: [makeBswmd(makeBswModule('Can', 'CanConfig', 'CanController'))],
      bswmdPaths: ['/schemas/Can.bswmd.arxml'],
    });
    useArxmlStore.getState().setViewMode('combined');

    // Act — use the post-fold combined-mode path
    // (basename prefix /Can.arxml/ + inner /EAS/Can/CanConfig).
    // This mirrors what Tree's onSelect would emit for the
    // vendor-folded JWQ3399 node.
    useArxmlStore.getState().addContainer('/Can.arxml/EAS/Can/CanConfig', 'CanController');

    // Assert — the source doc got the new container, and the
    // store's displayDoc was rebuilt (no error state).
    const after = useArxmlStore.getState();
    const canAfter = after.documents.find((d) => d.path === '/tmp/Can.arxml')!;
    const canMod = canAfter.packages[0]!.elements[0]!;
    if (canMod.kind !== 'module') throw new Error('expected module');
    const canContainer = canMod.children[0]!;
    if (canContainer.kind !== 'container') throw new Error('expected container');
    const canFirstChild = canContainer.children[0];
    expect(canFirstChild?.kind).toBe('container');
    if (canFirstChild?.kind === 'module' || canFirstChild?.kind === 'container') {
      expect(canFirstChild.shortName).toBe('CanController');
    }
    // The source doc is marked dirty; no other doc exists so we
    // only assert the source one.
    expect(after.dirtyPaths.has('/tmp/Can.arxml')).toBe(true);
    // displayDoc was rebuilt (the store's selector ran end-to-end).
    expect(after.displayDoc).not.toBeNull();
  });
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

  it('multi-instance: parent has a child with the same shortName → auto-suffix to `_1`', () => {
    // v1.8.4 Bug 2 — name-conflict no longer fires for containers. The
    // store action delegates to core addContainer which auto-suffixes
    // `AdcChannel` → `AdcChannel_1` and appends a second sibling.
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

    // Act — add AdcChannel again; auto-suffix inserts AdcChannel_1
    useArxmlStore.getState().addContainer('/EAS/Adc/AdcConfig', 'AdcChannel');

    // Assert — error stays null; the new container is appended with `_1`.
    const after = useArxmlStore.getState();
    expect(after.error).toBeNull();
    expect(after.documents[0]).not.toBe(before); // new doc ref (mutation applied)
    const adcModule = after.documents[0]!.packages[0]!.elements[0] as ArxmlModule;
    const adcConfigAfter = adcModule.children[0]! as ArxmlContainer;
    const channelChildren = adcConfigAfter.children.filter(
      (c): c is ArxmlContainer => c.kind === 'container',
    );
    expect(channelChildren.map((c) => c.shortName)).toEqual(['AdcChannel', 'AdcChannel_1']);
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
// v1.12.0 PATCH 1 (M4 from v1.11.4 joint review) — end-to-end P2 regression
//
// P2 (v1.11.2 carryover): recurring `lower0 / upper=infinite add-container`
// failure on the AUTOSAR_R22 > EcucDefs > Adc 3-layer value-file shape.
// v1.11.3 (commit 0b02392) fixed the fold-side path resolution, but no
// test pinned the full mutation dispatch chain end-to-end against the
// 3-layer shape — only `findByPath` resolution was tested (combinedDoc.
// test.ts:457-522). This block closes the regression-test gap.
//
// Pre-v1.11.3: post-fold selectedPath was `/AUTOSAR_R22/Adc/...` (only
// the inner EcucDefs was collapsed); the source doc still had the 3-layer
// structure and findByPath returned `path-not-found`, so every
// `addContainer` was a silent no-op via `mutation.error.path-not-found`.
//
// Post-v1.11.3: the outer AUTOSAR(_.*)? wrap is also collapsed when its
// only nested child is a tier-4 foldable EcucDefs pkg (combinedDoc.ts:
// 686-692 + 756). Post-fold selectedPath is `/Adc/AdcConfigSet`, which
// the source doc can resolve via the vendor-fold fallback in
// core/arxml/path.ts:84-105.
//
// This test exercises the full mutation dispatch chain end-to-end:
// addContainer (single-mode default) → resolveModuleAndParentContainer
// (compressed 3-segment fallback at bswmdLookup.ts:89-99) → coreAddContainer
// → applyMutationResultToActive → computeDisplayDoc re-fold.
// ---------------------------------------------------------------------------
describe('useArxmlStore — 3-layer AUTOSAR_R22/EcucDefs/Adc end-to-end (P2 regression)', () => {
  it('addContainer at post-fold /Adc/AdcConfigSet succeeds for an upperMultiplicity: infinite child', () => {
    // Arrange — 3-layer source doc `AUTOSAR_R22 > EcucDefs > Adc >
    // AdcConfigSet` (mirrors combinedDoc.test.ts:457-522 fixture).
    const moduleEl: ArxmlElement = {
      kind: 'module',
      tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
      shortName: 'Adc',
      params: {},
      children: [
        {
          kind: 'container',
          tagName: 'ECUC-CONTAINER-VALUE',
          shortName: 'AdcConfigSet',
          params: {},
          children: [],
        },
      ],
      references: [],
    };
    const ecucDefsPkg: ArxmlPackage = {
      shortName: 'EcucDefs',
      path: '/AUTOSAR_R22/EcucDefs',
      elements: [moduleEl],
    };
    const wrapPkg: ArxmlPackage = {
      shortName: 'AUTOSAR_R22',
      path: '/AUTOSAR_R22',
      elements: [],
      packages: [ecucDefsPkg],
    };
    const doc: ArxmlDocument = {
      path: '/test/Adc_EcucValues.arxml',
      version: '4.6',
      packages: [wrapPkg],
    };

    // Register the 3-layer doc + a BSWMD whose AdcConfigSet declares an
    // `AdcConfig` sub-container with upperMultiplicity: 'infinite' —
    // this is the P2 invariant the test pins (no multiplicity-exceeded
    // when the user adds many of these).
    //
    // Skip the `addBswmd('<mock />')` route — its parser would fail on
    // the mock content and persist a parse error in `state.error` that
    // the subsequent setState doesn't clear. The setState below populates
    // `bswmdSchemas` + `bswmdPaths` directly, which is all `addContainer`
    // needs (it reads `bswmdSchemas` via `resolveModuleAndParentContainer`).
    useArxmlStore.getState().addDocument(doc, '/test/Adc_EcucValues.arxml');
    useArxmlStore.setState({
      bswmdSchemas: [
        // `makeBswModule` here is the import-aliased
        // `makeBswModuleWithSubContainer` from line 30 (topContainer +
        // subContainer + param shape — see the PATCH-C comment block).
        makeBswmd(makeBswModule('Adc', 'AdcConfigSet', 'AdcConfig')),
      ],
      bswmdPaths: ['/schemas/Adc.bswmd.arxml'],
    });
    const before = useArxmlStore.getState().documents[0]!;

    // Act — single-mode default (viewMode defaults to 'single' per
    // uiSlice.ts:148). The post-fold path `/Adc/AdcConfigSet` is what
    // Tree emits after the v1.11.3 tier-4 + outer-wrap fold extension.
    // Pre-v1.11.3 this would resolve to `path-not-found` because the
    // source doc's structure was 3 layers deep and findByPath could not
    // map the 2-segment post-fold path back.
    useArxmlStore.getState().addContainer('/Adc/AdcConfigSet', 'AdcConfig');

    // Assert — mutation succeeded against the 3-layer shape. No error
    // was raised; the source doc was mutated (different ref); the path
    // is marked dirty; the new AdcConfig child appears in the source
    // doc's AdcConfigSet container.
    const after = useArxmlStore.getState();
    expect(after.error).toBeNull();
    expect(after.documents[0]).not.toBe(before);
    // Source doc preserved its 3-layer AUTOSAR_R22 > EcucDefs > Adc wrap;
    // walk to AdcConfigSet and confirm the new AdcConfig child.
    const wrap = after.documents[0]!.packages[0]!;
    expect(wrap.shortName).toBe('AUTOSAR_R22');
    const ecucDefs = wrap.packages![0]!;
    expect(ecucDefs.shortName).toBe('EcucDefs');
    const adcMod = ecucDefs.elements[0]!;
    if (adcMod.kind !== 'module') throw new Error('expected module');
    const adcConfigSet = adcMod.children[0]!;
    if (adcConfigSet.kind !== 'container') throw new Error('expected container');
    expect(adcConfigSet.children).toHaveLength(1);
    const newChild = adcConfigSet.children[0]!;
    if (newChild.kind !== 'container') throw new Error('expected new container');
    expect(newChild.shortName).toBe('AdcConfig');
    // Marked dirty.
    expect(after.dirtyPaths.has('/test/Adc_EcucValues.arxml')).toBe(true);
    // Display doc rebuilt; the post-fold tree root is `Adc` with the
    // new child accessible at `/Adc/AdcConfigSet/AdcConfig`.
    expect(after.displayDoc).not.toBeNull();
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
    // v1.4.0 trust sprint — 17c. Filter to known kinds (unknown has no SHORT-NAME).
    const shortNames = mod.children
      .filter(
        (c): c is ArxmlModule | ArxmlContainer => c.kind === 'module' || c.kind === 'container',
      )
      .map((c) => c.shortName);
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
    // v1.4.0 trust sprint — 17c. Filter to known kinds.
    const shortNames = mod.children
      .filter(
        (c): c is ArxmlModule | ArxmlContainer => c.kind === 'module' || c.kind === 'container',
      )
      .map((c) => c.shortName);
    expect(shortNames).toEqual(['AdcConfigSet']);
    const configSet = mod.children[0]!;
    if (configSet.kind !== 'container') throw new Error('expected container');
    expect(configSet.params.AdcConfigRef).toBeUndefined();
    expect(after.dirtyPaths.has('/tmp/Adc.arxml')).toBe(true);
  });

  // HIGH-4 (v1.11.2) — cascade must not silently skip per-ref failures.
  // Realistic scenario: the user opened the cascade dialog while the
  // target ref still existed, but a concurrent action (or stale
  // snapshot) removed the ref's container between scan and confirm.
  // The pre-v1.11.2 cascade dropped the failure on the floor and
  // reported a clean success — a contract violation. After the fix
  // the cascade still applies what it can, but emits a `warning` toast
  // naming the count of unresolved refs so the user can audit.
  it('cascade: stale ref (containerPath gone) → warning toast surfaces unresolved count', () => {
    // Arrange — set up the normal pendingDelete via the public API.
    setUpWithPendingDelete();

    // Inject a stale ref into pendingDelete.references whose container
    // path no longer resolves. This simulates a concurrent delete or a
    // snapshot taken before the ref was removed.
    useArxmlStore.setState((s) => ({
      pendingDelete: s.pendingDelete
        ? {
            path: s.pendingDelete.path,
            references: [
              ...s.pendingDelete.references,
              {
                filePath: '/tmp/Adc.arxml',
                containerPath: '/EAS/Adc/NoSuchContainer',
                paramKey: 'GhostRef',
              },
            ],
          }
        : null,
    }));

    // Act
    useArxmlStore.getState().confirmDeleteContainer('cascade');

    // Assert — primary delete still succeeded for the resolvable refs.
    const after = useArxmlStore.getState();
    expect(after.pendingDelete).toBeNull();
    const mod = after.documents[0]!.packages[0]!.elements[0]!;
    if (mod.kind !== 'module') throw new Error('expected module');
    const configSet = mod.children.find(
      (c) => c.kind === 'container' && c.shortName === 'AdcConfigSet',
    );
    expect(configSet).toBeDefined();
    if (configSet?.kind !== 'container') throw new Error('expected container');
    expect(configSet.params.AdcConfigRef).toBeUndefined();

    // Assert — the partial-failure diagnostic surfaces via the typed
    // toast slot. Pin the exact i18n substring for the count slot so
    // the test cannot accidentally match an unrelated "1" elsewhere
    // (timestamps, file paths, etc.).
    expect(after.toast).not.toBeNull();
    expect(after.toast?.kind).toBe('warning');
    // En: "1 reference(s)"; zh-CN: "1 个引用" — either is acceptable.
    expect(after.toast?.message ?? '').toMatch(/1 reference\(s\)|1 个引用/);
    // The legacy `error` slot must NOT be clobbered by the cascade
    // partial-failure diagnostic (HIGH-4 v1.11.2 review finding:
    // setWarning writes both fields; we route the warning through
    // the typed toast slot only to avoid stomping prior errors).
    expect(after.error).toBeNull();
    expect(after.dirtyPaths.has('/tmp/Adc.arxml')).toBe(true);
  });

  it('cascade: all-refs-fail → warning still emitted, container delete still applied', () => {
    // Arrange — set up pendingDelete, then nuke ALL refs by pointing
    // them at non-existent containers. This is the worst-case partial
    // failure: every cascade resolution fails, but the primary delete
    // still went through.
    setUpWithPendingDelete();

    useArxmlStore.setState((s) => ({
      pendingDelete: s.pendingDelete
        ? {
            path: s.pendingDelete.path,
            references: s.pendingDelete.references.map((r) => ({
              ...r,
              containerPath: '/EAS/Adc/NoSuchContainer',
            })),
          }
        : null,
    }));

    // Act
    useArxmlStore.getState().confirmDeleteContainer('cascade');

    // Assert — primary delete succeeded (AdcConfig gone), and the
    // warning toast surfaces the failure count to the user. Pin the
    // exact count slot in the i18n string (en: "1 reference(s)";
    // zh-CN: "1 个引用") so the assertion cannot be satisfied by an
    // unrelated digit in a timestamp or file path.
    const after = useArxmlStore.getState();
    expect(after.pendingDelete).toBeNull();
    expect(after.toast?.kind).toBe('warning');
    expect(after.toast?.message ?? '').toMatch(/1 reference\(s\)|1 个引用/);
    expect(after.error).toBeNull();
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
    // v1.4.0 trust sprint — 17c. Narrow before reading SHORT-NAME.
    const canFirstChild = canContainer.children[0];
    expect(canFirstChild?.kind).toBe('container');
    if (canFirstChild?.kind === 'module' || canFirstChild?.kind === 'container') {
      expect(canFirstChild.shortName).toBe('CanController');
    }
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
