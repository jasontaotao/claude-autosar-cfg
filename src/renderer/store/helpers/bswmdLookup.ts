// src/renderer/store/helpers/bswmdLookup.ts
// BSWMD lookup helpers used by the mutation actions. Pure — no store
// closure, no I/O. Extracted from useArxmlStore.ts in PR(5).

import type {
  BswModuleDef,
  BswmdDocument,
  ContainerDef,
  ParamDef,
  ReferenceDef,
} from '@core/project/bswmd.js';

/**
 * Sprint 15 HIGH-2 — find the BswModuleDef whose shortName appears in
 * the value-side document path. Returns `null` when no BSWMD is loaded
 * or the path is unparseable. Used by `deleteContainer` to pass the
 * BSWMD context to `coreRemoveContainer` so the multiplicity-floor
 * check can run.
 */
export function findModuleDefForPath(
  schemas: readonly BswmdDocument[],
  docPath: string,
): BswModuleDef | null {
  const segments = docPath.split('/').filter(Boolean);
  if (segments.length < 1) return null;
  // The module shortName is the last path segment of a value-side path
  // shaped like `/<AR-PACKAGE>/<MODULE>`. Walk the segments from the
  // back and return the first BSWMD match.
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const candidate = segments[i];
    if (candidate === undefined) continue;
    for (const schema of schemas) {
      for (const mod of schema.modules) {
        if (mod.shortName === candidate) return mod;
      }
    }
  }
  return null;
}

/**
 * Walk all loaded BSWMD schemas and find the module whose shortName
 * matches the second segment of `valuePath`, then resolve the parent
 * container def at the given subPath (everything after the module).
 *
 * The action uses this to look up both `addContainer`'s parent +
 * child container defs. The function returns the module + parent
 * container def (NOT the child) — the action then locates the
 * child via `findChildContainerDef`. This split mirrors the spec
 * (`getContainerDefByPath` + child lookup) and keeps the helper
 * surface narrow.
 */
export function resolveModuleAndParentContainer(
  schemas: readonly BswmdDocument[],
  valuePath: string,
): { readonly moduleDef: BswModuleDef; readonly parentContainerDef: ContainerDef | null } | null {
  const segments = valuePath.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const pkgName = segments[0];
  if (pkgName === undefined) return null;
  // Try the canonical 4-segment path first:
  //   /<pkg>/<module>/<container>/...
  // where `segments[1]` is the module shortName. Most projects use this
  // shape because the BSWMD-skeleton factory always writes a separate
  // module shortName even when it matches the package name.
  const moduleShortName = segments[1];
  if (moduleShortName !== undefined) {
    for (const schema of schemas) {
      for (const mod of schema.modules) {
        if (mod.shortName !== moduleShortName) continue;
        const subSegments = segments.slice(2);
        const subPath = subSegments.join('/');
        const parentContainerDef =
          subPath === '' ? null : resolveContainerDefBySubPath(mod, subPath);
        if (parentContainerDef !== null || subPath === '') {
          return { moduleDef: mod, parentContainerDef };
        }
      }
    }
  }
  // Compressed 3-segment fallback (companion to `findByPath` in
  // core/arxml/path.ts):
  //   /<pkg>/<container>/...
  // when `<pkg>`'s shortName equals the module shortName (e.g. project
  // `JWQ3399` whose package + module both name themselves `JWQ3399`).
  // We re-use `resolveContainerDefBySubPath` directly by treating the
  // sub-path as `segments.slice(1)` — same shape as the canonical walk
  // but starting at the first container shortName instead of the module.
  for (const schema of schemas) {
    for (const mod of schema.modules) {
      if (mod.shortName !== pkgName) continue;
      const subSegments = segments.slice(1);
      const subPath = subSegments.join('/');
      const parentContainerDef = resolveContainerDefBySubPath(mod, subPath);
      if (parentContainerDef !== null) {
        return { moduleDef: mod, parentContainerDef };
      }
    }
  }
  // v1.9.0 (post-c46f4a8) — vendor-prefix pre-fold fallback. Legacy
  // user docs generated under the pre-c46f4a8 skeleton (or the
  // skeleton's vendor-prefix branch before the mirror fix) carry the
  // full 4-segment form:
  //   /<pkg>/<vendorPkg>/<module>/<container>/...
  // where `segments[2]` is the module's own shortName. The 4-segment
  // canonical walker only checks `segments[1]`; the 3-segment
  // fallback checks `segments[0]`; both miss this shape. Try the
  // fixed `segments[2]` slot first (the vendor-prefix convention
  // used by the skeleton's pre-c46f4a8 vendor branch). Only check
  // `segments[2]` — a wider back-walk would over-match container
  // shortNames against unrelated module shortNames and regress
  // other paths (Tree.optionalContainers fixtures use paths like
  // `/EAS/EcuC/EcuCGeneral/MissingOptional` where a container named
  // "MissingOptional" would falsely match a module of the same
  // name if the walk scanned all segments).
  if (segments.length >= 4) {
    const vendorModuleShortName = segments[2];
    if (vendorModuleShortName !== undefined) {
      for (const schema of schemas) {
        for (const mod of schema.modules) {
          if (mod.shortName !== vendorModuleShortName) continue;
          const subSegments = segments.slice(3);
          const subPath = subSegments.join('/');
          const parentContainerDef =
            subPath === '' ? null : resolveContainerDefBySubPath(mod, subPath);
          if (parentContainerDef !== null || subPath === '') {
            return { moduleDef: mod, parentContainerDef };
          }
        }
      }
    }
  }
  return null;
}

