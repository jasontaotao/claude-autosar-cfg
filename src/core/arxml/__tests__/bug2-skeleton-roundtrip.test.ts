// Regression / acceptance tests for Bug 2a + 2b fixes (skeleton).
//
// Bug 2a — skeleton's pre-built sub-container shells used the
//   schema-side tag `ECUC-CONFIGURATION-CONTAINER`. After v1.4.1 the
//   skeleton emits the value-side `ECUC-CONTAINER-VALUE` tag — the
//   same tag `mutation.addContainer` and the serializer already use.
//
// Bug 2b — the skeleton's pre-built shells were created for EVERY
//   sub-container regardless of `lowerMultiplicity`. Optional
//   containers (lower=0, upper=1) now produce NO shell so the user
//   decides whether to add them via the picker. Required containers
//   (lower >= 1) still auto-create one shell.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import { parseBswmd } from '@core/project/bswmd.js';
import type { BswModuleDef, ContainerDef } from '@core/project/bswmd.js';
import { generateEcucSkeleton } from '@core/arxml/skeleton.js';
import { serializeArxml } from '@core/arxml/serializer.js';
import type { ArxmlContainer, ArxmlModule } from '@core/arxml/types.js';

const FIXTURE = resolve(__dirname, '../../../../tests/fixtures/bswmd/Adc_bswmd.arxml');

function makeBswContainer(
  shortName: string,
  opts: { lower?: number; upper?: number | 'infinite'; sub?: readonly ContainerDef[] } = {},
): ContainerDef {
  return {
    shortName,
    path: `/Module/${shortName}`,
    lowerMultiplicity: opts.lower ?? 0,
    upperMultiplicity: opts.upper ?? 1,
    subContainers: opts.sub ?? [],
    parameters: [],
    references: [],
    choices: [],
    multiplicityConfigClasses: [],
  };
}

function makeBswModule(
  shortName: string,
  containers: readonly ContainerDef[] = [],
  multiplicityConfigClasses: readonly { configClass: string; configVariant: string }[] = [],
): BswModuleDef {
  return {
    shortName,
    path: `/${shortName}`,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers,
    providedEntries: [],
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    multiplicityConfigClasses,
  };
}

function makeBswmd(modules: readonly BswModuleDef[]): { modules: readonly BswModuleDef[]; warnings: readonly string[]; version: string } {
  return { modules, warnings: [], version: '4.6' };
}

