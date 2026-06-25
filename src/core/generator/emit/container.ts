import { cType } from '../handlebars-helpers.js';
import type { BswmdParamDef } from '../handlebars-helpers.js';

export interface ContainerInstance {
  readonly shortName: string;
  readonly index?: number;
}

/**
 * Deterministic ordering: indexed first (by INDEX asc), then unindexed
 * (by shortName lexical asc). Stable for snapshot diffs.
 */
export function sortByIndex<T extends ContainerInstance>(instances: readonly T[]): readonly T[] {
  const indexed = instances
    .filter((i) => i.index !== undefined)
    .sort((a, b) => a.index! - b.index!);
  const unindexed = instances
    .filter((i) => i.index === undefined)
    .sort((a, b) => a.shortName.localeCompare(b.shortName));
  return [...indexed, ...unindexed];
}

export interface ContainerDeclInput {
  readonly typeName: string;
  readonly paramDefs: readonly BswmdParamDef[];
}

export function emitContainerDecl(input: ContainerDeclInput): string {
  // Strip trailing "Type" suffix for field base so `EcuC_PartitionConfigType`
  // yields `EcuC_PartitionConfig_0` rather than `EcuC_PartitionConfigType_0`.
  const fieldBase = input.typeName.endsWith('Type')
    ? input.typeName.slice(0, -'Type'.length)
    : input.typeName;
  const fields = input.paramDefs.map((def, i) => `    ${cType(def)} ${fieldBase}_${i};`).join('\n');
  return `typedef struct {\n${fields}\n} ${input.typeName};`;
}

// ---------------------------------------------------------------------------
// v1.14.0 MINOR S8 — recursive container walker (D-rev2 Senior S8).
// ---------------------------------------------------------------------------

/**
 * Minimal structural shape for recursive container traversal. Real BSWMD
 * containers may carry extra fields (multiplicity bounds, choice refs,
 * reference defs); the walker only reads `shortName` and optional nested
 * `containers`, so it stays compatible with any container shape that has
 * those two fields.
 */
export interface ContainerLike {
  readonly shortName: string;
  readonly parameters?: readonly unknown[];
  readonly containers?: readonly ContainerLike[];
}

/**
 * Depth-first pre-order traversal of `containers` and their nested
 * children. Calls `visit(c)` once per container before recursing into
 * its children, so callers see parents before descendants.
 *
 * Replaces the flat 1-level walk in v1.13.x that silently dropped
 * nested containers (D-rev2 Senior S8). Real BSWMD nests 2-3 levels
 * deep — e.g. EcuC PartitionConfig → PartitionBuffer →
 * PartitionBufferHeader.
 *
 * Tolerates containers without a `containers` field for backwards
 * compatibility with flat BSWMD (the existing PreCompile/Mixed/Refs
 * fixtures). Empty `containers: []` is treated identically to
 * missing `containers`.
 */
export function walkContainers(
  containers: readonly ContainerLike[],
  visit: (c: ContainerLike) => void,
): void {
  for (const c of containers) {
    visit(c);
    if (c.containers && c.containers.length > 0) {
      walkContainers(c.containers, visit);
    }
  }
}
