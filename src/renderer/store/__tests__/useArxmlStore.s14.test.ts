// Sprint 14 Task 7 — store actions for BSWMD-to-ECUC.
//
// Pins the contract for the three new store actions added to support
// the BSWMD-driven ECUC skeleton flow (Task 8) and cascade-on-remove
// (Task 12):
//
//   1. setBswmdModuleEnabled(bswmdPath, shortName, false) — adds the
//      module shortName to the schema's `disabledModules` Set, and
//      re-runs validation so any `schema-unknown` errors clear.
//   2. setBswmdModuleEnabled(..., true) — removes the shortName from
//      `disabledModules` so the module is active again.
//   3. setBswmdModuleEnabled on an unknown bswmdPath — no-op (does not
//      crash; does not mutate).
//   4. findDependentsOfBswmd(bswmdPath) — returns the `.path` array of
//      every loaded ArxmlDocument whose `sourceBswmdPath` matches.
//   5. findDependentsOfBswmd on a bswmdPath with no dependents —
//      returns an empty array (NOT undefined).
//   6. addDocumentWithSource(doc, sourceBswmdPath) — wraps the doc
//      with `sourceBswmdPath`, then delegates to addDocument so the
//      document is registered (documents, documentPaths, active, dirty
//      reset all happen).
//
// Fixture adaptations vs. the brief:
//
//   - Brief: `{ path, root: { tagName, attributes, children } }`
//     Reality (post-T1): `ArxmlDocument` is `{ path, version, packages,
//     sourceBswmdPath? }`. No `root` field. Tests use empty packages +
//     a synthetic version literal.
//   - Brief BSWMD modules: `{ shortName, path, containers, parameters,
//     references }`.
//     Reality (post-T4): `BswModuleDef` requires `dialect`, `moduleId`,
//     `containers`, `providedEntries`, `lowerMultiplicity`,
//     `upperMultiplicity`. We cast through `unknown` (same pattern as
//     T4 fixtures) so the test stays focused on store-level semantics
//     rather than fixture completeness.
//   - Brief schema carries `version: '4.0'`; BSWMD's `BswmdDocument` is
//     happy with any string here (no validation), so we keep '4.0' as
//     a literal fixture label.
//
// Bypasses React (store is consumed via `useArxmlStore.getState()` /
// `setState()`) — same pattern as every other store test.

import { describe, it, expect, beforeEach } from 'vitest';

import type { ArxmlDocument } from '@core/arxml/types';
import type { BswModuleDef, BswmdDocument } from '@core/project/bswmd.js';

import { useArxmlStore } from '../useArxmlStore.js';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

/** Build a minimal `ArxmlDocument` with `sourceBswmdPath` attached. */
function makeDocWithSource(path: string, sourceBswmdPath?: string): ArxmlDocument {
  return {
    path,
    version: '4.6',
    packages: [],
    ...(sourceBswmdPath !== undefined ? { sourceBswmdPath } : {}),
  };
}

/**
 * Build a minimal `BswModuleDef` fixture via `unknown` cast — the store
 * only inspects `shortName` (for disabledModules) and `path`, so the
 * other mandatory fields (containers / providedEntries / multiplicity)
 * can stay empty. Same pattern T4 fixtures use.
 */
function makeBswModuleDef(shortName: string): BswModuleDef {
  return {
    shortName,
    path: `/${shortName}`,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [],
    providedEntries: [],
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
  } as unknown as BswModuleDef;
}

/** Build a `BswmdDocument` with the given modules; `disabledModules`
 *  defaults to undefined (the action must materialise the Set on first
 *  disable). */
function makeBswmd(modules: readonly BswModuleDef[]): BswmdDocument {
  return {
    version: '4.0',
    modules,
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Test setup — reset to a known multi-doc + BSWMD state before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  useArxmlStore.setState({
    bswmdSchemas: [makeBswmd([makeBswModuleDef('A'), makeBswModuleDef('B')])],
    bswmdPaths: ['D:/bswmd/test.arxml'],
    documents: [makeDocWithSource('D:/proj/A_EcucValues.arxml', 'D:/bswmd/test.arxml')],
    documentPaths: ['D:/proj/A_EcucValues.arxml'],
  });
});

