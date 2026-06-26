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
// v1.14.1 PATCH-G (G3) — ancestry-aware sibling helper.
// v1.14.3 PATCH-I (R-1) — deleted leaf-only `walkContainers`; sole walker.
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
 * Depth-first pre-order traversal that threads the accumulated
 * `parentPath` into the visit callback as a second argument. The
 * initial `parentPath` is typically `''` (root) or the module's
 * `shortName` (so descendants get a `Module/` prefix on their
 * ancestry). At each level the callback receives the container and
 * the full slash-separated ancestry leading up to (but not
 * including) that container.
 *
 * Both Mcu (v1.14.1 PATCH-G G3) and EcuC (v1.14.2 PATCH-H H3) use this
 * helper. The leaf-only `walkContainers` was deleted in v1.14.3
 * PATCH-I R-1 — callers that don't need ancestry pass `parentPath=''`
 * and ignore the second callback argument.
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
