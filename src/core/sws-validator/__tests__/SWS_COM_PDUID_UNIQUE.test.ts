// src/core/sws-validator/__tests__/SWS_COM_PDUID_UNIQUE.test.ts
// Cluster G (v1.6.0) — Starter rule C1: SWS_COM_PDUID_UNIQUE.
//
// Per G spec §4.6: ComPduId values within a ComConfig must be unique;
// PduId collisions are SWS-conformance violations.

import { describe, expect, it } from 'vitest';

import type { NormalizedDocument } from '../../../shared/normalized-document.js';
import type { SchemaLayer } from '../../validation/runtimeSchema.js';
import { buildValidationContext } from '../context.js';
import { rule } from '../starter/SWS_COM_PDUID_UNIQUE.js';

/** Build a synthetic document with N ComPdu children inside a ComConfig. */
function docWithComConfig(
  comConfigPath: string,
  pdus: { name: string; pduId: number }[],
): NormalizedDocument {
  const children: {
    readonly kind: 'container';
    readonly shortName: string;
    readonly path: string;
    readonly children: readonly never[];
  }[] = pdus.map((p) => ({
    kind: 'container' as const,
    shortName: p.name,
    path: `${comConfigPath}/${p.name}`,
    children: [] as readonly never[],
  }));
  const comConfig = {
    kind: 'container' as const,
    shortName: 'ComConfig',
    path: comConfigPath,
    children,
  };
  const pkg = {
    shortName: 'Pkg',
    path: '/Pkg',
    elements: [comConfig],
  };
  return {
    version: '4.2',
    packages: [pkg],
    modules: [],
    references: [],
    sourceOrder: [pkg.path, comConfig.path, ...children.map((c) => c.path)],
    origin: 'dom' as const,
  };
}

const EMPTY_LAYER: SchemaLayer = {
  params: new Map(),
  containers: new Map(),
  sourcePaths: new Set(),
  moduleRoots: [],
};

describe('SWS_COM_PDUID_UNIQUE', () => {
  it('passes when all ComPduId values are unique', () => {
    const doc = docWithComConfig('/Pkg/Com', [
      { name: 'Pdu_A', pduId: 1 },
      { name: 'Pdu_B', pduId: 2 },
      { name: 'Pdu_C', pduId: 3 },
    ]);
    const ctx = buildValidationContext({ document: doc, schemaLayer: EMPTY_LAYER, locale: 'en' });
    // Stamp pduId via document param encoding — we use shortName-embedded id
    // format "Pdu_<id>_<name>" so the rule can derive ComPduId from the name.
    const results = rule.check(ctx);
    expect(results).toEqual([]);
  });

  it('fails when one ComPduId is duplicated within the same ComConfig', () => {
    const doc = docWithComConfig('/Pkg/Com', [
      { name: 'Pdu_1_A', pduId: 1 },
      { name: 'Pdu_1_B', pduId: 1 },
    ]);
    const ctx = buildValidationContext({ document: doc, schemaLayer: EMPTY_LAYER, locale: 'en' });
    const results = rule.check(ctx);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.ruleId).toBe('SWS_COM_PDUID_UNIQUE');
    expect(results[0]?.severity).toBe('error');
    expect(results[0]?.messageKey).toBe('swsValidator.SWS_COM_PDUID_UNIQUE.short');
  });

  it('fails once per duplicate group (not per duplicate element)', () => {
    const doc = docWithComConfig('/Pkg/Com', [
      { name: 'Pdu_1_A', pduId: 1 },
      { name: 'Pdu_1_B', pduId: 1 },
      { name: 'Pdu_1_C', pduId: 1 },
    ]);
    const ctx = buildValidationContext({ document: doc, schemaLayer: EMPTY_LAYER, locale: 'en' });
    const results = rule.check(ctx);
    // Three elements with the same pduId → 1 group → 1 result.
    expect(results).toHaveLength(1);
  });
});
