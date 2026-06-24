import { describe, it, expect } from 'vitest';

import {
  cIdent,
  cType,
  cValue,
  paramConfigClass,
  bswmdPathOf,
  partitionName,
} from '../handlebars-helpers.js';
import type { GenerationVariant } from '../registry.js';

describe('cIdent', () => {
  it('joins slash-separated path with underscores', () => {
    expect(cIdent('Mcu/Clock/ClockDivider')).toBe('Mcu_Clock_ClockDivider');
  });

  it('replaces dashes with underscores', () => {
    expect(cIdent('EcuC-PartitionConfig')).toBe('EcuC_PartitionConfig');
  });

  it('replaces dots with underscores', () => {
    expect(cIdent('Mcu.Clock.Divider')).toBe('Mcu_Clock_Divider');
  });

  it('strips leading/trailing whitespace', () => {
    expect(cIdent('  EcuC  ')).toBe('EcuC');
  });

  it('preserves already-valid identifiers unchanged', () => {
    expect(cIdent('EcuC_Partition_0')).toBe('EcuC_Partition_0');
  });
});

describe('cType', () => {
  it('maps EcucIntegerParamDef min=0 max=255 to uint8', () => {
    expect(
      cType({ kind: 'integer', min: 0, max: 255 }),
    ).toBe('uint8');
  });

  it('maps min=-128 max=127 to sint8', () => {
    expect(
      cType({ kind: 'integer', min: -128, max: 127 }),
    ).toBe('sint8');
  });

  it('maps min=0 max=65535 to uint16', () => {
    expect(
      cType({ kind: 'integer', min: 0, max: 65535 }),
    ).toBe('uint16');
  });

  it('maps min=0 max=4294967295 to uint32', () => {
    expect(
      cType({ kind: 'integer', min: 0, max: 4294967295 }),
    ).toBe('uint32');
  });

  it('maps larger range to uint64', () => {
    expect(
      cType({ kind: 'integer', min: 0, max: 4294967296 }),
    ).toBe('uint64');
  });

  it('maps EcucBooleanParamDef to uint8', () => {
    expect(cType({ kind: 'boolean' })).toBe('uint8');
  });

  it('maps EcucStringParamDef to const char*', () => {
    expect(cType({ kind: 'string' })).toBe('const char*');
  });

  it('maps EcucFloatParamDef to float32 by default', () => {
    expect(cType({ kind: 'float' })).toBe('float32');
  });

  it('returns ?? for unknown kind', () => {
    // The discriminated union never produces an unknown kind at the type
    // level, but the engine wrapper calls cType with `unknown` and we want
    // the default branch to be reachable for malformed BSWMD inputs.
    expect(cType({ kind: 'mystery' } as never)).toBe('??');
  });
});

describe('cValue', () => {
  it('renders integer literal unchanged', () => {
    expect(cValue(42, { kind: 'integer' })).toBe('42');
  });

  it('renders boolean as 0/1', () => {
    expect(cValue(true, { kind: 'boolean' })).toBe('1');
    expect(cValue(false, { kind: 'boolean' })).toBe('0');
  });

  it('renders string literal with C escaping', () => {
    expect(cValue('hello', { kind: 'string' })).toBe('"hello"');
    expect(cValue('a"b', { kind: 'string' })).toBe('"a\\"b"');
    expect(cValue('a\\b', { kind: 'string' })).toBe('"a\\\\b"');
  });

  it('renders float with 6-digit precision', () => {
    expect(cValue(3.14, { kind: 'float' })).toBe('3.140000f');
  });
});

describe('paramConfigClass', () => {
  const defWithPair = {
    paramConfigClasses: [
      { configVariant: 'PreCompile' as const, configClass: 'PreCompile' as const },
      { configVariant: 'Link' as const, configClass: 'Link' as const },
      { configVariant: 'PostBuild' as const, configClass: 'PostBuild' as const },
    ],
  };

  it('returns the matching configClass for active variant', () => {
    expect(
      paramConfigClass(defWithPair, 'PreCompile' as GenerationVariant),
    ).toBe('PreCompile');
    expect(
      paramConfigClass(defWithPair, 'Link' as GenerationVariant),
    ).toBe('Link');
    expect(
      paramConfigClass(defWithPair, 'PostBuild' as GenerationVariant),
    ).toBe('PostBuild');
  });

  it('throws when no pair exists for the active variant', () => {
    expect(() =>
      paramConfigClass(
        { paramConfigClasses: [] },
        'PreCompile' as GenerationVariant,
      ),
    ).toThrow(/no configClass/);
  });
});

describe('bswmdPathOf', () => {
  it('joins instance path with slashes', () => {
    expect(bswmdPathOf({ path: ['Mcu', 'Clock', 'Divider'] })).toBe(
      'Mcu/Clock/Divider',
    );
  });

  it('returns empty string for empty path', () => {
    expect(bswmdPathOf({ path: [] })).toBe('');
  });
});

describe('partitionName', () => {
  it('passes through shortName as C identifier', () => {
    expect(partitionName('Partition_0')).toBe('Partition_0');
  });

  it('prefixes with module shortName when bare name given', () => {
    expect(partitionName('EcuC/0')).toBe('EcuC_0');
  });
});
