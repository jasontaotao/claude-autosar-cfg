// v1.8.0 K Stencil Wizard — Task 2 (ComM family).
//
// AUTOSAR SWS_ComM §8 Container Definitions.
// Hand-curated minimal valid ComM module skeleton. One
// `ECUC-MODULE-CONFIGURATION-VALUES` module named `ComM`, containing a
// single `ComMConfig` container with one `ComMChannel` sub-container
// carrying `ComMChannelId` + `ComMChannelPncGatewayType` parameters.
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

function enumParam(value: string): ParamValue {
  return { type: 'enum', value };
}

export function buildCommModule(): ArxmlDocument {
  const commChannel: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'ComMChannel',
    params: {
      ComMChannelId: numParam(0),
      // SWS_ComM §8.4 ComMChannel: PNC gateway type is optional but
      // when present must be one of the literal enum values. Default
      // to the most permissive (COMM_NO_COMM_NC) so the user can
      // narrow it later.
      ComMChannelPncGatewayType: enumParam('COMM_NO_COMM_NC'),
    },
    children: [],
  };

  const commConfig: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'ComMConfig',
    params: {},
    children: [commChannel],
  };

  const commModule: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'ComM',
    params: {},
    references: [],
    children: [commConfig],
  };

  return {
    path: '',
    version: '4.6',
    packages: [
      {
        shortName: 'ComM',
        path: '/ComM',
        elements: [commModule],
      },
    ],
  };
}