describe('Bug 2a + 2b fixes — skeleton', () => {
  describe('Bug 2a — value-side tag on every container', () => {
    it('top-level container uses ECUC-CONTAINER-VALUE (value-side), not ECUC-CONFIGURATION-CONTAINER', () => {
      const cfgSet = makeBswContainer('CfgSet');
      const mod = makeBswModule('M', [cfgSet]);
      const ar = generateEcucSkeleton(makeBswmd([mod]), 'M');
      const moduleEl = ar.packages[0]!.elements[0]! as ArxmlModule;
      const child = moduleEl.children[0]! as ArxmlContainer;
      expect(child.tagName).toBe('ECUC-CONTAINER-VALUE');
    });

    it('recursively built sub-container shells use ECUC-CONTAINER-VALUE', () => {
      const leaf = makeBswContainer('Leaf', { lower: 1 });
      const middle = makeBswContainer('Middle', { lower: 1, sub: [leaf] });
      const top = makeBswContainer('Top', { lower: 1, sub: [middle] });
      const mod = makeBswModule('M', [top]);
      const ar = generateEcucSkeleton(makeBswmd([mod]), 'M');
      const topVal = (ar.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
      const middleVal = topVal.children[0]! as ArxmlContainer;
      const leafVal = middleVal.children[0]! as ArxmlContainer;
      expect(topVal.tagName).toBe('ECUC-CONTAINER-VALUE');
      expect(middleVal.tagName).toBe('ECUC-CONTAINER-VALUE');
      expect(leafVal.tagName).toBe('ECUC-CONTAINER-VALUE');
    });

    it('serialize → parse round-trip preserves the value-side tag', () => {
      const cfgSet = makeBswContainer('CfgSet', { lower: 1 });
      const mod = makeBswModule('M', [cfgSet]);
      const ar = generateEcucSkeleton(makeBswmd([mod]), 'M');
      const xmlRes = serializeArxml(ar);
      expect(xmlRes.ok).toBe(true);
      if (!xmlRes.ok) return;
      // The serialized XML should contain ECUC-CONTAINER-VALUE at least once.
      expect(xmlRes.value).toContain('ECUC-CONTAINER-VALUE');
      // And NOT contain the schema-side tag.
      expect(xmlRes.value).not.toContain('ECUC-CONFIGURATION-CONTAINER');
    });
  });

  describe('Bug 2b — respect lowerMultiplicity when pre-creating shells', () => {
    it('lower=1, upper=1 — exactly one shell created', () => {
      const required = makeBswContainer('Required', { lower: 1, upper: 1 });
      const mod = makeBswModule('M', [required]);
      const ar = generateEcucSkeleton(makeBswmd([mod]), 'M');
      const moduleEl = ar.packages[0]!.elements[0]! as ArxmlModule;
      expect(moduleEl.children).toHaveLength(1);
      const requiredVal = moduleEl.children[0]! as ArxmlContainer;
      expect(requiredVal.shortName).toBe('Required');
    });

    it('lower=0, upper=1 sub-container — NO shell pre-created (user adds via picker)', () => {
      // Top-level containers (children of the module) are always created.
      // The lowerMultiplicity rule only applies to SUB-containers (children
      // of containers). Put the optional container one level deep.
      const optional = makeBswContainer('Optional', { lower: 0, upper: 1 });
      const parent = makeBswContainer('Parent', { lower: 1, upper: 1, sub: [optional] });
      const mod = makeBswModule('M', [parent]);
      const ar = generateEcucSkeleton(makeBswmd([mod]), 'M');
      const parentVal = (ar.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
      expect(parentVal.children).toHaveLength(0);
    });

    it('lower=1, upper=infinite sub-container — exactly one shell (user adds more via picker)', () => {
      const many = makeBswContainer('Many', { lower: 1, upper: 'infinite' });
      const parent = makeBswContainer('Parent', { lower: 1, upper: 1, sub: [many] });
      const mod = makeBswModule('M', [parent]);
      const ar = generateEcucSkeleton(makeBswmd([mod]), 'M');
      const parentVal = (ar.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
      expect(parentVal.children).toHaveLength(1);
      const manyVal = parentVal.children[0]! as ArxmlContainer;
      expect(manyVal.shortName).toBe('Many');
    });

    it('recursive: optional nested in required — required shell exists, optional child does not', () => {
      const opt = makeBswContainer('Opt', { lower: 0, upper: 1 });
      const req = makeBswContainer('Req', { lower: 1, upper: 1, sub: [opt] });
      const mod = makeBswModule('M', [req]);
      const ar = generateEcucSkeleton(makeBswmd([mod]), 'M');
      const reqVal = (ar.packages[0]!.elements[0]! as ArxmlModule).children[0]! as ArxmlContainer;
      expect(reqVal.shortName).toBe('Req');
      expect(reqVal.children).toHaveLength(0);
    });
  });

  describe('Acceptance — user fixture (Adc) parses + serializes cleanly', () => {
    const xml = readFileSync(FIXTURE, 'utf-8');
    const parsed = parseBswmd(xml);
    if (!parsed.ok) throw new Error(`fixture parse failed: ${parsed.error.kind}`);

    it('Adc skeleton produces value-side tagged containers', () => {
      const ar = generateEcucSkeleton(parsed.value, 'Adc');
      const moduleEl = ar.packages[0]!.elements[0]! as ArxmlModule;
      // Module element uses ECUC-MODULE-CONFIGURATION-VALUES (its own tag),
      // container elements use ECUC-CONTAINER-VALUE.
      expect(moduleEl.tagName).toBe('ECUC-MODULE-CONFIGURATION-VALUES');
      function checkAll(el: ArxmlModule | ArxmlContainer): void {
        if (el.kind === 'container') {
          expect(el.tagName).toBe('ECUC-CONTAINER-VALUE');
          for (const child of el.children) {
            if (child.kind === 'module' || child.kind === 'container') {
              checkAll(child);
            }
          }
        }
      }
      checkAll(moduleEl);
    });
  });
});