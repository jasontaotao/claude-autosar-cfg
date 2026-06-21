// A+C integration test #4 — CLI `read` against a project manifest.
//
// A+C spec §10.6 row 4 cross-references W spec §3.4.1 (Demo ECU manifest
// schema). The canonical demo fixture path is `samples/arxml/demo-ecu/`
// but this ships in the W cluster. For A+C-5 we exercise the manifest
// loader with a minimal in-memory manifest pointing at the existing
// v1.5.1 fixtures (Com_Com.arxml). This unblocks G cluster's own W
// Demo ECU integration test (W-3 / W-5) once W cluster ships
// `samples/arxml/demo-ecu/demo.autosarcfg.json`.

import { writeFile, mkdtemp, rm, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { dispatchCommand } from '../../../src/cli/command-dispatcher.js';
import type { ParsedArgs } from '../../../src/cli/commander.js';

const COM_ARXML_SRC = 'D:/claude_proj2/claude-AutosarCfg/tests/fixtures/arxml/Com_Com.arxml';

describe('a-c-4: CLI read against project manifest (W Demo ECU cross-spec)', () => {
  let tmpDir: string;
  let manifestPath: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'a-c-demo-'));
    await mkdir(join(tmpDir, 'value'), { recursive: true });
    await copyFile(COM_ARXML_SRC, join(tmpDir, 'value', 'Com_Com.arxml'));
    manifestPath = join(tmpDir, 'demo.autosarcfg.json');
    const manifest = {
      schemaVersion: '1',
      id: 'demo-ecu-test',
      name: 'Demo ECU (test)',
      createdAt: new Date().toISOString(),
      valueArxmlPaths: ['value/Com_Com.arxml'],
      bswmdPaths: [],
    };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('reads the manifest and emits a ReadResult with summary counts', async () => {
    const parsed: ParsedArgs = {
      kind: 'read',
      global: { projectPath: manifestPath, verbose: false, quiet: false, noColor: false },
      input: { projectPath: manifestPath, format: 'json' },
    };

    const writes: string[] = [];
    const origOut = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array): boolean => {
      writes.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;
    try {
      const code = await dispatchCommand(parsed);
      expect(code).toBe(0);
      const out = JSON.parse(writes.join('')) as {
        ok: boolean;
        command: string;
        projectPath: string;
        summary: { moduleCount: number; containerCount: number };
      };
      expect(out.ok).toBe(true);
      expect(out.command).toBe('read');
      expect(out.summary.moduleCount).toBeGreaterThanOrEqual(0);
    } finally {
      process.stdout.write = origOut;
    }
  }, 15_000);
});
