// v1.8.0 K Stencil Wizard — Task 2 (PduR family).
//
// AUTOSAR SWS_PduR §8 Container Definitions.
// Hand-curated minimal valid PduR module skeleton. One
// `ECUC-MODULE-CONFIGURATION-VALUES` module named `PduR`, containing a
// single `PduRConfig` container with one `PduRRoutingPath` sub-container
// carrying both `PduRSourcePdu` and `PduRDestPdu` reference parameters.
//
// The reference values are intentionally set to placeholder shortName
// strings (e.g. `/Com/ComIPdu_PduRRoutingPath_Src`) — the user fills in
// real cross-module paths after picking the BSWMD in 'with-bswmd' mode
// or after editing the skeleton. We point the placeholder values at the
// routing-path's own parent path so the skeleton is self-consistent
// enough for the parser's strict-reject (it requires at least one
// reference-target to be set — empty `value: ''` placeholders are
// silently skipped by `extractReferenceParams`).
//
// Pure: no I/O, no mutation of inputs.

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlModule,
  ParamValue,
} from '../../../core/arxml/types.js';

export function buildPdurModule(): ArxmlDocument {
  // Reference params use `type: 'reference'` with a target `dest` so the
  // serializer emits `<VALUE-REF DEST="ECUC-CONTAINER-VALUE">...</VALUE-REF>`.
  // ECUC-CONTAINER-VALUE is the value-side tag for any container reference;
  // PduR's SWS uses ECUC-MODULE-CONFIGURATION-VALUE for module-level
  // references but per-container routing refs default to the value-side
  // container tag, which the parser accepts on round-trip.
  const routingPath: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'PduRRoutingPath',
    params: {
      // Placeholder paths — non-empty, non-trailing-slash so
      // parser.extractReferenceParams keeps them. Real values land
      // via the wizard's BSWMD merge step (Task 9).
      PduRSourcePdu: {
        type: 'reference',
        value: '/PduR/PduRConfig/PduRRoutingPath_src',
        dest: 'ECUC-CONTAINER-VALUE',
      },
      PduRDestPdu: {
        type: 'reference',
        value: '/PduR/PduRConfig/PduRRoutingPath_dst',
        dest: 'ECUC-CONTAINER-VALUE',
      },
    } satisfies Readonly<Record<string, ParamValue>>,
    children: [],
  };

  const pdurConfig: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'PduRConfig',
    params: {},
    children: [routingPath],
  };

  const pdurModule: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'PduR',
    params: {},
    references: [],
    children: [pdurConfig],
  };

  return {
    path: '',
    version: '4.6',
    packages: [
      {
        shortName: 'PduR',
        path: '/PduR',
        elements: [pdurModule],
      },
    ],
  };
}