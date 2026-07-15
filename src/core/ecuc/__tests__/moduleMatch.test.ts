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
      multiplicityConfigClasses: [],
    })),
    warnings: [],
  };
}

describe('hasBswmdForModule', () => {
  it('A. priority: sourceBswmdPath matches loaded BSWMD path', () => {
    const state = {
      bswmdPaths: ['/BSWMD/Can.arxml'],
      bswmdSchemas: [mkBswmd(['Can'])],
      documents: [mkDoc('/proj/ecuc/Can_EcucValues.arxml', '/BSWMD/Can.arxml')],
    };
    expect(hasBswmdForModule(state, '/proj/ecuc/Can_EcucValues.arxml')).toBe(true);
  });

  it('A. sourceBswmdPath set but BSWMD removed → false', () => {
    const state = {
      bswmdPaths: [],
      bswmdSchemas: [],
      documents: [mkDoc('/proj/ecuc/Can_EcucValues.arxml', '/BSWMD/Can.arxml')],
    };
    expect(hasBswmdForModule(state, '/proj/ecuc/Can_EcucValues.arxml')).toBe(false);
  });

  it('B. fallback: no sourceBswmdPath; module shortName in path matches schema', () => {
    const state = {
      bswmdPaths: ['/BSWMD/SomeOther.arxml'],
      bswmdSchemas: [mkBswmd(['Can'])],
      documents: [mkDoc('/proj/Can_EcucValues.arxml')], // no sourceBswmdPath
    };
    // Path is /proj/Can_EcucValues.arxml; segments[1] = 'Can_EcucValues.arxml' — does NOT match 'Can'.
    // Expect false (preserves original behavior; fallback only matches bare module shortName).
    expect(hasBswmdForModule(state, '/proj/Can_EcucValues.arxml')).toBe(false);
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

  it('B. fallback matches 2-segment vendor wrapper (JWQ_CDD_PACK/JWQ_Packet/<module>)', () => {
    // Real-world JWQ3399_bswmd.arxml has the module at path
    // /JWQ_CDD_PACK/JWQ_Packet/JWQ3399 (2-segment vendor wrapper around
    // the module shortName). Pre-fix `segments[1]` returned
    // 'JWQ_CDD_PACK' which never matched the BswModuleDef.shortName;
    // the + Add buttons stayed disabled. Walk ALL segments so the
    // wrapper depth is irrelevant.
    const state = {
      bswmdPaths: ['/BSWMD/JWQ3399.arxml'],
      bswmdSchemas: [mkBswmd(['JWQ3399'])],
      documents: [mkDoc('/proj/JWQ3399_EcucValues.arxml')], // no sourceBswmdPath
    };
    expect(
      hasBswmdForModule(
        state,
        '/proj/JWQ3399_EcucValues.arxml/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet/JWQ3399SpiConfig/JWQ3399SpiCsConfig/SpiCsViaGPIO',
      ),
    ).toBe(true);
  });

  it('B. fallback matches combined-mode selectedPath (basename prefix + 2-segment wrapper)', () => {
    // The combined Tree View (Sprint 13 Stage 3.5) prefixes every path
    // with the source file basename, so a 2-segment vendor wrapper
    // pushes the module to segments[3] instead of segments[1]. The
    // fix walks ALL segments so the prefix and wrapper depth don't
    // matter.
    const state = {
      bswmdPaths: ['/BSWMD/JWQ3399.arxml'],
      bswmdSchemas: [mkBswmd(['JWQ3399'])],
      documents: [mkDoc('/proj/JWQ3399_EcucValues.arxml')], // no sourceBswmdPath
    };
    const combinedPath =
      '/JWQ3399_EcucValues.arxml/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet/JWQ3399SpiConfig/JWQ3399SpiCsConfig/SpiCsViaGPIO';
    // Pre-fix segments[1] = 'JWQ_CDD_PACK' — never matches; post-fix
    // walks and hits 'JWQ3399' at segments[3].
    expect(hasBswmdForModule(state, combinedPath)).toBe(true);
  });

  it('B. fallback also matches the BswModuleDef.path tail segment', () => {
    // Some BSWMDs publish the module at a non-`shortName` path tail
    // (e.g. legacy EB-tresos dialects where the path embeds a
    // vendor-specific suffix). Mirror that here so the fallback still
    // resolves when the path tail differs from shortName.
    const state = {
      bswmdPaths: ['/BSWMD/Can.arxml'],
      bswmdSchemas: [
        {
          version: '4.6',
          modules: [
            {
              shortName: 'Can',
              path: '/EcucDefs/CanModule', // tail != shortName
              dialect: 'ecuc-module-def' as const,
              moduleId: 1,
              containers: [],
              providedEntries: [],
              lowerMultiplicity: 1,
              upperMultiplicity: 1,
              multiplicityConfigClasses: [],
            },
          ],
          warnings: [],
        },
      ],
      documents: [mkDoc('/proj/Can_EcucValues.arxml')], // no sourceBswmdPath
    };
    // Path is the raw value-side path; the module shortName 'Can'
    // sits at segments[1] in the simplified layout. Pre-fix already
    // passes this case; the test pins that the shortName-walk keeps
    // matching after the fix.
    expect(hasBswmdForModule(state, '/proj/Can/CanGeneral')).toBe(true);
  });

  it('B. fallback returns false when no segment matches any module shortName', () => {
    // No sourceBswmdPath on the document, no segment in the path
    // matches any schema module shortName. The button should stay
    // disabled (the user is not on a schema-declared path).
    const state = {
      bswmdPaths: ['/BSWMD/Can.arxml'],
      bswmdSchemas: [mkBswmd(['Can'])],
      documents: [mkDoc('/proj/Can_EcucValues.arxml')], // no sourceBswmdPath
    };
    expect(hasBswmdForModule(state, '/proj/Can_EcucValues.arxml/EcucDefs/Other/Container')).toBe(
      false,
    );
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
