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
 * Build Dcm Diagnostic Extract: one DCM-DSP-DID per DID + one DCM-DSP-ROUTINE per Routine.
 * DcmDspDidInfo / DcmDspRoutineInfo are BSWMD-coupled; user adds manually post-merge.
 */
function buildDcmContent(odx: OdxSummary): string {
  const dids = odx.dids
    .map(
      (did) =>
        `    <DCM-DSP-DID>
      <SHORT-NAME>${escapeXmlText(did.shortName)}</SHORT-NAME>
    </DCM-DSP-DID>`,
    )
    .join('\n');
  const routines = odx.routines
    .map(
      (r) =>
        `    <DCM-DSP-ROUTINE>
      <SHORT-NAME>${escapeXmlText(r.shortName)}</SHORT-NAME>
    </DCM-DSP-ROUTINE>`,
    )
    .join('\n');
  return wrapWithEnvelope([dids, routines].filter(Boolean).join('\n'));
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
