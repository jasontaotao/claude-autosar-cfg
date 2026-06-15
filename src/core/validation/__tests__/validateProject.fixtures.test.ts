// 5-fixture project-level baseline (Sprint 7 F7 → Sprint 9 #1).
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
//     signature interval so future parser/schema edits cannot silently
//     drop the new data or explode the count
//
// Sprint 8 #1 baseline numbers (after namespace normalisation):
//   pathIndex.size         : 1611
//   refSites.length        : 1336   (unchanged by Sprint 8 #1 — sites are
//                                      independent of path normalization)
//   referenceParams.total  : 1341   (param:reference values + module.references)
//   cross-ref errors       : 1336   (every ref site unresolved — second
//                                      mismatch dimension: VALUE-REF
//                                      targets carry schema-side type
//                                      segments not present in pathIndex)
//   validateProject total  : 1336   (= cross-ref; single-doc errors are 0
//                                      because the 5 fixtures carry no
//                                      per-doc violations)
//
// Sprint 9 #1 baseline numbers (after type-segment strip):
//   cross-ref errors       : 1003   (was 1336; 333 resolved by stripping
//                                      /Pdu/, /ComIPdu/, /ComSignal/,
//                                      /ComIPduGroup/ from fixture targets
//                                      where the pathIndex had the
//                                      shortened form). The remaining 1003
//                                      are *genuine* dangling refs: the
//                                      fixture ARXML has VALUE-REF targets
//                                      like /EcucDefs/Com/ComConfig/...
//                                      pointing to elements that actually
//                                      live under a sibling branch
//                                      /EcucDefs/Com/CanConfigSet/...
//                                      (i.e. the fixture data itself is
//                                      internally inconsistent on these
//                                      refs — no path-shape rewrite can
//                                      resolve them). See Deviations.
//
// Signature guard (T1-C + Sprint 9 #1):
//   refSites.length        : [1300, 1400]  — same window; helper is purely
//                                             path-rewriting, never adds
//                                             or drops sites.
//   cross-ref errors       : [800, 1100]   — Sprint 9 #1 closes the type-
//                                             segment dimension. Lower bound
//                                             800 protects against future
//                                             refactors that might resolve
//                                             these genuine dangles by
//                                             accident (false negative);
//                                             upper bound 1100 protects
//                                             against parser regressions
//                                             inflating the error count.
//   validateProject total  : [800, 1100]   — mirrors cross-ref (single-doc
//                                             errors remain 0 across these
//                                             5 fixtures).

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
    console.log('=== Sprint 9 #1 baseline (5 fixtures) ===');
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

    // -- SIGNATURE INTERVAL GUARDS (Sprint 9 #1) ----------------------------
    // Sprint 7 F7 ships 1336 refSites. Sprint 8 #1 kept the [1300, 1400]
    // band for `refSites` because the namespace helper only rewrites a
    // path string — it never adds or drops sites.
    //
    // Sprint 9 #1 closes the type-segment dimension of the cross-ref
    // mismatch. Of the previous 1336 unresolved cross-ref sites, 333 now
    // resolve after `tryStripTypeSegment` collapses the schema-side
    // `/Pdu/`, `/ComIPdu/`, `/ComSignal/`, `/ComIPduGroup/` segments that
    // the fixture VALUE-REFs carry but pathIndex does not (pathIndex keys
    // use the instance's own shortName directly, no type segment).
    //
    // The remaining 1003 cross-ref errors are *genuine* dangling refs:
    // the fixture ARXML has VALUE-REF targets pointing to elements that
    // actually live under a sibling branch (e.g. target says
    // `/EcucDefs/Com/ComConfig/ComIPduGroup/CAN_NetworkTx` but the
    // element `CAN_NetworkTx` is actually a sibling under
    // `/EcucDefs/Com/CanConfigSet/`). No path-shape rewrite can resolve
    // a branch mismatch; this is fixture data quality, out of scope for
    // Sprint 9 #1 (documented in Deviations; future backlog candidate).
    //
    // Band rationale:
    //  - refSites  [1300, 1400] — unchanged; helper does not touch sites.
    //  - cross-ref [800, 1100]  — accommodates the 1003 actual count;
    //                             lower bound 800 guards against future
    //                             refactors silently resolving genuine
    //                             dangles (false negative); upper bound
    //                             1100 guards against parser regressions
    //                             inflating the error count.
    //  - allErrors [800, 1100]  — mirrors cross-ref; single-doc errors are
    //                             still 0 across these 5 fixtures.
    expect(refSites.length).toBeGreaterThanOrEqual(1300);
    expect(refSites.length).toBeLessThanOrEqual(1400);
    expect(crossRefErrors.length).toBeGreaterThanOrEqual(800);
    expect(crossRefErrors.length).toBeLessThanOrEqual(1100);

    // The single-doc baseline is preserved — total error count from
    // validateProject must be at least the cross-ref count (since cross-ref
    // errors are added on top of the per-doc validate() results).
    expect(allErrors.length).toBeGreaterThanOrEqual(crossRefErrors.length);
    expect(allErrors.length).toBeGreaterThanOrEqual(800);
    expect(allErrors.length).toBeLessThanOrEqual(1100);
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
