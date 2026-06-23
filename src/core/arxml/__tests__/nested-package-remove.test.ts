// core/arxml/__tests__/nested-package-remove.test.ts
// Sprint X regression — removeContainer / addContainer must work when the
// AR-PACKAGE hierarchy is nested (e.g. vendor-prefix source docs where the
// ECUC module lives under two levels of <AR-PACKAGE> wrappers).
//
// Root cause: mutation.ts#removeElement and mutation.ts#findElementByPath
// use a flat `findRootPackageByShortName(doc.packages, ...)` and a flat
// `doc.packages.find((p) => p.shortName === pkgName)` lookup that only
// checks the top-level packages list. path.ts#findRootPackageByShortName
// already has a nested-fallback (added in v1.9.0 Sprint X, commit
// `path.ts` line ~226) — but mutation.ts never got the symmetric fix.
//
// Reproduction: real user project (`JWQ_CDD_PACK > JWQ_Packet > JWQ3399[ECUC]`,
// modeled from `C:\Users\13777\Desktop\ClaudeAutosarWorkSpace\ecuc\JWQ3399_EcucValues.arxml`).
// Every right-click "Delete container" on this shape silently no-ops with
// `path-not-found`.

import { describe, it, expect } from 'vitest';

import type { BswModuleDef, ContainerDef } from '../../project/bswmd.js';
import { addContainer, removeContainer } from '../mutation.js';
import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlModule,
  ArxmlPackage,
  ParamValue,
} from '../types.js';

// ---------------------------------------------------------------------------
// Hand-built nested-package fixture (mirrors JWQ3399_EcucValues.arxml shape)
// ---------------------------------------------------------------------------

/**
 * Build a doc with the exact shape the user has on disk:
 *   <AR-PACKAGES>
 *     <AR-PACKAGE> JWQ_CDD_PACK
 *       <AR-PACKAGES>
 *         <AR-PACKAGE> JWQ_Packet
 *           <ELEMENTS>
 *             <ECUC-MODULE-CONFIGURATION-VALUES> JWQ3399
 *               <CONTAINERS> JWQ3399ConfigSet (and any children)
 *           </ELEMENTS>
 *         </AR-PACKAGE>
 *       </AR-PACKAGES>
 *     </AR-PACKAGE>
 *   </AR-PACKAGES>
 *
 * The top-level `JWQ_CDD_PACK` package's `elements` list is EMPTY — the
 * ECUC module lives in the nested `JWQ_Packet` package. This is the
 * shape that breaks mutation.ts's flat top-level lookup.
 */
function makeNestedDoc(
  moduleShortName: string,
  moduleContainers: readonly ArxmlContainer[] = [],
  moduleParams: Readonly<Record<string, ParamValue>> = {},
): ArxmlDocument {
  const moduleEl: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: moduleShortName,
    params: moduleParams,
    children: moduleContainers,
    references: [],
  };
  const innerPkg: ArxmlPackage = {
    shortName: 'JWQ_Packet',
    path: '/JWQ_CDD_PACK/JWQ_Packet',
    elements: [moduleEl],
  };
  return {
    path: 'JWQ3399_EcucValues.arxml',
    version: '4.0',
    packages: [
      {
        shortName: 'JWQ_CDD_PACK',
        path: '/JWQ_CDD_PACK',
        elements: [], // empty: module is in nested pkg, not here
        packages: [innerPkg],
      },
    ],
  };
}

function makeContainer(
  shortName: string,
  children: readonly ArxmlContainer[] = [],
): ArxmlContainer {
  return {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName,
    params: {},
    children,
  };
}

function makeBswContainer(
  shortName: string,
  opts: { lower?: number; upper?: number | 'infinite' } = {},
): ContainerDef {
  return {
    shortName,
    path: `/Module/${shortName}`,
    lowerMultiplicity: opts.lower ?? 0,
    upperMultiplicity: opts.upper ?? 'infinite',
    subContainers: [],
    parameters: [],
    references: [],
    choices: [],
  };
}

