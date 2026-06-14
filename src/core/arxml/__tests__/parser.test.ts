import { describe, it, expect } from 'vitest';

import { parseArxml } from '../parser.js';
import type { ArxmlModule, ArxmlContainer } from '../types.js';

const MINIMAL_R46 = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EAS</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>EcuC</SHORT-NAME>
          <DEFINITION-REF DEST="ECUC-MODULE-DEF">/EAS/EcuC</DEFINITION-REF>
          <CONTAINERS>
            <ECUC-CONTAINER-VALUE>
              <SHORT-NAME>EcuCGeneralConfiguration</SHORT-NAME>
              <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER">/EAS/EcuC/EcuCGeneral</DEFINITION-REF>
              <PARAMETER-VALUES>
                <ECUC-NUMERICAL-PARAM-VALUE>
                  <DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/EAS/EcuC/EcuCGeneral/ConfigConsistencyRequired</DEFINITION-REF>
                  <VALUE>1</VALUE>
                </ECUC-NUMERICAL-PARAM-VALUE>
                <ECUC-NUMERICAL-PARAM-VALUE>
                  <DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/EAS/EcuC/EcuCGeneral/PostBuildVariantUsed</DEFINITION-REF>
                  <VALUE>0</VALUE>
                </ECUC-NUMERICAL-PARAM-VALUE>
                <ECUC-NUMERICAL-PARAM-VALUE>
                  <DEFINITION-REF DEST="ECUC-FLOAT-PARAM-DEF">/EAS/EcuC/EcuCGeneral/SleepMode</DEFINITION-REF>
                  <VALUE>2.5</VALUE>
                </ECUC-NUMERICAL-PARAM-VALUE>
              </PARAMETER-VALUES>
            </ECUC-CONTAINER-VALUE>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

describe('parseArxml', () => {
  it('parses a minimal r4.6 ECUC module with 3 params', () => {
    const r = parseArxml(MINIMAL_R46);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.version).toBe('4.6');
    expect(r.value.packages).toHaveLength(1);
    const pkg = r.value.packages[0]!;
    expect(pkg.shortName).toBe('EAS');
    expect(pkg.elements).toHaveLength(1);
    const mod = pkg.elements[0] as ArxmlModule;
    expect(mod.kind).toBe('module');
    expect(mod.shortName).toBe('EcuC');
    expect(mod.children).toHaveLength(1);
    const container = mod.children[0] as ArxmlContainer;
    expect(container.kind).toBe('container');
    expect(container.shortName).toBe('EcuCGeneralConfiguration');
    const keys = Object.keys(container.params);
    expect(keys).toHaveLength(3);
    expect(container.params['ConfigConsistencyRequired']).toEqual({ type: 'integer', value: 1 });
    expect(container.params['PostBuildVariantUsed']).toEqual({ type: 'integer', value: 0 });
    expect(container.params['SleepMode']).toEqual({ type: 'float', value: 2.5 });
  });

  it('extracts DEST attribute on DEFINITION-REF references', () => {
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><DEFINITION-REF DEST="ECUC-MODULE-DEF">/A/B/M</DEFINITION-REF></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
    expect(mod.references).toContain('ECUC-MODULE-DEF:/A/B/M');
  });

  it('returns Result.err for malformed XML', () => {
    const r = parseArxml('<AUTOSAR><AR-PACKAGES><AR-PACKAGE>');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('xml-malformed');
  });
});