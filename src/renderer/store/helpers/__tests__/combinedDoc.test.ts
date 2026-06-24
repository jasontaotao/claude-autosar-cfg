// @vitest-environment node

// Tests for the v1.9.0 Sprint X T7 fold: `computeDisplayDoc` accepts a
// `bswmdSchemas?` parameter and pipes both single-mode and combined-mode
// through `foldVendorPackages`. Vendor-private wrapper layers
// (e.g. `JWQ_CDD_PACK/JWQ_Packet/JWQ3399`) collapse into the deepest
// AR-PACKAGE so the Tree shows only the user-facing module name.
//
// Pure helper tests — no React / Zustand / Electron. We construct small
// `ArxmlDocument` shapes by hand to exercise the fold rules.

import { describe, expect, it } from 'vitest';

import { findByPath } from '@core/arxml/path.js';
import type { ArxmlDocument, ArxmlElement, ArxmlPackage } from '@core/arxml/types.js';
import type { BswmdDocument } from '@core/project/bswmd.js';

import { computeDisplayDoc } from '../combinedDoc.js';

/**
 * Build a 3-level vendor-prefix chain `Outer/Middle/Inner` where Outer
 * and Middle carry no `elements` (they're vendor wrappers) and Inner
 * carries the user-facing module. Mirrors the real fixture shape from
 * `JWQ_CDD_PACK/JWQ_Packet/JWQ3399`.
 */
function makeVendorDoc(outer: string, middle: string, inner: string): ArxmlDocument {
  const innerPkg: ArxmlPackage = {
    shortName: inner,
    path: `/${outer}/${middle}/${inner}`,
    elements: [],
  };
  const middlePkg: ArxmlPackage = {
    shortName: middle,
    path: `/${outer}/${middle}`,
    elements: [],
    packages: [innerPkg],
  };
  const outerPkg: ArxmlPackage = {
    shortName: outer,
    path: `/${outer}`,
    elements: [],
    packages: [middlePkg],
  };
  return {
    path: '/test',
    version: '4.6',
    packages: [outerPkg],
  };
}

/**
 * Build a 2-level wrapper `Wrapper/Module` with a plain module.
 */
function makeTwoLevelDoc(wrapper: string, moduleName: string): ArxmlDocument {
  const innerPkg: ArxmlPackage = {
    shortName: moduleName,
    path: `/${wrapper}/${moduleName}`,
    elements: [],
  };
  const wrapperPkg: ArxmlPackage = {
    shortName: wrapper,
    path: `/${wrapper}`,
    elements: [],
    packages: [innerPkg],
  };
  return {
    path: '/test',
    version: '4.6',
    packages: [wrapperPkg],
  };
}

/**
 * Build a 1-level doc with no nested packages (control: must NOT fold).
 */
function makeFlatDoc(moduleName: string): ArxmlDocument {
  const pkg: ArxmlPackage = {
    shortName: moduleName,
    path: `/${moduleName}`,
    elements: [],
  };
  return {
    path: '/test',
    version: '4.6',
    packages: [pkg],
  };
}

function makeBswmd(moduleShortNames: readonly string[]): BswmdDocument {
  return {
    version: '4.6',
    modules: moduleShortNames.map((shortName) => ({
      shortName,
      path: `/${shortName}`,
      dialect: 'ecuc-module-def',
      moduleId: null,
      containers: [],
      providedEntries: [],
      lowerMultiplicity: 0,
      upperMultiplicity: 1,
    })),
    warnings: [],
  };
}

/**
 * 2026-06-23 — EcucDefs tier 4 fixtures.
 *
 * Build a doc shaped like the Adc skeleton output: a wrap package
 * (e.g. `AUTOSAR_R22`) optionally containing `EcucDefs`, which in
 * turn contains a single module element directly in its `elements`
 * (mirrors skeleton.ts:115-175 where the module is emitted into
 * `pkg.elements`, not into a sub-package).
 */
