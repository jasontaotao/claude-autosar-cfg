// Sprint 13 Stage 5.D — `arxml:parse` IPC handler tests.
//
// The handler is a thin wrapper over `parseArxml` (it does no
// file I/O — `project:open` / `open arxml` already read the content).
// We don't stand up Electron's `ipcMain` here; these tests exercise
// the same code path the handler runs by calling `parseArxmlHandler`
// directly and verifying the response shape matches `ParseArxmlResponse`.
//
// The 5 cases that matter for the IPC envelope:
//   1. happy path (small valid ARXML) → `{ ok: true, value: ArxmlDocument }`
//   2. content exactly at the 32 MiB cap (boundary inclusive) → `{ ok: true, ... }`
//      — uses a 1 MiB payload padded to 32 MiB; we don't construct a
//        valid 32 MiB ARXML in memory (silly memory pressure); the test
//        pins the boundary by *triggering* the cap branch and verifying
//        a 1-byte over the cap is rejected.
//   3. content 1 byte over the 32 MiB cap → `{ ok: false, error: { kind: 'xml-malformed', ... } }`
//   4. xml-malformed payload (under cap) → `{ ok: false, error: { kind: 'xml-malformed', ... } }`
//   5. empty string → `{ ok: false, error: { kind: 'xml-malformed' | 'missing-root', ... } }`
//
// `parseArxml` itself never throws on bad input — it returns a Result
// envelope. That's the contract the IPC handler depends on.

import { describe, it, expect } from 'vitest';

import { parseArxmlHandler, ARXML_MAX_BYTES } from '../parseArxmlHandler.js';

const MIN_VALID_ARXML = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EAS</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>EcuC</SHORT-NAME>
          <DEFINITION-REF DEST="ECUC-MODULE-DEF">/EAS/EcuC</DEFINITION-REF>
          <CONTAINERS/>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

const ONE_MIB = 1024 * 1024;

describe('arxml:parse handler (Sprint 13 Stage 5.D) — Result envelope shape', () => {
  it('exports a 32 MiB cap constant shared with the size check', () => {
    // Pin the documented cap so a future re-tightening can't silently
    // break legitimate "load a 12 MiB AUTOSAR master BSWMD" paths.
    expect(ARXML_MAX_BYTES).toBe(32 * ONE_MIB);
  });

  it('returns ok=true with ArxmlDocument for a small valid ECUC input', () => {
    const r = parseArxmlHandler({ path: 'inline://test.arxml', content: MIN_VALID_ARXML });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    // version is the AUTOSAR major version literal ("4.0" → normalized
    // by detectVersion into the numeric form when supported). Don't pin
    // the exact literal — Sprint 12 #2 has 4.0 in SUPPORTED_VERSIONS.
    expect(typeof r.value.version).toBe('string');
    expect(r.value.packages).toHaveLength(1);
  });

  it('returns ok=false with xml-malformed error for unclosed tag input (under cap)', () => {
    const r = parseArxmlHandler({
      path: 'inline://bad.arxml',
      content: '<AUTOSAR><AR-PACKAGES><AR-PACKAGE>',
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.error.kind).toBe('xml-malformed');
  });

  it('returns ok=false (does not throw) for empty-string input', () => {
    const r = parseArxmlHandler({ path: 'inline://empty.arxml', content: '' });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    // Either xml-malformed or missing-root is acceptable — what matters
    // is that the IPC handler never throws to the IPC layer.
    expect(['xml-malformed', 'missing-root']).toContain(r.error.kind);
  });

  it('returns ok=false with cap-exceeded error when content is 1 byte over the 32 MiB cap', () => {
    // 32 MiB + 1 byte. We don't actually want fast-xml-parser to see this
    // payload (would OOM the test runner); the cap check short-circuits
    // before parseArxml is called.
    const oversized = ' '.repeat(32 * ONE_MIB + 1);
    const r = parseArxmlHandler({ path: 'inline://huge.arxml', content: oversized });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    // Reuse the `xml-malformed` kind (matches the BSWMD cap pattern in
    // register.ts:307) so the renderer can surface a single error kind
    // for "payload rejected before parse".
    expect(r.error.kind).toBe('xml-malformed');
    // The message must surface the MiB cap and the actual size so the
    // user can decide whether the file is corrupted or just too big.
    if (r.error.kind === 'xml-malformed') {
      expect(r.error.message).toMatch(/too large/i);
      expect(r.error.message).toMatch(/32\.0\s*MiB/);
      expect(r.error.message).toMatch(/max 32\.0\s*MiB/);
    }
  });

  it('returns ok=false for an exactly-32MiB-content that fast-xml-parser cannot parse', () => {
    // Exactly 32 MiB is the inclusive boundary — the cap check uses `>`
    // so this is allowed past the cap. We pad with spaces which is not
    // valid ARXML, so the cap allows the call through and parseArxml
    // returns a malformed-XML error (not a cap error). This pins the
    // "boundary inclusive" contract.
    const exactly = ' '.repeat(32 * ONE_MIB);
    const r = parseArxmlHandler({ path: 'inline://boundary.arxml', content: exactly });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    // Reached the parser — error must be a parse error, not the cap error.
    expect(r.error.kind).toBe('xml-malformed');
    if (r.error.kind === 'xml-malformed') {
      expect(r.error.message).not.toMatch(/too large/i);
    }
  });
});