/**
 * Variant of `resolveModuleForPath` for the addParameter case. Returns
 * the module def + the matching ParamDef. The value path is the
 * container path; the parameter shortName is supplied separately.
 *
 * The lookup succeeds as long as the BSWMD has a matching module +
 * parent container. When the param shortName isn't declared on the
 * parent container, `paramDef` is null and the caller surfaces a
 * `no-bswmd-for-module` error (BSWMD lookup is the store's job;
 * the cross-check inside the core is defence-in-depth, not the
 * primary error path — the spec says BSWMD is the source of truth).
 */
export function resolveParamDefForPath(
  schemas: readonly BswmdDocument[],
  containerPath: string,
  paramShortName: string,
): { readonly moduleDef: BswModuleDef; readonly paramDef: ParamDef | null } | null {
  const lookup = resolveModuleAndParentContainer(schemas, containerPath);
  if (lookup === null) return null;
  const { moduleDef, parentContainerDef } = lookup;
  // Module-level parents (parentContainerDef === null) have no
  // parameters per current AUTOSAR practice, so the param shortName
  // cannot resolve. Return the module def with a null paramDef so the
  // caller surfaces the proper error.
  if (parentContainerDef === null) return { moduleDef, paramDef: null };
  const paramDef = parentContainerDef.parameters.find((p) => p.shortName === paramShortName);
  return { moduleDef, paramDef: paramDef ?? null };
}

/**
 * Sprint 15 — variant of `resolveParamDefForPath` for the addReference
 * case. Looks up the BSWMD `ReferenceDef` for the given container
 * path + ref shortName. Mirrors the same null-handling contract:
 * `moduleDef` is set when the module is found, `refDef` is null when the
 * parent container exists but doesn't declare this ref.
 */
export function resolveReferenceDefForPath(
  schemas: readonly BswmdDocument[],
  containerPath: string,
  refShortName: string,
): { readonly moduleDef: BswModuleDef; readonly refDef: ReferenceDef | null } | null {
  const lookup = resolveModuleAndParentContainer(schemas, containerPath);
  if (lookup === null) return null;
  const { moduleDef, parentContainerDef } = lookup;
  if (parentContainerDef === null) return { moduleDef, refDef: null };
  const refDef = parentContainerDef.references.find((r) => r.shortName === refShortName);
  return { moduleDef, refDef: refDef ?? null };
}

/**
 * Walk the BswModuleDef's top-level containers, sub-containers, and
 * choice branches to find the ContainerDef matching the given
 * sub-path. Mirrors the shape of `getContainerDefByPath` from
 * core/project/bswmd.ts but is inlined here to avoid widening the
 * store's import surface with a one-off helper.
 */
export function resolveContainerDefBySubPath(
  mod: BswModuleDef,
  subPath: string,
): ContainerDef | null {
  const segments = subPath.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  const [head, ...tail] = segments;
  if (head === undefined) return null;
  const first = mod.containers.find((c) => c.shortName === head);
  if (first === undefined) return null;
  if (tail.length === 0) return first;
  return findContainerInTreeByPathLocal(first, tail);
}

function findContainerInTreeByPathLocal(
  parent: ContainerDef,
  segments: readonly string[],
): ContainerDef | null {
  if (segments.length === 0) return parent;
  const [head, ...tail] = segments;
  if (head === undefined) return null;
  const candidates = [...parent.subContainers, ...parent.choices];
  const found = candidates.find((c) => c.shortName === head);
  if (found === undefined) return null;
  if (tail.length === 0) return found;
  return findContainerInTreeByPathLocal(found, tail);
}

/**
 * Find a sub-container def by shortName under a parent. When
 * `parentDef` is null the search starts at the module's top-level
 * containers. Returns the first match.
 */
export function findChildContainerDef(
  mod: BswModuleDef,
  parentDef: ContainerDef | null,
  shortName: string,
): ContainerDef | null {
  if (parentDef === null) {
    return mod.containers.find((c) => c.shortName === shortName) ?? null;
  }
  const all = [...parentDef.subContainers, ...parentDef.choices];
  return all.find((c) => c.shortName === shortName) ?? null;
}
