// 5-sample baseline regression: every fixture that used to be covered by
// ECUC_SUBSET_SCHEMA must pass validation with zero errors. The layer
// in `_testSchemaLayer.ts` mirrors those 46 entries; if a fixture
// fails, the layer is wrong (or the fixture itself violates the ECUC
// subset and needs a marker).
//
// `schema-unknown` is filtered out before assertion: the 46-entry layer
// doesn't catalogue every param the fixtures carry (e.g. Det has
// `DetReportRuntimeErrorCallout` beyond the canonical subset), and the
// pre-subset-removal baseline treated "no schema entry" as silent-skip.
// We're preserving that contract here — the new
// `validate-with-layer-then-flag-unknown` behaviour is exercised in
// `validateProject.schemaLayer.test.ts`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { parseArxml } from '../../arxml/parser.js';
import { validate } from '../validate.js';

import { buildSubsetLikeLayer } from './_testSchemaLayer.js';

const LAYER = buildSubsetLikeLayer();

const FIXTURES = [
  'Det_Det.arxml',
  'EcuC_EcuC.arxml',
  'Com_Com.arxml',
  'PduR_PduR.arxml',
  'WdgIf_WdgIf.arxml',
] as const;

describe('5-sample baseline regression', () => {
  for (const name of FIXTURES) {
    it(`${name}: validate returns 0 errors`, () => {
      const path = join(process.cwd(), 'tests', 'fixtures', 'arxml', name);
      const xml = readFileSync(path, 'utf-8');
      const parsed = parseArxml(xml);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return; // type guard for TS; expect above already failed

      // Filter 'schema-unknown' — see file header for rationale.
      const errors = validate(parsed.value, LAYER).filter((e) => e.kind !== 'schema-unknown');
      if (errors.length > 0) {
        // Surface first 5 errors with full diagnostic context so a
        // failure message is actionable, not a 100-line dump.
        // eslint-disable-next-line no-console
        console.error(`\nBaseline failure for ${name}: ${errors.length} errors`);
        for (const e of errors.slice(0, 5)) {
          // eslint-disable-next-line no-console
          console.error(`  [${e.kind}] ${e.path} :: ${e.message}`);
        }
      }
      expect(errors).toEqual([]);
    });
  }
});
