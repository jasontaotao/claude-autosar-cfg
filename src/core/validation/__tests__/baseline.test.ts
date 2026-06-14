// 5-sample baseline regression: every fixture that seeded
// ECUC_SUBSET_SCHEMA must pass validation with zero errors.
// If a fixture fails, the schema entry is wrong (or the fixture
// itself violates the ECUC subset and needs a marker).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { parseArxml } from '../../arxml/parser.js';
import { validate } from '../validate.js';

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

      const errors = validate(parsed.value);
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