// ---------------------------------------------------------------------------
// setBswmdModuleEnabled
// ---------------------------------------------------------------------------

describe('setBswmdModuleEnabled', () => {
  it('adds module shortName to disabledModules when enabled=false', () => {
    useArxmlStore.getState().setBswmdModuleEnabled('D:/bswmd/test.arxml', 'A', false);
    const schema = useArxmlStore.getState().bswmdSchemas[0];
    expect(schema).toBeDefined();
    expect(schema!.disabledModules?.has('A')).toBe(true);
    // B should not be in disabledModules (only the targeted module).
    expect(schema!.disabledModules?.has('B')).toBe(false);
  });

  it('removes module shortName from disabledModules when re-enabled', () => {
    useArxmlStore.getState().setBswmdModuleEnabled('D:/bswmd/test.arxml', 'A', false);
    useArxmlStore.getState().setBswmdModuleEnabled('D:/bswmd/test.arxml', 'A', true);
    const schema = useArxmlStore.getState().bswmdSchemas[0];
    expect(schema).toBeDefined();
    expect(schema!.disabledModules?.has('A')).toBe(false);
  });

  it('no-ops (does not crash) on unknown bswmdPath', () => {
    const beforePaths = useArxmlStore.getState().bswmdPaths;
    const beforeSchemas = useArxmlStore.getState().bswmdSchemas;
    expect(() =>
      useArxmlStore.getState().setBswmdModuleEnabled('D:/bswmd/missing.arxml', 'A', false),
    ).not.toThrow();
    // State is untouched — same array references.
    expect(useArxmlStore.getState().bswmdPaths).toBe(beforePaths);
    expect(useArxmlStore.getState().bswmdSchemas).toBe(beforeSchemas);
  });
});

// ---------------------------------------------------------------------------
// findDependentsOfBswmd
// ---------------------------------------------------------------------------

describe('findDependentsOfBswmd', () => {
  it('returns paths of documents whose sourceBswmdPath matches', () => {
    const deps = useArxmlStore.getState().findDependentsOfBswmd('D:/bswmd/test.arxml');
    expect(deps).toEqual(['D:/proj/A_EcucValues.arxml']);
  });

  it('returns empty array when no document references the BSWMD', () => {
    useArxmlStore.setState({
      documents: [makeDocWithSource('D:/proj/Other_EcucValues.arxml', 'D:/bswmd/other.arxml')],
      documentPaths: ['D:/proj/Other_EcucValues.arxml'],
    });
    const deps = useArxmlStore.getState().findDependentsOfBswmd('D:/bswmd/test.arxml');
    expect(deps).toEqual([]);
  });

  it('returns empty array when documents list is empty', () => {
    useArxmlStore.setState({ documents: [], documentPaths: [] });
    const deps = useArxmlStore.getState().findDependentsOfBswmd('D:/bswmd/test.arxml');
    expect(deps).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// addDocumentWithSource
// ---------------------------------------------------------------------------

describe('addDocumentWithSource', () => {
  it('attaches sourceBswmdPath and adds document to the document set', () => {
    // Start clean so we can assert on the appended entry.
    useArxmlStore.setState({ documents: [], documentPaths: [] });

    const newDoc = makeDocWithSource('D:/proj/B_EcucValues.arxml');
    useArxmlStore.getState().addDocumentWithSource(newDoc, 'D:/bswmd/test.arxml');

    const state = useArxmlStore.getState();
    expect(state.documents[0]?.sourceBswmdPath).toBe('D:/bswmd/test.arxml');
    expect(state.documentPaths).toContain('D:/proj/B_EcucValues.arxml');
    // Back-compat `doc`/`filePath` synced via addDocument.
    expect(state.doc?.path).toBe('D:/proj/B_EcucValues.arxml');
    expect(state.filePath).toBe('D:/proj/B_EcucValues.arxml');
  });
});
