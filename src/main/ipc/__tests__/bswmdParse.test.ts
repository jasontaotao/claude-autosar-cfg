// Sprint 12 #1 — BSWMD_PARSE IPC handler shape tests.
//
// The handler itself is a thin wrapper over `parseBswmd` (it does no
// file I/O — `project:open` already read the content). We don't stand
// up Electron's `ipcMain` here; these tests exercise the same code
// path the handler runs by calling `parseBswmd` directly and verifying
// the response shape matches `ParseBswmdResponse`.
//
// The 4 cases that matter for the IPC envelope:
//   1. happy path → `{ ok: true, value: BswmdDocument }`
//   2. xml-malformed → `{ ok: false, error: { kind: 'xml-malformed', ... } }`
//   3. missing-root → `{ ok: false, error: { kind: 'missing-root', ... } }`
//   4. unsupported-version → `{ ok: false, error: { kind: 'unsupported-version', ... } }`
//
// `parseBswmd` itself never throws on bad input — it returns a Result
// envelope. That's the contract the IPC handler depends on.

import { describe, it, expect } from 'vitest';

import { parseBswmd } from '../../../core/project/bswmd.js';

const MIN_ECUC_MODULE_DEF = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_00046.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Can</SHORT-NAME>
          <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
          <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
          <CONTAINERS/>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

describe('bswmd:parse handler (Sprint 12 #1) — Result envelope shape', () => {
  it('returns ok=true with BswmdDocument for valid ECUC-MODULE-DEF input', () => {
    const r = parseBswmd(MIN_ECUC_MODULE_DEF);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    // `dialect` lives on the module (per-module variant), not on the
    // document — Sprint 12 #1 parser design choice (see bswmd.ts).
    expect(r.value.modules).toHaveLength(1);
    expect(r.value.modules[0]?.dialect).toBe('ecuc-module-def');
    expect(r.value.modules[0]?.shortName).toBe('Can');
  });

  it('returns ok=false with xml-malformed error for unclosed tag input', () => {
    const r = parseBswmd('<AUTOSAR><AR-PACKAGES><AR-PACKAGE>');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error.kind).toBe('xml-malformed');
  });

  it('returns ok=false with missing-root error when <AUTOSAR> is absent', () => {
    const r = parseBswmd('<?xml version="1.0"?><FOO/>');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error.kind).toBe('missing-root');
  });

  it('returns ok=false with unsupported-version error for r3.x namespace', () => {
    const r3Xml = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r3.5">
  <AR-PACKAGES><AR-PACKAGE><SHORT-NAME>X</SHORT-NAME></AR-PACKAGE></AR-PACKAGES>
</AUTOSAR>`;
    const r = parseBswmd(r3Xml);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error.kind).toBe('unsupported-version');
  });

  it('returns ok=false (does not throw) for empty-string input', () => {
    const r = parseBswmd('');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    // Either xml-malformed or missing-root is acceptable — what matters
    // is that the IPC handler never throws to the IPC layer.
    expect(['xml-malformed', 'missing-root']).toContain(r.error.kind);
  });
});
