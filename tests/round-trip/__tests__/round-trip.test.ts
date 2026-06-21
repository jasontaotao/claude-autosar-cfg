// tests/round-trip/__tests__/round-trip.test.ts
// v1.5.1 Foundation — Task 9 acceptance gate (PR(9) per the plan).
//
// What this test guards:
//   1. The parseArxml → serializeArxml pipeline preserves the semantic
//      content of the AUTOSAR document for every fixture in the corpus.
//   2. Two consecutive parse→serialize cycles are stable (the in-memory
//      model round-trips through itself without drift).
//   3. The streaming path (Sub-B/Sub-C of v1.5.1) produces a
//      NormalizedDocument semantically equivalent to the DOM path, so
//      v1.6.0 A+C Headless CLI can route either way without divergence.
//
// Why this is a regression test and not a unit test:
//   A one-line bug in `serializer.ts` (e.g. a missing child shallow-copy in
//   `renderModule`) is silent at the unit level (Object.is on a single
//   field passes) but corrupts the merged doc on the next mutation.
//   Running the full round-trip on real fixture data catches the bug.
//
// Why the tolerance whitelist (XML-string level):
//   See ./tolerance-rules.ts for the full rationale. Summary: XML
//   round-trip never preserves whitespace / attribute order / comments /
//   namespace prefix order exactly, and the v1.5.1 NormalizedDocument
//   model intentionally drops comments. A test that demanded byte-for-byte
//   equality would be useless; a test that whitelists "anything" would
//   be useless too. This whitelist sits in between.
//
// Why the ArxmlDocument-level deep-equal for the 1-pass test:
//   The source files in the corpus contain vendor-specific top-level
//   siblings (e.g. `<EAS-FORMAT>3.5.3</EAS-FORMAT>` inside `<AR-PACKAGE>`)
//   that the v1.5.1 parser does NOT model. The 1-pass test asserts that
//   what the model CAN represent is preserved losslessly — by re-parsing
//   both the source and the serialized output and comparing the resulting
//   `ArxmlDocument` values with deep equality. This is the actual
//   semantic round-trip invariant; the XML-string level tolerance rules
//   are reserved for the 2-pass stability test where both sides have
//   already been normalized through the model.
//
// Why we use the DOM serializer for the stream-path output:
//   Sub-B's `streamParse` produces a NormalizedDocument. There is no
//   `serializeNormalizedDocument` yet — v1.6.0 will add it. For the
//   v1.5.1 acceptance gate, the relevant invariant is that the
//   NormalizedDocument is semantically equivalent to the DOM path's
//   NormalizedDocument, NOT that the stream path can round-trip on its
//   own. We compare the two NormalizedDocument values directly.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseArxml } from '../../../src/core/arxml/parser.js';
import { serializeArxml } from '../../../src/core/arxml/serializer.js';
import { streamParse } from '../../../src/main/arxml-stream/streaming/index.js';
import { fromArxmlDocument } from '../../../src/shared/normalized-document.js';
import type { NormalizedDocument } from '../../../src/shared/normalized-document.js';
import { TOLERANCE_RULES } from '../tolerance-rules.js';

const FIXTURE_DIR = join(process.cwd(), 'tests/fixtures/arxml');

// Fixture selection rationale:
//   - Com_Com.arxml (8.6 MB)     — covers /EAS/ vendor-CDD namespace + large file
//   - EcuC_EcuC.arxml (194 KB)   — covers EcuC vendor dialect (reference param shape)
//   - PduR_PduR.arxml (790 KB)   — covers standard REFERENCE-VALUES shape
//   - WdgIf_WdgIf.arxml (4 KB)   — covers minimal standard shape
//   - comments-rich.arxml (NEW)  — covers comment density (acceptance-gate focus)
//
// Note: the plan referenced `AUTOSAR_MOD_ECUConfigurationParameters.arxml`
// as the first fixture but the project doesn't ship that file; the actual
// corpus in `tests/fixtures/arxml/` lists 6 files (plus our new one). The
// selected 5 cover the same dialect / size matrix.
const FIXTURES = [
  'Com_Com.arxml',
  'EcuC_EcuC.arxml',
  'PduR_PduR.arxml',
  'WdgIf_WdgIf.arxml',
  'comments-rich.arxml',
] as const;

// -----------------------------------------------------------------------------
// 1-pass DOM path: parse source → serialize → re-parse → assert deep-equal
// against the original parse. This is the "what the model can represent
// round-trips losslessly" guard.
// -----------------------------------------------------------------------------

