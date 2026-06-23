import { describe, it, expect } from 'vitest';

import { parseArxml } from '../parser.js';
import { packageByPath, findByPath, paramsEqual, findByPathMultiDoc } from '../path.js';
import type { ArxmlDocument } from '../types.js';

const NESTED_XML = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES>
  <AR-PACKAGE><SHORT-NAME>EAS</SHORT-NAME><ELEMENTS>
    <ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>EcuC</SHORT-NAME>
      <CONTAINERS>
        <ECUC-CONTAINER-VALUE><SHORT-NAME>EcuCGeneral</SHORT-NAME>
          <PARAMETER-VALUES>
            <ECUC-NUMERICAL-PARAM-VALUE>
              <DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/EAS/EcuC/EcuCGeneral/ConfigConsistencyRequired</DEFINITION-REF>
              <VALUE>1</VALUE>
            </ECUC-NUMERICAL-PARAM-VALUE>
          </PARAMETER-VALUES>
          <SUB-CONTAINERS>
            <ECUC-CONTAINER-VALUE><SHORT-NAME>Inner</SHORT-NAME>
              <PARAMETER-VALUES>
                <ECUC-NUMERICAL-PARAM-VALUE>
                  <DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/EAS/EcuC/EcuCGeneral/Inner/DeepParam</DEFINITION-REF>
                  <VALUE>42</VALUE>
                </ECUC-NUMERICAL-PARAM-VALUE>
              </PARAMETER-VALUES>
            </ECUC-CONTAINER-VALUE>
          </SUB-CONTAINERS>
        </ECUC-CONTAINER-VALUE>
      </CONTAINERS>
    </ECUC-MODULE-CONFIGURATION-VALUES>
  </ELEMENTS></AR-PACKAGE>
