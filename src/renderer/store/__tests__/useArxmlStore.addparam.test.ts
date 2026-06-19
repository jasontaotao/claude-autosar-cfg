// Sprint 16c #2 — T3 contract completion: addParameter stamps `definitionRef`.
//
// Background (commit `b767ea6`):
//   - Sprint 16 T3 fixed `applyParamUpdate` to preserve `definitionRef` on edit.
//   - `skeleton.ts` writes `definitionRef: p.path` on default-filled params.
//   - The serializer (commit `b767ea6`) writes the real BSWMD path or falls
//     back to `/__synthesized__/<shortName>` if missing.
//
// The bug this file pins:
//   The `addParameter` action (Sprint 15) created a fresh `ParamValue`
//   from scratch with no `definitionRef` — falling back to
//   `/__synthesized__/<shortName>` and defeating the T3 fix for any
//   user-added parameter.
//
// This test pins:
//   1. Single-doc addParameter: new param carries the BSWMD path as
//      `definitionRef` (NOT undefined, NOT `/__synthesized__/...`).
//   2. Combined-view addParameter: same — definitionRef is real BSWMD path.
//   3. Empty paramDef.path: falls through to existing behaviour — no
//      `definitionRef` on the new value.
//
// Fixtures mirror the existing `useArxmlStore.mutation.test.ts` style:
// minimal ArxmlDocument + BswModuleDef injected via setState so we
// exercise the store action's contract end-to-end.

import { describe, it, expect, beforeEach } from 'vitest';

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlModule,
  ParamValue,
} from '@core/arxml/types';
import type { BswModuleDef, ContainerDef, ParamDef } from '@core/project/bswmd';

import { useArxmlStore } from '../useArxmlStore';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

/**
 * Build a minimal ArxmlDocument with a single module + single container
 * under one root package. Mirrors `makeDoc` in
 * `useArxmlStore.mutation.test.ts:34`.
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
 * Build a BswModuleDef with a single top-container declaring one integer
 * parameter. The default BSWMD path style matches the existing
 * `makeBswModule` (`/EAS/<module>/<container>/<param>`) so combined-mode
 * routing works the same way.
 */