describe('Round-trip — DOM 1-pass (ArxmlDocument semantic equality)', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture} DOM round-trip preserves modeled structure`, () => {
      const content = readFileSync(join(FIXTURE_DIR, fixture), 'utf-8');
      const parsedSrc = parseArxml(content);
      expect(
        parsedSrc.ok,
        parsedSrc.ok ? '' : `parse failed: ${JSON.stringify(parsedSrc.error)}`,
      ).toBe(true);
      if (!parsedSrc.ok) return;
      const serialized = serializeArxml(parsedSrc.value, { sourceArxml: content });
      expect(
        serialized.ok,
        serialized.ok ? '' : `serialize failed: ${serialized.error.message}`,
      ).toBe(true);
      if (!serialized.ok) return;
      // Re-parse the serialized output. Whatever elements the model didn't
      // represent in the source (vendor siblings) will be missing in both
      // sides of the comparison, so the deep-equal reflects only what
      // the model actually preserves.
      const parsedRound = parseArxml(serialized.value);
      expect(
        parsedRound.ok,
        parsedRound.ok ? '' : `re-parse failed: ${JSON.stringify(parsedRound.error)}`,
      ).toBe(true);
      if (!parsedRound.ok) return;
      // Deep equality on the ArxmlDocument value (the full structured
      // content the parser extracts). If a serializer bug drops a
      // module/container/param/references, this assertion fails.
      expect(parsedRound.value).toEqual(parsedSrc.value);
    });
  }
});

// -----------------------------------------------------------------------------
// 2-pass DOM path: parse → serialize → parse → serialize, then compare the
// two serialized outputs under tolerance. Guards against one-step
// coincidence (the first pass "happens to look right" but the in-memory
// model is corrupted and would diverge on the next save).
// -----------------------------------------------------------------------------

describe('Round-trip — DOM 2-pass (XML-string stability under tolerance)', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture} 2-pass round-trip is stable under tolerance`, () => {
      const content = readFileSync(join(FIXTURE_DIR, fixture), 'utf-8');
      const parsed1 = parseArxml(content);
      expect(parsed1.ok).toBe(true);
      if (!parsed1.ok) return;
      const ser1 = serializeArxml(parsed1.value, { sourceArxml: content });
      expect(ser1.ok).toBe(true);
      if (!ser1.ok) return;
      // Second pass: parse the serialized output and serialize again. If
      // the serializer emits something the parser can't ingest, this fails.
      const parsed2 = parseArxml(ser1.value);
      expect(
        parsed2.ok,
        parsed2.ok ? '' : `re-parse failed: ${JSON.stringify(parsed2.error)}`,
      ).toBe(true);
      if (!parsed2.ok) return;
      const ser2 = serializeArxml(parsed2.value, { sourceArxml: ser1.value });
      expect(ser2.ok).toBe(true);
      if (!ser2.ok) return;
      // Pass-2 should match pass-1 under tolerance (both have already had
      // namespace / attribute-order normalized, and both went through the
      // same model that drops the same vendor siblings).
      const diff = diffUnderTolerance(ser1.value, ser2.value);
      expect(diff, diff ?? '').toBeNull();
    });
  }
});

// -----------------------------------------------------------------------------
// Streaming path: DOM NormalizedDocument vs stream NormalizedDocument must
// be semantically equivalent. The "tolerance rules" here are structural
// (the NormalizedDocument IS the canonical form) — no XML regex
// normalization needed. This is the v1.6.0 A+C Headless CLI acceptance
// guard: any divergence means the two paths would produce different CLI
// output, breaking the headless contract.
// -----------------------------------------------------------------------------

