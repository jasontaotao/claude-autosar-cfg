// src/core/sws-validator/__tests__/SWS_ECUC_MULTIPLICITY_MIN.test.ts
// Cluster G (v1.6.0) — Starter rule C4: SWS_ECUC_MULTIPLICITY_MIN.
//
// Per G spec §4.6: For each EcucContainerDef, the actual child-instance
// count must be ≥ `lowerMultiplicity`.
//
// Uses the runtime SchemaLayer.containers lookup to determine
// lowerMultiplicity; counts actual child instances via the normalized
// document tree.

import { describe, expect, it } from 'vitest';

import type { NormalizedDocument } from '../../../shared/normalized-document.js';
import type { SchemaLayer } from '../../validation/runtimeSchema.js';
import type { EcucContainerSchemaEntry } from '../../validation/types.js';
import { buildValidationContext } from '../context.js';
import { rule } from '../starter/SWS_ECUC_MULTIPLICITY_MIN.js';

function docWithContainer(
  containerPath: string,
  containerShortName: string,
  childCount: number,
): NormalizedDocument {
  const children = Array.from({ length: childCount }, (_, i) => ({
    kind: 'container' as const,
    shortName: `Child_${i}`,
    path: `${containerPath}/Child_${i}`,
    children: [],
  }));
  const container = {
    kind: 'container' as const,
    shortName: containerShortName,
    path: containerPath,
    children,
  };
  const pkg = {
    shortName: 'Pkg',
    path: '/Pkg',
    elements: [container],
  };
  return {
    version: '4.2',
    packages: [pkg],
    modules: [],
    references: [],
    sourceOrder: [pkg.path, containerPath, ...children.map((c) => c.path)],
    origin: 'dom' as const,
  };
}

function layerWithContainerMultiplicity(
  containerPath: string,
  lower: number,
): SchemaLayer {
  const entry: EcucContainerSchemaEntry = {
    path: containerPath,
    lower,
    upper: 'unbounded',
  };
  return {
    params: new Map(),
    containers: new Map([[containerPath, entry]]),
    sourcePaths: new Set([containerPath]),
    moduleRoots: [],
  };
}

describe('SWS_ECUC_MULTIPLICITY_MIN', () => {
  it('passes when child count equals lowerMultiplicity', () => {
    const path = '/Pkg/EcuC/Pdu';
    const doc = docWithContainer(path, 'Pdu', 2);
    const layer = layerWithContainerMultiplicity(path, 2);
    const ctx = buildValidationContext({ document: doc, schemaLayer: layer, locale: 'en' });
    expect(rule.check(ctx)).toEqual([]);
  });

  it('fails when child count is below lowerMultiplicity', () => {
    const path = '/Pkg/EcuC/Pdu';
    const doc = docWithContainer(path, 'Pdu', 1);
    const layer = layerWithContainerMultiplicity(path, 3);
    const ctx = buildValidationContext({ document: doc, schemaLayer: layer, locale: 'en' });
    const results = rule.check(ctx);
    expect(results).toHaveLength(1);
    expect(results[0]?.ruleId).toBe('SWS_ECUC_MULTIPLICITY_MIN');
    expect(results[0]?.messageKey).toBe('swsValidator.SWS_ECUC_MULTIPLICITY_MIN.short');
    expect(results[0]?.messageVars?.['actual']).toBe(1);
    expect(results[0]?.messageVars?.['min']).toBe(3);
  });

  it('passes when child count exceeds lowerMultiplicity', () => {
    const path = '/Pkg/EcuC/Pdu';
    const doc = docWithContainer(path, 'Pdu', 5);
    const layer = layerWithContainerMultiplicity(path, 1);
    const ctx = buildValidationContext({ document: doc, schemaLayer: layer, locale: 'en' });
    expect(rule.check(ctx)).toEqual([]);
  });
});