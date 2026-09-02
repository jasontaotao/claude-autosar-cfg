import { describe, expect, it } from 'vitest';

import { parseOdxDocument } from '../odxDocument.js';
import { resolveLayer } from '../layerResolver.js';
import { resolveDataObjects } from '../dopResolver.js';

function odxWithDops(dops: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <ODX>
      <DIAG-LAYER-CONTAINER>
        <BASE-VARIANT ID="_variant">
          <DIAG-DATA-DICTIONARY-SPEC>${dops}</DIAG-DATA-DICTIONARY-SPEC>
        </BASE-VARIANT>
      </DIAG-LAYER-CONTAINER>
    </ODX>`;
}

function resolve(xml: string) {
  const doc = parseOdxDocument(xml);
  return resolveDataObjects(resolveLayer(doc, '_variant'));
}

describe('resolveDataObjects', () => {
  it('resolves IDENTICAL with STANDARD-LENGTH-TYPE', () => {
    const result = resolve(
      odxWithDops(`
        <DATA-OBJECT-PROPS>
          <DATA-OBJECT-PROP ID="_uint16">
            <SHORT-NAME>UInt16</SHORT-NAME>
            <COMPU-METHOD><CATEGORY>IDENTICAL</CATEGORY></COMPU-METHOD>
            <DIAG-CODED-TYPE BASE-DATA-TYPE="A_UINT32" BASE-TYPE-ENCODING="NONE" xsi:type="STANDARD-LENGTH-TYPE"><BIT-LENGTH>16</BIT-LENGTH></DIAG-CODED-TYPE>
          </DATA-OBJECT-PROP>
        </DATA-OBJECT-PROPS>
      `),
    );

    const dop = result.dataObjects.find((x) => x.odxId === '_uint16')!;
    expect(dop.codedType).toEqual({ kind: 'standard', bitLength: 16 });
    expect(dop.compuMethod).toEqual({ kind: 'identical' });
    expect(dop.baseDataType).toBe('A_UINT32');
    expect(dop.encoding).toBe('NONE');
  });

  it('resolves LINEAR numerator/denominator coefficients', () => {
    const result = resolve(
      odxWithDops(`
        <DATA-OBJECT-PROPS>
          <DATA-OBJECT-PROP ID="_linear">
            <SHORT-NAME>Linear</SHORT-NAME>
            <COMPU-METHOD>
              <CATEGORY>LINEAR</CATEGORY>
              <COMPU-INTERNAL-TO-PHYS>
                <COMPU-NUMERATOR><V>-40</V><V>10</V></COMPU-NUMERATOR>
                <COMPU-DENOMINATOR><V>2</V></COMPU-DENOMINATOR>
              </COMPU-INTERNAL-TO-PHYS>
            </COMPU-METHOD>
            <DIAG-CODED-TYPE BASE-DATA-TYPE="A_UINT32" xsi:type="STANDARD-LENGTH-TYPE"><BIT-LENGTH>8</BIT-LENGTH></DIAG-CODED-TYPE>
          </DATA-OBJECT-PROP>
        </DATA-OBJECT-PROPS>
      `),
    );

    expect(result.dataObjects[0]?.compuMethod).toEqual({
      kind: 'linear',
      factor: 5,
      offset: -40,
    });
  });

  it('resolves TEXTTABLE entries', () => {
    const result = resolve(
      odxWithDops(`
        <DATA-OBJECT-PROPS>
          <DATA-OBJECT-PROP ID="_texttable">
            <SHORT-NAME>TextTable</SHORT-NAME>
            <COMPU-METHOD>
              <CATEGORY>TEXTTABLE</CATEGORY>
              <COMPU-INTERNAL-TO-PHYS>
                <COMPU-SCALES>
                  <COMPU-SCALE><LOWER-LIMIT>0</LOWER-LIMIT><UPPER-LIMIT>0</UPPER-LIMIT><COMPU-CONST><VT>Off</VT></COMPU-CONST></COMPU-SCALE>
                  <COMPU-SCALE><LOWER-LIMIT>1</LOWER-LIMIT><UPPER-LIMIT>1</UPPER-LIMIT><COMPU-CONST><VT>On</VT></COMPU-CONST></COMPU-SCALE>
                </COMPU-SCALES>
              </COMPU-INTERNAL-TO-PHYS>
            </COMPU-METHOD>
            <DIAG-CODED-TYPE BASE-DATA-TYPE="A_UINT32" xsi:type="STANDARD-LENGTH-TYPE"><BIT-LENGTH>8</BIT-LENGTH></DIAG-CODED-TYPE>
          </DATA-OBJECT-PROP>
        </DATA-OBJECT-PROPS>
      `),
    );

    expect(result.dataObjects[0]?.compuMethod).toEqual({
      kind: 'texttable',
      entries: [
        { lower: 0, upper: 0, text: 'Off' },
        { lower: 1, upper: 1, text: 'On' },
      ],
    });
  });

  it('resolves SCALE-LINEAR segments', () => {
    const result = resolve(
      odxWithDops(`
        <DATA-OBJECT-PROPS>
          <DATA-OBJECT-PROP ID="_scale">
            <SHORT-NAME>Scale</SHORT-NAME>
            <COMPU-METHOD>
              <CATEGORY>SCALE-LINEAR</CATEGORY>
              <COMPU-INTERNAL-TO-PHYS>
                <COMPU-SCALES>
                  <COMPU-SCALE>
                    <LOWER-LIMIT>0</LOWER-LIMIT><UPPER-LIMIT>100</UPPER-LIMIT>
                    <COMPU-RATIONAL-COEFFS><COMPU-NUMERATOR><V>0</V><V>1</V></COMPU-NUMERATOR></COMPU-RATIONAL-COEFFS>
                  </COMPU-SCALE>
                  <COMPU-SCALE>
                    <LOWER-LIMIT>101</LOWER-LIMIT><UPPER-LIMIT>255</UPPER-LIMIT>
                    <COMPU-RATIONAL-COEFFS><COMPU-NUMERATOR><V>10</V><V>2</V></COMPU-NUMERATOR></COMPU-RATIONAL-COEFFS>
                  </COMPU-SCALE>
                </COMPU-SCALES>
              </COMPU-INTERNAL-TO-PHYS>
            </COMPU-METHOD>
            <DIAG-CODED-TYPE BASE-DATA-TYPE="A_UINT32" xsi:type="STANDARD-LENGTH-TYPE"><BIT-LENGTH>8</BIT-LENGTH></DIAG-CODED-TYPE>
          </DATA-OBJECT-PROP>
        </DATA-OBJECT-PROPS>
      `),
    );

    expect(result.dataObjects[0]?.compuMethod).toEqual({
      kind: 'scale-linear',
      segments: [
        { lower: 0, upper: 100, factor: 1, offset: 0 },
        { lower: 101, upper: 255, factor: 2, offset: 10 },
      ],
    });
  });

  it('keeps unsupported RAT-FUNC data but omits its compu method', () => {
    const result = resolve(
      odxWithDops(`
        <DATA-OBJECT-PROPS>
          <DATA-OBJECT-PROP ID="_ratfunc">
            <SHORT-NAME>RatFunc</SHORT-NAME>
            <COMPU-METHOD><CATEGORY>RAT-FUNC</CATEGORY></COMPU-METHOD>
            <DIAG-CODED-TYPE BASE-DATA-TYPE="A_UINT32" xsi:type="STANDARD-LENGTH-TYPE"><BIT-LENGTH>8</BIT-LENGTH></DIAG-CODED-TYPE>
          </DATA-OBJECT-PROP>
        </DATA-OBJECT-PROPS>
      `),
    );

    expect(result.dataObjects[0]?.compuMethod).toBeUndefined();
    expect(result.warnings[0]?.code).toBe('odx-unsupported-compu');
  });

  it('resolves MIN-MAX-LENGTH-TYPE and opaque unsupported length types', () => {
    const result = resolve(
      odxWithDops(`
        <DATA-OBJECT-PROPS>
          <DATA-OBJECT-PROP ID="_minmax">
            <SHORT-NAME>MinMax</SHORT-NAME>
            <COMPU-METHOD><CATEGORY>IDENTICAL</CATEGORY></COMPU-METHOD>
            <DIAG-CODED-TYPE BASE-DATA-TYPE="A_UTF8STRING" xsi:type="MIN-MAX-LENGTH-TYPE"><MIN-LENGTH>1</MIN-LENGTH><MAX-LENGTH>20</MAX-LENGTH></DIAG-CODED-TYPE>
          </DATA-OBJECT-PROP>
          <DATA-OBJECT-PROP ID="_opaque">
            <SHORT-NAME>Opaque</SHORT-NAME>
            <COMPU-METHOD><CATEGORY>IDENTICAL</CATEGORY></COMPU-METHOD>
            <DIAG-CODED-TYPE BASE-DATA-TYPE="A_BYTEFIELD" xsi:type="LEADING-LENGTH-INFO-TYPE"><BIT-LENGTH>16</BIT-LENGTH></DIAG-CODED-TYPE>
          </DATA-OBJECT-PROP>
        </DATA-OBJECT-PROPS>
      `),
    );

    expect(result.dataObjects.find((x) => x.odxId === '_minmax')?.codedType).toEqual({
      kind: 'minmax',
      minBytes: 1,
      maxBytes: 20,
    });
    expect(result.dataObjects.find((x) => x.odxId === '_opaque')?.codedType).toEqual({
      kind: 'opaque',
    });
    expect(result.warnings.some((x) => x.code === 'odx-unsupported-coded-type')).toBe(true);
  });

  it('includes DTC-DOPs and does not throw for malformed elements', () => {
    const result = resolve(
      odxWithDops(`
        <DTC-DOPS>
          <DTC-DOP ID="_dtc-dop">
            <SHORT-NAME>DtcDop</SHORT-NAME>
            <COMPU-METHOD><CATEGORY>IDENTICAL</CATEGORY></COMPU-METHOD>
            <DIAG-CODED-TYPE BASE-DATA-TYPE="A_UINT32" xsi:type="STANDARD-LENGTH-TYPE"><BIT-LENGTH>24</BIT-LENGTH></DIAG-CODED-TYPE>
          </DTC-DOP>
        </DTC-DOPS>
        <DATA-OBJECT-PROPS>
          <DATA-OBJECT-PROP ID="_malformed"><SHORT-NAME>Malformed</SHORT-NAME></DATA-OBJECT-PROP>
        </DATA-OBJECT-PROPS>
      `),
    );

    expect(result.dataObjects.find((x) => x.odxId === '_dtc-dop')?.codedType).toEqual({
      kind: 'standard',
      bitLength: 24,
    });
    expect(result.dataObjects.find((x) => x.odxId === '_malformed')?.codedType).toEqual({
      kind: 'opaque',
    });
    expect(result.warnings.some((x) => x.code === 'odx-element-skipped')).toBe(true);
  });
});
