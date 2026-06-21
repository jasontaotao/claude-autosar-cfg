// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ArxmlDocument } from '@core/arxml/types';

import { useArxmlStore } from '../../../store/useArxmlStore';
import { EnumEditor } from '../modes/EnumEditor';

afterEach(cleanup);

// Real BSWMD fixture from `tests/fixtures/bswmd/Adc_bswmd.arxml`. The
// module sits under `/AUTOSAR_R22/EcucDefs/Adc` and declares the
// `AdcChannelRangeSelect` enum param (7 literals) inside a nested
// AdcConfigSet → AdcHwUnit → AdcChannel container chain. Loading this
// fixture exercises the full real-world path: nested `<AR-PACKAGE>`
// release namespace + non-trivial multi-segment container path.
const REAL_ADC_BSWMD_XML = readFileSync(
  resolve(__dirname, '../../../../../tests/fixtures/bswmd/Adc_bswmd.arxml'),
  'utf8',
);

// Real user workspace: vendor CDD BSWMD under
// `/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/...` with ECUC values stored under
// the shorter `/JWQ3399/...` path. The DEFINITION-REF bridges the two
// namespaces (`/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399General/JWQ3399CommArch`)
// while the user-selected `containerPath` follows the value-side
// `/JWQ3399/...` shape. This is the canonical AUTOSAR vendor-CDD
// mismatch the namespace-folding pipeline must handle.
//
// Loaded from the repo-relative `tests/fixtures/bswmd/` path (not
// from the user's Desktop) so the test runs in any checkout — see
// the README in that directory for the fixture's provenance.
const REAL_JWQ_BSWMD_XML = readFileSync(
  resolve(__dirname, '../../../../../tests/fixtures/bswmd/JWQ3399_bswmd.arxml'),
  'utf8',
);

// Minimal ECUC-MODULE-DEF that publishes a single enum param with two
// literals — enough to drive EnumEditor's `<select>` rendering without
// depending on the real `Adc_bswmd.arxml` fixture. Module path is
// value-side (`/EcucDefs/EcuC`) so the layer's `params` map key matches
// the path the renderer feeds EnumEditor without any namespace folding.
const BITORDER_BSWMD_XML = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>EcuC</SHORT-NAME>
          <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
          <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>EcucGeneral</SHORT-NAME>
              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
              <PARAMETERS>
                <ECUC-ENUMERATION-PARAM-DEF>
                  <SHORT-NAME>BitOrder</SHORT-NAME>
                  <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <LITERALS>
                    <ECUC-ENUMERATION-LITERAL-DEF>
                      <SHORT-NAME>LSB</SHORT-NAME>
                    </ECUC-ENUMERATION-LITERAL-DEF>
                    <ECUC-ENUMERATION-LITERAL-DEF>
                      <SHORT-NAME>MSB</SHORT-NAME>
                    </ECUC-ENUMERATION-LITERAL-DEF>
                  </LITERALS>
                </ECUC-ENUMERATION-PARAM-DEF>
              </PARAMETERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;

// AUTOSAR R22 release-namespace flavour: nested `<AR-PACKAGE>` so the
// parser produces the path `/AUTOSAR_R22/EcucDefs/EcuC/...`. This is
// the standard AUTOSAR release-namespace layout — the
// `/AUTOSAR_R<NN>/` prefix is what Sprint 17d's `normalizePath` folds
// to value-side `/EcucDefs`.
const BITORDER_R22_BSWMD_XML = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>AUTOSAR_R22</SHORT-NAME>
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>EcucDefs</SHORT-NAME>
          <ELEMENTS>
            <ECUC-MODULE-DEF>
              <SHORT-NAME>EcuC</SHORT-NAME>
              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
              <CONTAINERS>
                <ECUC-PARAM-CONF-CONTAINER-DEF>
                  <SHORT-NAME>EcucGeneral</SHORT-NAME>
                  <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <PARAMETERS>
                    <ECUC-ENUMERATION-PARAM-DEF>
                      <SHORT-NAME>BitOrder</SHORT-NAME>
                      <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                      <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                      <LITERALS>
                        <ECUC-ENUMERATION-LITERAL-DEF>
                          <SHORT-NAME>LSB</SHORT-NAME>
                        </ECUC-ENUMERATION-LITERAL-DEF>
                        <ECUC-ENUMERATION-LITERAL-DEF>
                          <SHORT-NAME>MSB</SHORT-NAME>
                        </ECUC-ENUMERATION-LITERAL-DEF>
                      </LITERALS>
                    </ECUC-ENUMERATION-PARAM-DEF>
                  </PARAMETERS>
                </ECUC-PARAM-CONF-CONTAINER-DEF>
              </CONTAINERS>
            </ECUC-MODULE-DEF>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;

