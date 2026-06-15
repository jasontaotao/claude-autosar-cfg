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

  // ---------- branch coverage gap fillers (parser.ts:295-314, 331, 366-370) ----------

  it('builds ArxmlReference from VALUE-REF with text content + DEST', () => {
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME></ECUC-MODULE-CONFIGURATION-VALUES><REFERENCE DEST="ECUC-PARAM-CONF-CONTAINER">/A/B/Ref</REFERENCE></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pkg = r.value.packages[0]!;
    expect(pkg.elements).toHaveLength(2);
    const ref = pkg.elements[1]!;
    expect(ref.kind).toBe('reference');
    if (ref.kind !== 'reference') return;
    expect(ref.tagName).toBe('REFERENCE');
    expect(ref.value).toBe('/A/B/Ref');
    expect(ref.dest).toBe('ECUC-PARAM-CONF-CONTAINER');
  });

  it('falls back to child <SHORT-NAME> when REFERENCE has no text', () => {
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME></ECUC-MODULE-CONFIGURATION-VALUES><VALUE-REF DEST="ECUC-REFERENCE-DEF"><SHORT-NAME>TargetElement</SHORT-NAME></VALUE-REF></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pkg = r.value.packages[0]!;
    const ref = pkg.elements[1]!;
    expect(ref.kind).toBe('reference');
    if (ref.kind !== 'reference') return;
    expect(ref.value).toBe('TargetElement');
    expect(ref.dest).toBe('ECUC-REFERENCE-DEF');
  });

  it('drops REFERENCE with neither text nor SHORT-NAME (no crash, no element emitted)', () => {
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME></ECUC-MODULE-CONFIGURATION-VALUES><REFERENCE DEST="ECUC-X"/></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pkg = r.value.packages[0]!;
    // Module survives; the empty REFERENCE is silently dropped by buildReference (value===undefined → null)
    expect(pkg.elements).toHaveLength(1);
    expect(pkg.elements[0]!.kind).toBe('module');
  });

  it('parses BOOLEAN param-value true/false into { type: "boolean" }', () => {
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME><PARAMETER-VALUES><ECUC-BOOLEAN-PARAM-VALUE><DEFINITION-REF DEST="ECUC-BOOLEAN-PARAM-DEF">/A/B/FlagOn</DEFINITION-REF><VALUE>true</VALUE></ECUC-BOOLEAN-PARAM-VALUE><ECUC-BOOLEAN-PARAM-VALUE><DEFINITION-REF DEST="ECUC-BOOLEAN-PARAM-DEF">/A/B/FlagOff</DEFINITION-REF><VALUE>false</VALUE></ECUC-BOOLEAN-PARAM-VALUE></PARAMETER-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
    const c = mod.children[0] as ArxmlContainer;
    expect(c.params['FlagOn']).toEqual({ type: 'boolean', value: true });
    expect(c.params['FlagOff']).toEqual({ type: 'boolean', value: false });
  });

  it('skips param wrapper with DEFINITION-REF but missing VALUE (no crash, key absent)', () => {
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME><PARAMETER-VALUES><ECUC-NUMERICAL-PARAM-VALUE><DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/A/B/HasValue</DEFINITION-REF><VALUE>42</VALUE></ECUC-NUMERICAL-PARAM-VALUE><ECUC-NUMERICAL-PARAM-VALUE><DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/A/B/NoValue</DEFINITION-REF></ECUC-NUMERICAL-PARAM-VALUE></PARAMETER-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
    const c = mod.children[0] as ArxmlContainer;
    expect(c.params['HasValue']).toEqual({ type: 'integer', value: 42 });
    expect(c.params['NoValue']).toBeUndefined();
    expect(Object.keys(c.params)).toHaveLength(1);
  });

  // ---------- Sprint 4 T1: DEST-aware ParamValue parsing ----------
  // EB tresos / Vector tools wrap boolean + string in NUMERICAL/TEXTUAL wrappers;
  // only <DEFINITION-REF DEST="..."> tells us the real schema type.

  it('parses BOOLEAN DEST inside NUMERICAL wrapper (EB tresos style) → boolean', () => {
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME><PARAMETER-VALUES><ECUC-NUMERICAL-PARAM-VALUE><DEFINITION-REF DEST="ECUC-BOOLEAN-PARAM-DEF">/A/B/FlagOn</DEFINITION-REF><VALUE>true</VALUE></ECUC-NUMERICAL-PARAM-VALUE></PARAMETER-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
    const c = mod.children[0] as ArxmlContainer;
    expect(c.params['FlagOn']).toEqual({ type: 'boolean', value: true });
  });

  it('parses BOOLEAN DEST (false) inside NUMERICAL wrapper → boolean(false)', () => {
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME><PARAMETER-VALUES><ECUC-NUMERICAL-PARAM-VALUE><DEFINITION-REF DEST="ECUC-BOOLEAN-PARAM-DEF">/A/B/FlagOff</DEFINITION-REF><VALUE>false</VALUE></ECUC-NUMERICAL-PARAM-VALUE></PARAMETER-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
    const c = mod.children[0] as ArxmlContainer;
    expect(c.params['FlagOff']).toEqual({ type: 'boolean', value: false });
  });

  it('parses STRING DEST inside TEXTUAL wrapper (ECUC-STRING-PARAM-DEF) → string', () => {
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME><PARAMETER-VALUES><ECUC-TEXTUAL-PARAM-VALUE><DEFINITION-REF DEST="ECUC-STRING-PARAM-DEF">/A/B/CddHeaderFile</DEFINITION-REF><VALUE>Det.c</VALUE></ECUC-TEXTUAL-PARAM-VALUE></PARAMETER-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
    const c = mod.children[0] as ArxmlContainer;
    expect(c.params['CddHeaderFile']).toEqual({ type: 'string', value: 'Det.c' });
  });

  it('parses FUNCTION-NAME DEST inside TEXTUAL wrapper (ECUC-FUNCTION-NAME-DEF) → string', () => {
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME><PARAMETER-VALUES><ECUC-TEXTUAL-PARAM-VALUE><DEFINITION-REF DEST="ECUC-FUNCTION-NAME-DEF">/A/B/WdgSetModeName</DEFINITION-REF><VALUE>Wdg_SetMode</VALUE></ECUC-TEXTUAL-PARAM-VALUE></PARAMETER-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
    const c = mod.children[0] as ArxmlContainer;
    expect(c.params['WdgSetModeName']).toEqual({ type: 'string', value: 'Wdg_SetMode' });
  });

  it('falls back to enum when TEXTUAL wrapper has no DEST (back-compat)', () => {
    // No @_DEST on DEFINITION-REF → wrapper-tag fallback kicks in.
    // TEXTUAL without DEST must remain 'enum' (per Sprint 4 plan §2.3 row 9).
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME><PARAMETER-VALUES><ECUC-TEXTUAL-PARAM-VALUE><DEFINITION-REF>/A/B/BusType</DEFINITION-REF><VALUE>LSB</VALUE></ECUC-TEXTUAL-PARAM-VALUE></PARAMETER-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
    const c = mod.children[0] as ArxmlContainer;
    expect(c.params['BusType']).toEqual({ type: 'enum', value: 'LSB' });
  });

  // ---------- Sprint 7 T1-A: <REFERENCE-VALUES> wrapper parsing ----------
  // 5 fixtures currently drop 2306 ECUC-REFERENCE-VALUE (cross-ref baseline=0).
  // The parser must surface these as type:'reference' params so cross-ref
  // validation can fire.

  describe('ECUC-REFERENCE-VALUE parsing', () => {
    it('case 1: standard REFERENCE-VALUES wrapper (Com/PduR shape) → type:reference with dest', () => {
      const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME><REFERENCE-VALUES><ECUC-REFERENCE-VALUE><DEFINITION-REF DEST="ECUC-REFERENCE-DEF">/EAS/Com/ComConfig/ComIPdu/ComPduIdRef</DEFINITION-REF><VALUE-REF DEST="ECUC-CONTAINER-VALUE">/EAS/EcuC/EcucPduCollection/Pdu/MyPdu</VALUE-REF></ECUC-REFERENCE-VALUE></REFERENCE-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
      const r = parseArxml(xml);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
      const c = mod.children[0] as ArxmlContainer;
      expect(c.params['ComPduIdRef']).toEqual({
        type: 'reference',
        value: '/EAS/EcuC/EcucPduCollection/Pdu/MyPdu',
        dest: 'ECUC-CONTAINER-VALUE',
      });
    });

    it('case 2: EcuC vendor dialect — ECUC-REFERENCE-VALUE nested in PARAMETER-VALUES with FOREIGN-REFERENCE-DEF', () => {
      const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME><PARAMETER-VALUES><ECUC-REFERENCE-VALUE><DEFINITION-REF DEST="ECUC-FOREIGN-REFERENCE-DEF">/EAS/EcuC/EcucPduCollection/Pdu/SysTPduToFrameMappingRef</DEFINITION-REF><VALUE-REF DEST="PDU-TO-FRAME-MAPPING" USER_DEF="false">PDU-TO-FRAME-MAPPING/</VALUE-REF></ECUC-REFERENCE-VALUE></PARAMETER-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
      const r = parseArxml(xml);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
      const c = mod.children[0] as ArxmlContainer;
      // PDU-TO-FRAME-MAPPING/ ends in '/' → unset placeholder, must NOT enter params
      expect(c.params['SysTPduToFrameMappingRef']).toBeUndefined();
      expect(Object.keys(c.params)).toHaveLength(0);
    });

    it('case 3: placeholder VALUE-REF (empty or trailing /) skipped — no reference param emitted', () => {
      const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME><REFERENCE-VALUES><ECUC-REFERENCE-VALUE><DEFINITION-REF DEST="ECUC-REFERENCE-DEF">/A/B/UnsetRef</DEFINITION-REF><VALUE-REF DEST="ECUC-CONTAINER-VALUE"></VALUE-REF></ECUC-REFERENCE-VALUE><ECUC-REFERENCE-VALUE><DEFINITION-REF DEST="ECUC-REFERENCE-DEF">/A/B/TrailingSlashRef</DEFINITION-REF><VALUE-REF DEST="ECUC-CONTAINER-VALUE">/A/B/</VALUE-REF></ECUC-REFERENCE-VALUE><ECUC-REFERENCE-VALUE><DEFINITION-REF DEST="ECUC-REFERENCE-DEF">/A/B/RealRef</DEFINITION-REF><VALUE-REF DEST="ECUC-CONTAINER-VALUE">/A/B/Target</VALUE-REF></ECUC-REFERENCE-VALUE></REFERENCE-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
      const r = parseArxml(xml);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
      const c = mod.children[0] as ArxmlContainer;
      expect(c.params['UnsetRef']).toBeUndefined();
      expect(c.params['TrailingSlashRef']).toBeUndefined();
      expect(c.params['RealRef']).toEqual({
        type: 'reference',
        value: '/A/B/Target',
        dest: 'ECUC-CONTAINER-VALUE',
      });
      expect(Object.keys(c.params)).toEqual(['RealRef']);
    });

    it('case 4: multiple ECUC-REFERENCE-VALUE under same REFERENCE-VALUES — each uses defPath tail as key, no key collision', () => {
      const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME><REFERENCE-VALUES><ECUC-REFERENCE-VALUE><DEFINITION-REF DEST="ECUC-REFERENCE-DEF">/EAS/Com/ComConfig/ComIPdu/ComPduIdRef</DEFINITION-REF><VALUE-REF DEST="ECUC-CONTAINER-VALUE">/EAS/EcuC/EcucPduCollection/Pdu/PduA</VALUE-REF></ECUC-REFERENCE-VALUE><ECUC-REFERENCE-VALUE><DEFINITION-REF DEST="ECUC-REFERENCE-DEF">/EAS/Com/ComConfig/ComIPdu/ComIPduGroupRef</DEFINITION-REF><VALUE-REF DEST="ECUC-CONTAINER-VALUE">/EAS/Com/ComConfig/ComIPduGroup/GroupA</VALUE-REF></ECUC-REFERENCE-VALUE><ECUC-REFERENCE-VALUE><DEFINITION-REF DEST="ECUC-REFERENCE-DEF">/EAS/Com/ComConfig/ComIPdu/ComIPduSignalRef</DEFINITION-REF><VALUE-REF DEST="ECUC-CONTAINER-VALUE">/EAS/Com/ComConfig/ComSignal/Sig1</VALUE-REF></ECUC-REFERENCE-VALUE></REFERENCE-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
      const r = parseArxml(xml);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
      const c = mod.children[0] as ArxmlContainer;
      expect(c.params['ComPduIdRef']).toEqual({
        type: 'reference',
        value: '/EAS/EcuC/EcucPduCollection/Pdu/PduA',
        dest: 'ECUC-CONTAINER-VALUE',
      });
      expect(c.params['ComIPduGroupRef']).toEqual({
        type: 'reference',
        value: '/EAS/Com/ComConfig/ComIPduGroup/GroupA',
        dest: 'ECUC-CONTAINER-VALUE',
      });
      expect(c.params['ComIPduSignalRef']).toEqual({
        type: 'reference',
        value: '/EAS/Com/ComConfig/ComSignal/Sig1',
        dest: 'ECUC-CONTAINER-VALUE',
      });
      expect(Object.keys(c.params).sort()).toEqual(
        ['ComIPduGroupRef', 'ComIPduSignalRef', 'ComPduIdRef'].sort(),
      );
    });

    it('case 5: USER_DEF attribute on VALUE-REF is ignored, parsing still produces type:reference', () => {
      const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME><REFERENCE-VALUES><ECUC-REFERENCE-VALUE><DEFINITION-REF DEST="ECUC-REFERENCE-DEF">/A/B/WithUserDef</DEFINITION-REF><VALUE-REF DEST="ECUC-CONTAINER-VALUE" USER_DEF="false">/A/B/Target</VALUE-REF></ECUC-REFERENCE-VALUE></REFERENCE-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
      const r = parseArxml(xml);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
      const c = mod.children[0] as ArxmlContainer;
      expect(c.params['WithUserDef']).toEqual({
        type: 'reference',
        value: '/A/B/Target',
        dest: 'ECUC-CONTAINER-VALUE',
      });
    });
  });
});