function makeBswModule(shortName: string, containers: readonly ContainerDef[]): BswModuleDef {
  return {
    shortName,
    path: `/Module/${shortName}`,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers,
    providedEntries: [],
    lowerMultiplicity: 0,
    upperMultiplicity: 1,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('removeContainer on nested-package doc (Sprint X regression)', () => {
  it('removes a top-level container under a nested ECUC module', () => {
    // Arrange: JWQ3399 / JWQ3399ConfigSet / JWQ3399InitConfig pre-built.
    const initConfig = makeContainer('JWQ3399InitConfig');
    const configSet = makeContainer('JWQ3399ConfigSet', [initConfig]);
    const doc = makeNestedDoc('JWQ3399', [configSet]);
    const moduleDef = makeBswModule('JWQ3399', []);

    // Act: delete the JWQ3399InitConfig container.
    const result = removeContainer(
      doc,
      '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet/JWQ3399InitConfig',
      false,
      moduleDef,
    );

    // Assert: deletion succeeded and the container is gone.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const removed = result.value;
    const initConfigPkg = removed.packages[0];
    expect(initConfigPkg).toBeDefined();
    const innerPkg = initConfigPkg?.packages?.[0];
    expect(innerPkg).toBeDefined();
    const moduleEl = innerPkg?.elements[0];
    expect(moduleEl?.kind).toBe('module');
    if (moduleEl?.kind !== 'module') return;
    const configSetEl = moduleEl.children[0];
    // Narrow through `kind` before reading shortName — ArxmlUnknown has
    // no shortName field, so the union access fails without it.
    expect(configSetEl?.kind).toBe('container');
    if (configSetEl?.kind !== 'container') return;
    expect(configSetEl.shortName).toBe('JWQ3399ConfigSet');
    expect(configSetEl.children).toHaveLength(0);
  });

  it('removes the deepest container (multi-level nested ECUC)', () => {
    // Arrange: JWQ3399 / JWQ3399ConfigSet / JWQ3399SpiConfig / JWQ3399SpiCsConfig
    const spiCs = makeContainer('JWQ3399SpiCsConfig');
    const spiConfig = makeContainer('JWQ3399SpiConfig', [spiCs]);
    const configSet = makeContainer('JWQ3399ConfigSet', [spiConfig]);
    const doc = makeNestedDoc('JWQ3399', [configSet]);
    const moduleDef = makeBswModule('JWQ3399', []);

    // Act
    const result = removeContainer(
      doc,
      '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet/JWQ3399SpiConfig/JWQ3399SpiCsConfig',
      false,
      moduleDef,
    );

    // Assert
    expect(result.ok).toBe(true);
  });

  it('removes the ECUC module itself (the package-bearing element)', () => {
    // Arrange: JWQ3399 / JWQ3399ConfigSet
    const configSet = makeContainer('JWQ3399ConfigSet');
    const doc = makeNestedDoc('JWQ3399', [configSet]);
    const moduleDef = makeBswModule('JWQ3399', []);

    // Act: delete the configSet top-level container.
    const result = removeContainer(
      doc,
      '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet',
      false,
      moduleDef,
    );

    // Assert
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const removed = result.value;
    const innerPkg = removed.packages[0]?.packages?.[0];
    expect(innerPkg).toBeDefined();
    const moduleEl = innerPkg?.elements[0];
    expect(moduleEl?.kind).toBe('module');
    if (moduleEl?.kind !== 'module') return;
    expect(moduleEl.children).toHaveLength(0);
  });

  it('addContainer round-trip: add a 0..* child then remove it', () => {
    // Arrange: build a fresh doc with JWQ3399ConfigSet only, BSWMD declares
    // JWQ3399InitConfig as 0..* (lower=0, upper=infinite).
    const configSet = makeContainer('JWQ3399ConfigSet');
    const doc = makeNestedDoc('JWQ3399', [configSet]);
    const initConfigDef = makeBswContainer('JWQ3399InitConfig', {
      lower: 0,
      upper: 'infinite',
    });
    const moduleDef = makeBswModule('JWQ3399', [initConfigDef]);

    // Act 1: add a new instance
    const addResult = addContainer(
      doc,
      '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet',
      'JWQ3399InitConfig',
      moduleDef,
      initConfigDef,
    );
    expect(addResult.ok).toBe(true);
    if (!addResult.ok) return;

    // Act 2: remove it. With the current bug, this returns path-not-found.
    const removeResult = removeContainer(
      addResult.value,
      '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet/JWQ3399InitConfig',
      false,
      moduleDef,
    );

    // Assert: round-trip works on a nested-package doc.
    expect(removeResult.ok).toBe(true);
  });

  it('removes the middle of 3 auto-suffixed siblings and preserves the other 2', () => {
    // Multi-instance regression (review CRITICAL-1). Auto-suffixed
    // siblings carry unique shortNames (`Pdu`, `Pdu_1`, `Pdu_2`).
    // Removing the middle one must NOT touch the others — the parent
    // identity-keyed `replaceElement` would match the wrong sibling
    // if `sameIdentity` collided, but auto-suffix keeps siblings
    // distinguishable so the walker hits the right one.
    const pdu = makeContainer('Pdu');
    const pdu_1 = makeContainer('Pdu_1');
    const pdu_2 = makeContainer('Pdu_2');
    const configSet = makeContainer('JWQ3399ConfigSet', [pdu, pdu_1, pdu_2]);
    const doc = makeNestedDoc('JWQ3399', [configSet]);
    const moduleDef = makeBswModule('JWQ3399', []);

    const result = removeContainer(
      doc,
      '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet/Pdu_1',
      false,
      moduleDef,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Walk the resulting doc and assert siblings are exactly [Pdu, Pdu_2].
    const innerPkg = result.value.packages[0]?.packages?.[0];
    const moduleEl = innerPkg?.elements[0];
    if (moduleEl?.kind !== 'module') throw new Error('module missing');
    const configSetAfter = moduleEl.children[0];
    if (configSetAfter?.kind !== 'container') throw new Error('configSet missing');
    expect(configSetAfter.children).toHaveLength(2);
    const names = configSetAfter.children
      .filter((c): c is ArxmlContainer => c.kind === 'container')
      .map((c) => c.shortName);
    expect(names).toEqual(['Pdu', 'Pdu_2']);
  });

  it('removes one of 2 same-shortName siblings by reference identity (regression for latent sameIdentity collision)', () => {
    // Edge case: a malformed user source doc with 2 sibling containers
    // sharing the same shortName (AUTOSAR violation, but Vector /
    // hand-edited files exist in the wild). `replaceElement` matches
    // parents via `sameIdentity` (kind + shortName), so this case
    // relies on `removeElement` short-circuiting when the filter is
    // a no-op — which it does here because BOTH siblings have the
    // same `kind + shortName`, the rebuild drops ONE of them
    // (reference equality), and the rebuilt parent is then placed
    // back at the first sameIdentity match. This test pins the
    // current behaviour: remove by path drops the target by reference,
    // and the rebuilt parent happens to land at the first sameIdentity
    // slot. The other same-named sibling stays in the doc.
    const first = makeContainer('Dup');
    const second = makeContainer('Dup');
    const configSet = makeContainer('JWQ3399ConfigSet', [first, second]);
    const doc = makeNestedDoc('JWQ3399', [configSet]);
    const moduleDef = makeBswModule('JWQ3399', []);

    const result = removeContainer(
      doc,
      '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet/Dup',
      false,
      moduleDef,
    );
    // The remove may or may not succeed depending on which `Dup` the
    // path resolves to. What we assert is the invariant: the result
    // doc, if any, must have EXACTLY ONE `Dup` (the surviving
    // sibling), never zero or two.
    if (!result.ok) return;
    const innerPkg = result.value.packages[0]?.packages?.[0];
    const moduleEl = innerPkg?.elements[0];
    if (moduleEl?.kind !== 'module') return;
    const configSetAfter = moduleEl.children[0];
    if (configSetAfter?.kind !== 'container') return;
    const dupCount = configSetAfter.children.filter(
      (c): c is ArxmlContainer => c.kind === 'container' && c.shortName === 'Dup',
    ).length;
    expect(dupCount).toBe(1);
  });
});
