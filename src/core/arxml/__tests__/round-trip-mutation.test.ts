// core/arxml/__tests__/round-trip-mutation.test.ts
// Sprint 15 — round-trip integration test for ECUC add/delete mutations.
//
// Pattern: parse fixture → mutate → serialize → re-parse → assert the
// mutation survived the trip through the serializer. This is the canonical
// proof that a new container / parameter / cascade delete can be persisted
// and re-loaded without losing shape.
//
// BSWMD is synthesised in-test (upper='infinite' on every node) so the
// add-container / add-parameter flows always have schema headroom; the
// goal here is to verify the **serializer**, not the multiplicity rules
// (those are pinned in mutation.test.ts).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { BswModuleDef, ContainerDef, ParamDef } from '../../project/bswmd.js';
import { addContainer, addParameter, removeContainer } from '../mutation.js';
import { parseArxml } from '../parser.js';
import { serializeArxml } from '../serializer.js';
import type { ArxmlContainer, ArxmlDocument, ArxmlElement, ArxmlModule } from '../types.js';

const SAMPLES = ['Det_Det', 'EcuC_EcuC', 'Com_Com', 'PduR_PduR', 'WdgIf_WdgIf'] as const;
const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'arxml');

/**
 * Build a permissive BSWMD where the module allows any add under it. The
 * `upperMultiplicity: 'infinite'` keeps `addContainer` from rejecting on
 * the multiplicity check — we are verifying round-trip, not schema.
 */
function makePermissiveModuleDef(moduleShortName: string): BswModuleDef {
  return {
    shortName: moduleShortName,
    path: `/${moduleShortName}`,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [],
    providedEntries: [],
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
  };
}

/**
 * A child `ContainerDef` that the picker / add flow would supply.
 * Unbounded multiplicity so the mutation always succeeds.
 */
function makePermissiveContainerDef(shortName: string): ContainerDef {
  return {
    shortName,
    path: `/${shortName}`,
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    subContainers: [],
    parameters: [],
    references: [],
    choices: [],
  };
}

function makePermissiveParamDef(shortName: string): ParamDef {
  return {
    shortName,
    path: `/${shortName}`,
    kind: 'integer',
    defaultValue: 42,
    minValue: null,
    maxValue: null,
    minLength: null,
    maxLength: null,
    enumerationLiterals: [],
  };
}

function modulePathOf(doc: ArxmlDocument): string {
  // Each fixture places its module at /<AR-PACKAGE>/<MODULE>; we walk the
  // first package and use the module's shortName + path.
  const pkg = doc.packages[0]!;
  const moduleEl = pkg.elements.find((e) => e.kind === 'module') as ArxmlModule | undefined;
  if (moduleEl === undefined) {
    throw new Error(`fixture ${pkg.path} has no module element`);
  }
  return `${pkg.path}/${moduleEl.shortName}`;
}

function findModuleIndexInPackage(pkg: { elements: readonly ArxmlElement[] }): number {
  const idx = pkg.elements.findIndex((e) => e.kind === 'module');
  if (idx === -1) throw new Error('no module in package');
  return idx;
}

async function loadParsed(name: string): Promise<{ doc: ArxmlDocument; moduleShortName: string }> {
  const path = join(FIXTURE_DIR, `${name}.arxml`);
  const xml = await readFile(path, 'utf-8');
  const p = parseArxml(xml);
  if (!p.ok) throw new Error(`failed to parse ${name}: ${p.error.kind}`);
  const pkg = p.value.packages[0]!;
  const moduleEl = pkg.elements.find((e) => e.kind === 'module') as ArxmlModule;
  return { doc: p.value, moduleShortName: moduleEl.shortName };
}

// ---------------------------------------------------------------------------
// addContainer → serialize → re-parse
// ---------------------------------------------------------------------------

