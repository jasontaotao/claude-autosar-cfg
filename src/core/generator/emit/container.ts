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