// Vendor-extension (/EAS/) flavour — Intewell private namespace.
// Same nested `<AR-PACKAGE>` pattern, just a different top segment.
const BITORDER_EAS_BSWMD_XML = BITORDER_R22_BSWMD_XML.replace(
  '<SHORT-NAME>AUTOSAR_R22</SHORT-NAME>',
  '<SHORT-NAME>EAS</SHORT-NAME>',
);

function resetStore(): void {
  useArxmlStore.setState({
    doc: null,
    documents: [],
    filePath: null,
    documentPaths: [],
    selectedPath: null,
    dirtyPaths: new Set<string>(),
    error: null,
    validationErrors: [],
    lastValidatedAt: null,
    bswmdSchemas: [],
    bswmdPaths: [],
  });
}

describe('EnumEditor', () => {
  beforeEach(resetStore);

  it('renders a <select> with literals from the BSWMD layer', () => {
    useArxmlStore.getState().addBswmd('/schemas/bitorder.bswmd.arxml', BITORDER_BSWMD_XML);

    render(
      <EnumEditor
        paramKey="BitOrder"
        value={{ type: 'enum', value: 'LSB' }}
        containerPath="/EcucDefs/EcuC/EcucGeneral"
      />,
    );

    const select = screen.getByTestId('enum-editor-BitOrder');
    expect(select.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'LSB' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'MSB' })).toBeInTheDocument();
  });

  it('falls back to <input type="text"> when the layer has no entry for this path', () => {
    // BSWMD loaded but does not catalogue the param we're rendering.
    useArxmlStore.getState().addBswmd('/schemas/bitorder.bswmd.arxml', BITORDER_BSWMD_XML);

    render(
      <EnumEditor
        paramKey="CustomEnum"
        value={{ type: 'enum', value: 'freeform' }}
        containerPath="/EcucDefs/EcuC/EcucGeneral"
      />,
    );

    const input = screen.getByTestId('enum-editor-text-CustomEnum');
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('type', 'text');
  });

  it('falls back to <input type="text"> when no BSWMD is loaded at all', () => {
    // Sanity check the reset: the previous tests added BSWMD via
    // `addBswmd`, so the store must have been cleared.
    expect(useArxmlStore.getState().bswmdSchemas).toEqual([]);

    render(
      <EnumEditor
        paramKey="BitOrder"
        value={{ type: 'enum', value: 'LSB' }}
        containerPath="/EcucDefs/EcuC/EcucGeneral"
      />,
    );

    const input = screen.getByTestId('enum-editor-text-BitOrder');
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('type', 'text');
  });

  it('folds /AUTOSAR_R<NN>/EcucDefs namespace and renders <select>', () => {
    useArxmlStore.getState().addBswmd('/schemas/r22.bswmd.arxml', BITORDER_R22_BSWMD_XML);

    // Simulate the renderer feeding the raw `/AUTOSAR_R22/EcucDefs/...`
    // path straight from the value-side ARXML — EnumEditor must fold
    // it to `/EcucDefs/...` before the layer lookup.
    render(
      <EnumEditor
        paramKey="BitOrder"
        value={{ type: 'enum', value: 'LSB' }}
        containerPath="/AUTOSAR_R22/EcucDefs/EcuC/EcucGeneral"
      />,
    );

    const select = screen.getByTestId('enum-editor-BitOrder');
    expect(select.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'LSB' })).toBeInTheDocument();
  });

  it('folds /EAS/ vendor namespace and renders <select>', () => {
    useArxmlStore.getState().addBswmd('/schemas/eas.bswmd.arxml', BITORDER_EAS_BSWMD_XML);

    render(
      <EnumEditor
        paramKey="BitOrder"
        value={{ type: 'enum', value: 'LSB' }}
        containerPath="/EAS/EcucDefs/EcuC/EcucGeneral"
      />,
    );

    const select = screen.getByTestId('enum-editor-BitOrder');
    expect(select.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'LSB' })).toBeInTheDocument();
  });

  it('renders <select> with literals from the real Adc_bswmd.arxml fixture (full namespace + nested path)', () => {
    // This is the production-grade path: vendor-published BSWMD under
    // the AUTOSAR R22 release namespace, with a 4-segment container
    // chain and a 7-literal enum. Mirrors what the renderer sees when
    // a user loads `tests/fixtures/bswmd/Adc_bswmd.arxml` via
    // `useArxmlStore.addBswmd()`.
    useArxmlStore.getState().addBswmd('/schemas/Adc.bswmd.arxml', REAL_ADC_BSWMD_XML);

    render(
      <EnumEditor
        paramKey="AdcChannelRangeSelect"
        value={{ type: 'enum', value: 'ADC_RANGE_ALWAYS' }}
        containerPath="/AUTOSAR_R22/EcucDefs/Adc/AdcConfigSet/AdcHwUnit/AdcChannel"
      />,
    );

    const select = screen.getByTestId('enum-editor-AdcChannelRangeSelect');
    expect(select.tagName).toBe('SELECT');
    // The Adc fixture's AdcChannelRangeSelect has 7 literals; assert
    // we got at least the well-known sentinel so a future BSWMD-side
    // renumber surfaces as a test diff.
    expect(screen.getByRole('option', { name: 'ADC_RANGE_ALWAYS' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'ADC_RANGE_BETWEEN' })).toBeInTheDocument();
  });

  it('handles vendor-CDD namespace mismatch (BSWMD in /JWQ_CDD_PACK/JWQ_Packet, value-side in /JWQ3399)', () => {
    // Sprint 17d follow-up: vendor CDD BSWMDs are published under
    // their own `<AR-PACKAGE>` chain (`/JWQ_CDD_PACK/JWQ_Packet/...`)
    // while the ECUC values live under the value-side package
    // (`/JWQ3399/...`). The `normalizePath` namespace list covers
    // `/EAS` and `/AUTOSAR_R<NN>/EcucDefs` but NOT vendor CDD prefixes,
    // so a plain `lookupSchema` would miss. `EnumEditor` must use
    // `lookupSchemaAcrossModuleRoots` (Sprint 17d follow-up) so the
    // value-side query path gets mapped back onto the BSWMD-side key
    // and the enum `<select>` renders with the BSWMD's literals
    // (`CommArchWithBridge` / `CommArchWithOutBridge`).
    useArxmlStore.getState().addBswmd('/schemas/JWQ3399.bswmd.arxml', REAL_JWQ_BSWMD_XML);

    render(
      <EnumEditor
        paramKey="JWQ3399CommArch"
        value={{ type: 'enum', value: 'CommArchWithBridge' }}
        containerPath="/JWQ3399/JWQ3399/JWQ3399General"
      />,
    );

    expect(screen.getByTestId('enum-editor-JWQ3399CommArch').tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'CommArchWithBridge' })).toBeInTheDocument();
    expect(screen.queryByTestId('enum-editor-text-JWQ3399CommArch')).toBeNull();
  });

  it('strips combined-mode <basename>/ prefix and renders <select>', () => {
    useArxmlStore.getState().addBswmd('/schemas/bitorder.bswmd.arxml', BITORDER_BSWMD_XML);

    // Two documents loaded → combined-mode. The renderer's combined
    // view wraps each document's path with a basename segment.
    useArxmlStore.setState({
      documents: [
        {
          path: 'one',
          version: '4.6',
          packages: [],
        } as ArxmlDocument,
        {
          path: 'two',
          version: '4.6',
          packages: [],
        } as ArxmlDocument,
      ],
      documentPaths: ['C:/proj/one.arxml', 'C:/proj/two.arxml'],
    });

    render(
      <EnumEditor
        paramKey="BitOrder"
        value={{ type: 'enum', value: 'LSB' }}
        containerPath="/one.arxml/EcucDefs/EcuC/EcucGeneral"
      />,
    );

    const select = screen.getByTestId('enum-editor-BitOrder');
    expect(select.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'LSB' })).toBeInTheDocument();
  });
});
