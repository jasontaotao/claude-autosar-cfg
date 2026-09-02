import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseOdxDocument } from '../odxDocument.js';
import { buildDim } from '../dimBuilder.js';

const realXml = readFileSync('samples/odx/Demo_Cdd.odx-d', 'utf8');

describe('buildDim', () => {
  it('builds the real Vector CANdela fixture', () => {
    const document = parseOdxDocument(realXml);
    const variant = document.importableVariants[0]!;
    const dim = buildDim({
      document,
      variantId: variant.odxId,
      sourcePath: 'Demo_Cdd.odx-d',
    });

    expect(dim.services.length).toBe(95);
    expect(dim.dataObjects.length).toBe(168);
    expect(dim.dtcs.length).toBe(99);
    expect(dim.sessions.length).toBeGreaterThan(0);
    expect(dim.securityLevels.length).toBeGreaterThan(0);
  });

  it('masks suppress-bit subfunctions and classifies services by SID', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <ODX>
        <DIAG-LAYER-CONTAINER>
          <BASE-VARIANT ID="_v">
            <DIAG-COMMS>
              <DIAG-SERVICE ID="_svc" SEMANTIC="SESSION">
                <SHORT-NAME>Session_Service</SHORT-NAME>
                <REQUEST-REF ID-REF="_req"/>
              </DIAG-SERVICE>
            </DIAG-COMMS>
            <REQUESTS>
              <REQUEST ID="_req">
                <PARAMS>
                  <PARAM SEMANTIC="SERVICE-ID"><SHORT-NAME>SID</SHORT-NAME><BYTE-POSITION>0</BYTE-POSITION><CODED-VALUE>0x10</CODED-VALUE></PARAM>
                  <PARAM SEMANTIC="SUBFUNCTION"><SHORT-NAME>Type</SHORT-NAME><BYTE-POSITION>1</BYTE-POSITION><CODED-VALUE>0x83</CODED-VALUE></PARAM>
                </PARAMS>
              </REQUEST>
            </REQUESTS>
          </BASE-VARIANT>
        </DIAG-LAYER-CONTAINER>
      </ODX>`;
    const dim = buildDim({
      document: parseOdxDocument(xml),
      variantId: '_v',
      sourcePath: 'synthetic',
    });

    expect(dim.services[0]?.serviceClass).toBe('DiagnosticSessionControl');
    expect(dim.services[0]?.sid).toBe(16);
    expect(dim.services[0]?.subFunction).toBe(3);
    expect(dim.sessions).toEqual([{ name: 'Session_Service', value: 3 }]);
  });

  it('pairs security access subfunctions and derives seed/key byte lengths', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <ODX>
        <DIAG-LAYER-CONTAINER>
          <BASE-VARIANT ID="_v">
            <DIAG-COMMS>
              <DIAG-SERVICE ID="_seed" SEMANTIC="SECURITY">
                <SHORT-NAME>RequestSeed</SHORT-NAME>
                <SDGS><SDG><SD SI="DiagInstanceQualifier">Level1</SD></SDG></SDGS>
                <REQUEST-REF ID-REF="_seedReq"/>
                <POS-RESPONSE-REFS><POS-RESPONSE-REF ID-REF="_seedPos"/></POS-RESPONSE-REFS>
              </DIAG-SERVICE>
              <DIAG-SERVICE ID="_key" SEMANTIC="SECURITY">
                <SHORT-NAME>SendKey</SHORT-NAME>
                <SDGS><SDG><SD SI="DiagInstanceQualifier">Level1</SD></SDG></SDGS>
                <REQUEST-REF ID-REF="_keyReq"/>
              </DIAG-SERVICE>
            </DIAG-COMMS>
            <DIAG-DATA-DICTIONARY-SPEC>
              <DATA-OBJECT-PROPS>
                <DATA-OBJECT-PROP ID="_dop">
                  <SHORT-NAME>FourBytes</SHORT-NAME>
                  <DIAG-CODED-TYPE BASE-DATA-TYPE="A_UINT32" xsi:type="STANDARD-LENGTH-TYPE"><BIT-LENGTH>32</BIT-LENGTH></DIAG-CODED-TYPE>
                </DATA-OBJECT-PROP>
              </DATA-OBJECT-PROPS>
            </DIAG-DATA-DICTIONARY-SPEC>
            <REQUESTS>
              <REQUEST ID="_seedReq">
                <PARAMS>
                  <PARAM SEMANTIC="SERVICE-ID"><SHORT-NAME>SID</SHORT-NAME><BYTE-POSITION>0</BYTE-POSITION><CODED-VALUE>39</CODED-VALUE></PARAM>
                  <PARAM SEMANTIC="SUBFUNCTION"><SHORT-NAME>Type</SHORT-NAME><BYTE-POSITION>1</BYTE-POSITION><CODED-VALUE>1</CODED-VALUE></PARAM>
                </PARAMS>
              </REQUEST>
              <REQUEST ID="_keyReq">
                <PARAMS>
                  <PARAM SEMANTIC="SERVICE-ID"><SHORT-NAME>SID</SHORT-NAME><BYTE-POSITION>0</BYTE-POSITION><CODED-VALUE>39</CODED-VALUE></PARAM>
                  <PARAM SEMANTIC="SUBFUNCTION"><SHORT-NAME>Type</SHORT-NAME><BYTE-POSITION>1</BYTE-POSITION><CODED-VALUE>2</CODED-VALUE></PARAM>
                  <PARAM SEMANTIC="DATA"><SHORT-NAME>Key</SHORT-NAME><BYTE-POSITION>2</BYTE-POSITION><DOP-REF ID-REF="_dop"/></PARAM>
                </PARAMS>
              </REQUEST>
            </REQUESTS>
            <POS-RESPONSES>
              <POS-RESPONSE ID="_seedPos">
                <PARAMS>
                  <PARAM SEMANTIC="DATA"><SHORT-NAME>Seed</SHORT-NAME><BYTE-POSITION>2</BYTE-POSITION><DOP-REF ID-REF="_dop"/></PARAM>
                </PARAMS>
              </POS-RESPONSE>
            </POS-RESPONSES>
          </BASE-VARIANT>
        </DIAG-LAYER-CONTAINER>
      </ODX>`;
    const dim = buildDim({
      document: parseOdxDocument(xml),
      variantId: '_v',
      sourcePath: 'synthetic',
    });

    expect(dim.securityLevels).toEqual([{ name: 'Level1', level: 1, seedBytes: 4, keyBytes: 4 }]);
  });

  it('derives session dependencies from PRE-CONDITION-STATE-REFS and validates DTC ranges', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <ODX>
        <DIAG-LAYER-CONTAINER>
          <BASE-VARIANT ID="_v">
            <DIAG-COMMS>
              <DIAG-SERVICE ID="_svc" SEMANTIC="STOREDDATA">
                <SHORT-NAME>ReadDid</SHORT-NAME>
                <PRE-CONDITION-STATE-REFS><PRE-CONDITION-STATE-REF ID-REF="_state"/></PRE-CONDITION-STATE-REFS>
                <REQUEST-REF ID-REF="_req"/>
              </DIAG-SERVICE>
            </DIAG-COMMS>
            <STATES><STATE ID="_state"><SHORT-NAME>ExtendedSession</SHORT-NAME></STATE></STATES>
            <DIAG-COMMS>
              <DIAG-SERVICE ID="_session" SEMANTIC="SESSION">
                <SHORT-NAME>ExtendedSession</SHORT-NAME>
                <REQUEST-REF ID-REF="_sessionReq"/>
              </DIAG-SERVICE>
            </DIAG-COMMS>
            <REQUESTS>
              <REQUEST ID="_req">
                <PARAMS><PARAM SEMANTIC="SERVICE-ID"><SHORT-NAME>SID</SHORT-NAME><BYTE-POSITION>0</BYTE-POSITION><CODED-VALUE>34</CODED-VALUE></PARAM></PARAMS>
              </REQUEST>
              <REQUEST ID="_sessionReq">
                <PARAMS>
                  <PARAM SEMANTIC="SERVICE-ID"><SHORT-NAME>SID</SHORT-NAME><BYTE-POSITION>0</BYTE-POSITION><CODED-VALUE>16</CODED-VALUE></PARAM>
                  <PARAM SEMANTIC="SUBFUNCTION"><SHORT-NAME>Type</SHORT-NAME><BYTE-POSITION>1</BYTE-POSITION><CODED-VALUE>3</CODED-VALUE></PARAM>
                </PARAMS>
              </REQUEST>
            </REQUESTS>
          </BASE-VARIANT>
          <ECU-SHARED-DATA ID="_shared">
            <DTCS>
              <DTC ID="_bad"><SHORT-NAME>BadDtc</SHORT-NAME><TROUBLE-CODE>99999999</TROUBLE-CODE></DTC>
              <DTC ID="_good"><SHORT-NAME>GoodDtc</SHORT-NAME><TROUBLE-CODE>0x123456</TROUBLE-CODE></DTC>
            </DTCS>
          </ECU-SHARED-DATA>
        </DIAG-LAYER-CONTAINER>
      </ODX>`;
    const dim = buildDim({
      document: parseOdxDocument(xml),
      variantId: '_v',
      sourcePath: 'synthetic',
    });

    const service = dim.services.find((item) => item.odxId === '_svc')!;
    expect(service.serviceClass).toBe('ReadDataByIdentifier');
    expect(service.sessionRefs).toEqual([3]);
    expect(dim.dtcs.find((dtc) => dtc.odxId === '_good')?.troubleCode).toBe(1193046);
    expect(dim.warnings.some((warning) => warning.code === 'odx-dtc-code-invalid')).toBe(true);
  });
});
