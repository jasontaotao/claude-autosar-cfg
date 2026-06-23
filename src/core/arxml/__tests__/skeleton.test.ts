// core/arxml/__tests__/skeleton.test.ts
// Sprint 14 — generateEcucSkeleton() pure-function contract.
//
// Tests are TDD-first: this file is the contract; skeleton.ts is the
// implementation. Each test constructs a minimal BswmdDocument by hand so
// the assertion focuses on skeleton-shape behaviour, not on the parser.
//
// Adaptations from the original plan brief (`task-2-brief.md`):
//   1. The brief assumed a pre-Sprint-12 root-based data model (`ArxmlDocument.root`
//      with free-form `{ tagName, attributes, children, text? }` children). The
//      repo has since moved to a discriminated-union model (`packages` +
//      `ArxmlModule | ArxmlContainer | ArxmlReference`). These tests assert
//      against the post-Sprint-12 model — see src/core/arxml/types.ts.
//   2. The brief's test "emits MODULE-REF with DEST=ECUC-MODULE-DEF and the
//      module path" cannot be satisfied: the discriminated-union model has
//      no MODULE-REF element. Module identity is encoded as (package path,
//      module shortName, sourceBswmdPath on the document). We replace it
//      with an assertion that the module's path is reachable through
//      packages[0].path and that sourceBswmdPath is undefined on the
//      generated doc (caller attaches it).

import { describe, it, expect } from 'vitest';

import type { BswmdDocument, BswModuleDef, ContainerDef, ParamDef } from '../../project/bswmd.js';
import { serializeArxml } from '../serializer.js';
import { generateEcucSkeleton, resolveCollisionFilename } from '../skeleton.js';
import type { PickedModule } from '../skeleton.js';
import type { ArxmlContainer, ArxmlModule } from '../types.js';

// ---------------------------------------------------------------------------
// Hand-built fixtures
// ---------------------------------------------------------------------------

function makeBswContainer(
  shortName: string,
  subContainers: readonly ContainerDef[] = [],
  lowerMultiplicity = 1,
): ContainerDef {
  return {
    shortName,
    path: `/Module/${shortName}`,
    lowerMultiplicity,
    upperMultiplicity: 1,
    subContainers,
    parameters: [],
    references: [],
    choices: [],
    multiplicityConfigClasses: [],
  };
}

function makeBswModule(shortName: string, containers: readonly ContainerDef[] = []): BswModuleDef {
  return {
    shortName,
    path: `/${shortName}`,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers,
    providedEntries: [],
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    multiplicityConfigClasses: [],
  };
}

function makeBswmd(modules: readonly BswModuleDef[]) {
  return { version: '4.6', modules, warnings: [] as string[] };
}

// ---------------------------------------------------------------------------
// generateEcucSkeleton
// ---------------------------------------------------------------------------