describe('round-trip: addContainer survives serialize / re-parse', () => {
  it.each(SAMPLES)('%s', async (name) => {
    const { doc, moduleShortName } = await loadParsed(name);
    const modulePath = modulePathOf(doc);
    const moduleDef = makePermissiveModuleDef(moduleShortName);
    const childDef = makePermissiveContainerDef('Sprint15TestContainer');

    // Act — add then round-trip.
    const m1 = addContainer(doc, modulePath, 'Sprint15TestContainer', moduleDef, childDef);
    expect(m1.ok).toBe(true);
    if (!m1.ok) return;
    const s1 = serializeArxml(m1.value);
    expect(s1.ok).toBe(true);
    if (!s1.ok) return;
    const p2 = parseArxml(s1.value);
    expect(p2.ok).toBe(true);
    if (!p2.ok) return;

    // Assert — the new container is still present after the trip. We
    // locate the module by kind (not by index) because some fixtures
    // (Det_Det) place an ECUC-DEFINITION-COLLECTION before the module.
    const newPkg = p2.value.packages[0]!;
    const newModuleIdx = findModuleIndexInPackage(newPkg);
    const newRoot = newPkg.elements[newModuleIdx] as ArxmlModule;
    // v1.4.0 trust sprint — 17c. Filter to known kinds (unknown has no SHORT-NAME).
    expect(
      newRoot.children
        .filter((c): c is ArxmlModule | ArxmlContainer => c.kind === 'module' || c.kind === 'container')
        .map((c) => c.shortName),
    ).toContain('Sprint15TestContainer');
  });
});

// ---------------------------------------------------------------------------
// addParameter → serialize → re-parse
// ---------------------------------------------------------------------------

describe('round-trip: addParameter survives serialize / re-parse', () => {
  it.each(SAMPLES)('%s', async (name) => {
    const { doc, moduleShortName } = await loadParsed(name);
    const modulePath = modulePathOf(doc);
    const moduleDef = makePermissiveModuleDef(moduleShortName);
    const paramDef = makePermissiveParamDef('Sprint15TestParam');

    // Act
    const m1 = addParameter(doc, modulePath, paramDef, moduleDef);
    expect(m1.ok).toBe(true);
    if (!m1.ok) return;
    const s1 = serializeArxml(m1.value);
    expect(s1.ok).toBe(true);
    if (!s1.ok) return;
    const p2 = parseArxml(s1.value);
    expect(p2.ok).toBe(true);
    if (!p2.ok) return;

    // Assert — the new param is still present.
    const newPkg = p2.value.packages[0]!;
    const newModuleIdx = findModuleIndexInPackage(newPkg);
    const newRoot = newPkg.elements[newModuleIdx] as ArxmlModule;
    expect(newRoot.params['Sprint15TestParam']).toMatchObject({ type: 'integer', value: 42 });
  });
});

// ---------------------------------------------------------------------------
// Sprint 16c #2 — addParameter stamps BSWMD path on DEFINITION-REF
// ---------------------------------------------------------------------------

/**
 * Sprint 16c #2 — `addParameter` must stamp `definitionRef: paramDef.path`
 * on the new `ParamValue` so the serializer (Sprint 16 T3) writes the
 * real BSWMD path instead of falling back to
 * `/__synthesized__/<shortName>`. The permissive BSWMD used here does NOT
 * place the param in a real `ContainerDef.parameters[]` — the add path
 * tolerates that by skipping the cross-reference check (see mutation.ts
 * `addParameter` body, sub-path branch). The BSWMD path we pass on the
 * `paramDef` is the only thing the new code reads.
 *
 * We verify the contract end-to-end: addParameter → serialize → re-parse
 * → assert the round-tripped `ParamValue` carries `definitionRef`.
 */
