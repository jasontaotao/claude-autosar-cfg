// 5-fixture project-level baseline (Sprint 6 F6).
//
// Loads the same 5 ARXML files the single-doc baseline (Sprint 5) uses
// and runs the new project-level surface end-to-end:
//   1. buildPathIndex  — counts how many elements end up addressable
//   2. extractReferences — counts VALUE-REF consumption sites
//   3. checkCrossRefs  — counts dangling refs across the project
//   4. validateProject — aggregate including single-doc errors
//
// The hard counts (2282 ref sites etc.) are LOOSE thresholds. The real
// purpose of this test is to print the numbers so the main agent can
// see what 5-fixture cross-ref validation actually produces and decide
// whether to add a documented "accepted value" baseline dimension.
// All assertions are >= lower bounds; the upper bound is open.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { parseArxml } from '../../arxml/parser.js';
import { buildPathIndex, checkCrossRefs, extractReferences, validateProject } from '../index.js';

const FIXTURES = [
  'Det_Det.arxml',
  'EcuC_EcuC.arxml',
  'Com_Com.arxml',
  'PduR_PduR.arxml',
  'WdgIf_WdgIf.arxml',
] as const;

function loadDoc(name: string) {
  const path = join(process.cwd(), 'tests', 'fixtures', 'arxml', name);
  const xml = readFileSync(path, 'utf-8');
  const parsed = parseArxml(xml);
  if (!parsed.ok) {
    throw new Error(`Failed to parse ${name}: ${JSON.stringify(parsed.error)}`);
  }
  return parsed.value;
}

/**
 * Count the reference-flavored params the parser actually surfaces:
 *   - container.params values whose `type` is 'reference'
 *   - module.references[] strings
 * This is what the parser puts in the tree; refSites.length from
 * extractReferences() captures a different (smaller) shape — only
 * elements with kind === 'reference' — and that shape is empty for
 * these 5 fixtures.
 */
function countReferenceParams(
  docs: readonly { packages: readonly { elements: readonly unknown[] }[] }[],
): number {
  let total = 0;
  const visit = (el: unknown): void => {
    if (!el || typeof el !== 'object') return;
    const node = el as {
      kind?: string;
      params?: Record<string, { type?: string; value?: string }>;
      references?: readonly string[];
      children?: readonly unknown[];
    };
    if (node.params) {
      for (const v of Object.values(node.params)) {
        if (v.type === 'reference') total += 1;
      }
    }
    if (node.references) total += node.references.length;
    if (node.children) for (const c of node.children) visit(c);
  };
  for (const d of docs) {
    for (const p of d.packages) {
      for (const e of p.elements) visit(e);
    }
  }
  return total;
}

