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
});