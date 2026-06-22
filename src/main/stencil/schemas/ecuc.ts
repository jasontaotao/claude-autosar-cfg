// v1.8.0 K Stencil Wizard — Task 2 (EcuC family).
//
// AUTOSAR SWS_EcuC §8 Container Definitions.
// Hand-curated minimal valid EcuC module skeleton. One
// `ECUC-MODULE-CONFIGURATION-VALUES` module named `EcuC`, containing a
// single `EcuCConfiguration` container with one `EcucPduCollection`
// sub-container holding one `EcucPdu` leaf carrying `EcucPduId` +
// `EcucPduLength` parameters.
//
// Pure: no I/O, no mutation of inputs.

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlModule,
  ParamValue,
} from '../../../core/arxml/types.js';

function numParam(value: number): ParamValue {
  return { type: 'integer', value };
}

export function buildEcucModule(): ArxmlDocument {
  const ecucPdu: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'EcucPdu',
    params: {
      EcucPduId: numParam(0),
      EcucPduLength: numParam(8),
    },
    children: [],
  };

  const ecucPduCollection: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'EcucPduCollection',
    params: {},
    children: [ecucPdu],
  };

  const ecucConfiguration: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'EcuCConfiguration',
    params: {},
    children: [ecucPduCollection],
  };

  const ecucModule: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'EcuC',
    params: {},
    references: [],
    children: [ecucConfiguration],
  };

  return {
    path: '',
    version: '4.6',
    packages: [
      {
        shortName: 'EcuC',
        path: '/EcuC',
        elements: [ecucModule],
      },
    ],
  };
}