describe('5-fixture project-level baseline (Sprint 6 F6)', () => {
  it('produces a healthy project-level surface and prints the real numbers', () => {
    const docs = FIXTURES.map(loadDoc);

    // Run all four project-level entry points.
    const pathIndex = buildPathIndex(docs);
    const refSites = extractReferences(docs);
    const crossRefErrors = checkCrossRefs(refSites, pathIndex);
    const allErrors = validateProject(docs);

    // Count how many string-typed 'reference' params exist in the parsed
    // tree (the parser folds VALUE-REFs into `params` with type:'reference'
    // and keeps top-level DEFINITION-REFs in module.references). This is
    // the actual number the parser surfaces; refSites.length comes from
    // kind:'reference' ELEMENTS which the parser only emits for top-level
    // standalone references, not for param-wrapped VALUE-REFs.
    const referenceParams = countReferenceParams(docs);

    // Surface every number so the test stdout tells the whole story.
    // eslint-disable-next-line no-console
    console.log('=== Sprint 6 F6 baseline (5 fixtures) ===');
    // eslint-disable-next-line no-console
    console.log('pathIndex.size         :', pathIndex.size);
    // eslint-disable-next-line no-console
    console.log('refSites.length        :', refSites.length, '(kind:reference ELEMENTS)');
    // eslint-disable-next-line no-console
    console.log(
      'referenceParams.total  :',
      referenceParams,
      '(param:reference values + module.references)',
    );
    // eslint-disable-next-line no-console
    console.log('cross-ref errors       :', crossRefErrors.length);
    // eslint-disable-next-line no-console
    console.log('validateProject total  :', allErrors.length);
    // eslint-disable-next-line no-console
    console.log('first 5 cross-ref errors:');
    for (const e of crossRefErrors.slice(0, 5)) {
      // eslint-disable-next-line no-console
      console.log(`  [${e.path}] -> ${e.actual}`);
    }

    // -- LOOSE THRESHOLDS (lower bounds) -------------------------------------
    // pathIndex should be large — 5 real BSW modules with deep nesting.
    // Soft floor catches "walker missing an element" regressions without
    // locking us into a precise number.
    expect(pathIndex.size).toBeGreaterThanOrEqual(1000);

    // refSites.length is EXPECTED to be 0 for these 5 fixtures.
    //
    // The parser currently handles `<PARAMETER-VALUES>` (ECUC-NUMERICAL-PARAM-VALUE
    // / ECUC-TEXTUAL-PARAM-VALUE) but does NOT yet parse `<REFERENCE-VALUES>`
    // (ECUC-REFERENCE-VALUE) — the wrapper that holds real cross-container
    // VALUE-REF data (~2306 wrappers across these 5 fixtures: Com 1846, PduR
    // 458, WdgIf 2). Until parser/serializer get REFERENCE-VALUES support
    // (planned for Sprint 7), no `param[].type === 'reference'` values reach
    // the parsed tree, so extractReferences' params scan yields zero.
    //
    // We also deliberately skip ArxmlModule.references[] in walkRefs because
    // those strings are module-level DEFINITION-REFs pointing at schema
    // definitions (e.g. "/EAS/Det"), not project-internal cross-refs — see
    // the comment block in walkRefs() for the rationale.
    //
    // Locking in 0 here means: when Sprint 7 lands REFERENCE-VALUES parsing,
    // this assertion will break — and that break is the signal that the new
    // baseline data is flowing through. At that point the test will be
    // updated to a real range (expected ~2000+ refSites).
    expect(refSites.length).toBe(0);

    // Every cross-ref error we emit must carry the new kind label — guards
    // against a regression where 'cross-ref' is accidentally renamed back
    // to 'reference' or a typo is introduced.
    expect(crossRefErrors.every((e) => e.kind === 'cross-ref')).toBe(true);

    // Cross-ref errors must be exactly zero — until Sprint 7 lands real
    // REFERENCE-VALUES parsing, there is no project-internal ref data to
    // validate. Any non-zero count here would mean a regression introduced
    // a new false-positive source.
    expect(crossRefErrors.length).toBe(0);

    // The single-doc baseline is preserved — total error count from
    // validateProject must be at least the cross-ref count (since cross-ref
    // errors are added on top of the per-doc validate() results).
    expect(allErrors.length).toBeGreaterThanOrEqual(crossRefErrors.length);
  });

  it('extractReferences never emits a site with an empty sourcePath (caller sanity)', () => {
    const docs = FIXTURES.map(loadDoc);
    const refSites = extractReferences(docs);

    // Each RefSite's sourcePath must be a non-empty absolute path. If this
    // fails it means walkRefs leaked a top-level (no parent) ref.
    for (const s of refSites) {
      expect(s.sourcePath.length).toBeGreaterThan(0);
      expect(s.sourcePath.startsWith('/')).toBe(true);
    }
  });

  it('checkCrossRefs only emits errors whose actual value is a real path string', () => {
    const docs = FIXTURES.map(loadDoc);
    const pathIndex = buildPathIndex(docs);
    const refSites = extractReferences(docs);
    const crossRefErrors = checkCrossRefs(refSites, pathIndex);

    for (const e of crossRefErrors) {
      // The `actual` field on a cross-ref error must be the target path the
      // walker tried to resolve — never empty (those are filtered out).
      expect(e.actual).toBeDefined();
      expect(e.actual!.length).toBeGreaterThan(0);
      // A trailing-slash placeholder is filtered by isUnsetPlaceholder, so
      // a dangling ref's actual must not end in "/".
      expect(e.actual!.endsWith('/')).toBe(false);
    }
  });
});
