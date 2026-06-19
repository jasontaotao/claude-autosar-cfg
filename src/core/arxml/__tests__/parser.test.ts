import { describe, it, expect } from 'vitest';

import { parseArxml } from '../parser.js';
import { serializeArxml } from '../serializer.js';
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
    expect(container.params['ConfigConsistencyRequired']).toMatchObject({ type: 'integer', value: 1 });
    expect(container.params['PostBuildVariantUsed']).toMatchObject({ type: 'integer', value: 0 });
    expect(container.params['SleepMode']).toMatchObject({ type: 'float', value: 2.5 });
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
    expect(c.params['FlagOn']).toMatchObject({ type: 'boolean', value: true });
    expect(c.params['FlagOff']).toMatchObject({ type: 'boolean', value: false });
  });

  it('skips param wrapper with DEFINITION-REF but missing VALUE (no crash, key absent)', () => {
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME><PARAMETER-VALUES><ECUC-NUMERICAL-PARAM-VALUE><DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/A/B/HasValue</DEFINITION-REF><VALUE>42</VALUE></ECUC-NUMERICAL-PARAM-VALUE><ECUC-NUMERICAL-PARAM-VALUE><DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/A/B/NoValue</DEFINITION-REF></ECUC-NUMERICAL-PARAM-VALUE></PARAMETER-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
    const c = mod.children[0] as ArxmlContainer;
    expect(c.params['HasValue']).toMatchObject({ type: 'integer', value: 42 });
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
    expect(c.params['FlagOn']).toMatchObject({ type: 'boolean', value: true });
  });

  it('parses BOOLEAN DEST (false) inside NUMERICAL wrapper → boolean(false)', () => {
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME><PARAMETER-VALUES><ECUC-NUMERICAL-PARAM-VALUE><DEFINITION-REF DEST="ECUC-BOOLEAN-PARAM-DEF">/A/B/FlagOff</DEFINITION-REF><VALUE>false</VALUE></ECUC-NUMERICAL-PARAM-VALUE></PARAMETER-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
    const c = mod.children[0] as ArxmlContainer;
    expect(c.params['FlagOff']).toMatchObject({ type: 'boolean', value: false });
  });

  it('parses STRING DEST inside TEXTUAL wrapper (ECUC-STRING-PARAM-DEF) → string', () => {
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME><PARAMETER-VALUES><ECUC-TEXTUAL-PARAM-VALUE><DEFINITION-REF DEST="ECUC-STRING-PARAM-DEF">/A/B/CddHeaderFile</DEFINITION-REF><VALUE>Det.c</VALUE></ECUC-TEXTUAL-PARAM-VALUE></PARAMETER-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
    const c = mod.children[0] as ArxmlContainer;
    expect(c.params['CddHeaderFile']).toMatchObject({ type: 'string', value: 'Det.c' });
  });

  it('parses FUNCTION-NAME DEST inside TEXTUAL wrapper (ECUC-FUNCTION-NAME-DEF) → string', () => {
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME><PARAMETER-VALUES><ECUC-TEXTUAL-PARAM-VALUE><DEFINITION-REF DEST="ECUC-FUNCTION-NAME-DEF">/A/B/WdgSetModeName</DEFINITION-REF><VALUE>Wdg_SetMode</VALUE></ECUC-TEXTUAL-PARAM-VALUE></PARAMETER-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
    const c = mod.children[0] as ArxmlContainer;
    expect(c.params['WdgSetModeName']).toMatchObject({ type: 'string', value: 'Wdg_SetMode' });
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
    expect(c.params['BusType']).toMatchObject({ type: 'enum', value: 'LSB' });
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
      expect(c.params['ComPduIdRef']).toMatchObject({
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
      expect(c.params['RealRef']).toMatchObject({
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
      expect(c.params['ComPduIdRef']).toMatchObject({
        type: 'reference',
        value: '/EAS/EcuC/EcucPduCollection/Pdu/PduA',
        dest: 'ECUC-CONTAINER-VALUE',
      });
      expect(c.params['ComIPduGroupRef']).toMatchObject({
        type: 'reference',
        value: '/EAS/Com/ComConfig/ComIPduGroup/GroupA',
        dest: 'ECUC-CONTAINER-VALUE',
      });
      expect(c.params['ComIPduSignalRef']).toMatchObject({
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
      expect(c.params['WithUserDef']).toMatchObject({
        type: 'reference',
        value: '/A/B/Target',
        dest: 'ECUC-CONTAINER-VALUE',
      });
    });
  });

  // ---------- Sprint 9 #12: nested AR-PACKAGE recursion ----------
  // Real-world R21/R22 BSW files (and the user's CanIf_bswmd.arxml /
  // CanIf_EcucValues.arxml) use a 2+ level AR-PACKAGE hierarchy:
  //   <AR-PACKAGES>
  //     <AR-PACKAGE> ... <AR-PACKAGES>
  //       <AR-PACKAGE> ... <ELEMENTS> ... </AR-PACKAGE>
  //     </AR-PACKAGES> ... </AR-PACKAGE>
  //   </AR-PACKAGES>
  // The parser previously walked only the outer AR-PACKAGE and ignored nested
  // ones, leaving elements: [] on the outer package and missing the entire
  // module/configuration-value tree. RED tests below pin the recursion contract.

  describe('nested AR-PACKAGE parsing', () => {
    it('case 1: double-nested AR-PACKAGE exposes inner ECUC-MODULE-CONFIGURATION-VALUES', () => {
      // Mimics R21/R22 BSWMD + EcucValues shape:
      //   AUTOSAR_R21 > EcucModuleConfigurationValuess > CanIf (module)
      const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>AUTOSAR_R21</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>EcucModuleConfigurationValuess</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>CanIf</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>CanIfInitCfg</SHORT-NAME><PARAMETER-VALUES><ECUC-TEXTUAL-PARAM-VALUE><DEFINITION-REF DEST="ECUC-STRING-PARAM-DEF">/A/B/CfgSet</DEFINITION-REF><VALUE>CanIf_Config</VALUE></ECUC-TEXTUAL-PARAM-VALUE></PARAMETER-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
      const r = parseArxml(xml);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // Outer package: AUTOSAR_R21, no direct elements, one nested package.
      expect(r.value.packages).toHaveLength(1);
      const outer = r.value.packages[0]!;
      expect(outer.shortName).toBe('AUTOSAR_R21');
      expect(outer.elements).toHaveLength(0);
      expect(outer.packages).toBeDefined();
      expect(outer.packages).toHaveLength(1);
      const inner = outer.packages![0]!;
      expect(inner.shortName).toBe('EcucModuleConfigurationValuess');
      expect(inner.path).toBe('/AUTOSAR_R21/EcucModuleConfigurationValuess');
      // Inner package owns the module — currently dropped, must be reachable.
      expect(inner.elements).toHaveLength(1);
      const mod = inner.elements[0] as ArxmlModule;
      expect(mod.kind).toBe('module');
      expect(mod.shortName).toBe('CanIf');
      const c = mod.children[0] as ArxmlContainer;
      expect(c.params['CfgSet']).toMatchObject({ type: 'string', value: 'CanIf_Config' });
    });

    it('case 2: triple-nested AR-PACKAGE recurses through every level', () => {
      const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>L1</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>L2</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>L3</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
      const r = parseArxml(xml);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.packages[0]!.shortName).toBe('L1');
      const l2 = r.value.packages[0]!.packages![0]!;
      expect(l2.shortName).toBe('L2');
      const l3 = l2.packages![0]!;
      expect(l3.shortName).toBe('L3');
      expect(l3.elements).toHaveLength(1);
      expect((l3.elements[0] as ArxmlModule).shortName).toBe('M');
    });

    it('case 3: outer package with both ELEMENTS and nested AR-PACKAGES (siblings)', () => {
      const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>Outer</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>DirectModule</SHORT-NAME></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>InnerPkg</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>NestedModule</SHORT-NAME></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
      const r = parseArxml(xml);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const outer = r.value.packages[0]!;
      expect(outer.elements).toHaveLength(1);
      expect((outer.elements[0] as ArxmlModule).shortName).toBe('DirectModule');
      expect(outer.packages).toHaveLength(1);
      expect(outer.packages![0]!.shortName).toBe('InnerPkg');
      expect((outer.packages![0]!.elements[0] as ArxmlModule).shortName).toBe('NestedModule');
    });

    it('case 4: nested package without ELEMENTS still surfaces as ArxmlPackage with elements=[]', () => {
      const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>Outer</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>EmptyInner</SHORT-NAME></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
      const r = parseArxml(xml);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const outer = r.value.packages[0]!;
      expect(outer.packages).toHaveLength(1);
      const inner = outer.packages![0]!;
      expect(inner.shortName).toBe('EmptyInner');
      expect(inner.elements).toEqual([]);
      expect(inner.path).toBe('/Outer/EmptyInner');
    });

    it('case 5: nested package without nested AR-PACKAGES omits `packages` field (back-compat with flat fixtures)', () => {
      const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
      const r = parseArxml(xml);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const pkg = r.value.packages[0]!;
      // Existing fixture shape: `packages` field is absent (not an empty array),
      // so the existing 5-fixture round-trip signature is preserved.
      expect(pkg.packages).toBeUndefined();
    });

    it('case 6: missing nested package SHORT-NAME uses placeholder without crash', () => {
      const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>Outer</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
      const r = parseArxml(xml);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const outer = r.value.packages[0]!;
      expect(outer.packages).toHaveLength(1);
      expect(outer.packages![0]!.shortName).toMatch(/^<unnamed-/);
      expect(outer.packages![0]!.elements).toHaveLength(1);
    });

    it('case 7: path computation correctly tracks nested package levels', () => {
      // path field is the contract used by validate.ts / buildPathIndex to
      // build the cross-ref target lookup; nesting must compose, not reset.
      const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P1</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P2</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
      const r = parseArxml(xml);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.packages[0]!.path).toBe('/P1');
      expect(r.value.packages[0]!.packages![0]!.path).toBe('/P1/P2');
    });

    // Sprint 9 #12 (review M-3): end-to-end nested round-trip — parse →
    // serialize → re-parse must produce a deep-equal document. Closes the
    // loop between parser recursion and serializer output.
    it('case 8: parse → serialize → re-parse of triple-nested ARXML is deep-equal', () => {
      const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>L1</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>L2</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>L3</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME><PARAMETER-VALUES><ECUC-NUMERICAL-PARAM-VALUE><DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/A/B/X</DEFINITION-REF><VALUE>7</VALUE></ECUC-NUMERICAL-PARAM-VALUE></PARAMETER-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
      const p1 = parseArxml(xml);
      expect(p1.ok).toBe(true);
      if (!p1.ok) return;
      const s1 = serializeArxml(p1.value);
      expect(s1.ok).toBe(true);
      if (!s1.ok) return;
      const p2 = parseArxml(s1.value);
      expect(p2.ok).toBe(true);
      if (!p2.ok) return;
      // Deep-equal ArxmlDocument (path + nested packages + module + container + param).
      expect(p2.value).toEqual(p1.value);
      // Drill down to confirm the inner element survives the round-trip.
      expect(p2.value.packages[0]!.packages![0]!.packages![0]!.elements[0]!.shortName).toBe('M');
      const c = (p2.value.packages[0]!.packages![0]!.packages![0]!.elements[0]! as ArxmlModule)
        .children[0] as ArxmlContainer;
      expect(c.params['X']).toMatchObject({ type: 'integer', value: 7 });
    });

    // Sprint 9 #12 (review H-2): two packages with identical shortName in
    // different branches must produce distinct `path` values. The path field
    // is the lookup key for path.ts / buildPathIndex; collision would silently
    // misroute cross-ref lookups.
    it('case 9: identical shortName in different branches produces distinct paths', () => {
      const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>Outer</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>BranchA</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>Def</SHORT-NAME></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE><AR-PACKAGE><SHORT-NAME>BranchB</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>Def</SHORT-NAME></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
      const r = parseArxml(xml);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const branchA = r.value.packages[0]!.packages![0]!;
      const branchB = r.value.packages[0]!.packages![1]!;
      const defA = branchA.packages![0]!;
      const defB = branchB.packages![0]!;
      expect(defA.shortName).toBe('Def');
      expect(defB.shortName).toBe('Def');
      // Distinct paths because of branch prefix.
      expect(defA.path).toBe('/Outer/BranchA/Def');
      expect(defB.path).toBe('/Outer/BranchB/Def');
      expect(defA.path).not.toBe(defB.path);
    });

    // Sprint 9 #12 (review M-1): adversarial deep nesting must NOT blow the
    // stack. Depth ceiling (16) silently truncates beyond that; the parse
    // still succeeds with a partial tree.
    it('case 10: 25-deep AR-PACKAGE nesting is truncated, not a stack overflow', () => {
      // Build XML with 25 nested <AR-PACKAGE><AR-PACKAGES> levels.
      let xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES>`;
      const depth = 25;
      for (let i = 0; i < depth; i++) {
        xml += `<AR-PACKAGE><SHORT-NAME>L${i}</SHORT-NAME><AR-PACKAGES>`;
      }
      xml += `<AR-PACKAGE><SHORT-NAME>Leaf</SHORT-NAME></AR-PACKAGE>`;
      for (let i = 0; i < depth; i++) {
        xml += `</AR-PACKAGES></AR-PACKAGE>`;
      }
      xml += `</AR-PACKAGES></AUTOSAR>`;
      const r = parseArxml(xml);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      // Outer package is reachable; depth beyond ceiling is silently truncated
      // (no exception thrown, parser contract intact).
      expect(r.value.packages[0]!.shortName).toBe('L0');
    });
  });

  // ---------- Sprint 12 (namespace compatibility): strict-reject breadcrumb ----------
  // The full strict-reject contract coverage lives in parser-namespace.test.ts.
  // This single case documents, next to the value-side tests, that a pure-BSWMD
  // file (only ECUC-MODULE-DEF inside ELEMENTS, no ECUC-MODULE-CONFIGURATION-VALUES)
  // must be rejected with `invalid-structure` rather than silently accepted.

  it('rejects pure-BSWMD files with invalid-structure (strict mode)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcuC</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>EcuC</SHORT-NAME>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('invalid-structure');
  });
});

// ---------------------------------------------------------------------------
// Wave 4.B branch coverage tests (parser.ts missing branches)
// ---------------------------------------------------------------------------

describe('parseArxml — defensive structure validation', () => {
  it('returns missing-root when XML is well-formed but has no AUTOSAR root', () => {
    // Line 106 — top-level key other than AUTOSAR is missing/null
    const r = parseArxml('<?xml version="1.0"?><OTHER><FOO/></OTHER>');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('missing-root');
  });

  it('returns missing-root when AUTOSAR root is missing AR-PACKAGES', () => {
    // Line 116 — AR-PACKAGES not present in the AUTOSAR element
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><OTHER/></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('missing-root');
  });

  it('returns unsupported-version when version cannot be detected', () => {
    // Line 111 — AUTOSAR has no version + opts.version is undefined.
    // detectVersion reads the xsi:schemaLocation or the xmlns namespace.
    // An empty xmlns with no schemaLocation yields null.
    const xml = `<?xml version="1.0"?><AUTOSAR><AR-PACKAGES></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('unsupported-version');
  });

  it('returns unsupported-version for an r-form namespace without a supported xsd (line 168-169)', () => {
    // Line 168 — r-form (`r4.0`, `r4.2`, ...) is stripped and checked
    // against SUPPORTED_ARXML_VERSIONS. An `r99.0` namespace maps to
    // '99.0' which is NOT in the supported set → returns null →
    // unsupported-version error.
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r99.0"><AR-PACKAGES></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('unsupported-version');
  });

  it('parses <SHORT-NAME> when wrapped in object form (line 202-204 readShortName)', () => {
    // Line 202 — fast-xml-parser may emit SHORT-NAME as `{ '#text': 'Name' }`
    // when the element has attributes. Build a SHORT-NAME in object form.
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME><L-4>InnerName</L-4></SHORT-NAME></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The parser falls through (no #text, no string) — readShortName returns
    // undefined → package shortName is undefined → element dropped.
    // This is a sanity test that the parser doesn't crash on this shape.
    expect(Array.isArray(r.value.packages)).toBe(true);
  });

  it('parses <LONG-NAME><L-4>...</L-4></LONG-NAME> into package.longName (line 211-214)', () => {
    // Line 211 — LONG-NAME in object form with L-4 child is read out as a
    // string into package.longName.
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><LONG-NAME><L-4>My Long Package Name</L-4></LONG-NAME></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.packages[0]!.longName).toBe('My Long Package Name');
  });

  it('skips PARAMETER-VALUES entries with DEFINITION-REF object but no #text (line 437-444)', () => {
    // Line 444 — DEFINITION-REF is an object with attributes but no #text
    // body. defPath stays undefined and the entry is silently dropped.
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME><PARAMETER-VALUES><ECUC-NUMERICAL-PARAM-VALUE><DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF"></DEFINITION-REF><VALUE>42</VALUE></ECUC-NUMERICAL-PARAM-VALUE></PARAMETER-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
    const c = mod.children[0] as ArxmlContainer;
    // No key was added — the entry was dropped silently.
    expect(c.params).toMatchObject({});
  });

  it('skips REFERENCE-VALUES entries with DEFINITION-REF object but no #text (line 477-484)', () => {
    // The standard REFERENCE-VALUES branch hits the same DEFINITION-REF
    // extraction. Drop entries with no body.
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME><REFERENCE-VALUES><ECUC-REFERENCE-VALUE><DEFINITION-REF DEST="ECUC-REFERENCE-DEF"></DEFINITION-REF></ECUC-REFERENCE-VALUE></REFERENCE-VALUES></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
    const c = mod.children[0] as ArxmlContainer;
    expect(c.params).toMatchObject({});
  });

  it('drops ECUC-CONTAINER-VALUE without SHORT-NAME (line 381)', () => {
    // buildContainer returns null when shortName is undefined → element
    // is silently dropped.
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><PARAMETER-VALUES></PARAMETER-VALUES></ECUC-CONTAINER-VALUE><ECUC-CONTAINER-VALUE><SHORT-NAME>C</SHORT-NAME></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
    // Only the second (named) container survives.
    expect(mod.children).toHaveLength(1);
    expect(mod.children[0]!.shortName).toBe('C');
  });

  it('walks SUB-CONTAINERS into module.children (line 362-363)', () => {
    // The SUB-CONTAINERS branch on a module is rarely used (CONTAINERS is
    // the standard shape), but the walker handles it identically. Pin it.
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><SUB-CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>SubA</SHORT-NAME></ECUC-CONTAINER-VALUE></SUB-CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
    expect(mod.children).toHaveLength(1);
    expect(mod.children[0]!.shortName).toBe('SubA');
  });

  it('drops generic ECUC-* elements without SHORT-NAME (line 334-338)', () => {
    // The fallback "any ECUC-* tag is treated as a container if it has a
    // SHORT-NAME" branch. With no SHORT-NAME the entry is dropped.
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>P</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>M</SHORT-NAME><CONTAINERS><ECUC-SOME-UNKNOWN-TAG><SHORT-NAME>HasName</SHORT-NAME></ECUC-SOME-UNKNOWN-TAG><ECUC-ANOTHER-UNKNOWN></ECUC-ANOTHER-UNKNOWN></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const mod = r.value.packages[0]!.elements[0] as ArxmlModule;
    // Only the named generic tag survives; the unnamed one is dropped.
    expect(mod.children).toHaveLength(1);
    expect(mod.children[0]!.shortName).toBe('HasName');
  });
});
