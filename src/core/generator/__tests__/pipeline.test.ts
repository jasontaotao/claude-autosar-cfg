import { describe, it, expect, beforeEach } from 'vitest';
import { runPipeline } from '../pipeline.js';
import {
  registerGenerator,
  _resetRegistryForTest,
  type ModuleGenerator,
  type GeneratedArtifact,
} from '../registry.js';
import { DiagnosticSeverity, DiagnosticCode } from '../diagnostics.js';

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
    const warn = result.diagnostics.find(
      d => d.code === DiagnosticCode.ECUC_GEN_NO_GENERATOR,
    );
    expect(warn).toBeDefined();
    expect(warn!.severity).toBe(DiagnosticSeverity.WARNING);
  });

  it('returns exitCode=1 with ERROR for generator throw', async () => {
    class ThrowGen implements ModuleGenerator {
      readonly moduleShortName = 'Stub';
      emit(): readonly GeneratedArtifact[] { throw new Error('boom'); }
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
    const err = result.diagnostics.find(
      d => d.code === DiagnosticCode.ECUC_GEN_THROW,
    );
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
      emit(): readonly GeneratedArtifact[] { return [{ path: 'A/a.c', content: '' }]; }
    }
    class BGen implements ModuleGenerator {
      readonly moduleShortName = 'B';
      emit(): readonly GeneratedArtifact[] { return [{ path: 'B/b.c', content: '' }]; }
    }
    _resetRegistryForTest();
    registerGenerator(new AGen());
    registerGenerator(new BGen());
    const result = await runPipeline({
      bswmdIndex: new Map<string, { shortName: string }>([
        ['A', { shortName: 'A' }],
        ['B', { shortName: 'B' }],
      ]),
      ecucValues: new Map([['A', {}], ['B', {}]]),
      variant: 'PreCompile',
      outDir: '/tmp/out',
      moduleFilter: ['A'],
      strict: false,
    });
    expect(result.artifacts.size).toBe(1);
    expect(result.artifacts.has('A/a.c')).toBe(true);
  });
});
