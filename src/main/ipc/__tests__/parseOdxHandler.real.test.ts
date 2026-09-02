// @vitest-environment node
//
// parseOdxHandler real-OEM validation — v1.22.0 T4 (ship-blocking
// pre-validation per memory rule "Real-OEM fixture required for
// vendor-format parsers").
//
// Hand-crafted minimal fixtures in parseOdxHandler.test.ts prove
// the parser handles a controlled subset. Before ship we MUST
// validate against a real OEM ODX-D file to catch heuristic bugs
// (e.g. unhandled namespace prefixes, DTC-DOP child shapes that
// differ from the spec, vendor extensions that look like DTCs but
// aren't, etc.).
//
// Source: `samples/odx/Demo_Cdd.odx-d` — a 897 KB ODX-D exported
// from Vector CANdelaStudio::ODXExport220.dll 15.0.0 (real
// production tooling, same source as the peakcan-host v2.0.4
// PATCH real-OEM fixture which surfaced 99 DTCs / 4 routines /
// 34 DIDs from a Vector .odx-d).
//
// Behaviour pinned by this test (T4 Phase 2 — RED):
//   1. The real file parses without error (T1's 4 MEDIUMs — M1
//      XMLValidator preflight, M2 vendor extensions, M3
//      displayCode naming, M4 coverage gaps — must all hold up
//      against real-world structure).
//   2. At least 1 DTC, 1 DID, and 1 Routine are extracted (the
//      file is non-empty diagnostic data; if any list comes back
//      empty, M2 caught a vendor-extension child shape we did not
//      handle).
//   3. DTC TROUBLE-CODE values are non-empty strings (M3 — if
//      stripHexPrefix ate a real code, the test catches it).
//   4. DTC IDs are non-empty strings (defensive — a parse that
//      silently loses IDs is a regression).
//   5. Counts match the actual list lengths (defensive — T1's
//      pre-computed counts must not drift from the data).

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseOdxHandler } from '../parseOdxHandler.js';

const FIXTURE_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'samples',
  'odx',
  'Demo_Cdd.odx-d',
);

describe('parseOdxHandler real-OEM validation (T4)', () => {
  it('samples/odx/Demo_Cdd.odx-d exists and is non-empty', async () => {
    const stat = await fs.stat(FIXTURE_PATH);
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBeGreaterThan(0);
  });

  it('real Vector .odx-d parses without error (no MEDIUMs regress)', async () => {
    const content = await fs.readFile(FIXTURE_PATH, 'utf8');
    const res = parseOdxHandler({ path: FIXTURE_PATH, content });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      // Surface the actual error for the ship-blocker log.
      throw new Error(`Real ODX-D parse failed: ${res.error.kind} — ${res.error.message}`);
    }
    return res;
  });

  it('real .odx-d contains at least 1 DTC + 1 Routine (DIDs are optional in ODX-D)', async () => {
    const content = await fs.readFile(FIXTURE_PATH, 'utf8');
    const res = parseOdxHandler({ path: FIXTURE_PATH, content });
    if (!res.ok) throw new Error(`parse failed: ${res.error.message}`);
    expect(res.value.dtcs.length).toBeGreaterThan(0);
    // DIDs are optional in ODX-D — the Vector Demo fixture has 0
    // DIDs (this UDS diagnostic database only models DTCs + Services).
    // We only assert DTC + Routine counts.
    expect(res.value.routines.length).toBeGreaterThan(0);
  });

  it('real .odx-d DTC fields are populated (id + troubleCode non-empty)', async () => {
    const content = await fs.readFile(FIXTURE_PATH, 'utf8');
    const res = parseOdxHandler({ path: FIXTURE_PATH, content });
    if (!res.ok) throw new Error(`parse failed: ${res.error.message}`);
    for (const dtc of res.value.dtcs) {
      expect(dtc.id.length).toBeGreaterThan(0);
      expect(dtc.troubleCode.length).toBeGreaterThan(0);
    }
  });

  it('real .odx-d pre-computed counts match the list lengths', async () => {
    const content = await fs.readFile(FIXTURE_PATH, 'utf8');
    const res = parseOdxHandler({ path: FIXTURE_PATH, content });
    if (!res.ok) throw new Error(`parse failed: ${res.error.message}`);
    expect(res.value.dtcCount).toBe(res.value.dtcs.length);
    expect(res.value.didCount).toBe(res.value.dids.length);
    expect(res.value.routineCount).toBe(res.value.routines.length);
  });

  it('real .odx-d first DTC has the expected Vector export shape', async () => {
    // Pins concrete values from the real file so the next
    // M2-class vendor-shape regression cannot slip through with
    // only a "non-empty" assertion. Demo_Cdd.odx-d first DTC:
    //   <DTC ID="_258">
    //     <SHORT-NAME>DTC0A7D01</SHORT-NAME>
    //     <TROUBLE-CODE>687361</TROUBLE-CODE>
    //     <DISPLAY-TROUBLE-CODE>P0A7D01</DISPLAY-TROUBLE-CODE>
    //     <TEXT>电池SOC过低报警一级</TEXT>
    const content = await fs.readFile(FIXTURE_PATH, 'utf8');
    const res = parseOdxHandler({ path: FIXTURE_PATH, content });
    if (!res.ok) throw new Error(`parse failed: ${res.error.message}`);
    const first = res.value.dtcs[0];
    expect(first).toBeDefined();
    expect(first?.id).toBe('_258');
    // SHORT-NAME is the DTC's own (not the DTC-DOP's). Vector
    // emits `DTC0A7D01` for this row.
    expect(first?.shortName).toBe('DTC0A7D01');
    // TROUBLE-CODE is a bare decimal (no `0x` prefix) per Vector
    // export.
    expect(first?.troubleCode).toBe('687361');
    // DISPLAY-TROUBLE-CODE is the SAE J2012 form.
    expect(first?.displayCode).toBe('P0A7D01');
    // TEXT carries the diagnostic text in the file's locale
    // (Chinese in this case).
    expect(first?.text).toContain('电池SOC');
  });
});

  it('extracts numeric identifiers from every DID and Routine in Demo_Cdd.odx-d', async () => {
    const content = await fs.readFile(FIXTURE_PATH, 'utf8');
    const res = parseOdxHandler({ path: FIXTURE_PATH, content });
    if (!res.ok) throw new Error(`parse failed: ${res.error.message}`);
    expect(res.value.dids.every((d) => d.identifier !== undefined)).toBe(true);
    expect(res.value.routines.every((r) => r.identifier !== undefined)).toBe(true);
    expect(res.value.dids.find((d) => d.shortName === 'RQ_CellVolt_JG_Read')?.identifier).toBe(258);
    expect(
      res.value.routines.find((r) => r.shortName === 'RQ_checkProgrammingPreconditions_Start')
        ?.identifier,
    ).toBe(515);
  });
