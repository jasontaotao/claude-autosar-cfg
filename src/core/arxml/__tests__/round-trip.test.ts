import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseArxml } from '../parser.js';
import { serializeArxml } from '../serializer.js';

const SAMPLES = ['Det_Det', 'EcuC_EcuC', 'Com_Com', 'PduR_PduR', 'WdgIf_WdgIf'] as const;

const FIXTURE_DIR = join(process.cwd(), 'tests', 'fixtures', 'arxml');

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
