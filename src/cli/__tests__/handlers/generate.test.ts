// Generate command handler test (v1.11.0 — Task 19).
//
// Pins the MVP happy-path: register EcuCGenerator, build a minimal project
// skeleton in a tmp dir, call `generateHeadlessProject`, and assert the
// returned envelope surfaces generated files + exit code 0.
//
// Follows the existing CLI test patterns (captureStd, real fs in tmpdir,
// real EcuCGenerator handle). Stubs the project loader so we don't depend
// on the full `openProject` IPC pipeline — the brief explicitly says the
// MVP handler does the parsing inline (mirror of `workspace-111` test).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generateHeadlessProject } from '../../handlers/generate.js';
import { _resetRegistryForTest } from '../../../core/generator/registry.js';
import type { BswmdModuleDefLite } from '../../../core/generator/normalize.js';
import type { EcucModuleConfigurationValuesInput } from '../../../core/generator/normalize.js';
import type { GenerateArgs } from '../../../shared/headless/ipc-contract.js';

/**
 * Test-only extension of the public `GenerateArgs` schema. The handler
 * accepts underscore-prefixed escape hatches to bypass the fs-based
 * project loader; that surface is not part of the wire contract, so
 * tests add it via an intersection rather than `as unknown` casts.
 */
type GenerateArgsForTest = GenerateArgs & {
  readonly _bswmdIndex?: ReadonlyMap<string, BswmdModuleDefLite>;
  readonly _ecucValues?: ReadonlyMap<string, EcucModuleConfigurationValuesInput>;
};

/**
 * Test fixture shape for the BSWMD module def. The wire-facing
 * `BswmdModuleDefLite` is intentionally a one-field opaque handle; the
 * runtime pipeline widens it via `ReadonlyMap<string, unknown>` and the
 * generators walk `containers` directly. The richer shape below
 * captures the minimal in-memory fixture needed by EcuCGenerator.
 */
interface BswmdContainerDefFixture {
  readonly shortName: string;
  readonly parameters: readonly { readonly kind: string }[];
}
interface BswmdModuleDefFixture extends BswmdModuleDefLite {
  readonly containers: readonly BswmdContainerDefFixture[];
}

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'claude-gen-handler-'));
  // Minimal manifest — the handler only reads bswmdPaths + valueArxmlPaths,
  // both empty here. We inject BSWMD / BSWCFG via the handler's loader stub.
  await writeFile(
    join(projectDir, 'project.autosarcfg.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'test',
      name: 'test',
      valueArxmlPaths: [],
      bswmdPaths: [],
    }),
  );
  _resetRegistryForTest();
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
  _resetRegistryForTest();
});

describe('generateHeadlessProject', () => {
  it('writes generated files into the project dir for a minimal EcuC input', async () => {
    // Seed inline BSWMD + BSWCFG that the loader helper will surface to the
    // pipeline. A bare `{ shortName: 'EcuC' }` def + empty values is enough
    // for EcuCGenerator to emit `EcuC/EcuC_Cfg.h` (the container header).
    const bswmdIndex = new Map<string, BswmdModuleDefFixture>([
      [
        'EcuC',
        {
          shortName: 'EcuC',
          containers: [{ shortName: 'EcuCGeneral', parameters: [] }],
        },
      ],
    ]);
    const ecucValues = new Map<string, EcucModuleConfigurationValuesInput>([
      ['EcuC', { parameters: [], references: [] }],
    ]);

    const args: GenerateArgsForTest = {
      command: 'generate',
      projectPath: projectDir,
      format: 'json',
      // Inject pre-loaded maps for the test — bypass fs-based loader.
      _bswmdIndex: bswmdIndex,
      _ecucValues: ecucValues,
    };
    const result = await generateHeadlessProject(args);

    expect(result.ok).toBe(true);
    expect(result.command).toBe('generate');
    expect(result.variant).toBe('PreCompile');
    expect(result.projectPath).toBe(projectDir);
    expect(result.files.length).toBeGreaterThan(0);
    // At least one generated file should mention EcuC_Cfg.
    const paths = result.files.map((f) => f.path);
    expect(paths.some((p) => p.includes('EcuC_Cfg'))).toBe(true);
  });
});
