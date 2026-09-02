// odxToDiagnosticExtract — pure mapper (v1.24.0 T1).
//
// Consumes an OdxSummary (already parsed by v1.22.0's parseOdxHandler)
// and produces 2 standalone ARXML file contents as strings:
//   - demContent: Diagnostic Extract for Dem (DTC → DemEventParameter)
//   - dcmContent: Diagnostic Extract for Dcm (DID → DcmDspDid, Routine → DcmDspRoutine)
//
// Standalone = no BSWMD-REF; user merges with their Dem/Dcm BSWMD
// post-export. Mirrors Vector's "Diagnostic Extract" tool convention.

import type { BswModuleDef } from '../project/bswmd/types.js';
import type { OdxSummary } from '../../shared/types.js';
import { resolveDefinitionRef } from './definitionRefResolver.js';

export interface OdxToDiagnosticExtractStats {
  readonly dtcCount: number;
  readonly didCount: number;
  readonly routineCount: number;
}

export interface OdxToDiagnosticExtractResult {
  readonly demContent: string;
  readonly dcmContent: string;
  readonly stats: OdxToDiagnosticExtractStats;
}

export interface OdxToDiagnosticExtractRequest {
  readonly odx: OdxSummary;
  /** Optional BSWMD lookup keyed by module shortName. */
  readonly bswmds?: ReadonlyMap<string, BswModuleDef>;
}

/** AUTOSAR 4.x XML envelope for both Dem and Dcm extract files. */
function wrapWithEnvelope(elementsXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_4-4.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>DiagExtract</SHORT-NAME>
      <ELEMENTS>
${elementsXml}
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;
}

/** XML-escape a text value (amp, lt, gt, quot, apos). UTF-8 bytes pass through. */
export function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build Dem Diagnostic Extract: one DEM-EVENT-PARAMETER per DTC.
 * EVENT-KIND defaults to DEM_EVENT_KIND_SWC (best-guess; user adjusts in BSWMD).
 * DISPLAY-CODE falls back to troubleCode if displayCode is missing.
 */
function buildDemContent(
  odx: OdxSummary,
  bswmds?: ReadonlyMap<string, BswModuleDef>,
): string {
  const demBswmd = bswmds?.get('Dem');
  const events = odx.dtcs
    .map((dtc) => {
      const troubleCode = parseTroubleCode(dtc.troubleCode);
      const paramBlock =
        troubleCode === undefined
          ? ''
          : `
        <PARAMETER-VALUES>
          <ECUC-NUMERICAL-PARAM-VALUE>
            <DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">${resolveDefinitionRef(
              'Dem',
              ['DemConfigSet', 'DemDTC', 'DemDtcValue'],
              demBswmd,
            )}</DEFINITION-REF>
            <VALUE>${troubleCode}</VALUE>
          </ECUC-NUMERICAL-PARAM-VALUE>
        </PARAMETER-VALUES>`;
      const longNameBlock = dtc.text
        ? `
        <LONG-NAME>
          <L-4 L="EN">${escapeXmlText(dtc.text)}</L-4>
        </LONG-NAME>`
        : '';
      const containerRef = resolveDefinitionRef('Dem', ['DemConfigSet', 'DemDTC'], demBswmd);
      return `      <ECUC-CONTAINER-VALUE>
        <SHORT-NAME>${escapeXmlText(dtc.shortName)}</SHORT-NAME>
        <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">${containerRef}</DEFINITION-REF>${longNameBlock}${paramBlock}
      </ECUC-CONTAINER-VALUE>`;
    })
    .join('\n');
  const moduleRef = resolveDefinitionRef('Dem', [], demBswmd);
  const demModule = `    <ECUC-MODULE-CONFIGURATION-VALUES>
      <SHORT-NAME>Dem</SHORT-NAME>
      <DEFINITION-REF DEST="ECUC-MODULE-DEF">${moduleRef}</DEFINITION-REF>
      <CONTAINERS>
${events}
      </CONTAINERS>
    </ECUC-MODULE-CONFIGURATION-VALUES>`;
  return wrapWithEnvelope(demModule);
}

/** Parse an ODX TROUBLE-CODE into the numeric UDS DTC value. Vector
 *  exports decimal values, while legacy fixtures may use 0x-prefixed
 *  hex. Any other string is treated as unparseable. */
