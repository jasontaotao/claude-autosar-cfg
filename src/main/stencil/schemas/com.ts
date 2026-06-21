// v1.8.0 K Stencil Wizard — Task 2 (Com family).
//
// AUTOSAR SWS_Com §8 Container Definitions.
// Hand-curated minimal valid Com module skeleton. One
// `ECUC-MODULE-CONFIGURATION-VALUES` module named `Com`, containing a
// single `ComConfig` container with a `ComConfigurationClass` parameter
// and one `ComIPdu` sub-container carrying `ComPduId` + `ComIPduDirection`.
//
// Pure: no I/O, no mutation of inputs. Caller receives a fresh
// `ArxmlDocument` ready to hand to `serializeArxml`.
//
// Implementation note: the project's `ArxmlDocument` shape (see
// `src/core/arxml/types.ts`) uses `packages[].elements[]` for the
// ECUC-MODULE-CONFIGURATION-VALUES entry, and module children live in
// `ArxmlModule.children` (which is then rendered by the serializer as
// `<CONTAINERS><ECUC-CONTAINER-VALUE>...</ECUC-CONTAINER-VALUE></CONTAINERS>`).
// This is the same shape produced by the Sprint 14 BSWMD-to-ECUC
// skeleton flow (`src/core/arxml/skeleton.ts`), so the Com family
// skeleton round-trips through the parser + serializer pair without
// any field drift.

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlModule,
  ParamValue,
} from '../../../core/arxml/types.js';

/** Numeric enum param helper. Centralised so all 4 schemas share the same construction pattern. */
function numParam(value: number): ParamValue {
  return { type: 'integer', value };
}

/** String-literal enum param helper. */
function enumParam(value: string): ParamValue {
  return { type: 'enum', value };
}

export function buildComModule(): ArxmlDocument {
  const comIpdu: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'ComIPdu',
    params: {
      ComPduId: numParam(0),
      ComIPduDirection: enumParam('RECEIVE'),
    },
    children: [],
  };

  const comConfig: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'ComConfig',
    params: {
      ComConfigurationClass: enumParam('PRE_COMPILE'),
    },
    children: [comIpdu],
  };

  const comModule: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'Com',
    params: {},
    references: [],
    children: [comConfig],
  };

  return {
    path: '',
    version: '4.6',
    packages: [
      {
        shortName: 'Com',
        path: '/Com',
        elements: [comModule],
      },
    ],
  };
}