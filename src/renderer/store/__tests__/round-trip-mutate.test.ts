import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { parseArxml } from '@core/arxml/parser.js';
import { serializeArxml } from '@core/arxml/serializer.js';
import type { SerializeError } from '@core/arxml/serializer.js';
import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  Result,
} from '@core/arxml/types';

import { useArxmlStore } from '../useArxmlStore';

type SerializeResult = Result<string, SerializeError>;

// Sprint 1/2 fixtures: 5 samples from user BSW project S32K148_EAS_EB_3399A.
// Path mirrors src/core/arxml/__tests__/round-trip.test.ts so both
// tests use the same in-repo fixtures (CI-friendly, no Windows-only
// absolute paths).
const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'arxml');
const SAMPLES = ['Det_Det', 'EcuC_EcuC', 'Com_Com', 'PduR_PduR', 'WdgIf_WdgIf'].map((n) =>
  join(FIXTURE_DIR, `${n}.arxml`),
);

interface MutableTarget {
  readonly containerPath: string;
  readonly paramKey: string;
  readonly newValue: { readonly type: 'integer'; readonly value: number };
}

/**
 * Walk the first container/module tree and locate a container that has at
 * least one integer parameter to mutate. Returns the canonical container
 * path (slash-delimited, package included) and the first integer param key,
 * or null when nothing in this doc is mutable via updateParam.
 */
function findIntegerTarget(doc: ArxmlDocument): MutableTarget | null {
  for (const pkg of doc.packages) {
    for (const el of pkg.elements) {
      const found = walk(el, [pkg.shortName]);
      if (found !== null) return found;
    }
  }
  return null;
}

function walk(el: ArxmlElement, path: string[]): MutableTarget | null {
  if (el.kind !== 'module' && el.kind !== 'container') return null;
  const currentPath = [...path, el.shortName];
  // Look for an integer param on this node
  for (const [k, v] of Object.entries(el.params)) {
    if (v.type === 'integer') {
      return {
        containerPath: '/' + currentPath.join('/'),
        paramKey: k,
        newValue: { type: 'integer', value: v.value + 1 },
      };
    }
  }
  // Recurse children (don't include self.shortName — caller already pushed it)
  for (const child of el.children) {
    const found = walk(child, currentPath);
    if (found !== null) return found;
  }
  return null;
}

describe('round-trip after mutation (5 samples)', () => {
  for (const filePath of SAMPLES) {
    const name = filePath.split(/[\\/]/).pop()!;
    it(`${name} — mutate integer param persists through serialize → re-parse`, () => {
      const xml = readFileSync(filePath, 'utf-8');
      const r1 = parseArxml(xml);
      expect(r1.ok).toBe(true);
      if (!r1.ok) return;
      const doc = r1.value;

      const target = findIntegerTarget(doc);
      if (target === null) {
        // Gracefully skip samples without an integer param (matches plan note:
        // "5 样本可能不全有 integer param")
        return;
      }

      // Apply via store
      useArxmlStore.getState().clear();
      useArxmlStore.getState().setDoc(doc, filePath);
      useArxmlStore.getState().updateParam(target.containerPath, target.paramKey, target.newValue);

      const mutated = useArxmlStore.getState().doc;
      expect(mutated).not.toBeNull();
      expect(mutated).not.toBe(doc); // new reference after mutation

      // Serialize + re-parse
      const serResult = serializeArxml(mutated!) as SerializeResult;
      expect(serResult.ok).toBe(true);
      if (!serResult.ok) return;
      const xml2 = serResult.value;

      const r2 = parseArxml(xml2);
      expect(r2.ok).toBe(true);
      if (!r2.ok) return;

      // Navigate to the same target in the re-parsed doc and verify the
      // mutated value persisted end-to-end.
      const segments = target.containerPath.split('/').filter(Boolean);
      const [pkgName, ...rest] = segments;
      const rePkg = r2.value.packages.find((p) => p.shortName === pkgName);
      expect(rePkg).toBeDefined();
      if (rePkg === undefined) return;

      // First segment after the package name is the top-level element to start from.
      // containerPath format: /pkgName/elementName/.../containerName
      const [firstSeg, ...tailSegs] = rest;
      if (firstSeg === undefined) return; // path was just /pkgName — no target

      const startEl: ArxmlElement | undefined = rePkg.elements.find(
        (e) => (e.kind === 'reference' ? (e.shortName ?? e.value) : e.shortName) === firstSeg,
      );
      let cursor: ArxmlElement | undefined = startEl;
      for (const seg of tailSegs) {
        if (cursor === undefined) break;
        if (cursor.kind !== 'module' && cursor.kind !== 'container') {
          cursor = undefined;
          break;
        }
        const next = cursor.children.find(
          (c) => (c.kind === 'reference' ? (c.shortName ?? c.value) : c.shortName) === seg,
        );
        cursor = next;
      }
      expect(cursor).toBeDefined();
      if (cursor === undefined) return;
      if (cursor.kind === 'reference') {
        throw new Error('expected container/module at target path');
      }
      const reTarget: ArxmlModule | ArxmlContainer = cursor;
      const reParam = reTarget.params[target.paramKey];
      // Sprint 16c #4 follow-up: reloaded params now carry `definitionRef`
      // (the DEFINITION-REF path from the XML). Use toMatchObject so the
      // comparison is value-only; the metadata is verified separately
      // by the dedicated definitionRef tests.
      expect(reParam).toMatchObject(target.newValue);
    });
  }
});
