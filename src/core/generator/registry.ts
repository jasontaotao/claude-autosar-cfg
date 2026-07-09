import type { Diagnostic } from './diagnostics.js';
import type { BswmdParamDefLite } from './normalize.js';

export type GenerationVariant = 'PreCompile' | 'Link' | 'PostBuild';

export interface GenerationContext {
  readonly variant: GenerationVariant;
  readonly bswmdIndex: ReadonlyMap<string, unknown>; // narrowed by normalize task
  readonly implByModule: ReadonlyMap<string, string>;
  readonly outDir: string;
  readonly diagnostics: Diagnostic[];
  // v1.13.4 PATCH-B (M5 + L3) — flat lookup keyed by
  // Module/Container/Param path. Generators use this to resolve the
  // real BSWMD shortName + paramConfigClass without re-walking the
  // BSWMD tree on every emit.
  readonly bswmdParamIndex?: ReadonlyMap<string, BswmdParamDefLite>;
}

export interface GeneratedArtifact {
  readonly path: string;
  readonly content: string;
}

export interface ModuleGenerator {
  readonly moduleShortName: string;
  emit(def: unknown, values: unknown, ctx: GenerationContext): readonly GeneratedArtifact[];
}

const generators = new Map<string, ModuleGenerator>();

export function registerGenerator(g: ModuleGenerator): void {
  // v1.39.0 MINOR T5 (H2) — idempotent register. The previous throw-on-
  // duplicate behavior broke the renderer's "Generate" button on the
  // second click because generate.ts:96 calls
  // `registerGenerator(new EcuCGenerator())` on every invocation and
  // tests masked the throw via `_resetRegistryForTest()`. Silent
  // overwrite (delete + set) is the correct fix: callers can re-bind
  // a module generator without coordinating test-isolation state.
  if (generators.has(g.moduleShortName)) {
    generators.delete(g.moduleShortName);
  }
  generators.set(g.moduleShortName, g);
}

export function getGenerator(shortName: string): ModuleGenerator | undefined {
  return generators.get(shortName);
}

/** Test-only: clear all registered generators. */
export function _resetRegistryForTest(): void {
  generators.clear();
}
