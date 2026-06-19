import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseArxml } from '../../../core/arxml/parser.js';
import { serializeArxml } from '../../../core/arxml/serializer.js';
import { createTransaction, commitTransaction, discardTransaction } from '../transaction.js';
import type { ScriptMutation, ScriptViolation } from '../types.js';
import type { ArxmlDocument } from '../../../core/arxml/types.js';

const FIXTURE = resolve(__dirname, '../../../../tests/fixtures/arxml/Com_Com.arxml');

let project: ArxmlDocument;
let firstTxPath: string;
let firstTxParam: string;
let originalValue: number;

beforeAll(() => {
  const xml = readFileSync(FIXTURE, 'utf8');
  const r = parseArxml(xml);
  if (!r.ok) throw new Error('parse failed');
  project = r.value;
  // Discover the first ComTxIPdu + its ComTxIPduUnusedAreasDefault param
  // so tests can target a real path/param in the fixture.
  type El = (typeof project)['packages'][number]['elements'][number];
  // Compute the synthetic container path for a given element by
  // walking up its parent chain. The ctx builds paths the same way:
  // `/<pkg.shortName>/<child.shortName>/.../<el.shortName>`.
  function computeSyntheticPath(
    siblings: readonly El[],
    target: El,
    parentPath: string,
  ): string | null {
    for (const el of siblings) {
      if (el === target) {
        return `${parentPath}/${el.shortName}`;
      }
      if (el.kind === 'module' || el.kind === 'container') {
        const found = computeSyntheticPath(
          el.children as readonly El[],
          target,
          `${parentPath}/${el.shortName}`,
        );
        if (found) return found;
      }
    }
    return null;
  }
  let totalTxIpdus = 0;
  let totalWithParam = 0;
  function walk(elements: readonly El[], pkgPath: string): void {
    for (const el of elements) {
      if (el.kind === 'module' || el.kind === 'container') {
        if (el.shortName === 'ComTxIPdu') {
          totalTxIpdus += 1;
          if ('ComTxIPduUnusedAreasDefault' in el.params) {
            totalWithParam += 1;
            firstTxParam = 'ComTxIPduUnusedAreasDefault';
            const p = el.params[firstTxParam]!;
            const synthPath = computeSyntheticPath(elements, el, pkgPath);
            firstTxPath = synthPath;
            if (p.type === 'integer' || p.type === 'float') {
              originalValue = p.value as number;
              return;
            }
          }
        }
        walk(el.children, `${pkgPath}/${el.shortName}`);
        if (firstTxPath) return;
      }
    }
  }
  for (const pkg of project.packages) {
    walk(pkg.elements, `/${pkg.shortName}`);
    if (firstTxPath) break;
  }
  // Helpful diagnostic if the test fails.
  if (!firstTxPath) {
    throw new Error(
      `fixture does not contain a ComTxIPdu with ComTxIPduUnusedAreasDefault (debug: totalTxIpdus=${totalTxIpdus} totalWithParam=${totalWithParam})`,
    );
  }
  if (!firstTxPath) throw new Error('fixture does not contain a ComTxIPdu with ComTxIPduUnusedAreasDefault');
});

describe('createTransaction', () => {
  it('starts with empty mutations and violations', () => {
    const tx = createTransaction(project);
    expect(tx.mutations).toEqual([]);
    expect(tx.violations).toEqual([]);
  });

  it('records mutations via addMutation', () => {
    const tx = createTransaction(project);
    tx.addMutation({
      kind: 'set-param',
      containerPath: firstTxPath,
      paramName: firstTxParam,
      newValue: 1,
    } as ScriptMutation);
    expect(tx.mutations).toHaveLength(1);
  });

  it('records violations via addViolation', () => {
    const tx = createTransaction(project);
    tx.addViolation({ kind: 'script:test', severity: 'error', message: 'x' } as ScriptViolation);
    expect(tx.violations).toHaveLength(1);
  });

  it('does not mutate the original project on addMutation (WorkingCopy is view-only)', () => {
    const tx = createTransaction(project);
    const before = JSON.stringify(project);
    tx.addMutation({
      kind: 'set-param',
      containerPath: firstTxPath,
      paramName: firstTxParam,
      newValue: originalValue + 100,
    });
    const after = JSON.stringify(project);
    expect(after).toBe(before);
  });
});

describe('commitTransaction', () => {
  it('applies a set-param mutation to the project', () => {
    const tx = createTransaction(project);
    tx.addMutation({
      kind: 'set-param',
      containerPath: firstTxPath,
      paramName: firstTxParam,
      newValue: originalValue + 100,
    } as ScriptMutation);
    const applied = commitTransaction(tx);
    expect(applied.applied).toBe(true);
    expect(applied.mutations).toHaveLength(1);
    // Re-walk the (now-mutated) doc to find the param's new value.
    // The setter splices the parent chain, so any prior `el` reference
    // is stale — we must look up by current tree.
    type El = (typeof project)['packages'][number]['elements'][number];
    function findParam(
      elements: readonly El[],
      pkgPath: string,
    ): number | null {
      for (const el of elements) {
        if (el.kind === 'module' || el.kind === 'container') {
          const myPath = `${pkgPath}/${el.shortName}`;
          if (myPath === firstTxPath) {
            const p = el.params[firstTxParam];
            if (p && (p.type === 'integer' || p.type === 'float')) {
              return p.value as number;
            }
          }
          const inner = findParam(el.children as readonly El[], myPath);
          if (inner !== null) return inner;
        }
      }
      return null;
    }
    let found: number | null = null;
    for (const pkg of project.packages) {
      found = findParam(pkg.elements, `/${pkg.shortName}`);
      if (found !== null) break;
    }
    expect(found).toBe(originalValue + 100);
  });

  it('round-trips a commit through serialize+parse (commit is real, not virtual)', () => {
    const tx = createTransaction(project);
    tx.addMutation({
      kind: 'set-param',
      containerPath: firstTxPath,
      paramName: firstTxParam,
      newValue: 42,
    } as ScriptMutation);
    commitTransaction(tx);
    const ser = serializeArxml(project);
    expect(ser.ok).toBe(true);
    if (ser.ok) {
      expect(ser.value).toContain('>42<');
    }
  });

  it('discardTransaction is a no-op (does not throw, does not mutate)', () => {
    const tx = createTransaction(project);
    tx.addMutation({
      kind: 'set-param',
      containerPath: firstTxPath,
      paramName: firstTxParam,
      newValue: 7,
    } as ScriptMutation);
    const before = JSON.stringify(project);
    expect(() => discardTransaction(tx)).not.toThrow();
    expect(JSON.stringify(project)).toBe(before);
  });
});

describe('commit error handling', () => {
  it('throws when targeting a non-existent container path', () => {
    const tx = createTransaction(project);
    tx.addMutation({
      kind: 'set-param',
      containerPath: '/__no_such_path__',
      paramName: firstTxParam,
      newValue: 1,
    } as ScriptMutation);
    expect(() => commitTransaction(tx)).toThrow();
  });

  it('throws when targeting a non-existent param name', () => {
    const tx = createTransaction(project);
    tx.addMutation({
      kind: 'set-param',
      containerPath: firstTxPath,
      paramName: '__no_such_param__',
      newValue: 1,
    } as ScriptMutation);
    expect(() => commitTransaction(tx)).toThrow();
  });
});
