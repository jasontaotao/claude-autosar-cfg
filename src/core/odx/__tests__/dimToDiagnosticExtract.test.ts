import { describe, expect, it } from 'vitest';

import { parseArxml } from '../../arxml/parser.js';
import type { Dim } from '../dim.js';
import { dimToDiagnosticExtract } from '../dimToDiagnosticExtract.js';

const emptyIndex = {
  containerPath: new Map(),
  paramPath: new Map(),
  refPath: new Map(),
  paramDef: new Map(),
};
const dim: Dim = {
  meta: {
    sourcePath: 'test',
    modelVersion: '1.0',
    variant: { kind: 'BASE-VARIANT', odxId: '_v', shortName: 'Variant' },
  },
  services: [],
  dataObjects: [],
  dtcs: [{ odxId: '_dtc', shortName: 'DTC_A', troubleCode: 1 }],
  sessions: [],
  securityLevels: [],
  warnings: [],
};

describe('dimToDiagnosticExtract', () => {
  it('emits standard ECUC envelopes that round-trip as ARXML', () => {
    const output = dimToDiagnosticExtract({ dim, bswmdIndex: emptyIndex });
    expect(output.demContent).toContain('Dem_Extract');
    expect(output.dcmContent).toContain('Dcm_Extract');
    expect(output.demContent).toContain('ECUC-MODULE-CONFIGURATION-VALUES');
    expect(() => parseArxml(output.demContent)).not.toThrow();
    expect(() => parseArxml(output.dcmContent)).not.toThrow();
    expect(output.stats.dtcCount).toBe(1);
  });
});

it('counts 0x2F InputOutputControlByIdentifier DIDs consistently', () => {
  const output = dimToDiagnosticExtract({
    dim: {
      ...dim,
      services: [
        {
          odxId: '_io',
          shortName: 'ControlDid',
          serviceClass: 'InputOutputControlByIdentifier',
          sid: 0x2f,
          request: [
            { name: 'SID', semantic: 'SERVICE-ID', codedValue: '47', bytePosition: 0 },
            { name: 'DID', semantic: 'ID', codedValue: '4660', bytePosition: 1 },
          ],
          posResponses: [],
          negResponseCodes: [],
          sdgAnnotations: {},
          sessionRefs: [],
          securityRefs: [],
        },
      ],
    },
    bswmdIndex: emptyIndex,
  });
  expect(output.stats.didCount).toBe(1);
});
