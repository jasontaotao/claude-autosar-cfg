// core/generator/normalize.ts
//
// Pre-process step: build a `NormalizedConfigTree` from the BSWMD index
// and ECUC values map. This is the single source of truth that the
// pipeline (Task 12) and EcuCGenerator (Task 16) consume.
//
// Implementation notes (per task brief):
// - Types are intentionally loose: `BswmdModuleDefLite` and
//   `EcucModuleConfigurationValuesInput` are the minimum surface area we
//   need here. Task 16 tightens both when the real generator assembles
//   typed per-module configurations.
// - `implByModule` is an empty Map and is deferred to v2 (no implementation
//   strategy data is consumed in v1.10.0).
// - Reference edges are collected as a flat list. Existence/resolve
//   validation lives in `validateReferences` (emit/reference.ts) and is
//   invoked by the pipeline; this step only assembles the edges.

import type { ReferenceEdge, NormalizedConfigTree } from './emit/reference.js';

export interface BswmdParamConfigClassLite {
  readonly configClass: 'PRE-COMPILE' | 'POST-BUILD' | 'LINK';
  readonly configVariant: 'VARIANT-PRE-COMPILE' | 'VARIANT-POST-BUILD';
}

export interface BswmdParamDefLite {
  readonly kind:
    | 'integer'
    | 'boolean'
    | 'string'
    | 'float'
    | 'enumeration'
    | 'reference'
    | 'function-name';
  readonly shortName: string;
  readonly paramConfigClasses: readonly BswmdParamConfigClassLite[];
}

// Structural shape we expect at runtime — `BswmdModuleDefLite` stays
// intentionally loose (only `shortName` is canonical) so existing test
// fixtures that extend it with custom container/parameter types keep
// compiling without rippling type changes through CLI integration tests.
interface BswmdModuleDefWithContainers {
  readonly shortName: string;
  readonly containers?: readonly {
    readonly shortName: string;
    readonly parameters?: readonly BswmdParamDefLite[];
  }[];
}

export interface BswmdModuleDefLite {
  readonly shortName: string;
}

export interface EcucReferenceValue {
  readonly path: string;
  readonly targetModule: string;
  readonly targetPath: string;
}

/**
 * Loose project ECUC values shape. Real project types live in
 * `src/core/ecuc/`; this is the minimum we need to walk references and
 * bucket values by module. Task 16 tightens.
 */
export interface EcucModuleConfigurationValuesInput {
  readonly definitionRef?: string;
  readonly containers?: readonly unknown[];
  readonly parameters?: readonly unknown[];
  readonly references?: readonly EcucReferenceValue[];
}

/**
 * Assemble a `NormalizedConfigTree` from the loaded BSWMD index and the
 * per-module ECUC values map.
 *
 * - `bswmdIndex` and `valuesByModule` are passed through.
 * - `bswmdParamIndex` is a flat lookup keyed by `Module/Container/Param`
 *   path, built by walking the optional `containers[]` on each module
 *   def. v1.13.4 PATCH-B (M5) uses this index to replace the hardcoded
 *   `'Param'` literal in EcuC + Mcu generators with the real BSWMD
 *   param shortName, and v1.13.4 PATCH-B (L3) uses `paramConfigClasses`
 *   to replace the `/PostBuild/i.test(path)` regex heuristic.
 * - `implByModule` is initialized to an empty Map (v2 will populate it
 *   from a deployment-manifest input).
 * - `references` is a flat list of `ReferenceEdge` collected from every
 *   module's `references` field. Existence/resolve checks happen later
 *   in `validateReferences`.
 */
export function normalizeToTree(
  bswmdIndex: ReadonlyMap<string, BswmdModuleDefLite>,
  ecucValues: ReadonlyMap<string, EcucModuleConfigurationValuesInput>,
): NormalizedConfigTree {
  const references: ReferenceEdge[] = [];
  for (const [moduleShortName, values] of ecucValues) {
    for (const ref of values.references ?? []) {
      references.push({
        sourceModule: moduleShortName,
        sourcePath: ref.path,
        targetModule: ref.targetModule,
        targetPath: ref.targetPath,
      });
    }
  }
  // v1.13.4 PATCH-B (M5 + L3) — flat lookup so generators can resolve
  // a value-path to its real BSWMD shortName + configClass in O(1).
  // Structural cast: BswmdModuleDefLite stays loose (only shortName is
  // canonical) so test fixtures extending it with custom container/param
  // shapes keep compiling. The cast is contained to this builder.
  const bswmdParamIndex = new Map<string, BswmdParamDefLite>();
  for (const [moduleShortName, def] of bswmdIndex) {
    const mod = def as BswmdModuleDefWithContainers;
    for (const container of mod.containers ?? []) {
      for (const param of container.parameters ?? []) {
        bswmdParamIndex.set(
          `${moduleShortName}/${container.shortName}/${param.shortName}`,
          param,
        );
      }
    }
  }
  return {
    bswmdIndex: bswmdIndex as ReadonlyMap<string, unknown>,
    valuesByModule: ecucValues as ReadonlyMap<string, unknown>,
    implByModule: new Map(),
    references,
    bswmdParamIndex,
  };
}
