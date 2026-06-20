import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseArxml } from '../parser.js';
import { serializeArxml } from '../serializer.js';
import type { ArxmlElement } from '../types.js';

const SAMPLES = ['Det_Det', 'EcuC_EcuC', 'Com_Com', 'PduR_PduR', 'WdgIf_WdgIf'] as const;

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'arxml');

// ---------------------------------------------------------------------------
// v1.4.0 trust sprint — sub-sprint 17c.
//
// Closes three silent-data-loss bugs in the ARXML round-trip path:
//
//   1. P0-1 — `classifyElement` returned `null` for any non-ECUC /
//      non-reference tag, so vendor extensions like SERVICE-NEEDS,
//      EXCLUSIVE-AREA, and /EAS/ namespaced elements were silently
//      dropped. Fixed by adding an `ArxmlUnknown` variant to the
//      `ArxmlElement` union; `classifyElement` now returns the
//      variant instead of `null` for unrecognized tags.
//   2. P0-2 — the serializer had no escape hatch for unknown
//      elements. Fixed by emitting `{ [tagName]: parsed }` from
//      `renderElement`, which `XMLBuilder` can re-serialize without
//      string re-parsing.
//   3. Second-order drop — `renderModule` only emitted
//      `m.references[0]`, silently dropping all other DEFINITION-REFs
//      in `ArxmlModule.references`. Fixed by emitting every
//      reference as a top-level <DEFINITION-REF> sibling, parsed
//      via `parser.ts:500`'s `asArray` consumer.
//
// Known limitations (deliberate, documented in CHANGELOG):
//   - Sibling order between known and unknown elements within a
//     parent is determined by model iteration order, not the original
//     source order. Full preservation requires `preserveOrder: true`,
//     which is a 2-week refactor out of scope for v1.4.0.
//   - XML comments / CDATA / processing instructions are still lost.
//     Punted to v1.5+.
// ---------------------------------------------------------------------------

// Sprint 7 T1-A note: the parser now folds <ECUC-REFERENCE-VALUE> into
// container.params as `{ type: 'reference', value, dest }`, but the
// serializer does NOT yet emit <REFERENCE-VALUES> wrappers. Re-parsing
// a serialized document therefore loses the reference params. Round-trip
// tests are expected to fail for fixtures containing ECUC-REFERENCE-VALUE
// (Com 1846, PduR 458, WdgIf 2) until T1-B lands serializer support.
//
// We split the suite so we still run a "parse-only" smoke against every
// fixture (parser sanity) while marking the parse→serialize→re-parse path
// skip / pending until T1-B is in.
describe('arxml round-trip on S32K148 samples', () => {
  it.each(SAMPLES)('parses without error: %s', async (name) => {
    const path = join(FIXTURE_DIR, `${name}.arxml`);
    const original = await readFile(path, 'utf8');
    const p = parseArxml(original);
    expect(p.ok).toBe(true);
  });

  // Sprint 7 T1-A: skipped pending serializer <REFERENCE-VALUES> support.
  // Sprint 7 T1-B: serializer now emits <REFERENCE-VALUES><ECUC-REFERENCE-VALUE>
  // with <VALUE-REF DEST="...">shape, matching parser.extractReferenceParams.
  // The EcuC vendor dialect (ECUC-REFERENCE-VALUE inside PARAMETER-VALUES) is
  // normalised on serialize to the standard shape; the params dict is the same
  // either way so the field-level deep-equal still holds.
  it.each(SAMPLES)('round-trip preserves ArxmlDocument fields: %s', async (name) => {
    const path = join(FIXTURE_DIR, `${name}.arxml`);
    const original = await readFile(path, 'utf8');
    const p1 = parseArxml(original);
    expect(p1.ok).toBe(true);
    if (!p1.ok) return;
    const s1 = serializeArxml(p1.value);
    expect(s1.ok).toBe(true);
    if (!s1.ok) return;
    const p2 = parseArxml(s1.value);
    expect(p2.ok).toBe(true);
    if (!p2.ok) return;
    expect(p2.value).toEqual(p1.value);
  });

  it.each(SAMPLES)('serialized XML re-parses cleanly: %s', async (name) => {
    const path = join(FIXTURE_DIR, `${name}.arxml`);
    const original = await readFile(path, 'utf8');
    const p1 = parseArxml(original);
    if (!p1.ok) return;
    const s1 = serializeArxml(p1.value);
    if (!s1.ok) return;
    const p2 = parseArxml(s1.value);
    expect(p2.ok).toBe(true);
    if (p2.ok) {
      expect(p2.value.packages.length).toBe(p1.value.packages.length);
      expect(p2.value.version).toBe(p1.value.version);
    }
  });
});

// ---------------------------------------------------------------------------
// v1.4.0 trust sprint — vendor extensions + multi-reference round-trip
// ---------------------------------------------------------------------------

