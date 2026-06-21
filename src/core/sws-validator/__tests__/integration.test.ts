// src/core/sws-validator/__tests__/integration.test.ts
// Cluster G (v1.6.0) — Integration test for all 4 starter rules.
//
// Builds a synthetic project that exercises all 4 rules:
//   - C1 (ComPduId unique): one ComConfig with 3 Pdus, two share the same ComPduId
//   - C3 (PduR routing complete): one RoutingPaths container with one OK + one BAD path
//   - C4 (EcuC multiplicity min): one container with 1 child, lowerMultiplicity=2
//   - C5 (BSWMD deps present): one module referencing a missing dep
//
// Expected: exactly 4 results (one per rule violation).

import { describe, expect, it } from 'vitest';

import type { NormalizedDocument } from '../../../shared/normalized-document.js';
import type { SchemaLayer } from '../../validation/runtimeSchema.js';
import type { EcucContainerSchemaEntry } from '../../validation/types.js';
import { RuleRegistry } from '../RuleRegistry.js';
import { runValidation } from '../engine.js';
import { rule as c5 } from '../starter/SWS_BSWMD_DEPS_PRESENT.js';
import { rule as c1 } from '../starter/SWS_COM_PDUID_UNIQUE.js';
import { rule as c4 } from '../starter/SWS_ECUC_MULTIPLICITY_MIN.js';
import { rule as c3 } from '../starter/SWS_PDUR_ROUTING_COMPLETE.js';

function buildFixtureDocument(): NormalizedDocument {
  const pduChildren = [
    {
      kind: 'container' as const,
      shortName: 'Pdu_1_A',
      path: '/Pkg/Com/ComConfig/Pdu_1_A',
      children: [],
    },
    {
      kind: 'container' as const,
      shortName: 'Pdu_1_B',
      path: '/Pkg/Com/ComConfig/Pdu_1_B',
      children: [],
    }, // dup
    {
      kind: 'container' as const,
      shortName: 'Pdu_2_C',
      path: '/Pkg/Com/ComConfig/Pdu_2_C',
      children: [],
    },
  ];
  const routingChildren = [
    {
      kind: 'container' as const,
      shortName: 'Path_OK__SRC_CanIf__DEST_Com',
      path: '/Pkg/PduR/RoutingPaths/Path_OK__SRC_CanIf__DEST_Com',
      children: [],
    },
    {
      kind: 'container' as const,
      shortName: 'Path_BAD__SRC___DEST_Com', // missing src
      path: '/Pkg/PduR/RoutingPaths/Path_BAD__SRC___DEST_Com',
      children: [],
    },
  ];
  const pduContainer = {
    kind: 'container' as const,
    shortName: 'Pdu',
    path: '/Pkg/EcuC/Pdu',
    children: [
      {
        kind: 'container' as const,
        shortName: 'Pdu_0',
        path: '/Pkg/EcuC/Pdu/Pdu_0',
        children: [],
      },
    ], // 1 child, lowerMultiplicity=2 → violation
  };
  return {
    version: '4.2',
    packages: [
      {
        shortName: 'Pkg',
        path: '/Pkg',
        elements: [
          {
            kind: 'container' as const,
            shortName: 'ComConfig',
            path: '/Pkg/Com/ComConfig',
            children: pduChildren,
          },
          {
            kind: 'container' as const,
            shortName: 'RoutingPaths',
            path: '/Pkg/PduR/RoutingPaths',
            children: routingChildren,
          },
          pduContainer,
          {
            kind: 'module' as const,
            shortName: 'Com',
            path: '/Pkg/Com',
            children: [],
          },
          {
            kind: 'module' as const,
            shortName: 'PduR',
            path: '/Pkg/PduR',
            children: [],
          },
        ],
      },
    ],
    modules: [
      { shortName: 'Com', path: '/Pkg/Com', definitionRef: 'Can' }, // 'Can' missing → C5 violation
      { shortName: 'PduR', path: '/Pkg/PduR', definitionRef: 'PduR' },
    ],
    references: [],
    sourceOrder: [],
    origin: 'dom',
  };
}

function buildFixtureLayer(): SchemaLayer {
  const pduEntry: EcucContainerSchemaEntry = {
    path: '/Pkg/EcuC/Pdu',
    lower: 2,
    upper: 'unbounded',
  };
  return {
    params: new Map(),
    containers: new Map([[pduEntry.path, pduEntry]]),
    sourcePaths: new Set([pduEntry.path]),
    moduleRoots: [],
  };
}

describe('SWS Validator — all-rules integration', () => {
  it('finds exactly 4 violations when all 4 rules run on the Demo ECU fixture', async () => {
    const doc = buildFixtureDocument();
    const layer = buildFixtureLayer();
    const reg = new RuleRegistry();
    reg.register(c1);
    reg.register(c3);
    reg.register(c4);
    reg.register(c5);
    const result = await runValidation(
      reg,
      { document: doc, schemaLayer: layer },
      { locale: 'en' },
    );
    expect(result.rulesRun).toBe(4);
    const byRule = new Map<string, number>();
    for (const r of result.results) {
      byRule.set(r.ruleId, (byRule.get(r.ruleId) ?? 0) + 1);
    }
    expect(byRule.get('SWS_COM_PDUID_UNIQUE')).toBe(1);
    expect(byRule.get('SWS_PDUR_ROUTING_COMPLETE')).toBe(1);
    expect(byRule.get('SWS_ECUC_MULTIPLICITY_MIN')).toBe(1);
    expect(byRule.get('SWS_BSWMD_DEPS_PRESENT')).toBe(1);
  });
});