</AR-PACKAGES></AUTOSAR>`;

describe('path helpers', () => {
  it('packageByPath hits and misses', () => {
    const r = parseArxml(NESTED_XML);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(packageByPath(r.value, '/EAS')).not.toBeNull();
    expect(packageByPath(r.value, '/Missing')).toBeNull();
  });

  it('findByPath navigates three-segment nested element', () => {
    const r = parseArxml(NESTED_XML);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const found = findByPath(r.value, '/EAS/EcuC/EcuCGeneral');
    expect(found).not.toBeNull();
    expect(found?.element.kind).toBe('container');
    if (found?.element.kind !== 'container') return;
    expect(found.element.shortName).toBe('EcuCGeneral');
  });

  it('findByPath navigates five-segment deep element', () => {
    const r = parseArxml(NESTED_XML);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const found = findByPath(r.value, '/EAS/EcuC/EcuCGeneral/Inner/DeepParam');
    // DeepParam is a key inside Inner.params, not a separate element node — findByPath
    // returns null when the final segment isn't a navigable element. Document this:
    expect(found).toBeNull();
  });

  it('paramsEqual is key-order independent', () => {
    const a = { x: { type: 'integer', value: 1 }, y: 'foo' };
    const b = { y: 'foo', x: { type: 'integer', value: 1 } };
    const c = { x: { type: 'integer', value: 1 }, y: 'bar' };
    expect(paramsEqual(a, b)).toBe(true);
    expect(paramsEqual(a, c)).toBe(false);
    expect(paramsEqual(a, {})).toBe(false);
  });

  // ---------- Sprint 9 #12 (review H-1) ----------
  // The H-1 finding was that packageByPath/findByPath did not descend into
  // nested <AR-PACKAGES>. Without these tests a regression in the recursive
  // helper would silently break cross-ref lookup for R21/R22 BSW files.

  it('packageByPath resolves nested packages (R21/R22 shape)', () => {
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>AUTOSAR_R22</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>EcucDefs</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>CanIf</SHORT-NAME></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Outer root still resolves.
    expect(packageByPath(r.value, '/AUTOSAR_R22')?.shortName).toBe('AUTOSAR_R22');
    // Nested leaf now resolves (was the regression).
    const nested = packageByPath(r.value, '/AUTOSAR_R22/EcucDefs');
    expect(nested).not.toBeNull();
    expect(nested?.shortName).toBe('EcucDefs');
  });

  it('findByPath navigates through a nested package to reach a leaf element', () => {
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>AUTOSAR_R22</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>EcucDefs</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>CanIf</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>CanIfInitCfg</SHORT-NAME></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const found = findByPath(r.value, '/AUTOSAR_R22/EcucDefs/CanIf/CanIfInitCfg');
    expect(found).not.toBeNull();
    expect(found?.element.kind).toBe('container');
    if (found?.element.kind !== 'container') return;
    expect(found.element.shortName).toBe('CanIfInitCfg');
  });

  // ---------- v1.9.0 (post-c46f4a8) — same-name AR-PACKAGE wrapper ----------
  // Before c46f4a8, vendor-prefix skeletons emitted an AR-PACKAGE whose
  // shortName matched the wrapped ECUC element's shortName
  // (e.g. `/JWQ_CDD_PACK/JWQ_Packet/JWQ3399 [AR-PACKAGE] > JWQ3399
  // [ECUC] > JWQ3399ConfigSet`). Existing user docs generated under that
  // shape are still in the wild — the user reported this as a regression
  // where `lower=0, upper=infinite` containers (and all add/delete
  // operations) failed with `path-not-found` because `findByPath`
  // couldn't bridge the same-name AR-PACKAGE wrap. The walker now
  // descends into a same-named child element when no sub-package or
  // direct child matches the segment. New docs use the 2-layer c46f4a8
  // shape and are unaffected.
  it('findByPath resolves through a same-name AR-PACKAGE wrapper (vendor-prefix legacy shape)', () => {
    // Mimics the user-reported JWQ3399 doc:
    //   JWQ_CDD_PACK (AR-PACKAGE) > JWQ_Packet (AR-PACKAGE) > JWQ3399
    //   (AR-PACKAGE, shortName matches wrapped ECUC) > JWQ3399 (ECUC
    //   element) > JWQ3399ConfigSet (container)
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>JWQ_CDD_PACK</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>JWQ_Packet</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>JWQ3399</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>JWQ3399</SHORT-NAME><CONTAINERS><ECUC-CONTAINER-VALUE><SHORT-NAME>JWQ3399ConfigSet</SHORT-NAME></ECUC-CONTAINER-VALUE></CONTAINERS></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const found = findByPath(r.value, '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/JWQ3399ConfigSet');
    expect(found).not.toBeNull();
    expect(found?.element.kind).toBe('container');
    if (found?.element.kind !== 'container') return;
    expect(found.element.shortName).toBe('JWQ3399ConfigSet');
  });

  it('findByPath resolves the wrapped ECUC element itself through a same-name AR-PACKAGE wrapper', () => {
    // The path /<...>/JWQ3399 targets the ECUC element (which shares the
    // wrapper's shortName). The walker must step through the wrapper
    // when the segment equals the package's shortName.
    const xml = `<?xml version="1.0"?><AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>JWQ_CDD_PACK</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>JWQ_Packet</SHORT-NAME><AR-PACKAGES><AR-PACKAGE><SHORT-NAME>JWQ3399</SHORT-NAME><ELEMENTS><ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>JWQ3399</SHORT-NAME></ECUC-MODULE-CONFIGURATION-VALUES></ELEMENTS></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AR-PACKAGE></AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const found = findByPath(r.value, '/JWQ_CDD_PACK/JWQ_Packet/JWQ3399');
    expect(found).not.toBeNull();
    expect(found?.element.kind).toBe('module');
  });

  // ---------- Sprint 13 Stage 3.5 (Combined Tree View) ----------
  // Combined Tree View synthesises a virtual ArxmlDocument whose packages
  // are the per-file basenames, and child paths are prefixed with the
  // original file's basename. `findByPathMultiDoc` strips that basename
  // prefix and routes the lookup back to the source document.

  function buildCanDoc(): ArxmlDocument {
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES>
  <AR-PACKAGE><SHORT-NAME>EAS</SHORT-NAME><ELEMENTS>
    <ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>Can</SHORT-NAME>
      <CONTAINERS>
        <ECUC-CONTAINER-VALUE><SHORT-NAME>CanConfigSet</SHORT-NAME>
          <PARAMETER-VALUES>
            <ECUC-NUMERICAL-PARAM-VALUE>
              <DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/EAS/Can/CanConfigSet/CanIfSupport</DEFINITION-REF>
              <VALUE>1</VALUE>
            </ECUC-NUMERICAL-PARAM-VALUE>
          </PARAMETER-VALUES>
        </ECUC-CONTAINER-VALUE>
      </CONTAINERS>
    </ECUC-MODULE-CONFIGURATION-VALUES>
  </ELEMENTS></AR-PACKAGE>
</AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    if (!r.ok) throw new Error(`Can parse: ${r.error}`);
    return r.value;
  }

  function buildAdcDoc(): ArxmlDocument {
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES>
  <AR-PACKAGE><SHORT-NAME>EAS</SHORT-NAME><ELEMENTS>
    <ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>Adc</SHORT-NAME>
      <CONTAINERS>
        <ECUC-CONTAINER-VALUE><SHORT-NAME>AdcConfigSet</SHORT-NAME></ECUC-CONTAINER-VALUE>
      </CONTAINERS>
    </ECUC-MODULE-CONFIGURATION-VALUES>
  </ELEMENTS></AR-PACKAGE>
</AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    if (!r.ok) throw new Error(`Adc parse: ${r.error}`);
    return r.value;
  }

  it('findByPathMultiDoc strips basename prefix and routes to source doc', () => {
    const docs: readonly ArxmlDocument[] = [buildAdcDoc(), buildCanDoc()];
    const paths = ['/tmp/Adc.arxml', '/tmp/Can.arxml'];
    // combined path uses the basename as the FIRST segment
    const found = findByPathMultiDoc(docs, paths, '/Can.arxml/EAS/Can/CanConfigSet');
    expect(found).not.toBeNull();
    expect(found?.filePath).toBe('/tmp/Can.arxml');
    // v1.4.0 trust sprint — 17c. Narrow before reading SHORT-NAME.
    if (found !== null) {
      expect(found.element.kind).toBe('container');
      if (found.element.kind === 'module' || found.element.kind === 'container') {
        expect(found.element.shortName).toBe('CanConfigSet');
      }
    }
  });

  it('findByPathMultiDoc returns null when basename prefix is unknown', () => {
    const docs = [buildCanDoc()];
    const paths = ['/tmp/Can.arxml'];
    const found = findByPathMultiDoc(docs, paths, '/Missing.arxml/EAS/Can/CanConfigSet');
    expect(found).toBeNull();
  });

  it('findByPathMultiDoc returns null when inner path does not exist in source', () => {
    const docs = [buildCanDoc()];
    const paths = ['/tmp/Can.arxml'];
    const found = findByPathMultiDoc(docs, paths, '/Can.arxml/EAS/Missing/CanConfigSet');
    expect(found).toBeNull();
  });

  it('findByPathMultiDoc handles same-basename disambiguation by filePath', () => {
    // Two Can.arxml files in different directories — basename alone is
    // ambiguous. The combined view falls back to [doc:N] index naming for
    // duplicates; findByPathMultiDoc supports that form too.
    const docs = [buildCanDoc(), buildCanDoc()];
    const paths = ['/a/Can.arxml', '/b/Can.arxml'];
    const byIndex = findByPathMultiDoc(docs, paths, '/[doc:0]/EAS/Can/CanConfigSet');
    expect(byIndex).not.toBeNull();
    expect(byIndex?.filePath).toBe('/a/Can.arxml');
    const byIndex1 = findByPathMultiDoc(docs, paths, '/[doc:1]/EAS/Can/CanConfigSet');
    expect(byIndex1?.filePath).toBe('/b/Can.arxml');
  });

  // ---------- Wave 4.B coverage (branches < 90% target) ----------
  // These cases close the remaining branch gaps in path.ts. They focus on
  // edge conditions: too-short paths, missing root packages, descending into
  // a reference (leaf), final cursor that is a package (not element), value
  // mismatch in paramsEqual, and the docIdx >= length guard in the multi-doc
  // path. They are pure data — no new fixtures needed beyond what is already
  // imported above.

  it('findByPath returns null when the path has fewer than two segments', () => {
    const r = parseArxml(NESTED_XML);
    if (!r.ok) throw new Error(`parse: ${r.error}`);
    // No leading slash → single segment after filter
    expect(findByPath(r.value, 'EAS')).toBeNull();
    // Only a leading slash → empty segments after filter
    expect(findByPath(r.value, '/')).toBeNull();
    // Empty string → empty segments after filter
    expect(findByPath(r.value, '')).toBeNull();
  });

  it('findByPath returns null when the root package is not in the document', () => {
    const r = parseArxml(NESTED_XML);
    if (!r.ok) throw new Error(`parse: ${r.error}`);
    // /EAS exists but /NoSuchRoot does not
    expect(findByPath(r.value, '/NoSuchRoot/EcuC/EcuCGeneral')).toBeNull();
  });

  it('findByPath returns null when descending into a reference element', () => {
    // The parser surfaces reference values as `params` entries, not as
    // `kind: 'reference'` child elements. But the path walker still has to
    // handle the case defensively — if it ever encountered a reference
    // element in `children`, it must refuse to descend (references are
    // leaves). Build a doc by hand with a synthetic reference child.
    const refChild = {
      kind: 'reference' as const,
      tagName: 'ECUC-REFERENCE-VALUE',
      shortName: 'RefOne',
      value: '/EAS/Mod/Cfg/RefOne',
    };
    const containerWithRef = {
      kind: 'container' as const,
      tagName: 'ECUC-CONTAINER-VALUE',
      shortName: 'Cfg',
      params: {},
      children: [refChild],
    };
    const module = {
      kind: 'module' as const,
      tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
      shortName: 'Mod',
      params: {},
      children: [containerWithRef],
      references: [],
    };
    const pkg = {
      shortName: 'EAS',
      path: '/EAS',
      elements: [module],
    };
    const doc: ArxmlDocument = {
      path: 'synthetic',
      version: '4.6',
      packages: [pkg],
    };
    // The reference itself resolves fine
    expect(findByPath(doc, '/EAS/Mod/Cfg/RefOne')).not.toBeNull();
    // Trying to descend further into the reference returns null (leaf)
    expect(findByPath(doc, '/EAS/Mod/Cfg/RefOne/Inner')).toBeNull();
  });

  it('findByPath returns null when the final cursor is a package rather than an element', () => {
    // The path /EAS has exactly one segment — caught by the early length check.
    // But /EAS/somePackageIfPresent would land on a package and fail the
    // final `isPackage(cursor)` guard. Our NESTED_XML does not have nested
    // <AR-PACKAGE> entries under EAS, so create a doc with one.
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES>
  <AR-PACKAGE><SHORT-NAME>EAS</SHORT-NAME><AR-PACKAGES>
    <AR-PACKAGE><SHORT-NAME>Nested</SHORT-NAME></AR-PACKAGE>
  </AR-PACKAGES></AR-PACKAGE>
</AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    if (!r.ok) throw new Error(`parse: ${r.error}`);
    // The leaf cursor is a package (Nested), not an element — null
    expect(findByPath(r.value, '/EAS/Nested')).toBeNull();
  });

  it('paramsEqual detects a value mismatch on equal-length equal-key objects', () => {
    // Same keys, same length, but the value at 'x' differs — the loop
    // catches it and returns false.
    const a = { x: 1, y: 'same' };
    const b = { x: 2, y: 'same' };
    expect(paramsEqual(a, b)).toBe(false);
  });

  it('findByPathMultiDoc returns null when path has fewer than two segments', () => {
    const docs = [buildCanDoc()];
    const paths = ['/tmp/Can.arxml'];
    // Single basename segment only
    expect(findByPathMultiDoc(docs, paths, '/Can.arxml')).toBeNull();
    // Empty after filter
    expect(findByPathMultiDoc(docs, paths, '/')).toBeNull();
    expect(findByPathMultiDoc(docs, paths, '')).toBeNull();
  });

  it('findByPathMultiDoc returns null when [doc:N] index is out of range', () => {
    const docs = [buildCanDoc()];
    const paths = ['/tmp/Can.arxml'];
    // Index 5 is beyond the filePaths array length (1)
    expect(findByPathMultiDoc(docs, paths, '/[doc:5]/EAS/Can/CanConfigSet')).toBeNull();
  });

  it('findByPathMultiDoc returns null when [doc:N] index is negative', () => {
    // Negative index is rejected by the `n >= 0` guard.
    const docs = [buildCanDoc(), buildCanDoc()];
    const paths = ['/a/Can.arxml', '/b/Can.arxml'];
    expect(findByPathMultiDoc(docs, paths, '/[doc:-1]/EAS/Can/CanConfigSet')).toBeNull();
  });

  it('findByPathMultiDoc strips basename and resolves path with Windows separators in filePath', () => {
    // The internal `lastSegment` helper splits on / and \. filePaths with
    // backslashes should still match the basename head segment.
    const docs = [buildCanDoc()];
    const paths = ['C:\\tmp\\Can.arxml'];
    const found = findByPathMultiDoc(docs, paths, '/Can.arxml/EAS/Can/CanConfigSet');
    expect(found).not.toBeNull();
    expect(found?.filePath).toBe('C:\\tmp\\Can.arxml');
  });

  // ---------- Sprint 16 — flat-mode fallback (no basename wrapper) ----------
  // When the combined view detects no module-shortName / basename
  // collision, buildCombinedDocument renders docs without a per-file
  // wrapper. selectedPath then has no basename prefix; findByPathMultiDoc
  // must locate the source doc by trying each doc in sequence.

  it('findByPathMultiDoc falls back to per-doc lookup when no basename prefix (flat mode)', () => {
    const docs = [buildAdcDoc(), buildCanDoc()];
    const paths = ['/tmp/Adc.arxml', '/tmp/Can.arxml'];
    const found = findByPathMultiDoc(docs, paths, '/EAS/Can/CanConfigSet');
    expect(found).not.toBeNull();
    expect(found?.filePath).toBe('/tmp/Can.arxml');
    // v1.4.0 trust sprint — 17c. Narrow before reading SHORT-NAME.
    if (found !== null) {
      expect(found.element.kind).toBe('container');
      if (found.element.kind === 'module' || found.element.kind === 'container') {
        expect(found.element.shortName).toBe('CanConfigSet');
      }
    }
  });

  it('findByPathMultiDoc flat-mode returns null when no doc contains the path', () => {
    const docs = [buildCanDoc()];
    const paths = ['/tmp/Can.arxml'];
    expect(findByPathMultiDoc(docs, paths, '/EAS/Adc/AdcConfigSet')).toBeNull();
  });

  it('findByPathMultiDoc flat-mode returns the first matching doc when paths are unique', () => {
    const docs = [buildAdcDoc(), buildCanDoc()];
    const paths = ['/tmp/Adc.arxml', '/tmp/Can.arxml'];
    const found = findByPathMultiDoc(docs, paths, '/EAS/Adc/AdcConfigSet');
    expect(found?.filePath).toBe('/tmp/Adc.arxml');
  });

  // ---------- Sprint X (v1.9.0) — vendor-prefix nested root package ----------
  // The review (CRITICAL) found that when a source arxml nests the module
  // under a vendor-prefix chain (e.g. JWQ_CDD_PACK > JWQ_Packet > JWQ3399),
  // the renderer-side fold collapses it back to a single top-level package
  // named `JWQ3399`. findByPath then receives a path like
  // `/JWQ3399/<ConfigSet>` from the Tree, but the source doc still has
  // `JWQ_CDD_PACK` at the top — so the literal shortName lookup misses.
  //
  // The fix is a nested fallback in findRootPackageByShortName: when the
  // exact shortName does not match any top-level package, walk the
  // recursive package tree and accept the deepest match.

  it('findByPath resolves through a vendor-prefix nested root (CRITICAL fix)', () => {
    // Source doc shape: JWQ_CDD_PACK > JWQ_Packet > JWQ3399 (the module
    // package). The renderer would fold this to a single `JWQ3399` at the
    // top of the displayDoc, so the Tree emits a path like
    // `/JWQ3399/JWQ3399ConfigSet` — findByPath must now find it.
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES>
  <AR-PACKAGE><SHORT-NAME>JWQ_CDD_PACK</SHORT-NAME><AR-PACKAGES>
    <AR-PACKAGE><SHORT-NAME>JWQ_Packet</SHORT-NAME><AR-PACKAGES>
      <AR-PACKAGE><SHORT-NAME>JWQ3399</SHORT-NAME><ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>JWQ3399</SHORT-NAME>
          <CONTAINERS>
            <ECUC-CONTAINER-VALUE><SHORT-NAME>JWQ3399ConfigSet</SHORT-NAME></ECUC-CONTAINER-VALUE>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS></AR-PACKAGE>
    </AR-PACKAGES></AR-PACKAGE>
  </AR-PACKAGES></AR-PACKAGE>
</AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    if (!r.ok) throw new Error(`parse: ${r.error}`);
    const found = findByPath(r.value, '/JWQ3399/JWQ3399/JWQ3399ConfigSet');
    expect(found).not.toBeNull();
    if (found === null) return;
    expect(found.element.kind).toBe('container');
    if (found.element.kind === 'module' || found.element.kind === 'container') {
      expect(found.element.shortName).toBe('JWQ3399ConfigSet');
    }
  });

  it('findByPath resolves deeply nested leaf under vendor-prefix root', () => {
    // Same vendor-prefix source, but path descends 2 levels of container
    // children — verifies the walk through `children` still works after
    // the root-package fallback repositions the cursor.
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES>
  <AR-PACKAGE><SHORT-NAME>JWQ_CDD_PACK</SHORT-NAME><AR-PACKAGES>
    <AR-PACKAGE><SHORT-NAME>JWQ_Packet</SHORT-NAME><AR-PACKAGES>
      <AR-PACKAGE><SHORT-NAME>JWQ3399</SHORT-NAME><ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>JWQ3399</SHORT-NAME>
          <CONTAINERS>
            <ECUC-CONTAINER-VALUE><SHORT-NAME>JWQ3399ConfigSet</SHORT-NAME>
              <SUB-CONTAINERS>
                <ECUC-CONTAINER-VALUE><SHORT-NAME>Child</SHORT-NAME></ECUC-CONTAINER-VALUE>
              </SUB-CONTAINERS>
            </ECUC-CONTAINER-VALUE>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS></AR-PACKAGE>
    </AR-PACKAGES></AR-PACKAGE>
  </AR-PACKAGES></AR-PACKAGE>
</AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    if (!r.ok) throw new Error(`parse: ${r.error}`);
    const found = findByPath(r.value, '/JWQ3399/JWQ3399/JWQ3399ConfigSet/Child');
    expect(found).not.toBeNull();
    if (found === null) return;
    expect(found.element.kind).toBe('container');
    if (found.element.kind === 'module' || found.element.kind === 'container') {
      expect(found.element.shortName).toBe('Child');
    }
  });

  it('findByPath resolves mixed vendor-prefix + plain top-level packages', () => {
    // Mixed case: source has a vendor-prefix chain AND a plain top-level
    // package. Both must resolve via the same findByPath. Top-level
    // matches continue to short-circuit on the literal name; nested
    // matches are reached via the fallback.
    const xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES>
  <AR-PACKAGE><SHORT-NAME>Other</SHORT-NAME><ELEMENTS>
    <ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>OtherMod</SHORT-NAME>
      <CONTAINERS>
        <ECUC-CONTAINER-VALUE><SHORT-NAME>OtherCfg</SHORT-NAME></ECUC-CONTAINER-VALUE>
      </CONTAINERS>
    </ECUC-MODULE-CONFIGURATION-VALUES>
  </ELEMENTS></AR-PACKAGE>
  <AR-PACKAGE><SHORT-NAME>JWQ_CDD_PACK</SHORT-NAME><AR-PACKAGES>
    <AR-PACKAGE><SHORT-NAME>JWQ3399</SHORT-NAME><ELEMENTS>
      <ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>JWQ3399</SHORT-NAME>
        <CONTAINERS>
          <ECUC-CONTAINER-VALUE><SHORT-NAME>JWQCfg</SHORT-NAME></ECUC-CONTAINER-VALUE>
        </CONTAINERS>
      </ECUC-MODULE-CONFIGURATION-VALUES>
    </ELEMENTS></AR-PACKAGE>
  </AR-PACKAGES></AR-PACKAGE>
</AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(xml);
    if (!r.ok) throw new Error(`parse: ${r.error}`);

    // Top-level package resolves via the short-circuit path.
    const other = findByPath(r.value, '/Other/OtherMod/OtherCfg');
    expect(other).not.toBeNull();
    if (other?.element.kind === 'module' || other?.element.kind === 'container') {
      expect(other.element.shortName).toBe('OtherCfg');
    }

    // Nested vendor-prefix package resolves via the fallback.
    const jwq = findByPath(r.value, '/JWQ3399/JWQ3399/JWQCfg');
    expect(jwq).not.toBeNull();
    if (jwq?.element.kind === 'module' || jwq?.element.kind === 'container') {
      expect(jwq.element.shortName).toBe('JWQCfg');
    }
  });
});