function makeEcucDefsDoc(opts: {
  readonly wrapShortName: string | null;
  readonly moduleShortName: string;
}): ArxmlDocument {
  const moduleEl: ArxmlElement = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: opts.moduleShortName,
    params: {},
    children: [],
    references: [],
  };
  const ecucDefsPkg: ArxmlPackage = {
    shortName: 'EcucDefs',
    path: opts.wrapShortName === null ? '/EcucDefs' : `/${opts.wrapShortName}/EcucDefs`,
    elements: [moduleEl],
  };
  if (opts.wrapShortName === null) {
    return {
      path: '/test',
      version: '4.6',
      packages: [ecucDefsPkg],
    };
  }
  const wrapPkg: ArxmlPackage = {
    shortName: opts.wrapShortName,
    path: `/${opts.wrapShortName}`,
    elements: [],
    packages: [ecucDefsPkg],
  };
  return {
    path: '/test',
    version: '4.6',
    packages: [wrapPkg],
  };
}

/**
 * Build an EcucDefs pkg that has MORE than one element (mixed module
 * + reference). Used to verify the new tier refuses to fold in this
 * case (invariant I1 + I2: element count must be strictly preserved).
 */
function makeEcucDefsMixedDoc(): ArxmlDocument {
  const moduleEl: ArxmlElement = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'Adc',
    params: {},
    children: [],
    references: [],
  };
  const refEl: ArxmlElement = {
    kind: 'reference',
    tagName: 'ECUC-REFERENCE-VALUE',
    shortName: 'DemoRef',
    value: '/Adc/DemoTarget',
  };
  const ecucDefsPkg: ArxmlPackage = {
    shortName: 'EcucDefs',
    path: '/EcucDefs',
    elements: [moduleEl, refEl],
  };
  return {
    path: '/test',
    version: '4.6',
    packages: [ecucDefsPkg],
  };
}

