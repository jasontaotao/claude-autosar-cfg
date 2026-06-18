// core/ecuc/__tests__/moduleMatch.test.ts
// Pin the contract of hasBswmdForModule: A→B priority fallback.

import { describe, expect, it } from 'vitest';

import type { ArxmlDocument } from '../../arxml/types.js';
import type { BswmdDocument } from '../../project/bswmd.js';
import { hasBswmdForModule } from '../moduleMatch.js';

function mkDoc(path: string, sourceBswmdPath?: string): ArxmlDocument {
  return {
    path,
    version: '4.6',
    packages: [],
    ...(sourceBswmdPath !== undefined ? { sourceBswmdPath } : {}),
  };
}

function mkBswmd(shortNames: string[]): BswmdDocument {
  return {
    version: '4.6',
    modules: shortNames.map((sn) => ({
      shortName: sn,
      path: `/${sn}`,
      dialect: 'ecuc-module-def' as const,
      moduleId: 1,
      containers: [],
      providedEntries: [],
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
    })),
    warnings: [],
  };
}

describe('hasBswmdForModule', () => {
  it('A. priority: sourceBswmdPath matches loaded BSWMD path', () => {
    const state = {
      bswmdPaths: ['/BSWMD/Can.arxml'],
      bswmdSchemas: [mkBswmd(['Can'])],
      documents: [mkDoc('/proj/ecuc/Can_Cfg.arxml', '/BSWMD/Can.arxml')],
    };
    expect(hasBswmdForModule(state, '/proj/ecuc/Can_Cfg.arxml')).toBe(true);
  });

  it('A. sourceBswmdPath set but BSWMD removed → false', () => {
    const state = {
      bswmdPaths: [],
      bswmdSchemas: [],
      documents: [mkDoc('/proj/ecuc/Can_Cfg.arxml', '/BSWMD/Can.arxml')],
    };
    expect(hasBswmdForModule(state, '/proj/ecuc/Can_Cfg.arxml')).toBe(false);
  });

  it('B. fallback: no sourceBswmdPath; module shortName in path matches schema', () => {
    const state = {
      bswmdPaths: ['/BSWMD/SomeOther.arxml'],
      bswmdSchemas: [mkBswmd(['Can'])],
      documents: [mkDoc('/proj/Can_Cfg.arxml')], // no sourceBswmdPath
    };
    // Path is /proj/Can_Cfg.arxml; segments[1] = 'Can_Cfg.arxml' — does NOT match 'Can'.
    // Expect false (preserves original behavior; fallback only matches bare module shortName).
    expect(hasBswmdForModule(state, '/proj/Can_Cfg.arxml')).toBe(false);
  });

  it('B. fallback matches when segments[1] equals module shortName', () => {
    // Layout: /<pkg>/<module-shortName>/...
    // For a manually-imported ECUC at /proj/Can (so segments = ['proj','Can']),
    // segments[1] = 'Can' which matches the schema module shortName.
    const state = {
      bswmdPaths: ['/BSWMD/Can.arxml'],
      bswmdSchemas: [mkBswmd(['Can'])],
      documents: [mkDoc('/proj/Can')], // no sourceBswmdPath
    };
    expect(hasBswmdForModule(state, '/proj/Can')).toBe(true);
  });

  it('returns false when selectedPath does not match any document', () => {
    const state = {
      bswmdPaths: ['/BSWMD/Can.arxml'],
      bswmdSchemas: [mkBswmd(['Can'])],
      documents: [mkDoc('/Can/CanGeneral')],
    };
    expect(hasBswmdForModule(state, '/NoSuchDoc')).toBe(false);
  });
});
