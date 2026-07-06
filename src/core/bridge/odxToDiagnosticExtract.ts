// odxToDiagnosticExtract — pure mapper (v1.24.0 T1).
//
// Consumes an OdxSummary (already parsed by v1.22.0's parseOdxHandler)
// and produces 2 standalone ARXML file contents as strings:
//   - demContent: Diagnostic Extract for Dem (DTC → DemEventParameter)
//   - dcmContent: Diagnostic Extract for Dcm (DID → DcmDspDid, Routine → DcmDspRoutine)
//
// Standalone = no BSWMD-REF; user merges with their Dem/Dcm BSWMD
// post-export. Mirrors Vector's "Diagnostic Extract" tool convention.

import type { OdxSummary } from '../../shared/types.js';

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
function buildDemContent(odx: OdxSummary): string {
  const events = odx.dtcs
    .map((dtc) => {
      const displayCode = dtc.displayCode || dtc.troubleCode;
      const textBlock = dtc.text ? `\n    <TEXT>${escapeXmlText(dtc.text)}</TEXT>` : '';
      return `    <DEM-EVENT-PARAMETER>
      <SHORT-NAME>${escapeXmlText(dtc.shortName)}</SHORT-NAME>
      <EVENT-KIND>DEM_EVENT_KIND_SWC</EVENT-KIND>
      <DISPLAY-CODE>${escapeXmlText(displayCode)}</DISPLAY-CODE>
      <DTC-VALUE>${escapeXmlText(dtc.troubleCode)}</DTC-VALUE>${textBlock}
    </DEM-EVENT-PARAMETER>`;
    })
    .join('\n');
  return wrapWithEnvelope(events);
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
function buildDcmContent(odx: OdxSummary): string {
  const dids = odx.dids
    .map((did) => {
      const dataBlock = did.data
        ? `\n        <DCM-DSP-DID-DATA>\n          <DIAG-CODED-TYPE>${escapeXmlText(did.data.dataType)}</DIAG-CODED-TYPE>\n          <BASE-TYPE-ENCODING>${escapeXmlText(did.data.encoding)}</BASE-TYPE-ENCODING>${did.data.bitLength !== undefined ? `\n          <BIT-LENGTH>${did.data.bitLength}</BIT-LENGTH>` : ''}\n        </DCM-DSP-DID-DATA>`
        : '';
      return `      <ECUC-CONTAINER-VALUE>
        <SHORT-NAME>${escapeXmlText(did.shortName)}</SHORT-NAME>
        <DEFINITION-REF DEST="DCM-DSP-DID">/Dcm/DcmDspDid</DEFINITION-REF>${dataBlock}
      </ECUC-CONTAINER-VALUE>`;
    })
    .join('\n');
  const routines = odx.routines
    .map(
      (r) =>
        `      <ECUC-CONTAINER-VALUE>
        <SHORT-NAME>${escapeXmlText(r.shortName)}</SHORT-NAME>
        <DEFINITION-REF DEST="DCM-DSP-ROUTINE">/Dcm/DcmDspRoutine</DEFINITION-REF>
        <DCM-DSP-ROUTINE>
          <SHORT-NAME>${escapeXmlText(r.shortName)}</SHORT-NAME>
        </DCM-DSP-ROUTINE>
      </ECUC-CONTAINER-VALUE>`,
    )
    .join('\n');
  const containersXml = [dids, routines].filter(Boolean).join('\n');
  // v1.27.2 PATCH — wrap the ODX-extracted ECUC-CONTAINER-VALUEs inside
  // an `ECUC-MODULE-CONFIGURATION-VALUES` element with `<SHORT-NAME>Dcm</SHORT-NAME>`.
  // The wrapper is required so the v1.27.0 Dcm config pipeline's xlsx
  // mapper (`add-child` to module `Dcm`) can resolve the parent element
  // via `findByPath` (`/DiagExtract/Dcm`). Pre-patch, the extract put
  // `<DCM-DSP-DID>` data-spec elements directly under `DiagExtract/
  // ELEMENTS` with no module wrapper, so `addContainer` failed
  // `locateParent` because there was no `Dcm` element to attach to.
  //
  // The DEM half (`buildDemContent`) does NOT need this wrapper —
  // DEM-EVENT-PARAMETER elements are top-level AR-PACKAGE/ELEMENTS
  // children by AUTOSAR convention (no module-config wrapper).
  const dcmModule = `    <ECUC-MODULE-CONFIGURATION-VALUES>
      <SHORT-NAME>Dcm</SHORT-NAME>
      <DEFINITION-REF DEST="ECUC-MODULE-DEF">/Dcm/Dcm</DEFINITION-REF>
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
    demContent: buildDemContent(request.odx),
    dcmContent: buildDcmContent(request.odx),
    stats: {
      dtcCount: request.odx.dtcs.length,
      didCount: request.odx.dids.length,
      routineCount: request.odx.routines.length,
    },
  };
}