describe('generateEcucSkeleton', () => {
  it('produces a single package containing a module with ECUC-MODULE-CONFIGURATION-VALUES tagName', () => {
    // Arrange
    const can = makeBswModule('Can');
    const doc = makeBswmd([can]);

    // Act
    const ar = generateEcucSkeleton(doc, 'Can');

    // Assert — brief test 1, adapted to the packages + discriminated-union model.
    expect(ar.packages).toHaveLength(1);
    expect(ar.packages[0]!.elements).toHaveLength(1);
    const mod = ar.packages[0]!.elements[0]! as ArxmlModule;
    expect(mod.kind).toBe('module');
    expect(mod.tagName).toBe('ECUC-MODULE-CONFIGURATION-VALUES');
  });

  it('sets module shortName', () => {
    // Arrange
    const can = makeBswModule('Can');
    const doc = makeBswmd([can]);

    // Act
    const ar = generateEcucSkeleton(doc, 'Can');

    // Assert — brief test 2, adapted.
    const mod = ar.packages[0]!.elements[0]! as ArxmlModule;
    expect(mod.shortName).toBe('Can');
  });

  it('emits empty params and references at module level', () => {
    // Arrange
    const can = makeBswModule('Can');
    const doc = makeBswmd([can]);

    // Act
    const ar = generateEcucSkeleton(doc, 'Can');

    // Assert — replaces brief test 3 (MODULE-REF). The discriminated-union
    // model has no MODULE-REF element; the empty params + references are the
    // observable contract for a fresh skeleton that the user fills in via
    // ParamEditor. Module identity comes from (packages[0].path,
    // module.shortName, doc.sourceBswmdPath attached by the caller).
    const mod = ar.packages[0]!.elements[0]! as ArxmlModule;
    expect(mod.params).toEqual({});
    expect(mod.references).toEqual([]);
  });

  it('emits one ArxmlContainer per BSWMD top-level container, with correct tagName + shortName', () => {
    // Arrange
    const canConfigSet = makeBswContainer('CanConfigSet');
    const can = makeBswModule('Can', [canConfigSet]);
    const doc = makeBswmd([can]);

    // Act
    const ar = generateEcucSkeleton(doc, 'Can');

    // Assert — brief test 4, adapted. The skeleton module's children are the
    // generated ArxmlContainers (one per BSWMD top-level container).
    const mod = ar.packages[0]!.elements[0]! as ArxmlModule;
    expect(mod.children).toHaveLength(1);
    const child = mod.children[0]! as ArxmlContainer;
    expect(child.kind).toBe('container');
    expect(child.tagName).toBe('ECUC-CONTAINER-VALUE');
    expect(child.shortName).toBe('CanConfigSet');
    expect(child.params).toEqual({});
  });

  it('throws if module shortName not in BSWMD', () => {
    // Arrange
    const can = makeBswModule('Can');
    const doc = makeBswmd([can]);

    // Act + Assert — brief test 5, verbatim.
    expect(() => generateEcucSkeleton(doc, 'Missing')).toThrow(/not found/i);
  });

  it('returns document with empty path and no sourceBswmdPath', () => {
    // Arrange
    const can = makeBswModule('Can');
    const doc = makeBswmd([can]);

    // Act
    const ar = generateEcucSkeleton(doc, 'Can');

    // Assert — brief test 6, verbatim. The caller is responsible for attaching
    // `path` and `sourceBswmdPath`; the skeleton factory returns a bare
    // document.
    expect(ar.path).toBe('');
    expect(ar.sourceBswmdPath).toBeUndefined();
  });

  it('recursively expands subContainers into nested ArxmlContainer children', () => {
    // Bonus test (not in the brief) — the brief's `subContainers.map(buildContainer)`
    // sketch implies recursion; pin it down so future refactors don't flatten it.
    // Arrange
    const canController = makeBswContainer('CanController');
    const canConfigSet = makeBswContainer('CanConfigSet', [canController]);
    const can = makeBswModule('Can', [canConfigSet]);
    const doc = makeBswmd([can]);

    // Act
    const ar = generateEcucSkeleton(doc, 'Can');

    // Assert
    const mod = ar.packages[0]!.elements[0]! as ArxmlModule;
    const canConfigSetValue = mod.children[0]! as ArxmlContainer;
    expect(canConfigSetValue.children).toHaveLength(1);
    const canControllerValue = canConfigSetValue.children[0]! as ArxmlContainer;
    expect(canControllerValue.kind).toBe('container');
    expect(canControllerValue.shortName).toBe('CanController');
  });

  it('sets package shortName + path to the module shortName', () => {
    // Arrange — bonus. The brief said the path is `caller-set`, but we still
    // choose a sensible default for the package shortName + path so the
    // caller doesn't have to fabricate them.
    const can = makeBswModule('Can');
    const doc = makeBswmd([can]);

    // Act
    const ar = generateEcucSkeleton(doc, 'Can');

    // Assert
    expect(ar.packages[0]!.shortName).toBe('Can');
    expect(ar.packages[0]!.path).toBe('/Can');
  });

  // Bug — JWQ3399SpiConfig-style containers mix ECUC-PARAM-CONF-CONTAINER-DEF
  // (in `subContainers`) and ECUC-CHOICE-CONTAINER-DEF (in `choices`). The
  // skeleton factory pre-creates only `subContainers` shells, so the entire
  // choice subtree was lost on round-trip — user reported that
  // JWQ3399SpiConfig comes back empty even though BSWMD declares
  // SpiCsConfig + SpiHWUnitRef as required choice containers. These two
  // tests pin the fix.
  it('emits an ECUC-CONTAINER-VALUE shell per choice container when its lowerMultiplicity > 0', () => {
    // Arrange — SpiConfig-shaped: 2 optional sub-containers (lower=0)
    // + 2 required choice containers (lower=1, 2 branches each). The
    // choice containers live in the `choices` field, not
    // `subContainers`, mirroring how `bswmd.ts::buildChoiceContainer`
    // surfaces them after parsing BSWMD's
    // `<ECUC-CHOICE-CONTAINER-DEF><CHOICES>` block.
    const spiSequence = makeBswContainer('SpiSequenceRef', [], 0);
    const spiChannel = makeBswContainer('SpiChannelRef', [], 0);
    const spiCsBranchA = makeBswContainer('SpiCsViaPher', [], 0);
    const spiCsBranchB = makeBswContainer('SpiCsViaGPIO', [], 0);
    const spiCsConfig: ContainerDef = {
      ...makeBswContainer('SpiCsConfig', [], 1),
      choices: [spiCsBranchA, spiCsBranchB],
    };
    const spiHwBranchA = makeBswContainer('SpiHWUnitRef', [], 0);
    const spiHwBranchB = makeBswContainer('SpiHWUnitUserDef', [], 0);
    const spiHwConfig: ContainerDef = {
      ...makeBswContainer('SpiHWUnitRef', [], 1),
      choices: [spiHwBranchA, spiHwBranchB],
    };
    // `subContainers` = plain containers only; choice containers live
    // in the `choices` field — this matches what `buildContainer` in
    // bswmd.ts produces for a `SUB-CONTAINERS` block (which never
    // contains `<ECUC-CHOICE-CONTAINER-DEF>`).
    const spiConfig: ContainerDef = {
      ...makeBswContainer('SpiConfig', [spiSequence, spiChannel], 1),
      choices: [spiCsConfig, spiHwConfig],
    };
    const mod = makeBswModule('Spi', [spiConfig]);
    const doc = makeBswmd([mod]);

    // Act
    const ar = generateEcucSkeleton(doc, 'Spi');

    // Assert — SpiConfig is a required top-level container, so it must
    // exist. Inside it the 2 optional sub-containers (lower=0) stay
    // absent, but the 2 required choice containers (lower=1) must be
    // pre-created as empty ECUC-CONTAINER-VALUE shells so the user can
    // descend into them from the editor.
    const modEl = ar.packages[0]!.elements[0]! as ArxmlModule;
    expect(modEl.children).toHaveLength(1);
    const spiCfg = modEl.children[0]! as ArxmlContainer;
    expect(spiCfg.shortName).toBe('SpiConfig');
    expect(spiCfg.children).toHaveLength(2);
    const childNames = spiCfg.children.map((c) => (c as ArxmlContainer).shortName);
    expect(childNames).toContain('SpiCsConfig');
    expect(childNames).toContain('SpiHWUnitRef');
    // Pre-created choice shells carry ECUC-CONTAINER-VALUE (value-side
    // tag — Bug 2a from v1.4.1) and start empty; the user picks the
    // concrete branch via the picker.
    for (const child of spiCfg.children) {
      const cc = child as ArxmlContainer;
      expect(cc.tagName).toBe('ECUC-CONTAINER-VALUE');
      expect(cc.params).toEqual({});
      expect(cc.children).toEqual([]);
    }
  });

  it('does NOT pre-create a choice container shell when its lowerMultiplicity == 0', () => {
    // Arrange — one optional choice container (lower=0) under a required
    // top-level container.
    const branchA = makeBswContainer('BranchA', [], 0);
    const branchB = makeBswContainer('BranchB', [], 0);
    const optionalChoice: ContainerDef = {
      ...makeBswContainer('OptionalChoice', [], 0),
      choices: [branchA, branchB],
    };
    const top: ContainerDef = {
      ...makeBswContainer('Top', [], 1),
      choices: [optionalChoice],
    };
    const mod = makeBswModule('M', [top]);
    const doc = makeBswmd([mod]);

    // Act
    const ar = generateEcucSkeleton(doc, 'M');

    // Assert — even though `choices` is now traversed, the lower=0
    // gate still applies: optional choice containers stay out of the
    // skeleton so the picker doesn't see a ghost shell.
    const modEl = ar.packages[0]!.elements[0]! as ArxmlModule;
    const topEl = modEl.children[0]! as ArxmlContainer;
    expect(topEl.children).toEqual([]);
  });

  // ─── S1 (P3) — choice container marker ──────────────────────────────
  // v1.7.1 ships a structural distinction between choice-container
  // shells and plain sub-container shells so the UI can render the
  // "please pick a branch" prompt. Currently `buildChoiceShell`
  // emits a shape that is byte-identical to `buildSubContainerShell`
  // apart from the children list — the only signal is membership in
  // the parent's `choices[]` array, which is lost the moment the shell
  // is constructed. These three tests pin the new shape.

  it('S1: choice container shell carries isChoiceContainer: true', () => {
    // Arrange — one required choice container with 2 branches under a
    // required top-level container. We navigate down to the
    // choice-container shell and assert the marker.
    const branchA = makeBswContainer('BranchA', [], 0);
    const branchB = makeBswContainer('BranchB', [], 0);
    const choice: ContainerDef = {
      ...makeBswContainer('ChoiceContainer', [], 1),
      choices: [branchA, branchB],
    };
    const top: ContainerDef = {
      ...makeBswContainer('Top', [], 1),
      choices: [choice],
    };
    const mod = makeBswModule('M', [top]);
    const doc = makeBswmd([mod]);

    // Act
    const ar = generateEcucSkeleton(doc, 'M');

    // Assert — the choice-container shell under `top` carries the
    // marker so the UI can tell it apart from a plain sub-container.
    const modEl = ar.packages[0]!.elements[0]! as ArxmlModule;
    const topEl = modEl.children[0]! as ArxmlContainer;
    expect(topEl.children).toHaveLength(1);
    const choiceEl = topEl.children[0]! as ArxmlContainer;
    expect(choiceEl.shortName).toBe('ChoiceContainer');
    expect(choiceEl.isChoiceContainer).toBe(true);
  });

  it('S1: choice container shell lists branch shortNames in choiceBranches', () => {
    // Arrange — same shape as above; we additionally assert that the
    // branch list is exposed for the UI to render the picker.
    const branchA = makeBswContainer('BranchA', [], 0);
    const branchB = makeBswContainer('BranchB', [], 0);
    const branchC = makeBswContainer('BranchC', [], 0);
    const choice: ContainerDef = {
      ...makeBswContainer('ChoiceContainer', [], 1),
      choices: [branchA, branchB, branchC],
    };
    const top: ContainerDef = {
      ...makeBswContainer('Top', [], 1),
      choices: [choice],
    };
    const mod = makeBswModule('M', [top]);
    const doc = makeBswmd([mod]);

    // Act
    const ar = generateEcucSkeleton(doc, 'M');

    // Assert — branch list preserves iteration order of `c.choices`
    // (BSWMD parser emits branches in source order; the UI picker
    // renders them in the same order).
    const modEl = ar.packages[0]!.elements[0]! as ArxmlModule;
    const topEl = modEl.children[0]! as ArxmlContainer;
    const choiceEl = topEl.children[0]! as ArxmlContainer;
    expect(choiceEl.choiceBranches).toEqual(['BranchA', 'BranchB', 'BranchC']);
  });

  it('S1: plain sub-container shell does NOT carry isChoiceContainer / choiceBranches', () => {
    // Arrange — a plain sub-container (in `subContainers`, not
    // `choices`). The new markers are choice-specific; the absence
    // here is what lets the UI distinguish the two cases.
    const plainSub: ContainerDef = makeBswContainer('PlainSub', [], 1);
    const top: ContainerDef = {
      ...makeBswContainer('Top', [plainSub], 1),
      choices: [],
    };
    const mod = makeBswModule('M', [top]);
    const doc = makeBswmd([mod]);

    // Act
    const ar = generateEcucSkeleton(doc, 'M');

    // Assert — both marker fields are absent (undefined, not falsey
    // strings). This is the structural distinction the UI relies on.
    const modEl = ar.packages[0]!.elements[0]! as ArxmlModule;
    const topEl = modEl.children[0]! as ArxmlContainer;
    expect(topEl.children).toHaveLength(1);
    const subEl = topEl.children[0]! as ArxmlContainer;
    expect(subEl.shortName).toBe('PlainSub');
    expect(subEl.isChoiceContainer).toBeUndefined();
    expect(subEl.choiceBranches).toBeUndefined();
  });

  // ─── T4 (Sprint X Phase 4) — vendor-prefix AR-PACKAGE hierarchy ─────
  // v1.9.0 Sprint X mirrors the BSWMD `mod.path` physical structure:
  // the first `N-1` segments become AR-PACKAGE nodes; the trailing
  // segment (= `mod.shortName`) is the ECUC element's own SHORT-NAME
  // and lives directly under the deepest AR-PACKAGE.
  //
  // BSWMD `ECUC-MODULE-DEF.path` = `parentPkg.PATH + ownShortName`, so
  // for `/JWQ_CDD_PACK/JWQ_Packet/JWQ3399` the BSWMD-side container is
  // `/JWQ_CDD_PACK/JWQ_Packet` and `JWQ3399` is the module's own
  // shortName. Pre-fix the skeleton emitted `JWQ3399` as a third
  // AR-PACKAGE (colliding with the ECUC element's SHORT-NAME); the
  // fix emits only the parent package chain so the value-side arxml
  // mirrors the BSWMD structure 1:1. Standard AUTOSAR modules
  // (`/Can`) keep the existing single-layer shape — backwards-
  // compatible with all round-trip fixtures. The renderer (Phase 3)
  // folds the chain to the deepest package via `foldVendorPackages` so
  // users see a single AR-PACKAGE in the Tree.

  it('T4: single-segment mod.path keeps single-layer package (backwards compat)', () => {
    // Arrange — standard AUTOSAR module `/Can` (1 segment). Existing
    // round-trip fixtures pin this shape; Phase 4 must not regress it.
    const can = makeBswModule('Can');
    const doc = makeBswmd([can]);

    // Act
    const ar = generateEcucSkeleton(doc, 'Can');

    // Assert — single top-level package, no nested packages, full
    // module lives directly under it.
    expect(ar.packages).toHaveLength(1);
    expect(ar.packages[0]!.shortName).toBe('Can');
    expect(ar.packages[0]!.path).toBe('/Can');
    expect(ar.packages[0]!.elements).toHaveLength(1);
    expect(ar.packages[0]!.packages).toBeUndefined();
  });

  it('T4: 3-segment vendor-prefix mod.path emits 2-layer AR-PACKAGE chain (strip last segment = mod.shortName)', () => {
    // Arrange — vendor-prefix module `/JWQ_CDD_PACK/JWQ_Packet/JWQ3399`
    // (3 segments). After slicing off the trailing segment (=
    // `mod.shortName`), only the first 2 segments form the
    // AR-PACKAGE chain. The ECUC element `JWQ3399` lives directly
    // under the deepest AR-PACKAGE `JWQ_Packet`.
    const mod: BswModuleDef = {
      shortName: 'JWQ3399',
      path: '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399',
      dialect: 'ecuc-module-def',
      moduleId: null,
      containers: [],
      providedEntries: [],
      lowerMultiplicity: 0,
      upperMultiplicity: 'infinite',
      multiplicityConfigClasses: [],
    };
    const doc: BswmdDocument = {
      version: '4.2',
      modules: [mod],
      warnings: [],
    };

    // Act
    const ar = generateEcucSkeleton(doc, 'JWQ3399');

    // Assert — 2-layer chain (mirror of BSWMD physical structure).
    expect(ar.packages).toHaveLength(1);
    const jwqCddPack = ar.packages[0]!;
    expect(jwqCddPack.shortName).toBe('JWQ_CDD_PACK');
    expect(jwqCddPack.path).toBe('/JWQ_CDD_PACK');
    expect(jwqCddPack.elements).toEqual([]); // vendor wrapper: no elements
    expect(jwqCddPack.packages).toBeDefined();

    const jwqPacket = jwqCddPack.packages![0]!;
    expect(jwqPacket.shortName).toBe('JWQ_Packet');
    expect(jwqPacket.path).toBe('/JWQ_CDD_PACK/JWQ_Packet');
    // Leaf AR-PACKAGE carries the ECUC element directly (no extra
    // `JWQ3399` AR-PACKAGE wrapper, since `JWQ3399` is the module's
    // own shortName, not a separate package).
    expect(jwqPacket.elements).toHaveLength(1);
    expect(jwqPacket.packages).toBeUndefined();
    const moduleEl = jwqPacket.elements[0]! as ArxmlModule;
    expect(moduleEl.kind).toBe('module');
    expect(moduleEl.shortName).toBe('JWQ3399');
  });

  it('T4: 2-segment vendor-prefix mod.path emits single-layer AR-PACKAGE chain (strip last segment)', () => {
    // Arrange — `/EAS/Can` (2 segments, matches Intewell vendor
    // prefix). After slicing off the trailing segment (= `Can` =
    // `mod.shortName`), only `EAS` remains as a single AR-PACKAGE.
    // The ECUC element `Can` lives directly under it.
    const mod: BswModuleDef = {
      shortName: 'Can',
      path: '/EAS/Can',
      dialect: 'ecuc-module-def',
      moduleId: null,
      containers: [],
      providedEntries: [],
      lowerMultiplicity: 0,
      upperMultiplicity: 'infinite',
      multiplicityConfigClasses: [],
    };
    const doc: BswmdDocument = {
      version: '4.2',
      modules: [mod],
      warnings: [],
    };

    // Act
    const ar = generateEcucSkeleton(doc, 'Can');

    // Assert — single-layer AR-PACKAGE `EAS` carrying the `Can`
    // ECUC element directly.
    expect(ar.packages).toHaveLength(1);
    const eas = ar.packages[0]!;
    expect(eas.shortName).toBe('EAS');
    expect(eas.path).toBe('/EAS');
    expect(eas.elements).toHaveLength(1);
    expect(eas.packages).toBeUndefined();
    const moduleEl = eas.elements[0]! as ArxmlModule;
    expect(moduleEl.shortName).toBe('Can');
  });

  it('T4: mod.path "/" or empty falls back to single-layer (does not crash)', () => {
    // Arrange — pathological BSWMD with no segments. The skeleton
    // must not crash; it should fall back to a single-layer package
    // named after the module shortName so the round-trip path still
    // resolves.
    const mod: BswModuleDef = {
      shortName: 'RootMod',
      path: '/',
      dialect: 'ecuc-module-def',
      moduleId: null,
      containers: [],
      providedEntries: [],
      lowerMultiplicity: 0,
      upperMultiplicity: 'infinite',
      multiplicityConfigClasses: [],
    };
    const doc: BswmdDocument = {
      version: '4.2',
      modules: [mod],
      warnings: [],
    };

    // Act
    const ar = generateEcucSkeleton(doc, 'RootMod');

    // Assert — single-layer fallback: only the module-named package
    // exists, no nesting (split('/').filter(Boolean) drops the lone
    // empty segment).
    expect(ar.packages).toHaveLength(1);
    expect(ar.packages[0]!.shortName).toBe('RootMod');
    expect(ar.packages[0]!.path).toBe('/RootMod');
    expect(ar.packages[0]!.elements).toHaveLength(1);
    expect(ar.packages[0]!.packages).toBeUndefined();
  });

  it('T4: serialised vendor-prefix skeleton has 2 nested <AR-PACKAGE> elements (ECUC element under the deepest one)', () => {
    // Round-trip the 2-layer chain through the serializer so we know
    // the wire format mirrors the BSWMD physical structure: 2
    // <AR-PACKAGE> elements (vendor prefix chain) with the ECUC
    // element's SHORT-NAME under the deepest one — no third
    // <AR-PACKAGE> wrapping the module's own shortName.
    const mod: BswModuleDef = {
      shortName: 'JWQ3399',
      path: '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399',
      dialect: 'ecuc-module-def',
      moduleId: null,
      containers: [],
      providedEntries: [],
      lowerMultiplicity: 0,
      upperMultiplicity: 'infinite',
      multiplicityConfigClasses: [],
    };
    const doc: BswmdDocument = {
      version: '4.2',
      modules: [mod],
      warnings: [],
    };

    // Act
    const ar = generateEcucSkeleton(doc, 'JWQ3399');
    const r = serializeArxml(ar);
    expect(r.ok).toBe(true);
    if (!r.ok) return; // narrow for typecheck

    // Assert — exactly 2 <AR-PACKAGE> elements (vendor prefix chain).
    // `JWQ3399` appears as the ECUC element SHORT-NAME, not as a
    // third <AR-PACKAGE>.
    const packageCount = (r.value.match(/<AR-PACKAGE>/g) ?? []).length;
    expect(packageCount).toBe(2);
    expect(r.value).toContain('<SHORT-NAME>JWQ_CDD_PACK</SHORT-NAME>');
    expect(r.value).toContain('<SHORT-NAME>JWQ_Packet</SHORT-NAME>');
    expect(r.value).toContain('<SHORT-NAME>JWQ3399</SHORT-NAME>');
    // Sanity: ECUC-MODULE-CONFIGURATION-VALUES exists with JWQ3399
    // as its SHORT-NAME.
    expect(r.value).toContain('ECUC-MODULE-CONFIGURATION-VALUES');
  });
});

