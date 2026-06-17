import { readFileSync, existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseArxml } from '../parser.js';
import { serializeArxml } from '../serializer.js';
import type { ArxmlDocument } from '../types.js';

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

  for (const [label, path] of FIXTURES) {
    // Skipped via vitest runIf when vendor fixtures are not installed in CI —
    // reported as `skipped` rather than a vacuous `passed`.
    it.runIf(existsSync(path))(`${label} parses without unsupported-version`, () => {
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
  }
});

describe('BSWMD-as-value strict reject', () => {
  const PURE_BSWMD = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcuC</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>EcuC</SHORT-NAME>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>EcuCGeneral</SHORT-NAME>
              <PARAMETERS>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>SleepMode</SHORT-NAME>
                  <MIN>0</MIN>
                  <MAX>10</MAX>
                </ECUC-INTEGER-PARAM-DEF>
              </PARAMETERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

  it('rejects pure BSWMD with invalid-structure and hint message', () => {
    const r = parseArxml(PURE_BSWMD);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('invalid-structure');
    if (r.error.kind !== 'invalid-structure') return;
    expect(r.error.message).toMatch(/BSWMD|BSW Module Description|Load BSWMD/i);
  });

  const MIXED = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Mixed</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>Can</SHORT-NAME>
          <CONTAINERS>
            <ECUC-CONTAINER-VALUE>
              <SHORT-NAME>CanConfigSet</SHORT-NAME>
              <PARAMETER-VALUES>
                <ECUC-NUMERICAL-PARAM-VALUE>
                  <DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/X</DEFINITION-REF>
                  <VALUE>1</VALUE>
                </ECUC-NUMERICAL-PARAM-VALUE>
              </PARAMETER-VALUES>
            </ECUC-CONTAINER-VALUE>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Schema</SHORT-NAME>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

  it('parses mixed (value + def) files successfully', () => {
    const r = parseArxml(MIXED);
    expect(r.ok).toBe(true);
  });

  const VALUE_ONLY = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Values</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>Can</SHORT-NAME>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

  it('parses value-only files successfully (regression)', () => {
    const r = parseArxml(VALUE_ONLY);
    expect(r.ok).toBe(true);
  });
});

describe('serializer version fidelity', () => {
  const mkDoc = (v: '4.2' | '4.6' | '00046' | '00049'): ArxmlDocument => ({
    path: '/test.arxml',
    version: v,
    packages: [
      {
        shortName: 'P',
        path: '/P',
        elements: [
          {
            kind: 'module',
            tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
            shortName: 'M',
            params: {},
            children: [],
            references: [],
          },
        ],
      },
    ],
  });

  it.each(['4.2', '4.6', '00046', '00049'] as const)(
    'serializes %s with the matching xsd file name',
    (v) => {
      const r = serializeArxml(mkDoc(v));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      if (v === '4.2') {
        expect(r.value).toMatch(/AUTOSAR_4-2-2\.xsd/);
      } else if (v === '4.6') {
        expect(r.value).toMatch(/AUTOSAR_4-6-0\.xsd/);
      } else if (v === '00046') {
        expect(r.value).toMatch(/AUTOSAR_00046\.xsd/);
      } else if (v === '00049') {
        expect(r.value).toMatch(/AUTOSAR_00049\.xsd/);
      }
    },
  );

  it.each(['00046', '00048', '00049', '00050'] as const)(
    'round-trips a 5-digit-versioned document (%s)',
    (v) => {
      const doc = mkDoc(v);
      const ser = serializeArxml(doc);
      expect(ser.ok).toBe(true);
      if (!ser.ok) return;
      const re = parseArxml(ser.value);
      expect(re.ok).toBe(true);
      if (!re.ok) return;
      expect(re.value.version).toBe(v);
    },
  );
});
