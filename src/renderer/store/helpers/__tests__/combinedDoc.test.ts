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

import type { ArxmlDocument, ArxmlPackage } from '@core/arxml/types.js';
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
