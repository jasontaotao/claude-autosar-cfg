import { describe, it, expect, beforeEach } from 'vitest';

import { DiagnosticSeverity, DiagnosticCode } from '../diagnostics.js';
import { runPipeline } from '../pipeline.js';
import {
  registerGenerator,
  _resetRegistryForTest,
  type ModuleGenerator,
  type GeneratedArtifact,
} from '../registry.js';

class StubGen implements ModuleGenerator {
  readonly moduleShortName = 'Stub';
  emit(): readonly GeneratedArtifact[] {
    return [{ path: 'Stub/Stub_Cfg.c', content: '/* stub */' }];
  }
}

beforeEach(() => {
  _resetRegistryForTest();
  registerGenerator(new StubGen());
});

describe('runPipeline', () => {
  it('returns exitCode=0 and 1 artifact for a clean run', async () => {
    const result = await runPipeline({
      bswmdIndex: new Map([['Stub', { shortName: 'Stub' }]]),
      ecucValues: new Map([['Stub', {}]]),
      variant: 'PreCompile',
      outDir: '/tmp/out',
      moduleFilter: undefined,
      strict: false,
    });
    expect(result.exitCode).toBe(0);
    expect(result.artifacts.size).toBe(1);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('returns exitCode=0 with WARNING for missing generator', async () => {
    _resetRegistryForTest(); // unregister Stub
    const result = await runPipeline({
      bswmdIndex: new Map([['Stub', { shortName: 'Stub' }]]),
      ecucValues: new Map([['Stub', {}]]),
      variant: 'PreCompile',
      outDir: '/tmp/out',
      moduleFilter: undefined,
      strict: false,
    });
    expect(result.exitCode).toBe(0);
    const warn = result.diagnostics.find((d) => d.code === DiagnosticCode.ECUC_GEN_NO_GENERATOR);
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe(DiagnosticSeverity.WARNING);
  });

  it('returns exitCode=1 with ERROR for generator throw', async () => {
    class ThrowGen implements ModuleGenerator {
      readonly moduleShortName = 'Stub';
      emit(): readonly GeneratedArtifact[] {
        throw new Error('boom');
      }
    }
    _resetRegistryForTest();
    registerGenerator(new ThrowGen());
    const result = await runPipeline({
      bswmdIndex: new Map([['Stub', { shortName: 'Stub' }]]),
      ecucValues: new Map([['Stub', {}]]),
      variant: 'PreCompile',
      outDir: '/tmp/out',
      moduleFilter: undefined,
      strict: false,
    });
    expect(result.exitCode).toBe(1);
    const err = result.diagnostics.find((d) => d.code === DiagnosticCode.ECUC_GEN_THROW);
    expect(err).toBeDefined();
    expect(err!.severity).toBe(DiagnosticSeverity.ERROR);
  });

  it('honors --strict: WARNING becomes exitCode=1', async () => {
    _resetRegistryForTest();
    const result = await runPipeline({
      bswmdIndex: new Map([['Stub', { shortName: 'Stub' }]]),
      ecucValues: new Map([['Stub', {}]]),
      variant: 'PreCompile',
      outDir: '/tmp/out',
      moduleFilter: undefined,
      strict: true,
    });
    expect(result.exitCode).toBe(1);
  });

  it('honors moduleFilter: only runs specified modules', async () => {
    class AGen implements ModuleGenerator {
      readonly moduleShortName = 'A';
      emit(): readonly GeneratedArtifact[] {
        return [{ path: 'A/a.c', content: '' }];
      }
    }
    class BGen implements ModuleGenerator {
      readonly moduleShortName = 'B';
      emit(): readonly GeneratedArtifact[] {
        return [{ path: 'B/b.c', content: '' }];
      }
    }
    _resetRegistryForTest();
    registerGenerator(new AGen());
    registerGenerator(new BGen());
    const result = await runPipeline({
      bswmdIndex: new Map<string, { shortName: string }>([
        ['A', { shortName: 'A' }],
        ['B', { shortName: 'B' }],
      ]),
      ecucValues: new Map([
        ['A', {}],
        ['B', {}],
      ]),
      variant: 'PreCompile',
      outDir: '/tmp/out',
      moduleFilter: ['A'],
      strict: false,
    });
    expect(result.artifacts.size).toBe(1);
    expect(result.artifacts.has('A/a.c')).toBe(true);
  });

  // v1.14.0 MINOR S6 — when Stage 1 (pre-process) produces an ERROR,
  // Stage 2 (generate) MUST NOT run the generators. Running generators
  // against malformed input (e.g. unresolved cross-module refs) can
  // emit garbage that overwrites valid artifacts on disk. The pipeline
  // should bail out before the generators see bad input.
  it('skips Stage 2 generators when Stage 1 produced an ERROR (D-rev2 S6)', async () => {
    let stage2Ran = false;
    class SpyGen implements ModuleGenerator {
      readonly moduleShortName = 'EcuC';
      emit(): readonly GeneratedArtifact[] {
        stage2Ran = true;
        return [];
      }
    }
    _resetRegistryForTest();
    registerGenerator(new SpyGen());

    // Stage 1 ERROR: EcuC references Os, but Os is not loaded.
    // validateReferences pushes ECUC-GEN-010 (REF_UNRESOLVED) at ERROR.
    // We still load EcuC into bswmdIndex so the pipeline would normally
    // reach the generate stage for EcuC — the S6 gate must stop it.
    const result = await runPipeline({
      bswmdIndex: new Map([['EcuC', { shortName: 'EcuC', containers: [] }]]),
      ecucValues: new Map([
        [
          'EcuC',
          {
            definitionRef: '/AUTOSAR/EcucDefs/EcuC',
            parameters: [],
            references: [
              {
                path: 'EcuC/EcuCGeneral/PartitionRef',
                targetModule: 'Os', // not loaded → Stage 1 ERROR
                targetPath: 'Os/OsCore/OsCore_0',
              },
            ],
          },
        ],
      ]),
      variant: 'PreCompile',
      outDir: '/tmp/out',
      moduleFilter: undefined,
      strict: false,
    });

    expect(stage2Ran).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.diagnostics.some((d) => d.code === DiagnosticCode.ECUC_GEN_REF_UNRESOLVED)).toBe(
      true,
    );
    // Stage 2 must not produce any artifacts.
    expect(result.artifacts.size).toBe(0);
  });

  // v1.14.1 PATCH-G (G4) — SEC3 wire-up. The pipeline's Stage 1 must
  // run `validateModuleHeaderPaths` and surface a BSW-SEC-002 ERROR
  // for any BSWMD module whose `moduleHeader` fails the whitelist.
  // S6 early-break then skips Stage 2 (no generator runs for any
  // module), so a SpyGen with `stage2Ran` flag proves the gate works.
  it('v1.14.1 G4 — skips Stage 2 when BSWMD moduleHeader fails SEC3', async () => {
    let stage2Ran = false;
    class SpyGen implements ModuleGenerator {
      readonly moduleShortName = 'EcuC';
      emit(): readonly GeneratedArtifact[] {
        stage2Ran = true;
        return [];
      }
    }
    _resetRegistryForTest();
    registerGenerator(new SpyGen());

    const result = await runPipeline({
      bswmdIndex: new Map([
        // `..` in moduleHeader → SEC3 violation
        ['EcuC', { shortName: 'EcuC', moduleHeader: '../etc/EcuC_Cfg.h', containers: [] }],
      ]),
      ecucValues: new Map(),
      variant: 'PreCompile',
      outDir: '/tmp/out',
      moduleFilter: undefined,
      strict: false,
    });

    expect(stage2Ran).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(
      result.diagnostics.some((d) => d.code === DiagnosticCode.BSW_SEC_INVALID_HEADER_PATH),
    ).toBe(true);
  });

  // v1.14.2 PATCH-H (H1.3) — strict-mode upgrade for BSW-SEC-003.
  // The validator emits BSW-SEC-003 as a WARN (default) so non-strict
  // builds still succeed. When `strict: true`, the pipeline promotes
  // the diagnostic to ERROR so the existing S6 early-break (line 141)
  // skips Stage 2 and the exit code derives to 1. This is the path
  // the v1.14.1 spec promised (line 168: "`strict: true` (CLI flag)
  // promotes `BSW-SEC-003` from WARN → ERROR") — previously blocked
  // because the v1.14.1 parser pushed a free-form string warning
  // instead of a Diagnostic.
  it('v1.14.2 H1.3 — strict mode promotes BSW-SEC-003 from WARN to ERROR', async () => {
    let stage2Ran = false;
    class SpyGen implements ModuleGenerator {
      readonly moduleShortName = 'EcuC';
      emit(): readonly GeneratedArtifact[] {
        stage2Ran = true;
        return [];
      }
    }
    _resetRegistryForTest();
    registerGenerator(new SpyGen());

    const result = await runPipeline({
      bswmdIndex: new Map([
        // '' in includes[] → BSW-SEC-003
        [
          'EcuC',
          {
            shortName: 'EcuC',
            moduleHeader: 'EcuC/EcuC_Cfg.h',
            includes: [''],
            containers: [],
          },
        ],
      ]),
      ecucValues: new Map(),
      variant: 'PreCompile',
      outDir: '/tmp/out',
      moduleFilter: undefined,
      strict: true,
    });

    const sec003 = result.diagnostics.find((d) => d.code === DiagnosticCode.BSW_SEC_EMPTY_INCLUDE);
    expect(sec003).toBeDefined();
    expect(sec003?.severity).toBe(DiagnosticSeverity.ERROR);
    // S6 early-break should still fire (promoted ERROR).
    expect(stage2Ran).toBe(false);
    expect(result.exitCode).toBe(1);
  });

  it('v1.14.2 H1.3 — non-strict mode keeps BSW-SEC-003 as WARN (no early-break)', async () => {
    // Counterpart to the strict test: confirms the promotion is
    // gated on `strict: true`. Non-strict mode must keep the WARN
    // and proceed to Stage 2.
    let stage2Ran = false;
    class SpyGen implements ModuleGenerator {
      readonly moduleShortName = 'EcuC';
      emit(): readonly GeneratedArtifact[] {
        stage2Ran = true;
        return [];
      }
    }
    _resetRegistryForTest();
    registerGenerator(new SpyGen());

    const result = await runPipeline({
      bswmdIndex: new Map([
        [
          'EcuC',
          {
            shortName: 'EcuC',
            moduleHeader: 'EcuC/EcuC_Cfg.h',
            includes: [''],
            containers: [],
          },
        ],
      ]),
      ecucValues: new Map(),
      variant: 'PreCompile',
      outDir: '/tmp/out',
      moduleFilter: undefined,
      strict: false,
    });

    const sec003 = result.diagnostics.find((d) => d.code === DiagnosticCode.BSW_SEC_EMPTY_INCLUDE);
    expect(sec003).toBeDefined();
    expect(sec003?.severity).toBe(DiagnosticSeverity.WARNING);
    // Stage 2 ran (WARN is non-blocking) — exit code 0 with warning.
    expect(stage2Ran).toBe(true);
    expect(result.exitCode).toBe(0);
  });
});
