// arxml-stream/streaming/__tests__/sax-reader.test.ts
// Verify that streamParse produces the same NormalizedDocument shape
// as the DOM path (parseArxml + fromArxmlDocument). Also exercises
// error handling and a perf regression alarm.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseArxml } from '../../../../core/arxml/parser.js';
import { fromArxmlDocument } from '../../../../shared/normalized-document.js';
import { streamParse } from '../index.js';

const FIXTURE_DIR = join(process.cwd(), 'tests/fixtures/arxml');

// Use the 5 fixtures the round-trip suite uses (per PR(9) plan). The
// vendor-extension.arxml exercises the catch-all `unknown` element kind.
const FIXTURES = [
  'Com_Com.arxml',
  'Det_Det.arxml',
  'EcuC_EcuC.arxml',
  'PduR_PduR.arxml',
  'WdgIf_WdgIf.arxml',
  'vendor-extension.arxml',
] as const;

describe('streamParse — equivalence with DOM', () => {
  for (const fixture of FIXTURES) {
    it(`produces equivalent NormalizedDocument for ${fixture}`, async () => {
      const content = readFileSync(join(FIXTURE_DIR, fixture), 'utf-8');

      const domParsed = parseArxml(content);
      if (!domParsed.ok) {
        throw new Error(`DOM parse failed for ${fixture}: ${domParsed.error.kind}`);
      }
      const domDoc = fromArxmlDocument(domParsed.value, 'dom');

      const streamDoc = await streamParse(content);

      // Compare ignoring the `origin` field. We destructure into
      // fresh names so the eslint `no-unused-vars` rule doesn't trip
      // on the deliberately-unused `origin` key.
      const domRest = { ...domDoc, origin: undefined };
      const streamRest = { ...streamDoc, origin: undefined };
      delete (domRest as { origin?: unknown }).origin;
      delete (streamRest as { origin?: unknown }).origin;
      expect(streamRest).toEqual(domRest);
    });
  }
});

describe('streamParse — error handling', () => {
  it('throws on malformed XML', async () => {
    await expect(streamParse('<not closed>')).rejects.toThrow();
  });
});

describe('streamParse — performance', () => {
  it('parses a 10MB synthetic ARXML in <5s (regression alarm)', async () => {
    const base = readFileSync(join(FIXTURE_DIR, 'Com_Com.arxml'), 'utf-8');
    // Pad to ~10 MiB using XML comments (skip-safe, byte-counted).
    const padded = base + '<!-- ' + 'x'.repeat(10 * 1024 * 1024) + ' -->';

    const start = Date.now();
    await streamParse(padded);
    const dur = Date.now() - start;
    if (dur > 2000) {
      // eslint-disable-next-line no-console
      console.warn(`[perf] streamParse 10MB took ${dur}ms (target < 2000ms)`);
    }
    expect(dur).toBeLessThan(5000);
  }, 30_000);
});