describe('Round-trip — DOM vs stream NormalizedDocument', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture}: stream NormalizedDocument matches DOM NormalizedDocument`, async () => {
      const content = readFileSync(join(FIXTURE_DIR, fixture), 'utf-8');
      const parsed = parseArxml(content);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const domDoc = fromArxmlDocument(parsed.value, 'dom');
      const streamDoc: NormalizedDocument = await streamParse(content);
      // origin tag is the only allowed difference (used for diagnostics).
      expect(streamDoc.origin).toBe('stream');
      expect(domDoc.origin).toBe('dom');
      // Everything else must be deeply equal.
      expect(normalizeForCompare(streamDoc)).toEqual(normalizeForCompare(domDoc));
    });
  }
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Normalize an XML string by stripping categories listed in TOLERANCE_RULES.
 * Returns `null` if the two strings are equal after normalization, or a
 * diagnostic message showing the first 200 chars of each diff side.
 */
function diffUnderTolerance(a: string, b: string): string | null {
  let aNorm = a;
  let bNorm = b;
  if (TOLERANCE_RULES.namespacePrefixOrder) {
    // Strip `xmlns="..."` and `xmlns:foo="..."` declarations. The value
    // is a URI that never contains `"`, so the negative-class regex is safe.
    aNorm = aNorm.replace(/\s+xmlns(:\w+)?="[^"]*"/g, '');
    bNorm = bNorm.replace(/\s+xmlns(:\w+)?="[^"]*"/g, '');
  }
  if (TOLERANCE_RULES.namespaceSchemaLocation) {
    // Strip `xsi:schemaLocation="ns-uri xsd-name"` entirely — the
    // serializer regenerates this from its version table. The XSD
    // name (the authoritative version hint) is captured in the parsed
    // ArxmlDocument.version, so dropping the attribute here loses no
    // semantic information. The attribute VALUE may contain a space, so
    // we use a non-greedy `[^"]*` match (the URI + xsd are double-quoted).
    aNorm = aNorm.replace(/\s+xsi:schemaLocation="[^"]*"/g, '');
    bNorm = bNorm.replace(/\s+xsi:schemaLocation="[^"]*"/g, '');
  }
  if (TOLERANCE_RULES.whitespace) {
    aNorm = aNorm.replace(/\s+/g, ' ').trim();
    bNorm = bNorm.replace(/\s+/g, ' ').trim();
  }
  if (TOLERANCE_RULES.comments) {
    aNorm = aNorm.replace(/<!--[\s\S]*?-->/g, '');
    bNorm = bNorm.replace(/<!--[\s\S]*?-->/g, '');
  }
  if (TOLERANCE_RULES.attributeOrder) {
    aNorm = sortAttributesWithinElements(aNorm);
    bNorm = sortAttributesWithinElements(bNorm);
  }
  return aNorm === bNorm
    ? null
    : `Diff after tolerance:\nA: ${aNorm.slice(0, 200)}\nB: ${bNorm.slice(0, 200)}`;
}

/**
 * Sort attributes within every opening tag so the regex comparison is
 * order-insensitive. Self-closing tags handled by the `\/?>` group.
 *
 * Implementation note: a naive `attrs.split(/\s+/)` is wrong because
 * attribute VALUES can contain spaces (e.g. `xsi:schemaLocation="ns xsd"`).
 * This tokenizer walks the substring once, respecting `="..."` quoting
 * and only emitting attribute keys for sorting (the VALUES are preserved
 * verbatim and re-attached to their sorted names — we don't need value
 * equality under tolerance, only key order).
 */
function sortAttributesWithinElements(xml: string): string {
  return xml.replace(
    /<([\w][\w-]*)([^>]*?)(\/?)>/g,
    (_match, tag: string, attrs: string, slash: string) => {
      if (attrs.trim().length === 0) return `<${tag}${attrs}${slash}>`;
      const tokens: { key: string; literal: string }[] = [];
      let i = 0;
      const n = attrs.length;
      while (i < n) {
        // Skip whitespace between attributes.
        while (i < n && /\s/.test(attrs[i]!)) i += 1;
        if (i >= n) break;
        // Read attribute name.
        const nameStart = i;
        while (i < n && /[^\s=]/.test(attrs[i]!)) i += 1;
        const name = attrs.slice(nameStart, i);
        // If the next char is '=', capture the quoted value.
        let literal = attrs.slice(nameStart, i);
        if (i < n && attrs[i] === '=') {
          i += 1;
          const quote = attrs[i];
          if (quote === '"' || quote === "'") {
            i += 1;
            while (i < n && attrs[i] !== quote) i += 1;
            if (i < n) i += 1; // consume closing quote
            literal = attrs.slice(nameStart, i);
          } else {
            // Unquoted value (rare in serialized ARXML, but be safe).
            while (i < n && /\S/.test(attrs[i]!)) i += 1;
            literal = attrs.slice(nameStart, i);
          }
        }
        tokens.push({ key: name, literal });
      }
      const sorted = tokens
        .slice()
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((t) => t.literal)
        .join(' ');
      return `<${tag} ${sorted}${slash}>`;
    },
  );
}

/**
 * Strip the `origin` tag from a NormalizedDocument so deep-equal can
 * compare across DOM and stream origins (origin is the only allowed
 * difference between the two production paths).
 */
function normalizeForCompare(doc: NormalizedDocument): Omit<NormalizedDocument, 'origin'> {
  const { origin, ...rest } = doc;
  // `origin` is the only allowed difference between DOM and stream
  // production paths; we explicitly strip it here so the deep-equal
  // below focuses on the structural content.
  void origin;
  return rest;
}