describe('arxml round-trip — v1.4.0 trust sprint (17c)', () => {
  it('preserves vendor-extension elements across parse → serialize → re-parse', async () => {
    const path = join(FIXTURE_DIR, 'vendor-extension.arxml');
    const original = await readFile(path, 'utf8');

    const p1 = parseArxml(original);
    expect(p1.ok).toBe(true);
    if (!p1.ok) return;

    // The fixture has 3 unknown elements at the package level (siblings of
    // the module): SERVICE-NEEDS, EXCLUSIVE-AREA, EAS-CUSTOM-DATA.
    const pkg = p1.value.packages[0];
    expect(pkg).toBeDefined();
    if (pkg === undefined) return;

    const unknownElements = pkg.elements.filter(
      (c): c is Extract<ArxmlElement, { kind: 'unknown' }> => c.kind === 'unknown',
    );
    expect(unknownElements.length).toBe(3);

    // Spot-check one captured `parsed` object.
    const serviceNeeds = unknownElements.find((c) => c.tagName === 'SERVICE-NEEDS');
    expect(serviceNeeds).toBeDefined();
    if (serviceNeeds === undefined) return;
    expect(serviceNeeds.parsed).toMatchObject({
      'NEEDED-HARDWARE-VARIANT': 'VARIANT-PRE-COMPILE',
      'NEEDED-TRIGGER-MODE': 'EXTERNAL-TRIGGER',
    });

    // Serialize → re-parse → assert the unknown elements survived.
    const s1 = serializeArxml(p1.value);
    expect(s1.ok).toBe(true);
    if (!s1.ok) return;
    const p2 = parseArxml(s1.value);
    expect(p2.ok).toBe(true);
    if (!p2.ok) return;

    const pkg2 = p2.value.packages[0];
    expect(pkg2).toBeDefined();
    if (pkg2 === undefined) return;

    const unknownAfter = pkg2.elements.filter(
      (c): c is Extract<ArxmlElement, { kind: 'unknown' }> => c.kind === 'unknown',
    );
    expect(unknownAfter.length).toBe(3);

    // Compare each captured `parsed` object by tagName. fast-xml-parser
    // normalises whitespace inside `#text` on re-parse (the builder pads
    // children with leading/trailing newlines); we strip that key before
    // comparing so the test is robust to whitespace-only deltas. The
    // meaningful structural data is the set of non-`#text` keys + values.
    const beforeByTag = new Map(
      unknownElements.map((c) => [c.kind === 'unknown' ? c.tagName : '', c]),
    );
    const afterByTag = new Map(
      unknownAfter.map((c) => [c.kind === 'unknown' ? c.tagName : '', c]),
    );
    const stripText = (o: Readonly<Record<string, unknown>>): Record<string, unknown> => {
      const { '#text': _text, ...rest } = o as Record<string, unknown> & {
        '#text'?: unknown;
      };
      void _text;
      return rest;
    };
    for (const [tag, before] of beforeByTag) {
      const after = afterByTag.get(tag);
      expect(after, `tagName=${tag} should survive round-trip`).toBeDefined();
      if (after === undefined || before.kind !== 'unknown' || after.kind !== 'unknown') continue;
      // Compare structural data (non-#text keys). Whitespace inside #text
      // is rebuilt by XMLBuilder and is not part of the round-trip contract.
      expect(stripText(after.parsed)).toEqual(stripText(before.parsed));
    }
  });

  it('round-trips a module with 2+ DEFINITION-REFs (synthetic fixture)', () => {
    // Synthetic ARXML — a single module with two top-level DEFINITION-REFs.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_4-2-2.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EAS</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>Can</SHORT-NAME>
          <DEFINITION-REF DEST="ECUC-MODULE-DEF">/EAS/Can</DEFINITION-REF>
          <DEFINITION-REF DEST="ECUC-MODULE-DEF">/EAS/CanSecondary</DEFINITION-REF>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

    const p1 = parseArxml(xml);
    expect(p1.ok).toBe(true);
    if (!p1.ok) return;

    const mod = p1.value.packages
      .flatMap((p) => p.elements)
      .find((e): e is Extract<ArxmlElement, { kind: 'module' }> => e.kind === 'module');
    expect(mod).toBeDefined();
    if (mod === undefined) return;
    expect(mod.references.length).toBe(2);

    const s1 = serializeArxml(p1.value);
    expect(s1.ok).toBe(true);
    if (!s1.ok) return;
    const p2 = parseArxml(s1.value);
    expect(p2.ok).toBe(true);
    if (!p2.ok) return;

    const mod2 = p2.value.packages
      .flatMap((p) => p.elements)
      .find((e): e is Extract<ArxmlElement, { kind: 'module' }> => e.kind === 'module');
    expect(mod2).toBeDefined();
    if (mod2 === undefined) return;

    // Critical: both DEFINITION-REFs must survive round-trip.
    expect(mod2.references.length).toBe(2);
    expect(mod2.references).toEqual(mod.references);
  });
});