// ---------------------------------------------------------------------------
// resolveCollisionFilename (T3 — full collision-resolution contract)
// ---------------------------------------------------------------------------
//
// Note: the original T3 brief specified the Map key as
// `${moduleShortName}/${bswmdPath}`. T2's stub shipped
// `${bswmdPath}::${moduleShortName}` and was accepted by the reviewer;
// we keep the stub shape (less churn, no `/` vs path-separator
// confusion in logs). The brief's 5 tests are ported verbatim below
// with only the key shape adjusted to match the implemented contract.

describe('resolveCollisionFilename', () => {
  const PROJECT_DIR = 'D:/proj';
  // Helper: build a key in the implemented `::` shape from the brief's
  // (moduleShortName, bswmdPath) tuple.
  const k = (moduleShortName: string, bswmdPath: string): string =>
    `${bswmdPath}::${moduleShortName}`;

  it('returns single-Cfg.arxml for a single pick', () => {
    const picks: PickedModule[] = [{ bswmdPath: 'D:/bswmd/Can.arxml', moduleShortName: 'Can' }];
    const m = resolveCollisionFilename(picks, PROJECT_DIR);
    expect(m.size).toBe(1);
    expect(m.get(k('Can', 'D:/bswmd/Can.arxml'))).toBe(`${PROJECT_DIR}/ecuc/Can_EcucValues.arxml`);
  });

  it('Sprint 16: emitted filename uses AUTOSAR _EcucValues.arxml suffix (no collision)', () => {
    // Pin the new naming convention explicitly. The default-fill test
    // above already exercises this via fixture strings, but this case
    // exists to make the naming intent self-documenting.
    const m = resolveCollisionFilename(
      [{ bswmdPath: '/BSWMD/Can.arxml', moduleShortName: 'Can' }],
      '/proj',
    );
    expect(m.get('/BSWMD/Can.arxml::Can')).toBe('/proj/ecuc/Can_EcucValues.arxml');
  });

  it('Sprint 16: vendor collision suffix still uses _EcucValues.arxml', () => {
    const m = resolveCollisionFilename(
      [
        { bswmdPath: '/BSWMD/Can_v1.arxml', moduleShortName: 'Can' },
        { bswmdPath: '/BSWMD/Can_v2.arxml', moduleShortName: 'Can' },
      ],
      '/proj',
    );
    expect(m.get('/BSWMD/Can_v1.arxml::Can')).toBe('/proj/ecuc/Can_EcucValues.arxml');
    expect(m.get('/BSWMD/Can_v2.arxml::Can')).toBe('/proj/ecuc/Can__can_v2_EcucValues.arxml');
  });

  it('returns multiple non-colliding Cfg.arxml files for multi-pick from one BSWMD', () => {
    const picks: PickedModule[] = [
      { bswmdPath: 'D:/bswmd/Can.arxml', moduleShortName: 'Can' },
      { bswmdPath: 'D:/bswmd/Can.arxml', moduleShortName: 'CanIf' },
    ];
    const m = resolveCollisionFilename(picks, PROJECT_DIR);
    expect(m.size).toBe(2);
    expect(m.get(k('Can', 'D:/bswmd/Can.arxml'))).toBe(`${PROJECT_DIR}/ecuc/Can_EcucValues.arxml`);
    expect(m.get(k('CanIf', 'D:/bswmd/Can.arxml'))).toBe(
      `${PROJECT_DIR}/ecuc/CanIf_EcucValues.arxml`,
    );
  });

  it('suffixes vendor key when same module shortName across two BSWMDs (different basenames)', () => {
    const picks: PickedModule[] = [
      { bswmdPath: 'D:/bswmd/Can_Bswmd.arxml', moduleShortName: 'Can' },
      { bswmdPath: 'D:/bswmd/Intewell_Can.arxml', moduleShortName: 'Can' },
    ];
    const m = resolveCollisionFilename(picks, PROJECT_DIR);
    expect(m.size).toBe(2);
    expect(m.get(k('Can', 'D:/bswmd/Can_Bswmd.arxml'))).toBe(
      `${PROJECT_DIR}/ecuc/Can_EcucValues.arxml`,
    );
    expect(m.get(k('Can', 'D:/bswmd/Intewell_Can.arxml'))).toBe(
      `${PROJECT_DIR}/ecuc/Can__intewell_can_EcucValues.arxml`,
    );
  });

  it('falls back to numeric suffix when basenames collide', () => {
    const picks: PickedModule[] = [
      { bswmdPath: 'D:/a/Can.arxml', moduleShortName: 'Can' },
      { bswmdPath: 'D:/b/Can.arxml', moduleShortName: 'Can' },
    ];
    const m = resolveCollisionFilename(picks, PROJECT_DIR);
    expect(m.size).toBe(2);
    expect(m.get(k('Can', 'D:/a/Can.arxml'))).toBe(`${PROJECT_DIR}/ecuc/Can_EcucValues.arxml`);
    expect(m.get(k('Can', 'D:/b/Can.arxml'))).toBe(
      `${PROJECT_DIR}/ecuc/Can__can_1_EcucValues.arxml`,
    );
  });

  it('handles empty picks gracefully', () => {
    const m = resolveCollisionFilename([], PROJECT_DIR);
    expect(m).toBeInstanceOf(Map);
    expect(m.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// generateEcucSkeleton — default param fill (post-v1.0.0)
// ---------------------------------------------------------------------------
//
// Skeleton emits BSWMD `defaultValue` into top-level containers via the
// shared `buildDefaultValue` (core/arxml/defaultValue.ts). Module-level
// params stay empty because `BswModuleDef` has no `parameters` field today
// (rare in practice). Sub-containers are NOT filled — they are empty
// shells; the user instanceiates them on demand.
//
// Type-map behaviour:
//   integer / float / boolean — default required; null default => SKIP
//   enumeration / string / function-name — null default => empty string

describe('generateEcucSkeleton — default param fill (post-v1.0.0)', () => {
  function buildBswmdWithContainers(...containers: ContainerDef[]): BswmdDocument {
    return {
      version: '4.6',
      modules: [
        {
          shortName: 'Can',
          path: '/Can',
          dialect: 'ecuc-module-def',
          moduleId: 1,
          containers,
          providedEntries: [],
          lowerMultiplicity: 1,
          upperMultiplicity: 1,
        },
      ],
      warnings: [],
    };
  }

  it('emits integer param with default', () => {
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('integer', 'CanBusOffProcessing', 0)],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    expect(gen.kind).toBe('container');
    if (gen.kind !== 'container') throw new Error('guard');
    expect(gen.params['CanBusOffProcessing']).toEqual({
      type: 'integer',
      value: 0,
      definitionRef: '/CanBusOffProcessing',
    });
  });

  it('Sprint 16: attaches definitionRef from BSWMD path on integer param with default', () => {
    // The skeleton must carry the BSWMD-side definition path so the
    // serializer can write a real DEFINITION-REF instead of the
    // '/__synthesized__/<shortName>' placeholder.
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [
        {
          ...mkParam('integer', 'CanBusOffProcessing', 0),
          path: '/AUTOSAR/EcucDefs/Can/CanGeneral/CanBusOffProcessing',
        },
      ],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (gen.kind !== 'container') throw new Error('guard');
    expect(gen.params['CanBusOffProcessing']).toEqual({
      type: 'integer',
      value: 0,
      definitionRef: '/AUTOSAR/EcucDefs/Can/CanGeneral/CanBusOffProcessing',
    });
  });

  it('Sprint 16: attaches definitionRef on text-shaped fallback (empty string placeholder)', () => {
    // String / enum params with null default still get a definitionRef so
    // the empty placeholder row renders with the real BSWMD path.
    const cont: ContainerDef = {
      shortName: 'CanIfInitCfg',
      path: '/CanIf/CanIfInitCfg',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [
        {
          ...mkParam('string', 'CanIfInitCfgSet', null),
          path: '/AUTOSAR/EcucDefs/CanIf/CanIfInitCfg/CanIfInitCfgSet',
        },
      ],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (gen.kind !== 'container') throw new Error('guard');
    expect(gen.params['CanIfInitCfgSet']).toEqual({
      type: 'string',
      value: '',
      definitionRef: '/AUTOSAR/EcucDefs/CanIf/CanIfInitCfg/CanIfInitCfgSet',
    });
  });

  it('emits float param with default', () => {
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('float', 'CanMainFunctionRWPeriod', 0.0)],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (gen.kind !== 'container') throw new Error('guard');
    expect(gen.params['CanMainFunctionRWPeriod']).toEqual({
      type: 'float',
      value: 0.0,
      definitionRef: '/CanMainFunctionRWPeriod',
    });
  });

  it('emits boolean param with default true', () => {
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('boolean', 'CanDevErrorDetect', true)],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (gen.kind !== 'container') throw new Error('guard');
    expect(gen.params['CanDevErrorDetect']).toEqual({
      type: 'boolean',
      value: true,
      definitionRef: '/CanDevErrorDetect',
    });
  });

  it('emits enum param with default literal', () => {
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('enumeration', 'CanBusOffProcessing', 'POLLING')],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (gen.kind !== 'container') throw new Error('guard');
    expect(gen.params['CanBusOffProcessing']).toEqual({
      type: 'enum',
      value: 'POLLING',
      definitionRef: '/CanBusOffProcessing',
    });
  });

  it('emits string param with default', () => {
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('string', 'CanImplementation', 'FLEXC')],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (gen.kind !== 'container') throw new Error('guard');
    expect(gen.params['CanImplementation']).toEqual({
      type: 'string',
      value: 'FLEXC',
      definitionRef: '/CanImplementation',
    });
  });

  it('skips integer with null default', () => {
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('integer', 'CanBusOffProcessing', null)],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (gen.kind !== 'container') throw new Error('guard');
    expect(gen.params['CanBusOffProcessing']).toBeUndefined();
  });

  it('emits empty string for string with null default', () => {
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('string', 'CanImplementation', null)],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (gen.kind !== 'container') throw new Error('guard');
    expect(gen.params['CanImplementation']).toEqual({
      type: 'string',
      value: '',
      definitionRef: '/CanImplementation',
    });
  });

  it('skips reference params (use addReference separately)', () => {
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [],
      references: [
        {
          shortName: 'CanIf',
          path: '/Can/CanGeneral/CanIf',
          destKind: 'ECUC-MODULE-CONFIGURATION-VALUES',
          lowerMultiplicity: 0,
          upperMultiplicity: 1,
        },
      ],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const gen = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (gen.kind !== 'container') throw new Error('guard');
    expect(Object.keys(gen.params)).toEqual([]);
    // Note: ArxmlContainer has no `references` field in the
    // discriminated-union model; reference wiring is handled by a
    // separate editor flow, not by the skeleton factory.
  });

  // ─── S2 (P1) — sub-container default value fill ──────────────────────
  // v1.7.1 ships a uniform default-fill across all container depths.
  // Pre-S2 only `buildTopContainer` ran `buildDefaultValue` per
  // parameter; `buildSubContainerShell` returned `params: {}` literally,
  // so every pre-created sub-container started empty. S2 extracts a
  // shared `fillParamsFromBswmd(c)` helper from `buildTopContainer` and
  // uses it in both builders. Choice shells deliberately stay empty
  // (branches are user-instanced per AUTOSAR semantics).

  it('S2: sub-container with default integer parameter carries the default value', () => {
    // Arrange — a sub-container with one integer param with default 5,
    // nested under a top-level container with no params of its own.
    const sub: ContainerDef = {
      shortName: 'CanSub',
      path: '/Can/CanGeneral/CanSub',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('integer', 'SubParam', 5)],
      references: [],
      choices: [],
    };
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [sub],
      parameters: [],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');

    // Act — descend into the sub-container shell (the child of CanGeneral).
    const canGeneral = (skel.packages[0]!.elements[0]! as ArxmlModule)
      .children[0]! as ArxmlContainer;
    if (canGeneral.kind !== 'container') throw new Error('guard');
    const canSub = canGeneral.children[0]! as ArxmlContainer;
    if (canSub.kind !== 'container') throw new Error('guard');

    // Assert — the default flows down to the sub-container, identical
    // shape to the top-layer default (type + value + definitionRef).
    expect(canSub.params['SubParam']).toEqual({
      type: 'integer',
      value: 5,
      definitionRef: '/SubParam',
    });
  });

  it('S2: deeply nested sub-container (3 levels) inherits default fill', () => {
    // Arrange — A → B → C nested sub-containers; only C has a parameter.
    // Verifies the helper recurses correctly and that every level
    // reaches the same fill-from-default code path.
    const c: ContainerDef = {
      shortName: 'C',
      path: '/Can/A/B/C',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('integer', 'DeepParam', 42)],
      references: [],
      choices: [],
    };
    const b: ContainerDef = {
      shortName: 'B',
      path: '/Can/A/B',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [c],
      parameters: [],
      references: [],
      choices: [],
    };
    const a: ContainerDef = {
      shortName: 'A',
      path: '/Can/A',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [b],
      parameters: [],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(a), 'Can');

    // Act — descend 3 levels.
    const topA = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    if (topA.kind !== 'container') throw new Error('guard');
    const midB = topA.children[0]! as ArxmlContainer;
    if (midB.kind !== 'container') throw new Error('guard');
    const leafC = midB.children[0]! as ArxmlContainer;
    if (leafC.kind !== 'container') throw new Error('guard');

    // Assert — defaults reach the leaf even 3 levels deep.
    expect(leafC.params['DeepParam']).toEqual({
      type: 'integer',
      value: 42,
      definitionRef: '/DeepParam',
    });
  });

  it('S2: sub-container with no parameters returns params: {} (not undefined)', () => {
    // Arrange — sub-container with empty parameters array. After S2, the
    // helper still runs (returns `{}`) instead of skipping the field
    // entirely — same shape as a top-container with no params.
    const sub: ContainerDef = {
      shortName: 'EmptySub',
      path: '/Can/Top/EmptySub',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [],
      references: [],
      choices: [],
    };
    const top: ContainerDef = {
      shortName: 'Top',
      path: '/Can/Top',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [sub],
      parameters: [],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(top), 'Can');

    // Act
    const topEl = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    const subEl = topEl.children[0]! as ArxmlContainer;

    // Assert — `params` is the empty object, not undefined.
    expect(subEl.params).toEqual({});
  });

  it('S2: choice shell does NOT carry defaults (branches are user-instanced)', () => {
    // Regression guard — S2 must NOT fill choice shells with branch
    // defaults. Choice branches are user-instanced at runtime; the
    // shell is just a placeholder for the picker to descend into.
    // Mirrors the buildChoiceShell JSDoc contract at skeleton.ts:222+.
    const branchA: ContainerDef = {
      shortName: 'BranchA',
      path: '/Can/Top/ChoiceContainer/BranchA',
      lowerMultiplicity: 0,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('integer', 'BranchParam', 99)],
      references: [],
      choices: [],
    };
    const branchB: ContainerDef = {
      shortName: 'BranchB',
      path: '/Can/Top/ChoiceContainer/BranchB',
      lowerMultiplicity: 0,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('string', 'BranchString', 'hi')],
      references: [],
      choices: [],
    };
    const choice: ContainerDef = {
      shortName: 'ChoiceContainer',
      path: '/Can/Top/ChoiceContainer',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('integer', 'ChoiceOwnParam', 7)],
      references: [],
      choices: [branchA, branchB],
    };
    const top: ContainerDef = {
      shortName: 'Top',
      path: '/Can/Top',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [],
      references: [],
      choices: [choice],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(top), 'Can');

    // Act — find the choice shell (a direct child of Top, marked by S1).
    const topEl = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    const choiceShell = topEl.children[0]! as ArxmlContainer;

    // Assert — choice shell's own `params` stays `{}` (S2 must not
    // delegate fillParamsFromBswmd here; AUTOSAR semantic is the user
    // picks one branch, the shell carries no defaults).
    expect(choiceShell.params).toEqual({});
  });

  it('S2: Sprint 16 invariant — definitionRef carried on sub-container default', () => {
    // The Sprint 16 invariant "every default-filled param carries the
    // BSWMD-side definition path on `definitionRef`" must hold at every
    // depth, not just the top layer. This test pins that contract for
    // sub-container fills.
    const sub: ContainerDef = {
      shortName: 'CanSub',
      path: '/Can/CanGeneral/CanSub',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [
        {
          ...mkParam('integer', 'SubParam', 5),
          path: '/AUTOSAR/EcucDefs/Can/CanGeneral/CanSub/SubParam',
        },
      ],
      references: [],
      choices: [],
    };
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [sub],
      parameters: [],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');

    // Act
    const canGeneral = (skel.packages[0]!.elements[0]! as ArxmlModule)
      .children[0]! as ArxmlContainer;
    const canSub = canGeneral.children[0]! as ArxmlContainer;

    // Assert — the real BSWMD path is carried, not the legacy
    // `/__synthesized__/<shortName>` placeholder.
    expect(canSub.params['SubParam']).toEqual({
      type: 'integer',
      value: 5,
      definitionRef: '/AUTOSAR/EcucDefs/Can/CanGeneral/CanSub/SubParam',
    });
  });

  // ─── S3 (P2) — container description carry-through ──────────────────
  // v1.7.1 ships end-to-end <DESC> text flow: BSWMD parser
  // (src/core/project/bswmd.ts) extracts <DESC> body into
  // ContainerDef.desc / ParamDef.desc; the skeleton carries that into
  // ArxmlContainer.description for top containers, sub-containers, and
  // choice shells. Pre-S3 the parser did not read <DESC> at all so the
  // value-side UI had no way to surface BSWMD-side documentation.

  it('S3: top-container description carried from ContainerDef.desc', () => {
    // Arrange — top container with desc; no sub-containers, no params.
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [],
      references: [],
      choices: [],
      desc: 'General CAN driver configuration.',
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');

    // Act
    const canGeneral = (skel.packages[0]!.elements[0]! as ArxmlModule)
      .children[0]! as ArxmlContainer;

    // Assert — the description is carried verbatim onto the
    // value-side ArxmlContainer.description field.
    expect(canGeneral.description).toBe('General CAN driver configuration.');
  });

  it('S3: sub-container description carried from ContainerDef.desc', () => {
    // Arrange — top container has no desc; sub-container carries one.
    const sub: ContainerDef = {
      shortName: 'CanSub',
      path: '/Can/CanGeneral/CanSub',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [],
      references: [],
      choices: [],
      desc: 'Sub-container with its own description.',
    };
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [sub],
      parameters: [],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');

    // Act
    const canGeneral = (skel.packages[0]!.elements[0]! as ArxmlModule)
      .children[0]! as ArxmlContainer;
    const canSub = canGeneral.children[0]! as ArxmlContainer;

    // Assert — the description reaches the sub-container shell. The
    // top container without desc has description === undefined.
    expect(canGeneral.description).toBeUndefined();
    expect(canSub.description).toBe('Sub-container with its own description.');
  });

  it('S3: choice shell description carried', () => {
    // Arrange — a choice container with desc; branches are nested in
    // `choices`. The skeleton emits a single shell carrying the
    // choice container's own description.
    const branchA: ContainerDef = {
      shortName: 'BranchA',
      path: '/Can/Top/ChoiceContainer/BranchA',
      lowerMultiplicity: 0,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [],
      references: [],
      choices: [],
    };
    const branchB: ContainerDef = {
      shortName: 'BranchB',
      path: '/Can/Top/ChoiceContainer/BranchB',
      lowerMultiplicity: 0,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [],
      references: [],
      choices: [],
    };
    const choice: ContainerDef = {
      shortName: 'ChoiceContainer',
      path: '/Can/Top/ChoiceContainer',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [],
      references: [],
      choices: [branchA, branchB],
      desc: 'Pick exactly one of the two branches below.',
    };
    const top: ContainerDef = {
      shortName: 'Top',
      path: '/Can/Top',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [],
      references: [],
      choices: [choice],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(top), 'Can');

    // Act — find the choice shell under Top.
    const topEl = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    const choiceShell = topEl.children[0]! as ArxmlContainer;

    // Assert — the choice shell carries the choice container's own
    // description, distinct from any branch's description.
    expect(choiceShell.isChoiceContainer).toBe(true);
    expect(choiceShell.description).toBe('Pick exactly one of the two branches below.');
  });

  it('S3: container without desc leaves ArxmlContainer.description undefined', () => {
    // Arrange — no desc anywhere. Regression guard that the field is
    // genuinely omitted (not "" or null) when the BSWMD has no
    // <DESC>. Matches the existing pre-S3 behaviour for fields like
    // isChoiceContainer.
    const cont: ContainerDef = {
      shortName: 'Plain',
      path: '/Can/Plain',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');

    // Act
    const plainEl = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;

    // Assert
    expect(plainEl.description).toBeUndefined();
  });

  // ─── T3 (Sprint X Phase 2) — top-container DEFINITION-REF stamp ──────
  // v1.9.0 stamps the BSWMD-side path on every emitted ECUC-CONTAINER-VALUE
  // (top, sub, choice) so the serializer writes a real
  // <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">...</DEFINITION-REF>
  // sibling of <SHORT-NAME>. Pre-T3 the field was omitted and the
  // serializer fell back to /__synthesized__/<shortName>.
  it('Sprint X T3: top-container stamps BSWMD path as definitionRef', () => {
    // Arrange — a top-level container with a non-trivial path (the
    // vendor-prefix shape `/Vendor/Can/CanConfigSet` is what the
    // Sprint X project specifically targets, but any non-empty path
    // exercises the stamp).
    const cont: ContainerDef = {
      shortName: 'CanConfigSet',
      path: '/Vendor/Can/CanConfigSet',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('integer', 'SomeParam', 0)],
      references: [],
      choices: [],
    };

    // Act
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const topEl = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;

    // Assert — definitionRef is stamped with the exact BSWMD path,
    // not the value-side /EAS/Can/CanConfigSet path.
    expect(topEl.definitionRef).toBe('/Vendor/Can/CanConfigSet');
  });

  it('Sprint X T3: top-container default-fill still applies after definitionRef stamp', () => {
    // Regression guard — adding the definitionRef stamp must not
    // regress the v1.7.1 S2 default-fill behaviour. The two changes
    // touch different fields, but both run in buildTopContainer.
    const cont: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Vendor/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [mkParam('integer', 'CanBusOffProcessing', 0)],
      references: [],
      choices: [],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(cont), 'Can');
    const topEl = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    expect(topEl.definitionRef).toBe('/Vendor/Can/CanGeneral');
    expect(topEl.params['CanBusOffProcessing']).toEqual({
      type: 'integer',
      value: 0,
      definitionRef: '/CanBusOffProcessing',
    });
  });

  it('Sprint X T3: sub-container (lower>0) stamps BSWMD path as definitionRef', () => {
    // Arrange — sub-container under a top-level container. The
    // sub-container shell path comes from the BSWMD ContainerDef.path,
    // distinct from the parent's path.
    const sub: ContainerDef = {
      shortName: 'CanSub',
      path: '/Vendor/Can/CanGeneral/CanSub',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [],
      references: [],
      choices: [],
    };
    const top: ContainerDef = {
      shortName: 'CanGeneral',
      path: '/Vendor/Can/CanGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [sub],
      parameters: [],
      references: [],
      choices: [],
    };

    // Act
    const skel = generateEcucSkeleton(buildBswmdWithContainers(top), 'Can');
    const topEl = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    const subEl = topEl.children[0]! as ArxmlContainer;

    // Assert — both depth levels carry their own BSWMD-side path.
    expect(topEl.definitionRef).toBe('/Vendor/Can/CanGeneral');
    expect(subEl.definitionRef).toBe('/Vendor/Can/CanGeneral/CanSub');
  });

  it('Sprint X T3: choice container shell stamps BSWMD path so serializer picks ECUC-CHOICE-CONTAINER-DEF DEST', () => {
    // Arrange — a required choice container (lower=1, 2 branches).
    // The shell's definitionRef is the choice container's own BSWMD
    // path; combined with `isChoiceContainer: true` it signals the
    // serializer to emit DEST="ECUC-CHOICE-CONTAINER-DEF" instead of
    // the plain DEST="ECUC-PARAM-CONF-CONTAINER-DEF".
    const branchA: ContainerDef = {
      shortName: 'BranchA',
      path: '/Vendor/Can/Top/ChoiceContainer/BranchA',
      lowerMultiplicity: 0,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [],
      references: [],
      choices: [],
    };
    const branchB: ContainerDef = {
      shortName: 'BranchB',
      path: '/Vendor/Can/Top/ChoiceContainer/BranchB',
      lowerMultiplicity: 0,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [],
      references: [],
      choices: [],
    };
    const choice: ContainerDef = {
      shortName: 'ChoiceContainer',
      path: '/Vendor/Can/Top/ChoiceContainer',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [],
      references: [],
      choices: [branchA, branchB],
    };
    const top: ContainerDef = {
      shortName: 'Top',
      path: '/Vendor/Can/Top',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      subContainers: [],
      parameters: [],
      references: [],
      choices: [choice],
    };
    const skel = generateEcucSkeleton(buildBswmdWithContainers(top), 'Can');

    // Act
    const topEl = (skel.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
    const choiceShell = topEl.children[0]! as ArxmlContainer;

    // Assert — choice marker + branch list + the choice container's
    // own BSWMD path. The branches themselves are NOT pre-created
    // (children: []), so their definitionRefs are not stamped by the
    // skeleton — they get stamped by addContainer when the user picks
    // a branch via the picker.
    expect(choiceShell.isChoiceContainer).toBe(true);
    expect(choiceShell.choiceBranches).toEqual(['BranchA', 'BranchB']);
    expect(choiceShell.definitionRef).toBe('/Vendor/Can/Top/ChoiceContainer');
  });
});

