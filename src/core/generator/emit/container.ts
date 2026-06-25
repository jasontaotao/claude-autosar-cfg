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

// ---------------------------------------------------------------------------
// v1.14.1 PATCH-G (G3) — ancestry-aware sibling helper.
// ---------------------------------------------------------------------------

/**
 * Depth-first pre-order traversal that threads the accumulated
 * `parentPath` into the visit callback as a second argument. The
 * initial `parentPath` is typically `''` (root) or the module's
 * `shortName` (so descendants get a `Module/` prefix on their
 * ancestry). At each level the callback receives the container and
 * the full slash-separated ancestry leading up to (but not
 * including) that container.
 *
 * Companion to `walkContainers` — the v1.14.0 S8 helper stays
 * un-touched because its callback signature is locked by the S8
 * tests. Mcu's G3 walk uses this helper (EcuC still uses the
 * leaf-only `walkContainers`; see EcuC comment at the call site).
 */
export function walkContainersWithAncestry(
  containers: readonly ContainerLike[],
  parentPath: string,
  visit: (c: ContainerLike, ancestry: string) => void,
): void {
  for (const c of containers) {
    const ancestry = parentPath ? `${parentPath}/${c.shortName}` : c.shortName;
    visit(c, ancestry);
    if (c.containers && c.containers.length > 0) {
      walkContainersWithAncestry(c.containers, ancestry, visit);
    }
  }
}