function makeBswModule(
  moduleShortName: string,
  containerShortName: string,
  paramShortName: string,
  paramPath: string,
): BswModuleDef {
  const topContainer: ContainerDef = {
    shortName: containerShortName,
    path: `/EAS/${moduleShortName}/${containerShortName}`,
    lowerMultiplicity: 0,
    upperMultiplicity: 1,
    subContainers: [],
    parameters: [
      {
        shortName: paramShortName,
        path: paramPath,
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

function makeBswmd(mod: BswModuleDef) {
  return { version: '4.6', modules: [mod], warnings: [] };
}

/**
 * Walk the test doc's tree to the first container under the module.
 * Throws if the shape isn't the expected single-module + single-container
 * layout — keeps the assertions terse.
 */
function firstContainerOf(doc: ArxmlDocument): ArxmlContainer {
  const mod = doc.packages[0]!.elements[0]!;
  if (mod.kind !== 'module') throw new Error('expected module');
  const child = mod.children[0]!;
  if (child.kind !== 'container') throw new Error('expected container');
  return child;
}

beforeEach(() => {
  useArxmlStore.getState().clear();
});

// ---------------------------------------------------------------------------
// Acceptance #1 — single-doc: addParameter stamps definitionRef
// ---------------------------------------------------------------------------

describe('useArxmlStore — addParameter stamps definitionRef (Sprint 16c #2)', () => {
  it('single-doc: new param carries BSWMD path as definitionRef', () => {
    // Arrange
    const doc = makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig');
    useArxmlStore.getState().addDocument(doc, '/tmp/Adc.arxml');
    const realBswmdPath = '/EAS/Adc/AdcConfig/TestParam';
    useArxmlStore.setState({
      bswmdSchemas: [
        makeBswmd(makeBswModule('Adc', 'AdcConfig', 'TestParam', realBswmdPath)),
      ],
      bswmdPaths: ['/schemas/Adc.bswmd.arxml'],
    });

    // Act
    useArxmlStore.getState().addParameter('/EAS/Adc/AdcConfig', 'TestParam');

    // Assert — definitionRef on the new value is the BSWMD path.
    const mutated = useArxmlStore.getState().documents[0]!;
    const container = firstContainerOf(mutated);
    expect(container.params['TestParam']).toBeDefined();
    expect(container.params['TestParam']?.definitionRef).toBe(realBswmdPath);
    // Negative assertion — must NOT fall back to synthesized path.
    expect(container.params['TestParam']?.definitionRef).not.toContain(
      '/__synthesized__/',
    );
  });
});

// ---------------------------------------------------------------------------
// Acceptance #2 — combined-view: addParameter stamps definitionRef
// ---------------------------------------------------------------------------

describe('useArxmlStore — addParameter in combined view (Sprint 16c #2)', () => {
  it('combined view: new param on the source doc carries BSWMD path as definitionRef', () => {
    // Arrange
    const adcDoc = makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig');
    const canDoc = makeDoc('/tmp/Can.arxml', 'Can', 'CanConfig');
    useArxmlStore.getState().addDocument(adcDoc, '/tmp/Adc.arxml');
    useArxmlStore.getState().addDocument(canDoc, '/tmp/Can.arxml');
    const realBswmdPath = '/EAS/Can/CanConfig/TestParam';
    useArxmlStore.setState({
      bswmdSchemas: [
        makeBswmd(makeBswModule('Can', 'CanConfig', 'TestParam', realBswmdPath)),
      ],
      bswmdPaths: ['/schemas/Can.bswmd.arxml'],
    });
    useArxmlStore.getState().setViewMode('combined');

    // Act — combined-view path: containerPath carries the file-prefix.
    useArxmlStore.getState().addParameter('/Can.arxml/EAS/Can/CanConfig', 'TestParam');

    // Assert — Can.arxml carries the new param with the real BSWMD path.
    const after = useArxmlStore.getState();
    const canDocAfter = after.documents.find((d) => d.path === '/tmp/Can.arxml')!;
    const canContainer = firstContainerOf(canDocAfter);
    expect(canContainer.params['TestParam']?.definitionRef).toBe(realBswmdPath);
    expect(canContainer.params['TestParam']?.definitionRef).not.toContain(
      '/__synthesized__/',
    );

    // And Adc.arxml was not touched.
    const adcDocAfter = after.documents.find((d) => d.path === '/tmp/Adc.arxml')!;
    const adcContainer = firstContainerOf(adcDocAfter);
    expect(adcContainer.params['TestParam']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Acceptance #3 — empty paramDef.path: no definitionRef on the new value
// ---------------------------------------------------------------------------

describe('useArxmlStore — addParameter with empty paramDef.path (Sprint 16c #2)', () => {
  it('empty path: definitionRef stays undefined (no fabricated DEFINITION-REF)', () => {
    // Arrange — BSWMD declares the param but with an empty `path` (degenerate
    // case from a malformed / minimal BSWMD). The store's addParameter call
    // should NOT stamp a definitionRef and should NOT crash.
    const doc = makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig');
    useArxmlStore.getState().addDocument(doc, '/tmp/Adc.arxml');
    useArxmlStore.setState({
      bswmdSchemas: [
        makeBswmd(makeBswModule('Adc', 'AdcConfig', 'TestParam', '')),
      ],
      bswmdPaths: ['/schemas/Adc.bswmd.arxml'],
    });

    // Act
    useArxmlStore.getState().addParameter('/EAS/Adc/AdcConfig', 'TestParam');

    // Assert — the param is created, but with no definitionRef (the
    // serializer will then fall back to `/__synthesized__/<shortName>`,
    // which is the same behaviour as before Sprint 16c #2).
    const mutated = useArxmlStore.getState().documents[0]!;
    const container = firstContainerOf(mutated);
    expect(container.params['TestParam']).toBeDefined();
    expect(container.params['TestParam']?.definitionRef).toBeUndefined();
  });
});