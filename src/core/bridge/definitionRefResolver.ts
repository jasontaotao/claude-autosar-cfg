// definitionRefResolver — central definition-ref path resolver.
//
// Bridge mappers must not hardcode DEFINITION-REF literals: package
// roots differ across BSWMD sets. Given a module shortName and a
// container path (shortNames from the module root; the leaf may name
// a sub-container, parameter, or reference), resolve the BSWMD-accurate
// ref by walking the container tree. When no BswModuleDef is threaded,
// fall back to the standard AUTOSAR R22 EcucDefs prefix. A miss with a
// loaded BSWMD is reported via onMiss instead of passing silently.

import type { BswModuleDef, ContainerDef } from '../project/bswmd/types.js';

const STANDARD_PREFIX = '/AUTOSAR_R22/EcucDefs';

export interface DefinitionRefMiss {
  readonly moduleName: string;
  readonly containerPath: readonly string[];
}

export function resolveDefinitionRef(
  moduleName: string,
  containerPath: readonly string[],
  bswmd?: BswModuleDef | undefined,
  onMiss?: (miss: DefinitionRefMiss) => void,
): string {
  if (bswmd !== undefined) {
    if (containerPath.length === 0) return bswmd.path;
    const resolved = findPathInTree(bswmd.containers, containerPath, 0);
    if (resolved !== null) return resolved;
    onMiss?.({ moduleName, containerPath });
  }
  const segments = [moduleName, ...containerPath].filter(Boolean);
  return `${STANDARD_PREFIX}/${segments.join('/')}`;
}

function findPathInTree(
  candidates: readonly ContainerDef[],
  path: readonly string[],
  index: number,
): string | null {
  if (index >= path.length) return null;
  const target = path[index];
  for (const candidate of candidates) {
    if (candidate.shortName !== target) continue;
    if (index === path.length - 1) return candidate.path;
    const nested = findPathInTree(
      [...candidate.subContainers, ...candidate.choices],
      path,
      index + 1,
    );
    if (nested !== null) return nested;
    // The final segment may name a parameter or reference on this
    // container rather than a sub-container.
    if (index === path.length - 2) {
      const leafName = path[index + 1];
      const leaf = [...candidate.parameters, ...candidate.references].find(
        (l) => l.shortName === leafName,
      );
      if (leaf !== undefined) return leaf.path;
    }
  }
  return null;
}
