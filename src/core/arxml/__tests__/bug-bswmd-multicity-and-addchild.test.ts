// Repro + acceptance tests for Bug 1:
//   BSWMD <MULTIPLICITY-CONFIG-CLASSES> (CONFIG-CLASS / CONFIG-VARIANT) on
//   containers / modules is dropped by the parser — `ContainerDef` and
//   `BswModuleDef` carry no such field.
//
// After v1.4.1 the parser reads the block and exposes it as
// `multiplicityConfigClasses` on both types.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import { listAllowedSubElements } from '@core/arxml/mutation.js';
import { generateEcucSkeleton } from '@core/arxml/skeleton.js';
import type { ArxmlContainer } from '@core/arxml/types.js';
import { parseBswmd } from '@core/project/bswmd.js';

import { findDeepestModule } from './__helpers__/findDeepestModule.js';

const FIXTURE = resolve(__dirname, '../../../../tests/fixtures/bswmd/Adc_bswmd.arxml');

describe('Bug 1 — BSWMD MULTIPLICITY-CONFIG-CLASSES propagation', () => {
  const xml = readFileSync(FIXTURE, 'utf-8');
  const parsed = parseBswmd(xml);
  if (!parsed.ok) throw new Error(`fixture parse failed: ${parsed.error.kind}`);
  const doc = parsed.value;
  const adc = doc.modules.find((m) => m.shortName === 'Adc');
  if (adc === undefined) throw new Error('Adc module not found in fixture');

  it('Bug 1 fix: ContainerDef exposes MULTIPLICITY-CONFIG-CLASSES from BSWMD', () => {
    const hwUnit = adc.containers
      .flatMap((c) => c.subContainers)
      .find((c) => c.shortName === 'AdcHwUnit');
    expect(hwUnit).toBeDefined();
    if (hwUnit === undefined) return;
    // AdcHwUnit declares 2 ECUC-MULTIPLICITY-CONFIGURATION-CLASS rows.
    const mcc = hwUnit.multiplicityConfigClasses ?? [];
    expect(mcc).toHaveLength(2);
    expect(mcc).toContainEqual({ configClass: 'PRE-COMPILE', configVariant: 'VARIANT-POST-BUILD' });
    expect(mcc).toContainEqual({
      configClass: 'PRE-COMPILE',
      configVariant: 'VARIANT-PRE-COMPILE',
    });
  });

  it('Bug 1 fix: BswModuleDef exposes MULTIPLICITY-CONFIG-CLASSES from BSWMD', () => {
    // Adc BSWMD module-level MULTIPLICITY-CONFIG-CLASSES is on the
    // ECUC-MODULE-DEF wrapper. The Adc fixture may not declare any
    // (the field is optional). Contract: the field is present.
    const mcc = adc.multiplicityConfigClasses;
    expect(mcc).toBeDefined();
  });

  it('Bug 2b: skeleton pre-creates required containers (lower>=1), skips optional (lower=0)', () => {
    const skeleton = generateEcucSkeleton(doc, 'Adc');
    const mod = findDeepestModule(skeleton);
    const cfgSet = mod.children.find(
      (c): c is ArxmlContainer => c.kind === 'container' && c.shortName === 'AdcConfigSet',
    );
    expect(cfgSet).toBeDefined();
    if (cfgSet === undefined) return;
    // AdcHwUnit has lower=1, upper=infinite → exactly one shell pre-built.
    const hwUnitShells = cfgSet.children.filter(
      (c): c is ArxmlContainer => c.kind === 'container' && c.shortName === 'AdcHwUnit',
    );
    expect(hwUnitShells).toHaveLength(1);
  });

  it('listAllowedSubElements works on a fresh skeleton (smoke for path-walker)', () => {
    const skeleton = generateEcucSkeleton(doc, 'Adc');
    const mod = findDeepestModule(skeleton);
    const bswmdCfgSet = adc.containers.find((c) => c.shortName === 'AdcConfigSet');
    if (bswmdCfgSet === undefined) throw new Error('bswmd cfgSet not found');
    const allowed = listAllowedSubElements(adc, bswmdCfgSet, mod);
    expect(allowed.length).toBeGreaterThanOrEqual(0);
  });
});
