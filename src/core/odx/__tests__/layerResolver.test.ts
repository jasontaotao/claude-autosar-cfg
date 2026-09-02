import { describe, expect, it } from 'vitest';

import { parseOdxDocument } from '../odxDocument.js';
import { resolveLayer } from '../layerResolver.js';

const chainXml = `<?xml version="1.0" encoding="UTF-8"?>
<ODX ID="_odx">
  <DIAG-LAYER-CONTAINER ID="_container">
    <PROTOCOL ID="_protocol">
      <DIAG-COMMS>
        <DIAG-SERVICE ID="_protocol-service">
          <SHORT-NAME>ProtocolService</SHORT-NAME>
        </DIAG-SERVICE>
        <DIAG-SERVICE ID="_excluded-service">
          <SHORT-NAME>ExcludedService</SHORT-NAME>
        </DIAG-SERVICE>
      </DIAG-COMMS>
    </PROTOCOL>
    <BASE-VARIANT ID="_base">
      <PARENT-REFS>
        <PARENT-REF ID-REF="_protocol" xsi:type="PROTOCOL-REF"/>
      </PARENT-REFS>
      <DIAG-COMMS>
        <DIAG-SERVICE ID="_base-service">
          <SHORT-NAME>BaseService</SHORT-NAME>
        </DIAG-SERVICE>
        <DIAG-SERVICE ID="_protocol-service">
          <SHORT-NAME>BaseOverride</SHORT-NAME>
        </DIAG-SERVICE>
      </DIAG-COMMS>
      <NOT-INHERITED-DIAG-COMMS>
        <NOT-INHERITED-DIAG-COMM>
          <DIAG-COMM-SNREF>ExcludedService</DIAG-COMM-SNREF>
        </NOT-INHERITED-DIAG-COMM>
      </NOT-INHERITED-DIAG-COMMS>
    </BASE-VARIANT>
    <ECU-VARIANT ID="_ecu">
      <PARENT-REFS>
        <PARENT-REF ID-REF="_base" xsi:type="BASE-VARIANT-REF"/>
      </PARENT-REFS>
      <DIAG-COMMS>
        <DIAG-SERVICE ID="_ecu-service">
          <SHORT-NAME>EcuService</SHORT-NAME>
        </DIAG-SERVICE>
      </DIAG-COMMS>
    </ECU-VARIANT>
  </DIAG-LAYER-CONTAINER>
</ODX>`;

const cycleXml = `<?xml version="1.0" encoding="UTF-8"?>
<ODX ID="_odx">
  <DIAG-LAYER-CONTAINER ID="_container">
    <BASE-VARIANT ID="_a">
      <PARENT-REFS><PARENT-REF ID-REF="_b"/></PARENT-REFS>
    </BASE-VARIANT>
    <BASE-VARIANT ID="_b">
      <PARENT-REFS><PARENT-REF ID-REF="_a"/></PARENT-REFS>
    </BASE-VARIANT>
  </DIAG-LAYER-CONTAINER>
</ODX>`;

describe('resolveLayer', () => {
  it('flattens the parent chain and applies child precedence', () => {
    const doc = parseOdxDocument(chainXml);
    const layer = resolveLayer(doc, '_ecu');

    expect(layer.chain.map((x) => x.tag)).toEqual(['ECU-VARIANT', 'BASE-VARIANT', 'PROTOCOL']);
    const shortNames = layer.services.map((service) => service.children['SHORT-NAME']?.[0]?.text);
    expect(shortNames).toContain('EcuService');
    expect(shortNames).toContain('BaseService');
    expect(shortNames).not.toContain('ProtocolService');
    expect(shortNames).toContain('BaseOverride');
  });

  it('removes services listed as NOT-INHERITED', () => {
    const doc = parseOdxDocument(chainXml);
    const layer = resolveLayer(doc, '_ecu');

    expect(layer.services.some((service) => service.attrs.ID === '_excluded-service')).toBe(false);
  });

  it('warns and continues when a parent reference is unresolved', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <ODX>
        <DIAG-LAYER-CONTAINER>
          <ECU-VARIANT ID="_ecu">
            <PARENT-REFS><PARENT-REF ID-REF="_missing"/></PARENT-REFS>
          </ECU-VARIANT>
        </DIAG-LAYER-CONTAINER>
      </ODX>`;
    const layer = resolveLayer(parseOdxDocument(xml), '_ecu');

    expect(layer.chain.map((x) => x.tag)).toEqual(['ECU-VARIANT']);
    expect(layer.warnings).toHaveLength(1);
    expect(layer.warnings[0]?.code).toBe('odx-unresolved-parent-ref');
  });

  it('throws a hard error on an inheritance cycle', () => {
    const doc = parseOdxDocument(cycleXml);

    expect(() => resolveLayer(doc, '_a')).toThrowError(/odx-inheritance-cycle/);
  });
});

describe('resolveLayer multiple inheritance', () => {
  it('collects services from every parent reference', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <ODX>
        <DIAG-LAYER-CONTAINER>
          <BASE-VARIANT ID="_p1">
            <DIAG-COMMS><DIAG-SERVICE ID="_s1"><SHORT-NAME>One</SHORT-NAME></DIAG-SERVICE></DIAG-COMMS>
          </BASE-VARIANT>
          <BASE-VARIANT ID="_p2">
            <DIAG-COMMS><DIAG-SERVICE ID="_s2"><SHORT-NAME>Two</SHORT-NAME></DIAG-SERVICE></DIAG-COMMS>
          </BASE-VARIANT>
          <ECU-VARIANT ID="_ecu">
            <PARENT-REFS>
              <PARENT-REF ID-REF="_p1"/>
              <PARENT-REF ID-REF="_p2"/>
            </PARENT-REFS>
            <DIAG-COMMS><DIAG-SERVICE ID="_s3"><SHORT-NAME>Child</SHORT-NAME></DIAG-SERVICE></DIAG-COMMS>
          </ECU-VARIANT>
        </DIAG-LAYER-CONTAINER>
      </ODX>`;
    const layer = resolveLayer(parseOdxDocument(xml), '_ecu');
    const ids = layer.services.map((service) => service.attrs.ID).sort();
    expect(ids).toEqual(['_s1', '_s2', '_s3']);
  });
});
