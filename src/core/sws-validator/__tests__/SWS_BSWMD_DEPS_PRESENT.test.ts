// src/core/sws-validator/__tests__/SWS_BSWMD_DEPS_PRESENT.test.ts
// Cluster G (v1.6.0) — Starter rule C5: SWS_BSWMD_DEPS_PRESENT.
//
// Per G spec §4.6: Every BSWMD-declared module dependency (referenced
// `<ECUC-MODULE-DEF-REF>`) must be defined by some loaded BSWMD file.

import { describe, expect, it } from 'vitest';

import type { SchemaLayer } from '../../validation/runtimeSchema.js';
import type { NormalizedDocument } from '../../../shared/normalized-document.js';
import { buildValidationContext } from '../context.js';
import { rule } from '../starter/SWS_BSWMD_DEPS_PRESENT.js';

function docWithModules(modules: { shortName: string; path: string; definitionRef: string }[]): NormalizedDocument {
  return {
    version: '4.2',
    packages: [
      {
        shortName: 'Pkg',
        path: '/Pkg',
        elements: modules.map((m) => ({
          kind: 'module' as const,
          shortName: m.shortName,
          path: m.path,
          children: [],
        })),
      },
    ],
    modules: modules.map((m) => ({
      shortName: m.shortName,
      path: m.path,
      definitionRef: m.definitionRef,
    })),
    references: [],
    sourceOrder: ['/Pkg', ...modules.map((m) => m.path)],
    origin: 'dom' as const,
  };
}

const EMPTY_LAYER: SchemaLayer = {
  params: new Map(),
  containers: new Map(),
  sourcePaths: new Set(),
  moduleRoots: [],
};

describe('SWS_BSWMD_DEPS_PRESENT', () => {
  it('passes when module has no referenced dependencies', () => {
    const doc = docWithModules([
      { shortName: 'Com', path: '/Pkg/Com', definitionRef: '' },
    ]);
    const ctx = buildValidationContext({ document: doc, schemaLayer: EMPTY_LAYER, locale: 'en' });
    expect(rule.check(ctx)).toEqual([]);
  });

  it('passes when all referenced deps are present in moduleShortNames', () => {
    const doc = docWithModules([
      { shortName: 'Com', path: '/Pkg/Com', definitionRef: 'Com' },
      { shortName: 'PduR', path: '/Pkg/PduR', definitionRef: 'PduR' },
    ]);
    const ctx = buildValidationContext({ document: doc, schemaLayer: EMPTY_LAYER, locale: 'en' });
    // Without an explicit deps field, the rule should pass.
    expect(rule.check(ctx)).toEqual([]);
  });

  it('fails when a module references a missing dependency', () => {
    // Synthetic doc with a module whose definitionRef encodes the dep name.
    const doc = docWithModules([
      { shortName: 'Com', path: '/Pkg/Com', definitionRef: 'Com' },
      { shortName: 'PduR', path: '/Pkg/PduR', definitionRef: 'Can' }, // Can is missing
    ]);
    const ctx = buildValidationContext({ document: doc, schemaLayer: EMPTY_LAYER, locale: 'en' });
    const results = rule.check(ctx);
    expect(results).toHaveLength(1);
    expect(results[0]?.ruleId).toBe('SWS_BSWMD_DEPS_PRESENT');
    expect(results[0]?.messageVars?.['missingDep']).toBe('Can');
  });
});