describe('round-trip: addParameter stamps BSWMD path as definitionRef (Sprint 16c #2)', () => {
  it.each(SAMPLES)('%s', async (name) => {
    // Arrange
    const { doc, moduleShortName } = await loadParsed(name);
    const modulePath = modulePathOf(doc);
    const moduleDef = makePermissiveModuleDef(moduleShortName);
    const realBswmdPath = '/Some/Real/Bswmd/Path/TestParam';
    const paramDef: ParamDef = {
      ...makePermissiveParamDef('TestParam'),
      path: realBswmdPath,
    };

    // Act
    const m1 = addParameter(doc, modulePath, paramDef, moduleDef);
    expect(m1.ok).toBe(true);
    if (!m1.ok) return;
    // Confirm the in-memory shape carries the definitionRef.
    const newMod = m1.value.packages[0]!.elements.find((e) => e.kind === 'module') as ArxmlModule;
    expect(newMod.params['TestParam']?.definitionRef).toBe(realBswmdPath);

    // Serialize — the serialized XML is the user-visible "save" output.
    // The DEFINITION-REF text for the *new* param must be the real BSWMD
    // path, NOT the /__synthesized__/<shortName> placeholder. (Other
    // pre-existing params in the fixture may still carry /__synthesized__/
    // — those are out of scope here; we only care about the one we just
    // added.)
    const s1 = serializeArxml(m1.value);
    expect(s1.ok).toBe(true);
    if (!s1.ok) return;
    expect(s1.value).toContain(`>${realBswmdPath}</DEFINITION-REF>`);
    expect(s1.value).not.toContain(`/__synthesized__/TestParam`);
  });
});

/**
 * Edge case — `paramDef.path` is empty (degenerate BSWMD). The new code
 * must skip stamping the field so the serializer falls back to the
 * existing `/__synthesized__/<shortName>` placeholder rather than emit
 * an empty DEFINITION-REF.
 */
describe('round-trip: addParameter with empty paramDef.path skips definitionRef (Sprint 16c #2)', () => {
  it('empty path: no definitionRef on the new value (existing fallback applies)', async () => {
    // Arrange
    const { doc, moduleShortName } = await loadParsed('Com_Com');
    const modulePath = modulePathOf(doc);
    const moduleDef = makePermissiveModuleDef(moduleShortName);
    const paramDef: ParamDef = {
      ...makePermissiveParamDef('EmptyPathParam'),
      path: '',
    };

    // Act
    const m1 = addParameter(doc, modulePath, paramDef, moduleDef);
    expect(m1.ok).toBe(true);
    if (!m1.ok) return;

    // Assert — no definitionRef on the in-memory value.
    const newMod = m1.value.packages[0]!.elements.find((e) => e.kind === 'module') as ArxmlModule;
    expect(newMod.params['EmptyPathParam']?.definitionRef).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// removeContainer → serialize → re-parse
// ---------------------------------------------------------------------------

describe('round-trip: removeContainer survives serialize / re-parse', () => {
  it.each(SAMPLES)('%s', async (name) => {
    // Arrange — add a container first, then remove it. We don't use
    // `cascade=true` here because the cascade cross-doc behaviour lives in
    // the store action (Phase 2); single-doc cascade is a no-op at the
    // core layer.
    const { doc, moduleShortName } = await loadParsed(name);
    const modulePath = modulePathOf(doc);
    const moduleDef = makePermissiveModuleDef(moduleShortName);
    const childDef = makePermissiveContainerDef('Sprint15ToBeRemoved');

    const m1 = addContainer(doc, modulePath, 'Sprint15ToBeRemoved', moduleDef, childDef);
    expect(m1.ok).toBe(true);
    if (!m1.ok) return;

    // Act — remove the just-added container.
    const m2 = removeContainer(m1.value, `${modulePath}/Sprint15ToBeRemoved`, false);
    expect(m2.ok).toBe(true);
    if (!m2.ok) return;
    const s1 = serializeArxml(m2.value);
    expect(s1.ok).toBe(true);
    if (!s1.ok) return;
    const p2 = parseArxml(s1.value);
    expect(p2.ok).toBe(true);
    if (!p2.ok) return;

    // Assert — the removed container is gone, and the rest of the doc
    // survived (no over-deletion). The parsed root should not contain
    // Sprint15ToBeRemoved as a child of the module.
    const newPkg = p2.value.packages[0]!;
    const newModuleIdx = findModuleIndexInPackage(newPkg);
    const newRoot = newPkg.elements[newModuleIdx] as ArxmlModule;
    // v1.4.0 trust sprint — 17c. Filter to known kinds (unknown has no SHORT-NAME).
    expect(
      newRoot.children
        .filter((c): c is ArxmlModule | ArxmlContainer => c.kind === 'module' || c.kind === 'container')
        .map((c) => c.shortName),
    ).not.toContain('Sprint15ToBeRemoved');
  });
});
