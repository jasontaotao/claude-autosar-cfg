// Repro: confirm strict-reject message + parseBswmd against the real
// EB tresos R4.2.2 BSWMD. This is what the user sees in their renderer
// when they click "Open ARXML" with the BSWMD file selected.

import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseBswmd } from '../../project/bswmd.js';
import { parseArxml } from '../parser.js';

const REAL_BSWMD_PATH = 'C:/EB/tresos/autosar/4.2.2/AUTOSAR_MOD_ECUConfigurationParameters.arxml';

describe('BSWMD path through both parsers', () => {
  const hasFile = existsSync(REAL_BSWMD_PATH);
  const xml = hasFile ? readFileSync(REAL_BSWMD_PATH, 'utf8') : '';

  it.runIf(hasFile)('parseArxml strict-rejects with helpful hint (Open ARXML flow)', () => {
    const r = parseArxml(xml);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('invalid-structure');
    if (r.error.kind !== 'invalid-structure') return;
    console.log('[repro] parseArxml error:', r.error.message);
    expect(r.error.message).toMatch(/BSWMD|Load BSWMD/);
  });

  it.runIf(hasFile)('parseBswmd accepts it (Load BSWMD flow)', () => {
    const r = parseBswmd(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) {
      // BswmdError union is not uniform — 'unsupported-version' carries
      // only `version`, the other kinds carry `message`. Surface both
      // shapes here so a regression is obvious in CI logs.
      const detail =
        r.error.kind === 'unsupported-version'
          ? `unsupported version ${r.error.version}`
          : r.error.message;
      throw new Error(`parseBswmd failed: ${detail}`);
    }
    console.log(
      `[repro] parseBswmd: version=${r.value.version}, modules=${r.value.modules.length}`,
    );
  });
});