// ---------------------------------------------------------------------------
// Test 1: 3-level vendor-prefix doc + matching BSWMD module collapses
// to a single top-level package whose shortName is the module name.
// ---------------------------------------------------------------------------
describe('computeDisplayDoc vendor fold (Sprint X T7)', () => {
  it('Test 1 — collapses full 3-level vendor chain to single top-level module (JWQ_CDD_PACK trusted prefix)', () => {
    const doc = makeVendorDoc('JWQ_CDD_PACK', 'JWQ_Packet', 'JWQ3399');
    const schema = makeBswmd(['JWQ3399']);

    const r = computeDisplayDoc('single', doc, [], [], [schema]);

    expect(r).not.toBeNull();
    expect(r?.doc).not.toBeNull();
    // v1.9.0 Sprint X Phase 5c — `JWQ_CDD_PACK` matches the trusted
    // vendor pack prefix `JWQ_.*_PACK`, which is specific enough to
    // fold on its own (the deepest BSWMD module `JWQ3399` is also a
    // positive match, but the trusted-prefix rule would fold even
    // without it). The full 3-level chain collapses to a single
    // top-level `JWQ3399`. This restores the user requirement
    // "不在 UI 里显示 vendor 父层".
    expect(r?.doc?.packages.length).toBe(1);
    expect(r?.doc?.packages[0]?.shortName).toBe('JWQ3399');
    // Warnings unchanged (this fold emits none).
    expect(r?.warnings).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Test 2: 2-level wrapper `/AUTOSAR/EcucDefs` matches the vendor
  // whitelist prefix (EcucDefs) and collapses WITHOUT needing a BSWMD.
  //
  // v1.9.0 Sprint X (MEDIUM #2) — the whitelist is now AND-combined
  // with the BSWMD match. Without a BSWMD that declares `EcucDefs`
  // as a module, the wrapper must NOT be collapsed (the user may
  // have a custom package called `EcucDefs` that is not the
  // well-known AUTOSAR one). This test now asserts the no-fold
  // behavior: the doc passes through unchanged.
  // -------------------------------------------------------------------------
  it('Test 2 — no fold when inner has no BSWMD match, even with whitelist prefix (EcucDefs)', () => {
    const doc = makeTwoLevelDoc('AUTOSAR', 'EcucDefs');
    // No BSWMD schemas → whitelist alone is not enough (v1.9.0 MEDIUM #2).
    const r = computeDisplayDoc('single', doc, [], [], []);

    // Both layers preserved (no fold).
    expect(r?.doc?.packages.length).toBe(1);
    expect(r?.doc?.packages[0]?.shortName).toBe('AUTOSAR');
    expect(r?.doc?.packages[0]?.packages?.[0]?.shortName).toBe('EcucDefs');
  });

  // -------------------------------------------------------------------------
  // Test 3: trusted vendor pack prefix `JWQ_.*_PACK` folds on its
  // own — no BSWMD match required. v1.9.0 Sprint X Phase 5c — the
  // trusted-prefix rule is the regression fix for the 3-level chain
  // collapse. The naming convention is specific enough that we
  // trust the fold unconditionally; the inner may not yet be
  // declared as a BSWMD module but the chain should still collapse.
  // -------------------------------------------------------------------------
  it('Test 3 — trusted pack JWQ_FOO_PACK folds without a BSWMD match (Phase 5c carve-out)', () => {
    const doc = makeTwoLevelDoc('JWQ_FOO_PACK', 'Can');
    // No BSWMD → trusted-prefix rule alone is enough.
    const r = computeDisplayDoc('single', doc, [], [], []);

    expect(r?.doc?.packages.length).toBe(1);
    expect(r?.doc?.packages[0]?.shortName).toBe('Can');
  });

  // -------------------------------------------------------------------------
  // Test 4: no-fold path. A 1-level doc (no nested packages) must NOT
  // be re-wrapped — the function returns the SAME `ArxmlDocument`
  // reference (fast path so `useMemo` in Tree.tsx skips re-render).
  // -------------------------------------------------------------------------
  it('Test 4 — returns the same ArxmlDocument reference when no fold is needed (fast path)', () => {
    const doc = makeFlatDoc('EcuC');
    const r = computeDisplayDoc('single', doc, [], [], [makeBswmd(['EcuC'])]);

    // Reference-equal fast path — Tree's useMemo can skip re-render.
    expect(r?.doc).toBe(doc);
  });

  // -------------------------------------------------------------------------
  // Test 5: import-merged mode also runs the fold. The legacy
  // single-mode behaviour was to pass `activeDoc` through verbatim;
  // Sprint X T7 collapses that to keep the import-merged tree aligned
  // with single-mode display.
  //
  // v1.9.0 Sprint X Phase 5c — the full 3-level chain collapses to
  // a single top-level `JWQ3399` (trusted pack prefix).
  // -------------------------------------------------------------------------
  it('Test 5 — import-merged mode also collapses the full 3-level vendor chain', () => {
    const doc = makeVendorDoc('JWQ_CDD_PACK', 'JWQ_Packet', 'JWQ3399');
    const schema = makeBswmd(['JWQ3399']);

    const r = computeDisplayDoc('import-merged', doc, [], [], [schema]);

    expect(r?.doc?.packages.length).toBe(1);
    expect(r?.doc?.packages[0]?.shortName).toBe('JWQ3399');
  });

  // -------------------------------------------------------------------------
  // Test 6: combined-mode also folds. When `buildCombinedDocument`
  // produces a doc with a vendor-prefix chain, the fold runs before
  // the result is returned so the Tree shows the collapsed shape.
  //
  // v1.9.0 Sprint X Phase 5c — the full 3-level chain collapses to
  // a single top-level `JWQ3399` (trusted pack prefix).
  // -------------------------------------------------------------------------
  it('Test 6 — combined-mode collapses the full 3-level vendor chain from the synthesised doc', () => {
    const doc = makeVendorDoc('JWQ_CDD_PACK', 'JWQ_Packet', 'JWQ3399');
    const schema = makeBswmd(['JWQ3399']);

    // combined-mode with NO collision: synthesises a flat displayDoc by
    // concatenating the source doc's root packages (Sprint 16).
    const r = computeDisplayDoc('combined', null, [doc], ['/foo.arxml'], [schema]);

    expect(r?.doc?.packages.length).toBe(1);
    expect(r?.doc?.packages[0]?.shortName).toBe('JWQ3399');
  });

  // -------------------------------------------------------------------------
  // Test 7: descendant element paths are rewritten when the wrapper
  // is collapsed. The Tree navigates by `pkg.path` and `findByPath`
  // on the SOURCE doc uses the original 3-segment path. This test
  // asserts the rewrite so downstream consumers (ContextMenu,
  // ParamEditor) have a stable contract.
  //
  // v1.9.0 Sprint X Phase 5c — the full 3-level chain collapses.
  // The hoisted deepest module keeps the deepest shortName `JWQ3399`
  // and its path is rewritten to drop the entire wrapper prefix.
  // -------------------------------------------------------------------------
  it('Test 7 — full chain collapse rewrites the hoisted module path to drop all wrapper prefixes', () => {
    const innerPkg: ArxmlPackage = {
      shortName: 'JWQ3399',
      path: '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399',
      elements: [],
    };
    const middlePkg: ArxmlPackage = {
      shortName: 'JWQ_Packet',
      path: '/JWQ_CDD_PACK/JWQ_Packet',
      elements: [],
      packages: [innerPkg],
    };
    const outerPkg: ArxmlPackage = {
      shortName: 'JWQ_CDD_PACK',
      path: '/JWQ_CDD_PACK',
      elements: [],
      packages: [middlePkg],
    };
    const doc: ArxmlDocument = {
      path: '/test',
      version: '4.6',
      packages: [outerPkg],
    };

    const r = computeDisplayDoc('single', doc, [], [], [makeBswmd(['JWQ3399'])]);

    // Full chain collapsed — only the deepest module remains at top,
    // its path rewritten to drop the entire `/JWQ_CDD_PACK/JWQ_Packet`
    // wrapper prefix.
    const hoisted = r?.doc?.packages[0];
    expect(hoisted?.shortName).toBe('JWQ3399');
    expect(hoisted?.path).toBe('/JWQ3399');
  });

  // -------------------------------------------------------------------------
  // v1.9.0 Sprint X (MEDIUM #2) — vendor fold whitelist tightened.
  // The whitelist (`EcucDefs` / `EAS` / `JWQ_*_PACK` / `AUTOSAR(_.*)?`)
  // is now AND-combined with a positive BSWMD module match. Without
  // the AND, user-defined packages that happen to share a well-known
  // prefix (e.g. a project-local `EcucDefs` for EcuC vendor config)
  // would be silently collapsed.
  // -------------------------------------------------------------------------
  it('MEDIUM #2 — does NOT fold EcucDefs > MyOwnSub when no BSWMD match', () => {
    const doc = makeTwoLevelDoc('EcucDefs', 'MyOwnSub');
    // No BSWMD schemas at all.
    const r = computeDisplayDoc('single', doc, [], [], []);

    // Both layers preserved — user-defined `EcucDefs > MyOwnSub`
    // must remain visible so the user can navigate it normally.
    expect(r?.doc?.packages.length).toBe(1);
    expect(r?.doc?.packages[0]?.shortName).toBe('EcucDefs');
    expect(r?.doc?.packages[0]?.packages?.[0]?.shortName).toBe('MyOwnSub');
  });

  it('MEDIUM #2 — DOES fold EcucDefs > JWQ3399 when BSWMD declares JWQ3399', () => {
    const doc = makeTwoLevelDoc('EcucDefs', 'JWQ3399');
    // BSWMD for JWQ3399 — fold is allowed.
    const r = computeDisplayDoc('single', doc, [], [], [makeBswmd(['JWQ3399'])]);

    expect(r?.doc?.packages.length).toBe(1);
    expect(r?.doc?.packages[0]?.shortName).toBe('JWQ3399');
  });

  // -------------------------------------------------------------------------
  // v1.9.0 Sprint X Phase 5c — trusted vendor pack (JWQ_.*_PACK)
  // folds on its own, without needing a positive BSWMD match on the
  // inner. The naming convention is specific enough (only a
  // vendor-controlled pack would use `JWQ_*_PACK`) that we trust the
  // fold unconditionally. The inner may not be a BSWMD module yet
  // (e.g. the BSWMD is loaded after the doc opens), but the chain
  // should still collapse so the UI is consistent across reload
  // states. Regression guard for the Phase 5b AND-rule that broke
  // the 3-level `JWQ_CDD_PACK > JWQ_Packet > JWQ3399` chain.
  // -------------------------------------------------------------------------
  it('Phase 5c — trusted pack JWQ_FOO_PACK > Can folds even without a BSWMD match', () => {
    const doc = makeTwoLevelDoc('JWQ_FOO_PACK', 'Can');
    // No BSWMD schemas — Phase 5b would refuse to fold here, but the
    // trusted-prefix rule alone is sufficient for `JWQ_.*_PACK`.
    const r = computeDisplayDoc('single', doc, [], [], []);

    expect(r?.doc?.packages.length).toBe(1);
    expect(r?.doc?.packages[0]?.shortName).toBe('Can');
  });

  // -------------------------------------------------------------------------
  // v1.9.0 Sprint X Phase 5c — generic vendor prefix (`EcucDefs`)
  // WITHOUT a BSWMD match on the inner must NOT fold. This guards
  // user-defined `EcucDefs` packages (the very thing MEDIUM #2 was
  // about). The trusted-only carve-out applies only to `JWQ_.*_PACK`.
  // -------------------------------------------------------------------------
  it('Phase 5c — generic prefix EcucDefs > MyOwnSub does NOT fold without BSWMD match', () => {
    const doc = makeTwoLevelDoc('EcucDefs', 'MyOwnSub');
    const r = computeDisplayDoc('single', doc, [], [], []);

    // Both layers preserved — `EcucDefs` is generic; the
    // trusted-only carve-out does not apply.
    expect(r?.doc?.packages.length).toBe(1);
    expect(r?.doc?.packages[0]?.shortName).toBe('EcucDefs');
    expect(r?.doc?.packages[0]?.packages?.[0]?.shortName).toBe('MyOwnSub');
  });
});

// ---------------------------------------------------------------------------
// 2026-06-23 — EcucDefs fold (tier 4).
//
// Verifies the new fold trigger added in combinedDoc.ts#foldPackage:
// when `pkg.shortName === 'EcucDefs'` AND it carries exactly one
// `kind: 'module'` element AND no sub-packages, the EcucDefs layer
// collapses and the module element is hoisted to the parent.
//
// Strictly disjoint from existing tier 1-3 tests because tier 4 fires
// only when `pkg.packages === undefined && pkg.elements.length === 1`
// (existing tiers all use `elements: []` EcucDefs as a wrapper).
// ---------------------------------------------------------------------------

describe('EcucDefs fold (tier 4)', () => {
  it('folds AUTOSAR_R22 > EcucDefs > Adc_module to [Adc hoisted at root] (outer wrap collapses too)', () => {
    // Arrange — mirrors skeleton.ts output for Adc_bswmd.arxml
    const doc = makeEcucDefsDoc({ wrapShortName: 'AUTOSAR_R22', moduleShortName: 'Adc' });
    const bswmds = [makeBswmd(['Adc'])];

    // Act
    const result = computeDisplayDoc('single', doc, [], [], bswmds);

    // Assert — the whole 3-layer chain AUTOSAR_R22 > EcucDefs > Adc
    // collapses to a single hoisted `Adc` at the root. Leaving the
    // outer AUTOSAR_R22 wrap visible (the v1.9.0 behaviour) would
    // produce a post-fold selectedPath of `/AUTOSAR_R22/Adc/...` that
    // no longer matches the source doc's 3-layer structure, so every
    // mutation dispatch (`addContainer` / `addParameter` /
    // `removeContainer` / `removeParameter` / `addReference`) would
    // fail with `path-not-found`. The fix extends tier 4's collapse
    // to the outer `AUTOSAR(_.*)?` wrap when the inner satisfies the
    // tier-4 structural pattern.
    expect(result).not.toBeNull();
    expect(result!.doc).not.toBeNull();
    expect(result!.doc!.packages.length).toBe(1);
    const hoisted = result!.doc!.packages[0]!;
    expect(hoisted.isVendorFoldResult).toBe(true);
    expect(hoisted.shortName).toBe('Adc');
    expect(hoisted.path).toBe('/Adc');
    expect(hoisted.elements.length).toBe(1);
    expect(hoisted.elements[0]!.kind).toBe('module');
  });

  it('end-to-end — Adc_EcucValues.arxml shape yields post-fold selectedPath that resolves on the source doc', () => {
    // Regression test for the Adc add/remove bug: a value file with
    // `AUTOSAR_R22 > EcucDefs > Adc > AdcConfigSet` (3 layers + child)
    // must fold to a selectedPath that the SOURCE doc can resolve via
    // the vendor-fold fallback in `findByPath` (core/arxml/path.ts:84-105).
    // Pre-fix, the post-fold path was `/AUTOSAR_R22/Adc/AdcConfigSet` and
    // findByPath returned `path-not-found` because the source doc still
    // had the EcucDefs layer between them.
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
      path: '/test',
      version: '4.6',
      packages: [wrapPkg],
    };
    const bswmds = [makeBswmd(['Adc'])];

    const result = computeDisplayDoc('single', doc, [], [], bswmds);

    expect(result).not.toBeNull();
    expect(result!.doc).not.toBeNull();
    const topPkg = result!.doc!.packages[0]!;
    // The hoisted pkg carries the module element as a direct child;
    // the Tree (Tree.tsx:158-170) sees isVendorFoldResult === true at
    // the top level and renders the module at root with parent path
    // '' → selectedPath = '/Adc/AdcConfigSet' on a child click.
    expect(topPkg.isVendorFoldResult).toBe(true);
    expect(topPkg.shortName).toBe('Adc');
    expect(topPkg.elements[0]!.kind).toBe('module');

    // End-to-end pin: the post-fold path '/Adc/AdcConfigSet' must
    // resolve on the SOURCE doc via the vendor-fold fallback (the
    // module shortName 'Adc' is found anywhere in the tree, then the
    // 'AdcConfigSet' child is walked). Pre-fix, the post-fold path
    // was '/AUTOSAR_R22/Adc/AdcConfigSet' which did not match the
    // source's 3-layer structure and findByPath returned null.
    const resolved = findByPath(doc, '/Adc/AdcConfigSet');
    expect(resolved).not.toBeNull();
    expect(resolved!.element.kind).toBe('container');
    expect((resolved!.element as { shortName: string }).shortName).toBe('AdcConfigSet');
  });

  it('folds EcucDefs > Adc_module (single wrap, no AUTOSAR layer) to [Adc hoisted at root]', () => {
    // Arrange
    const doc = makeEcucDefsDoc({ wrapShortName: null, moduleShortName: 'Adc' });
    const bswmds = [makeBswmd(['Adc'])];

    // Act
    const result = computeDisplayDoc('single', doc, [], [], bswmds);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.doc).not.toBeNull();
    expect(result!.doc!.packages.length).toBe(1);
    const hoisted = result!.doc!.packages[0]!;
    expect(hoisted.isVendorFoldResult).toBe(true);
    expect(hoisted.shortName).toBe('Adc');
    expect(hoisted.elements[0]!.kind).toBe('module');
  });

  it('refuses to fold when EcucDefs has sibling elements (module + reference) — invariant I1', () => {
    // Arrange
    const doc = makeEcucDefsMixedDoc();
    const bswmds = [makeBswmd(['Adc'])];

    // Act
    const result = computeDisplayDoc('single', doc, [], [], bswmds);

    // Assert — EcucDefs preserved unchanged (no silent element drop)
    expect(result).not.toBeNull();
    expect(result!.doc).not.toBeNull();
    const pkg = result!.doc!.packages[0]!;
    expect(pkg.shortName).toBe('EcucDefs');
    expect(pkg.isVendorFoldResult).toBeUndefined();
    expect(pkg.elements.length).toBe(2);
    expect(pkg.elements[0]!.kind).toBe('module');
    expect(pkg.elements[1]!.kind).toBe('reference');
  });

  it('folds EcucDefs even when the module is NOT in loaded BSWMDs (naming-only tier)', () => {
    // Arrange — empty BSWMD list (no modules known)
    const doc = makeEcucDefsDoc({ wrapShortName: null, moduleShortName: 'Adc' });
    const bswmds = [makeBswmd([])];

    // Act
    const result = computeDisplayDoc('single', doc, [], [], bswmds);

    // Assert — fold still fires (tier 4 has no BSWMD gate, unlike generic tier)
    expect(result).not.toBeNull();
    expect(result!.doc).not.toBeNull();
    const hoisted = result!.doc!.packages[0]!;
    expect(hoisted.isVendorFoldResult).toBe(true);
    expect(hoisted.shortName).toBe('Adc');
  });
});
