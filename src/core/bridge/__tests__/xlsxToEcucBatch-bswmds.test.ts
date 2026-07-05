// xlsxToEcucBatch — v1.26.0 T4 BSWMD-driven edge cases.
//
// Each of the 3 fail-fast error classes that the mapper raises at
// construction time gets one explicit test that pins the exact error
// regex. The third case ("Container not found in BSWMD module") is
// covered via a synthetic `BswModuleDef` whose `containers` array is
// empty — option (b) from the T4 brief — because constructing a
// purpose-built BSWMD ARXML fixture just to omit one container adds
// noise to the samples tree and pulls fast-xml-parser into the
// negative-path test for no behavioural gain.

import { describe, expect, it } from 'vitest';

import { type BswModuleDef } from '../../project/bswmd.js';
import { xlsxToEcucBatch, type EcucInstanceRow } from '../xlsxToEcucBatch.js';

// ---------------------------------------------------------------------------
// Synthetic-BSWMD helper — T4 third error path
// ---------------------------------------------------------------------------

/**
 * Build a minimal-but-typed `BswModuleDef` whose `containers` array
 * carries only the shortNames in `containerShortNames`. Used to force
 * the "container not found in BSWMD module" error path without
 * parsing a real ARXML fixture.
 *
 * `lookupContainerDef` only walks `containers` (and recursively
 * `subContainers` / `choices`) and matches by `shortName`, so an
 * otherwise-stub module with the right `containers` array is enough
 * to exercise both the success and the miss path.
 */
function syntheticBswModuleDef(
  shortName: string,
  containerShortNames: readonly string[],
): BswModuleDef {
  return {
    shortName,
    path: `/AUTOSAR/${shortName}`,
    dialect: 'ecuc-module-def',
    moduleId: null,
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    providedEntries: [],
    containers: containerShortNames.map((c) => ({
      shortName: c,
      path: `/AUTOSAR/${shortName}/${c}`,
      lowerMultiplicity: 0,
      upperMultiplicity: 'infinite',
      subContainers: [],
      parameters: [],
      references: [],
      choices: [],
    })),
    multiplicityConfigClasses: [],
    includes: [],
  };
}

describe('xlsxToEcucBatch — BSWMD-driven edge cases (v1.26.0 T4)', () => {
  it("throws 'Unrecognized sheet name' with the allowed-list suffix", () => {
    const bswmds = new Map<string, BswModuleDef>();
    // `EcucInstanceRow.sheet` is the strict literal union; widen with `as
    // never` so we can drive the negative path without touching the
    // production-side sheet type (mirror of the v1.25.0 test pattern).
    const row = {
      sheet: 'NotARealSheet' as never,
      shortName: 'Foo',
      params: {},
    };
    expect(() => xlsxToEcucBatch([row], bswmds)).toThrow(
      /Unrecognized sheet name: 'NotARealSheet' \(allowed:.*\)/,
    );
  });

  it("throws 'BSWMD map missing module' with the provided-modules suffix (empty)", () => {
    const bswmds = new Map<string, BswModuleDef>(); // empty — no modules loaded
    const row: EcucInstanceRow = {
      sheet: 'ComIPdu',
      shortName: 'Foo',
      params: {},
    };
    expect(() => xlsxToEcucBatch([row], bswmds)).toThrow(
      /BSWMD map missing module 'Com' \(needed by sheet 'ComIPdu'\)\. Provided modules: <empty>/,
    );
  });

  it("throws 'Container not found in BSWMD module' when the BSWMD module is present but lacks the requested container", () => {
    // Synthetic Com module that declares 'SomeOtherContainer' but NOT
    // 'ComIPdu'. The mapper accepts the sheet name (ComIPdu → Com),
    // finds Com in the BSWMD map, then fails on the container lookup.
    const bswmds = new Map<string, BswModuleDef>([
      ['Com', syntheticBswModuleDef('Com', ['SomeOtherContainer'])],
    ]);
    const row: EcucInstanceRow = {
      sheet: 'ComIPdu',
      shortName: 'Foo',
      params: {},
    };
    expect(() => xlsxToEcucBatch([row], bswmds)).toThrow(
      /Container 'ComIPdu' not found in BSWMD module 'Com'\. Verify the BSWMD declares this container shortName\./,
    );
  });
});
