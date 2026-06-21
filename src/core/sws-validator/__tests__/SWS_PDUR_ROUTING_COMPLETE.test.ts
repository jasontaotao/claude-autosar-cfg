// src/core/sws-validator/__tests__/SWS_PDUR_ROUTING_COMPLETE.test.ts
// Cluster G (v1.6.0) — Starter rule C3: SWS_PDUR_ROUTING_COMPLETE.
//
// Per G spec §4.6: Every PduRRoutingPath must specify a complete
// source→destination path (no empty src or dest).

import { describe, expect, it } from 'vitest';

import type { NormalizedDocument } from '../../../shared/normalized-document.js';
import type { SchemaLayer } from '../../validation/runtimeSchema.js';
import { buildValidationContext } from '../context.js';
import { rule } from '../starter/SWS_PDUR_ROUTING_COMPLETE.js';

function docWithRoutingPaths(
  routingPaths: { name: string; src: string | null; dest: string | null }[],
): NormalizedDocument {
  const children = routingPaths.map((p) => ({
    kind: 'container' as const,
    shortName: p.name,
    path: `/Pkg/PduR/RoutingPaths/${p.name}`,
    children: [],
  }));
  const container = {
    kind: 'container' as const,
    shortName: 'RoutingPaths',
    path: '/Pkg/PduR/RoutingPaths',
    children,
  };
  const pkg = {
    shortName: 'Pkg',
    path: '/Pkg',
    elements: [container],
  };
  // Encode src/dest via the children paths: `${path}?src=...&dest=...`.
  // Simpler: encode in shortName suffix `__SRC_<value>__DEST_<value>`.
  return {
    version: '4.2',
    packages: [pkg],
    modules: [],
    references: [],
    sourceOrder: [pkg.path, container.path, ...children.map((c) => c.path)],
    origin: 'dom' as const,
  };
}

const EMPTY_LAYER: SchemaLayer = {
  params: new Map(),
  containers: new Map(),
  sourcePaths: new Set(),
  moduleRoots: [],
};

describe('SWS_PDUR_ROUTING_COMPLETE', () => {
  it('passes when every RoutingPath has both src and dest', () => {
    const doc = docWithRoutingPaths([
      { name: 'Path_OK__SRC_CanIf__DEST_Com', src: 'CanIf', dest: 'Com' },
      { name: 'Path_OK2__SRC_Com__DEST_CanIf', src: 'Com', dest: 'CanIf' },
    ]);
    const ctx = buildValidationContext({ document: doc, schemaLayer: EMPTY_LAYER, locale: 'en' });
    const results = rule.check(ctx);
    expect(results).toEqual([]);
  });

  it('fails when a RoutingPath has empty src', () => {
    const doc = docWithRoutingPaths([{ name: 'Path_BAD__SRC___DEST_Com', src: '', dest: 'Com' }]);
    const ctx = buildValidationContext({ document: doc, schemaLayer: EMPTY_LAYER, locale: 'en' });
    const results = rule.check(ctx);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.ruleId).toBe('SWS_PDUR_ROUTING_COMPLETE');
    expect(results[0]?.messageKey).toBe('swsValidator.SWS_PDUR_ROUTING_COMPLETE.short');
  });

  it('fails when a RoutingPath has empty dest', () => {
    const doc = docWithRoutingPaths([
      { name: 'Path_BAD__SRC_CanIf__DEST_', src: 'CanIf', dest: '' },
    ]);
    const ctx = buildValidationContext({ document: doc, schemaLayer: EMPTY_LAYER, locale: 'en' });
    const results = rule.check(ctx);
    expect(results.length).toBeGreaterThan(0);
  });
});
