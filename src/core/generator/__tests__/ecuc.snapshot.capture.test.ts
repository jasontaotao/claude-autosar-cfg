// One-shot capture script for EcuC generator goldens. Run with:
//   pnpm vitest run src/core/generator/__tests__/ecuc.snapshot.capture.test.ts
//
// v1.13.4 PATCH-B (M5) introduced the first intentional emission change
// since the snapshot tests were authored: real BSWMD shortName replaces
// the hardcoded `'Param'` literal. This test regenerates the goldens
// under `testdata/generator/ecuc-expected/{PreCompile,Mixed,Refs}-1/`
// from the current fixture + generator.
//
// The capture test is gated behind `RUN_SNAPSHOT_CAPTURE=1` so it does
// not run during normal `pnpm test`. To regenerate:
//   RUN_SNAPSHOT_CAPTURE=1 pnpm vitest run src/core/generator/__tests__/ecuc.snapshot.capture.test.ts

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it } from 'vitest';

import { EcuCGenerator } from '../modules/ecuc.js';
import { normalizeToTree, type BswmdModuleDefLite } from '../normalize.js';
import { _resetRegistryForTest, type GenerationContext } from '../registry.js';

import {
  ecucDef,
  ecucValuesPreCompile,
  ecucValuesMixed,
  ecucValuesRefs,
  type BswmdModuleDef,
  type EcucModuleConfigurationValues,
} from './test-fixtures/ecuc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outRoot = join(__dirname, '..', '..', '..', '..', 'testdata', 'generator', 'ecuc-expected');

function makeCtx(): GenerationContext {
  // v1.13.4 PATCH-B (L3) — populate bswmdParamIndex so the structured
  // configClass lookup in isPostBuild() can route PostBuildParam to
  // EcuC_PBcfg.c. Without this, the capture would silently skip the
  // PBcfg.c artifact (conservative fallback when index is empty).
  //
  // v1.14.2 PATCH-H (H4) — populate `bswmdIndex` to match the
  // runtime snapshot test (`ecuc.snapshot.test.ts:71-73`). Before
  // H4 the capture script ran with an empty bswmdIndex Map, so a
  // re-run would silently regenerate goldens that diverged from
  // the runtime behavior (Refs-1 would lose its cross-ref
  // `#include "Os/Os_Cfg.h"`, and the v1.14.2 H2 self-include
  // logic would never fire during capture). After H4 the capture
  // uses the same Map the runtime test uses, so a fresh capture
  // produces goldens byte-identical to what the runtime test
  // asserts (parity test in `ecuc.snapshot.test.ts`).
  const tree = normalizeToTree(
    new Map([[ecucDef.shortName, ecucDef as unknown as BswmdModuleDefLite]]),
    new Map(),
  );
  return {
    variant: 'PreCompile',
    bswmdIndex: new Map<string, unknown>([
      ['EcuC', { shortName: 'EcuC', moduleHeader: 'EcuC/EcuC_Cfg.h' }],
      ['Os', { shortName: 'Os', moduleHeader: 'Os/Os_Cfg.h' }],
    ]) as never,
    implByModule: new Map<string, string>(),
    outDir: '/tmp',
    diagnostics: [],
    bswmdParamIndex: tree.bswmdParamIndex,
  };
}

const RUN_CAPTURE = process.env.RUN_SNAPSHOT_CAPTURE === '1';

describe.skipIf(!RUN_CAPTURE)('capture EcuC snapshots', () => {
  it('regenerates PreCompile/Mixed/Refs goldens', () => {
    const generator = new EcuCGenerator();
    const scenarios: Array<{
      scenario: 'PreCompile' | 'Mixed' | 'Refs';
      values: EcucModuleConfigurationValues;
    }> = [
      { scenario: 'PreCompile', values: ecucValuesPreCompile as EcucModuleConfigurationValues },
      { scenario: 'Mixed', values: ecucValuesMixed as EcucModuleConfigurationValues },
      { scenario: 'Refs', values: ecucValuesRefs as EcucModuleConfigurationValues },
    ];
    for (const { scenario, values } of scenarios) {
      _resetRegistryForTest();
      const out = generator.emit(ecucDef as unknown as BswmdModuleDef, values, makeCtx());
      const dir = join(outRoot, `${scenario}-1`);
      mkdirSync(dir, { recursive: true });
      for (const art of out) {
        const file = join(dir, art.path.split('/').pop()!);
        writeFileSync(file, art.content, 'utf8');
        // eslint-disable-next-line no-console
        console.log(`wrote ${file} (${art.content.length} bytes)`);
      }
    }
  });
});