describe('resolveCollisionFilename — ecuc/ subfolder (post-v1.0.0)', () => {
  it('single pick uses <proj>/ecuc/ prefix', () => {
    const map = resolveCollisionFilename(
      [{ bswmdPath: '/BSWMD/Can.arxml', moduleShortName: 'Can' }],
      '/proj',
    );
    expect(map.size).toBe(1);
    expect(map.get('/BSWMD/Can.arxml::Can')).toBe('/proj/ecuc/Can_EcucValues.arxml');
  });

  it('cross-BSWMD name collision produces one canonical + one vendor-suffixed in subfolder', () => {
    const map = resolveCollisionFilename(
      [
        { bswmdPath: '/BSWMD/Can_v1.arxml', moduleShortName: 'Can' },
        { bswmdPath: '/BSWMD/Can_v2.arxml', moduleShortName: 'Can' },
      ],
      '/proj',
    );
    expect(map.size).toBe(2);
    expect(map.get('/BSWMD/Can_v1.arxml::Can')).toBe('/proj/ecuc/Can_EcucValues.arxml');
    expect(map.get('/BSWMD/Can_v2.arxml::Can')).toBe('/proj/ecuc/Can__can_v2_EcucValues.arxml');
  });

  it('handles projectDir with trailing slash without doubling', () => {
    const map = resolveCollisionFilename(
      [{ bswmdPath: '/BSWMD/Can.arxml', moduleShortName: 'Can' }],
      '/proj/',
    );
    // resolveCollisionFilename normalizes a trailing '/' on projectDir
    // via `.replace(/\/+$/, '')`, so '/proj/' and '/proj' produce the
    // same path shape ('/proj/ecuc/...') instead of '/proj//ecuc/...'.
    expect(map.get('/BSWMD/Can.arxml::Can')).toBe('/proj/ecuc/Can_EcucValues.arxml');
  });
});

function mkParam(
  kind: ParamDef['kind'],
  shortName: string,
  defaultValue: ParamDef['defaultValue'],
): ParamDef {
  return {
    shortName,
    path: `/${shortName}`,
    kind,
    defaultValue,
    minValue: null,
    maxValue: null,
    minLength: null,
    maxLength: null,
    enumerationLiterals: [],
  };
}
