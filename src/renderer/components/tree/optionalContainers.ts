// S4 (v1.7.2) — optional container visibility helper.
//
// Pure / no-React / no-store-closure. Resolves the BSWMD-side
// `ContainerDef[]` of children that:
//   - have `lowerMultiplicity === 0` (optional)
//   - are NOT already present in the value-side children by shortName
// so the Tree can render a placeholder row per missing optional
// child with a `+` button that invokes `addContainer`.
//
// The helper does not decide where to render placeholders or how the
// user invokes the mutation — those concerns live in `Tree.tsx`. This
// file owns only the lookup.

import type { ArxmlElement } from '@core/arxml/types.js';
import type { BswmdDocument, ContainerDef } from '@core/project/bswmd.js';

import { resolveContainerDefBySubPath } from '../../store/helpers/bswmdLookup.js';

/**
 * Given the BSWMD schema set, the value-side path of the parent
 * container (e.g. `/EAS/EcuC/EcuCGeneral`), and the existing
 * value-side children of that parent, return the `ContainerDef[]`
 * for the optional children (lowerMultiplicity === 0) that are NOT
 * already present in the value tree.
 *
 * The implementation re-uses `resolveContainerDefBySubPath` from
 * `store/helpers/bswmdLookup.ts` so the BSWMD-side parent lookup is
 * identical to the one `addContainer` performs on click. The module
 * itself is resolved by walking the parent path's segments — the
 * 4-segment canonical shape (`/<pkg>/<module>/<container>`) is the
 * common case; the 3-segment compressed shape (`/<pkg>/<container>`
 * where pkg shortName === module shortName) is the fallback the
 * core lookup uses.
 *
 * Returns `[]` when:
 *   - `bswmd` is null or empty (no schema loaded)
 *   - the parent path is too short to resolve a module
 *   - the parent container cannot be walked to via the path
 *   - the parent container declares no optional children
 *
 * The caller (Tree.tsx) treats `[]` as "no placeholders render" — no
 * error, no warning, just nothing to show.
 */
export function findMissingOptionalSiblings(
  bswmd: readonly BswmdDocument[] | null,
  valueParentPath: string,
  existingChildren: readonly ArxmlElement[],
): readonly ContainerDef[] {
  if (bswmd === null || bswmd.length === 0) return [];
  if (valueParentPath === '' || valueParentPath === '/') return [];
  // Re-use the same lookup core the mutation action uses. The helper
  // is tolerant of the 3- and 4-segment value-path shapes; we strip
  // the leading slash and pass the path as-is.
  const normalized = valueParentPath.startsWith('/') ? valueParentPath.slice(1) : valueParentPath;
  const parent = resolveBswmdContainer(bswmd, normalized);
  if (parent === null) return [];
  // Optional sub-containers (lowerMultiplicity === 0) are only
  // surfaced when missing from the value tree. The candidate set
  // unions subContainers + choices because both are user-addable
  // from the BSWMD side.
  const candidates = [...parent.subContainers, ...parent.choices];
  const existingShortNames = new Set<string>();
  for (const c of existingChildren) {
    // References and unknowns don't carry a `shortName`. Use whatever
    // stable identifier matches the BSWMD-side shortName so dedup
    // is correct: container/module → shortName, reference → value,
    // unknown → tagName.
    if (c.kind === 'reference') {
      existingShortNames.add(c.value);
    } else if (c.kind === 'unknown') {
      existingShortNames.add(c.tagName);
    } else {
      existingShortNames.add(c.shortName);
    }
  }
  return candidates.filter(
    (cd) => cd.lowerMultiplicity === 0 && !existingShortNames.has(cd.shortName),
  );
}

/**
 * Walk every loaded BSWMD schema and find the parent `ContainerDef`
 * for the given value-side path. Tries both 4-segment
 * (`<pkg>/<module>/<container>/...`) and 3-segment
 * (`<pkg>/<container>/...` with pkg shortName === module shortName)
 * shapes — the same dual-shape search the core mutation
 * `addContainer` uses. Returns the matching `ContainerDef` or `null`
 * when no schema declares the parent.
 */
function resolveBswmdContainer(
  bswmd: readonly BswmdDocument[],
  normalizedParentPath: string,
): ContainerDef | null {
  const segments = normalizedParentPath.split('/').filter((s) => s.length > 0);
  if (segments.length < 2) return null;
  // Canonical 4-segment shape: `<pkg>/<module>/<container>/...`.
  const moduleShortName = segments[1];
  if (moduleShortName !== undefined) {
    for (const schema of bswmd) {
      for (const mod of schema.modules) {
        if (mod.shortName !== moduleShortName) continue;
        const subPath = segments.slice(2).join('/');
        const parent = resolveContainerDefBySubPath(mod, subPath);
        if (parent !== null) return parent;
      }
    }
  }
  // Compressed 3-segment shape: `<pkg>/<container>/...` where
  // `<pkg>.shortName === <module>.shortName` (e.g. project `JWQ3399`
  // where package and module share the name). We re-walk against
  // each module whose shortName matches the FIRST segment (the pkg
  // name) and use segments.slice(1) as the container sub-path.
  const pkgName = segments[0];
  if (pkgName !== undefined) {
    for (const schema of bswmd) {
      for (const mod of schema.modules) {
        if (mod.shortName !== pkgName) continue;
        const subPath = segments.slice(1).join('/');
        const parent = resolveContainerDefBySubPath(mod, subPath);
        if (parent !== null) return parent;
      }
    }
  }
  return null;
}
