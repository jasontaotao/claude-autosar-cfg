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
  if (generators.has(g.moduleShortName)) {
    throw new Error(`Generator for ${g.moduleShortName} already registered`);
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
