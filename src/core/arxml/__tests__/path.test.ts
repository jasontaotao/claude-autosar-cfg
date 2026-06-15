import { describe, it, expect } from 'vitest';

import { parseArxml } from '../parser.js';
import { packageByPath, findByPath, paramsEqual } from '../path.js';

const NESTED_XML = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES>
  <AR-PACKAGE><SHORT-NAME>EAS</SHORT-NAME><ELEMENTS>
    <ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>EcuC</SHORT-NAME>
      <CONTAINERS>
        <ECUC-CONTAINER-VALUE><SHORT-NAME>EcuCGeneral</SHORT-NAME>
          <PARAMETER-VALUES>
            <ECUC-NUMERICAL-PARAM-VALUE>
              <DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/EAS/EcuC/EcuCGeneral/ConfigConsistencyRequired</DEFINITION-REF>
              <VALUE>1</VALUE>
            </ECUC-NUMERICAL-PARAM-VALUE>
          </PARAMETER-VALUES>
          <SUB-CONTAINERS>
            <ECUC-CONTAINER-VALUE><SHORT-NAME>Inner</SHORT-NAME>
              <PARAMETER-VALUES>
                <ECUC-NUMERICAL-PARAM-VALUE>
                  <DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/EAS/EcuC/EcuCGeneral/Inner/DeepParam</DEFINITION-REF>
                  <VALUE>42</VALUE>
                </ECUC-NUMERICAL-PARAM-VALUE>
              </PARAMETER-VALUES>
            </ECUC-CONTAINER-VALUE>
          </SUB-CONTAINERS>
        </ECUC-CONTAINER-VALUE>
      </CONTAINERS>
    </ECUC-MODULE-CONFIGURATION-VALUES>
  </ELEMENTS></AR-PACKAGE>
</AR-PACKAGES></AUTOSAR>`;

describe('path helpers', () => {
  it('packageByPath hits and misses', () => {
    const r = parseArxml(NESTED_XML);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(packageByPath(r.value, '/EAS')).not.toBeNull();
    expect(packageByPath(r.value, '/Missing')).toBeNull();
  });

  it('findByPath navigates three-segment nested element', () => {
    const r = parseArxml(NESTED_XML);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const found = findByPath(r.value, '/EAS/EcuC/EcuCGeneral');
    expect(found).not.toBeNull();
    expect(found?.element.kind).toBe('container');
    if (found?.element.kind !== 'container') return;
    expect(found.element.shortName).toBe('EcuCGeneral');
  });

  it('findByPath navigates five-segment deep element', () => {
    const r = parseArxml(NESTED_XML);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const found = findByPath(r.value, '/EAS/EcuC/EcuCGeneral/Inner/DeepParam');
    // DeepParam is a key inside Inner.params, not a separate element node — findByPath
    // returns null when the final segment isn't a navigable element. Document this:
    expect(found).toBeNull();
  });

  it('paramsEqual is key-order independent', () => {
    const a = { x: { type: 'integer', value: 1 }, y: 'foo' };
    const b = { y: 'foo', x: { type: 'integer', value: 1 } };
    const c = { x: { type: 'integer', value: 1 }, y: 'bar' };
    expect(paramsEqual(a, b)).toBe(true);
    expect(paramsEqual(a, c)).toBe(false);
    expect(paramsEqual(a, {})).toBe(false);
  });

  // ---------- Sprint 9 #12 (review H-1) ----------
  // The H-1 finding was that packageByPath/findByPath did not descend into
  // nested <AR-PACKAGES>. Without these tests a regression in the recursive
  // helper would silently break cross-ref lookup for R21/R22 BSW files.

  it('packageByPath resolves nested packages (R21/R22 shape)', () => {
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>AUTOSAR_R22</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>EcucDefs</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>CanIf</SHORT-NAME></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Outer root still resolves.
    expect(packageByPath(r.value, '/AUTOSAR_R22')?.shortName).toBe('AUTOSAR_R22');
    // Nested leaf now resolves (was the regression).
    const nested = packageByPath(r.value, '/AUTOSAR_R22/EcucDefs');
    expect(nested).not.toBeNull();
    expect(nested?.shortName).toBe('EcucDefs');
  });

  it('findByPath navigates through a nested package to reach a leaf element', () => {
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>AUTOSAR_R22</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>EcucDefs</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>CanIf</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>CanIfInitCfg</SHORT-NAME></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const found = findByPath(r.value, '/AUTOSAR_R22/EcucDefs/CanIf/CanIfInitCfg');
    expect(found).not.toBeNull();
    expect(found?.element.kind).toBe('container');
    if (found?.element.kind !== 'container') return;
    expect(found.element.shortName).toBe('CanIfInitCfg');
  });
});
