// Sprint 13+ repro — verify parseBswmd against the real EB tresos R4.2.2
// AUTOSAR_MOD_ECUConfigurationParameters.arxml shipped with EB tresos.
// This file is purely schema-side (84 ECUC-MODULE-DEF blocks, no
// ECUC-MODULE-CONFIGURATION-VALUES), so it's the canonical "pure BSWMD"
// case the strict-reject logic in parser.ts must NOT mis-handle via the
// `parseBswmd` entry point.
//
// Skipped automatically if the file isn't present on the developer's
// machine (CI may not have EB tresos installed). Mirrors the
// `it.runIf(FileExists)` pattern from parser-namespace.test.ts.

import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseBswmd } from '../bswmd.js';

const REAL_BSWMD_PATH = 'C:/EB/tresos/autosar/4.2.2/AUTOSAR_MOD_ECUConfigurationParameters.arxml';

describe('parseBswmd — EB tresos R4.2.2 real fixture', () => {
  const hasFile = existsSync(REAL_BSWMD_PATH);
  const xml = hasFile ? readFileSync(REAL_BSWMD_PATH, 'utf8') : '';

  it.runIf(hasFile)('parses the AUTOSAR standard ECUC-MODULE-DEF dialect', () => {
    const r = parseBswmd(xml);
    if (!r.ok) {
      // Surface the error verbatim so a regression in namespace / version
      // detection is obvious in CI logs. BswmdError's 'unsupported-version'
      // branch carries only `version`; other branches carry `message`.
      const detail =
        r.error.kind === 'unsupported-version'
          ? `unsupported version ${r.error.version}`
          : r.error.message;
      throw new Error(`parseBswmd failed: kind=${r.error.kind} ${detail}`);
    }
    expect(r.value.version).toBe('4.0');
    expect(r.value.modules.length).toBeGreaterThan(0);
    // Spot-check: the standard AUTOSAR Parameter Definition ships all
    // modules (Adc, BswM, Can, CanIf, Com, ...). At least one of those
    // canonical names should appear.
    const names = new Set(r.value.modules.map((m) => m.shortName));
    expect(
      ['Adc', 'BswM', 'Can', 'CanIf'].some((n) => names.has(n)),
      `expected canonical AUTOSAR modules; got: ${[...names].slice(0, 10).join(', ')}`,
    ).toBe(true);
  });

  it.runIf(!hasFile)('skips when EB tresos is not installed', () => {
    // No-op; logged so it's clear why this test is silent in some envs.
    expect(hasFile).toBe(false);
  });
});
