// v1.20.0 T1 C2.4 — resolveModuleDefForActiveDoc helper tests.
//
// Verifies the 4-case resolution: no doc / no module / module
// matches a loaded BSWMD / module shortName does not match. The
// helper is pure (operates on store state shape) and is consumed
// by the new `applyMutation` flow to thread `moduleDef` context
// to `applyPatchSteps`.

import { describe, expect, it } from 'vitest';

import type { ArxmlDocument } from '../../../core/arxml/types.js';
import type { BswModuleDef } from '../../../core/project/bswmd.js';
import { resolveModuleDefForActiveDoc } from '../resolveModuleDefForActiveDoc.js';

// Minimal stand-in for `ArxmlState`. We only need the fields the
// helper actually reads (doc + bswmdSchemas). Using `Pick<…>` keeps
// the test surface narrow.
type StateForResolver = {
  readonly doc: ArxmlDocument | null;
  readonly bswmdSchemas: readonly BswModuleDef[];
};

function makeModuleDef(shortName: string): BswModuleDef {
  return {
    shortName,
    path: `/${shortName}`,
    containers: [],
    parameters: [],
    references: [],
    choices: [],
  } as unknown as BswModuleDef;
}

function makeDoc(moduleShortName: string | null): ArxmlDocument {
  if (moduleShortName === null) {
    return { path: '/tmp/empty.arxml', version: '4.6', packages: [] };
  }
  return {
    path: '/tmp/with-module.arxml',
    version: '4.6',
    packages: [
      {
        shortName: 'EAS',
        path: '/EAS',
        elements: [
          {
            kind: 'module',
            tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
            shortName: moduleShortName,
            params: {},
            children: [],
            references: [],
          },
        ],
      },
    ],
  };
}

describe('resolveModuleDefForActiveDoc — null-doc branch', () => {
  it('returns undefined when state.doc is null', () => {
    const state: StateForResolver = { doc: null, bswmdSchemas: [makeModuleDef('EcuC')] };
    expect(resolveModuleDefForActiveDoc(state)).toBeUndefined();
  });
});

describe('resolveModuleDefForActiveDoc — no-module branch', () => {
  it('returns undefined when the doc has no module element', () => {
    const state: StateForResolver = {
      doc: makeDoc(null),
      bswmdSchemas: [makeModuleDef('EcuC')],
    };
    expect(resolveModuleDefForActiveDoc(state)).toBeUndefined();
  });
});

describe('resolveModuleDefForActiveDoc — match branch', () => {
  it('returns the matching BswModuleDef when the module shortName matches a loaded schema', () => {
    const ecuc = makeModuleDef('EcuC');
    const state: StateForResolver = {
      doc: makeDoc('EcuC'),
      bswmdSchemas: [makeModuleDef('Can'), makeModuleDef('Mcu'), ecuc],
    };
    expect(resolveModuleDefForActiveDoc(state)).toBe(ecuc);
  });
});

describe('resolveModuleDefForActiveDoc — no-match branch', () => {
  it('returns undefined when the module shortName does not match any loaded schema', () => {
    const state: StateForResolver = {
      doc: makeDoc('EcuC'),
      bswmdSchemas: [makeModuleDef('Can'), makeModuleDef('Mcu')],
    };
    expect(resolveModuleDefForActiveDoc(state)).toBeUndefined();
  });
});
