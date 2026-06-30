import { describe, expect, it } from 'vitest';

import { parseBswmd } from '../bswmd.js';
import type { BswmdDocument, ModuleRefEntry } from '../bswmd.js';

describe('BswmdDocument.moduleRefs (C11)', () => {
  it('accepts document without moduleRefs (back-compat)', () => {
    const doc: BswmdDocument = {
      version: '4.6',
      modules: [],
      warnings: [],
    };
    expect(doc.moduleRefs).toBeUndefined();
  });

  it('accepts document with explicit MODULE-REF entries', () => {
    const entries: ReadonlyArray<ModuleRefEntry> = [
      { target: '/Vendor/Adc', source: '/Vendor/MyCollection' },
      { target: '/Vendor/Pwm', source: '/Vendor/MyCollection' },
    ];
    const doc: BswmdDocument = {
      version: '4.6',
      modules: [],
      warnings: [],
      moduleRefs: entries,
    };
    expect(doc.moduleRefs).toEqual(entries);
  });

  it('parses a single MODULE-REF from parseBswmd end-to-end', () => {
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Vendor</SHORT-NAME>
      <ELEMENTS>
        <MODULE-REF>/Vendor/AdcCfg</MODULE-REF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;
    const result = parseBswmd(xml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moduleRefs).toEqual([{ target: '/Vendor/AdcCfg', source: '/Vendor' }]);
  });

  it('attributes nested MODULE-REF source to the parent AR-PACKAGE (depth 2+)', () => {
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Vendor</SHORT-NAME>
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>Adc</SHORT-NAME>
          <ELEMENTS>
            <MODULE-REF>/Vendor/AdcCfg</MODULE-REF>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;
    const result = parseBswmd(xml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moduleRefs).toEqual([{ target: '/Vendor/AdcCfg', source: '/Vendor/Adc' }]);
  });

  it('parses a BSWMD without MODULE-REF with moduleRefs undefined (back-compat)', () => {
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Vendor</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Adc</SHORT-NAME>
          <CONTAINERS/>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;
    const result = parseBswmd(xml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moduleRefs).toBeUndefined();
  });
});
