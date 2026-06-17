import { readFileSync, existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseArxml } from '../parser.js';

describe('XSD_PATTERN namespace detection', () => {
  it('matches the legacy dashed form AUTOSAR_4-2-2.xsd', async () => {
    const { detectVersion } = await import('../parser-internals.js');
    const r = detectVersion({
      '@_xmlns': 'http://autosar.org/schema/r4.2',
      '@_xsi:schemaLocation':
        'http://autosar.org/schema/r4.2 AUTOSAR_4-2-2.xsd',
    });
    expect(r).toBe('4.2');
  });

  it('matches the 5-digit form AUTOSAR_00046.xsd', async () => {
    const { detectVersion } = await import('../parser-internals.js');
    const r = detectVersion({
      '@_xmlns': 'http://autosar.org/schema/r4.0',
      '@_xsi:schemaLocation':
        'http://autosar.org/schema/r4.0 AUTOSAR_00046.xsd',
    });
    expect(r).toBe('00046');
  });

  it('matches the 5-digit form AUTOSAR_00049.xsd (R20-11)', async () => {
    const { detectVersion } = await import('../parser-internals.js');
    const r = detectVersion({
      '@_xmlns': 'http://autosar.org/schema/r4.0',
      '@_xsi:schemaLocation':
        'http://autosar.org/schema/r4.0 AUTOSAR_00049.xsd',
    });
    expect(r).toBe('00049');
  });
});

describe('EB tresos real fixture compatibility', () => {
  // EB tresos ships R4.4 / R19-11 / R20-11 / R21-11 BSWMDs at
  // C:\EB\tresos\autosar\<version>\AUTOSAR_MOD_ECUConfigurationParameters.arxml
  // Each is 12-16 MB and uses the 5-digit xsd form.
  // The fixtures are loaded by full path because they live outside the
  // project tree — they're vendor reference data, not committed fixtures.
  const FIXTURES: ReadonlyArray<readonly [label: string, path: string]> = [
    ['R4.4.0', 'C:\\EB\\tresos\\autosar\\4.4.0\\AUTOSAR_MOD_ECUConfigurationParameters.arxml'],
    ['R19-11', 'C:\\EB\\tresos\\autosar\\R19-11\\AUTOSAR_MOD_ECUConfigurationParameters.arxml'],
    ['R20-11', 'C:\\EB\\tresos\\autosar\\R20-11\\AUTOSAR_MOD_ECUConfigurationParameters.arxml'],
    ['R21-11', 'C:\\EB\\tresos\\autosar\\R21-11\\AUTOSAR_MOD_ECUConfigurationParameters.arxml'],
  ];

  it.each(FIXTURES)('%s parses without unsupported-version', (_label, path) => {
    if (!existsSync(path)) {
      // Skip silently — vendor fixtures not installed in CI.
      return;
    }
    const xml = readFileSync(path, 'utf8');
    const r = parseArxml(xml);
    // Pre-fix this returned { ok: false, error: { kind: 'unsupported-version', version: 'unknown' } }.
    // Post-fix we expect either:
    //   (a) ok=true with a version string, OR
    //   (b) ok=false with kind='invalid-structure' (the strict reject from Task 4).
    // We only assert NOT 'unsupported-version' here — the strict-reject contract
    // is tested separately in Task 4.
    if (!r.ok) {
      expect(r.error.kind).not.toBe('unsupported-version');
    } else {
      expect(typeof r.value.version).toBe('string');
    }
  });
});