// 5-fixture project-level baseline (Sprint 7 F7).
//
// Loads the same 5 ARXML files the single-doc baseline (Sprint 5) uses
// and runs the new project-level surface end-to-end:
//   1. buildPathIndex  — counts how many elements end up addressable
//   2. extractReferences — counts VALUE-REF consumption sites
//   3. checkCrossRefs  — counts dangling refs across the project
//   4. validateProject — aggregate including single-doc errors
//
// Sprint 7 F7 (T1-A + T1-B + T1-C) shipped ECUC-REFERENCE-VALUE
// end-to-end:
//   - T1-A: parser reads both standard <REFERENCE-VALUES> wrapper
//     (Com/PduR/WdgIf) and the EcuC vendor dialect (ref nested under
//     <PARAMETER-VALUES> with DEST="ECUC-FOREIGN-REFERENCE-DEF")
//   - T1-B: serializer emits <VALUE-REF> standard output regardless
//     of which dialect the input used; round-trip field equality holds
//   - T1-C: this file — print every baseline number + lock the
//     signature interval [1300, 1400] so future parser/schema edits
//     cannot silently drop the new data or explode the count
//
// Sprint 7 baseline numbers (F7):
//   pathIndex.size         : 1611   (unchanged from F6)
//   refSites.length        : 1336   (was 0 — parser now sees VALUE-REFs)
//   referenceParams.total  : 1341   (param:reference values + module.references)
//   cross-ref errors       : 1336   (1:1 with refSites — every ref site is
//                                      unresolved; this is the data shape
//                                      of a fixture slice that does not
//                                      form a self-contained project:
//                                      VALUE-REF targets use the /EAS/...
//                                      namespace while the path index is
//                                      built from /EcucDefs/... values)
//   validateProject total  : 1336   (= cross-ref; single-doc errors are 0
//                                      because the 5 fixtures carry no
//                                      per-doc violations)
//
// Signature guard (T1-C):
//   refSites / cross-ref errors are asserted in [1300, 1400] — the only
//   narrow interval that keeps the Sprint 7 contract honest. Going below
//   1300 means a parser/serializer regression silently dropped real
//   data; going above 1400 means the parser started double-counting
//   (e.g. re-scanning the same wrapper twice). The same upper bound
//   serves the upper-bound of `validateProject` total.

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

describe('5-fixture project-level baseline (Sprint 7 F7)', () => {
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
    console.log('=== Sprint 7 F7 baseline (5 fixtures) ===');
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

    // Every cross-ref error we emit must carry the new kind label — guards
    // against a regression where 'cross-ref' is accidentally renamed back
    // to 'reference' or a typo is introduced.
    expect(crossRefErrors.every((e) => e.kind === 'cross-ref')).toBe(true);

    // -- SIGNATURE INTERVAL GUARDS (T1-C) -----------------------------------
    // Sprint 7 F7 ships 1336 refSites / 1336 cross-ref errors. The interval
    // [1300, 1400] is the *only* window that keeps the contract honest:
    //  - below 1300  ⇒ parser/serializer silently dropped ECUC-REFERENCE-VALUE
    //                  entries (Sprint 6 regression of the worst kind)
    //  - above 1400  ⇒ parser started double-counting (e.g. scanning the
    //                  same <REFERENCE-VALUES> wrapper twice)
    // Any future refactor that needs to drift outside this band must
    // update the assertions AND document the change in PROGRESS / CHANGELOG.
    expect(refSites.length).toBeGreaterThanOrEqual(1300);
    expect(refSites.length).toBeLessThanOrEqual(1400);
    expect(crossRefErrors.length).toBeGreaterThanOrEqual(1300);
    expect(crossRefErrors.length).toBeLessThanOrEqual(1400);

    // The single-doc baseline is preserved — total error count from
    // validateProject must be at least the cross-ref count (since cross-ref
    // errors are added on top of the per-doc validate() results). The
    // 5 fixtures carry no per-doc violations, so allErrors.length equals
    // crossRefErrors.length today, but we still assert the >= relation
    // so future per-doc validation work doesn't quietly inflate past
    // 1400 without the signature guard noticing.
    expect(allErrors.length).toBeGreaterThanOrEqual(crossRefErrors.length);
    expect(allErrors.length).toBeGreaterThanOrEqual(1300);
    expect(allErrors.length).toBeLessThanOrEqual(1400);
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
