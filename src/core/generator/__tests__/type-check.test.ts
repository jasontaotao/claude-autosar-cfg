import { describe, it, expect } from 'vitest';

import {
  validateTypeMatches,
  type BswmdParamDefForTypeCheck,
  type EcucParameterValueForTypeCheck,
} from '../emit/type-check.js';

// v1.39.0 M3 — exhaustiveness guard for `expectedRuntimeKind` switch.
// A future BswmdParamKind variant that misses the switch would
// previously fall through and return `undefined`, causing silent
// runtime-kind mismatch reports (or worse, no report at all). The
// new `default` arm with `satisfies never` surfaces the gap at
// compile time AND throws at runtime.

describe('validateTypeMatches', () => {
  it('flags ECUC-GEN-012 when runtime kind does not match BSWMD kind (v1.39.0 M3)', () => {
    const bswmdByModule = new Map([
      [
        'Com',
        {
          params: [
            {
              shortName: 'ComTxIPduUnusedAreasDefault',
              kind: 'integer',
            } as BswmdParamDefForTypeCheck,
          ],
        },
      ],
    ]);
    const ecucByModule = new Map([
      [
        'Com',
        {
          parameters: [
            {
              shortName: 'ComTxIPduUnusedAreasDefault',
              value: 'seven',
            } as EcucParameterValueForTypeCheck,
          ],
        },
      ],
    ]);
    const out = validateTypeMatches(bswmdByModule, ecucByModule);
    expect(out).toHaveLength(1);
    expect(out[0]?.moduleShortName).toBe('Com');
    expect(out[0]?.ecucPath).toBe('ComTxIPduUnusedAreasDefault');
  });
});