function parseTroubleCode(value: string): number | undefined {
  if (value.length === 0) return undefined;
  const parsed = /^0[xX][0-9a-fA-F]+$/.test(value)
    ? Number.parseInt(value, 16)
    : Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Build Dcm Diagnostic Extract: one `<ECUC-CONTAINER-VALUE>` of `<DcmDspDid>`
 * type per DID + one `<ECUC-CONTAINER-VALUE>` of `<DcmDspRoutine>` type per
 * Routine. Each carries a `<DEFINITION-REF>` pointing at the BSWMD-side
 * container definition so the v1.27.0 Dcm config pipeline can apply
 * xlsx service `add-child` siblings against this extract doc.
 *
 * **v1.27.2 PATCH**: shape changed from data-spec elements (`<DCM-DSP-DID>`,
 * `<DCM-DSP-ROUTINE>`) to AUTOSAR-canonical service container instances
 * (`<ECUC-CONTAINER-VALUE>` with `<DEFINITION-REF DEST="...">`). The old
 * shape was correct per v1.24.0 spec ("DID → DcmDspDid; user adds manually
 * post-merge"), but v1.27.0 spec §96 mandates the container-instance shape
 * so that the Dcm config IPC's xlsx mapper can `add-child` siblings
 * against the same extract doc. BSWMD-side container defs (`DcmDspDid`,
 * `DcmDspRoutine`) are ECUC-PARAM-CONF-CONTAINER-DEF (leaf), so the
 * sibling relationship via module-level add (with `definitionRef`) is
 * the correct AUTOSAR idiom — not add-child to the leaf container.
 *
 * The `<DCM-DSP-DID-DATA>` block (BASE-DATA-TYPE / BASE-TYPE-ENCODING /
 * optional BIT-LENGTH from v1.24.x PATCH) is preserved verbatim inside
 * the `<ECUC-CONTAINER-VALUE>` body, so the round-trip information
 * (DID encoding metadata) is unchanged. The `<DCM-DSP-ROUTINE>` inner
 * block is similarly preserved.
 */
function buildDcmContent(
  odx: OdxSummary,
  bswmds?: ReadonlyMap<string, BswModuleDef>,
): string {
  const dcmBswmd = bswmds?.get('Dcm');
  const identifierParams = (
    containerPath: readonly string[],
    leafParam: string,
    identifier: number | undefined,
  ): string => {
    if (identifier === undefined) return '';
    const ref = resolveDefinitionRef('Dcm', [...containerPath, leafParam], dcmBswmd);
    return `
        <PARAMETER-VALUES>
          <ECUC-NUMERICAL-PARAM-VALUE>
            <DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">${ref}</DEFINITION-REF>
            <VALUE>${identifier}</VALUE>
          </ECUC-NUMERICAL-PARAM-VALUE>
        </PARAMETER-VALUES>`;
  };
  const dids = odx.dids
    .map((did) => {
      const dataBlock = did.data
        ? `
        <DCM-DSP-DID-DATA>
          <DIAG-CODED-TYPE>${escapeXmlText(did.data.dataType)}</DIAG-CODED-TYPE>
          <BASE-TYPE-ENCODING>${escapeXmlText(did.data.encoding)}</BASE-TYPE-ENCODING>${did.data.bitLength !== undefined ? `
          <BIT-LENGTH>${did.data.bitLength}</BIT-LENGTH>` : ''}
        </DCM-DSP-DID-DATA>`
        : '';
      const didPath = ['DcmConfigSet', 'DcmDsp', 'DcmDspDid'];
      const didRef = resolveDefinitionRef('Dcm', didPath, dcmBswmd);
      const params = identifierParams(didPath, 'DcmDspDidIdentifier', did.identifier);
      return `      <ECUC-CONTAINER-VALUE>
        <SHORT-NAME>${escapeXmlText(did.shortName)}</SHORT-NAME>
        <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">${didRef}</DEFINITION-REF>${params}${dataBlock}
      </ECUC-CONTAINER-VALUE>`;
    })
    .join('\n');
  const routines = odx.routines
    .map((routine) => {
      const routinePath = ['DcmConfigSet', 'DcmDsp', 'DcmDspRoutine'];
      const routineRef = resolveDefinitionRef('Dcm', routinePath, dcmBswmd);
      const params = identifierParams(routinePath, 'DcmDspRoutineIdentifier', routine.identifier);
      return `      <ECUC-CONTAINER-VALUE>
        <SHORT-NAME>${escapeXmlText(routine.shortName)}</SHORT-NAME>
        <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">${routineRef}</DEFINITION-REF>${params}
      </ECUC-CONTAINER-VALUE>`;
    })
    .join('\n');
  const containersXml = [dids, routines].filter(Boolean).join('\n');
  const moduleRef = resolveDefinitionRef('Dcm', [], dcmBswmd);
  const dcmModule = `    <ECUC-MODULE-CONFIGURATION-VALUES>
      <SHORT-NAME>Dcm</SHORT-NAME>
      <DEFINITION-REF DEST="ECUC-MODULE-DEF">${moduleRef}</DEFINITION-REF>
      <CONTAINERS>
${containersXml}
      </CONTAINERS>
    </ECUC-MODULE-CONFIGURATION-VALUES>`;
  return wrapWithEnvelope(dcmModule);
}

export function odxToDiagnosticExtract(
  request: OdxToDiagnosticExtractRequest,
): OdxToDiagnosticExtractResult {
  return {
    demContent: buildDemContent(request.odx, request.bswmds),
    dcmContent: buildDcmContent(request.odx, request.bswmds),
    stats: {
      dtcCount: request.odx.dtcs.length,
      didCount: request.odx.dids.length,
      routineCount: request.odx.routines.length,
    },
  };
}
