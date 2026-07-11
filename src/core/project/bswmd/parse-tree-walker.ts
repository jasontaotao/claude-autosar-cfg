// core/project/bswmd/parse-tree-walker.ts
// AR-PACKAGE + ELEMENTS walkers + the path-lookup `findContainerInTree`.
//
// Split from `src/core/project/bswmd/parse.ts` as part of v1.46.0
// MINOR T4 (file-size backlog closure round-2). The walker block is
// moved verbatim from the pre-T4 parse.ts so dialect-dispatch
// semantics are preserved. Only the imports + `asArray` source change
// (now `asArrayLocal`, kept private to this file to avoid a
// cross-file runtime dep on parse.ts).
//
// Why these 4 functions live here vs. in `parse.ts`: the walker is
// an orchestration layer that dispatches between EB and ECUC dialect
// builders. Dialect builders live in `parse-eb-dialect.ts` (T3) and
// `parse-ecuc-dialect.ts` (T5); pulling the walker out of parse.ts
// isolates the dialect-independent AR-PACKAGE/ELEMENTS descent from
// the dialect-specific builder code.
//
// Scope boundary:
//   - `findContainerInTree` walks a `containers[]` array + nested
//     `subContainers` + `choices` looking for a SHORT-NAME match.
//     Used by `lookup.ts:findContainerInTreeByPath` for path-based
//     container resolution (BSWMD-driven ECUC bridge).
//   - `walkPackagesForModules` is the top-level entry: descends
//     AR-PACKAGES → walks each ELEMENTS block via
//     `walkElementsForModules` → recurses on nested AR-PACKAGES.
//   - `walkPackagesForModuleRefs` mirrors the top-level descent but
//     extracts `<MODULE-REF>` children (C11 v1.17.0 cross-ref
//     support).
//   - `walkElementsForModules` is the per-ELEMENTS dispatcher:
//     recognises `<BSW-MODULE-DESCRIPTION>` (EB dialect) and
//     `<ECUC-MODULE-DEF>` (ECUC dialect), accumulates duplicates
//     as non-fatal warnings.

import { buildEbModule, readElementText } from './parse-eb-dialect.js';
import { buildEcucModule } from './parse-ecuc-dialect.js';
import { readShortName } from './parse-primitives.js';
import type {
  BswmdError,
  BswModuleDef,
  ContainerDef,
  DepthGuard,
  ModuleRefEntry,
} from './types.js';

// ---------------------------------------------------------------------------
// v1.46.0 MINOR T4 — block extracted verbatim from pre-T4 parse.ts.
// Internal helpers (`walkPackagesFor*`) gain `export function` so
// `parse.ts:parseBswmd` can call them via the same module path.
// ---------------------------------------------------------------------------
export function findContainerInTree(
  containers: readonly ContainerDef[],
  shortName: string,
): ContainerDef | null {
  for (const c of containers) {
    if (c.shortName === shortName) return c;
    const nested = findContainerInTree(c.subContainers, shortName);
    if (nested !== null) return nested;
    const inChoice = findContainerInTree(c.choices, shortName);
    if (inChoice !== null) return inChoice;
  }
  return null;
}

/**
 * Walk AR-PACKAGES at any depth, dispatching each module child element to
 * the dialect-specific builder. Returns a fatal BswmdError if a top-level
 * module definition is missing its required SHORT-NAME (the module would be
 * unreachable by path lookup anyway). Non-fatal issues (unknown inner kinds)
 * are accumulated in `warnings`.
 */
export function walkPackagesForModules(
  node: Record<string, unknown>,
  parentPath: string,
  out: BswModuleDef[],
  warnings: string[],
  guard?: DepthGuard,
): BswmdError | null {
  for (const pkg of asArrayLocal<Record<string, unknown>>(node['AR-PACKAGE'])) {
    // Stop walking more packages once the depth guard has tripped.
    if (guard?.error !== null && guard?.error !== undefined) return guard.error;
    const shortName = readShortName(pkg);
    if (shortName === undefined) continue;
    const path = `${parentPath}/${shortName}`;
    const elementsRaw = pkg['ELEMENTS'];
    if (typeof elementsRaw === 'object' && elementsRaw !== null) {
      const err = walkElementsForModules(
        elementsRaw as Record<string, unknown>,
        path,
        out,
        warnings,
        guard,
      );
      if (err !== null) return err;
    }
    const nestedRaw = pkg['AR-PACKAGES'];
    if (typeof nestedRaw === 'object' && nestedRaw !== null) {
      const err = walkPackagesForModules(
        nestedRaw as Record<string, unknown>,
        path,
        out,
        warnings,
        guard,
      );
      if (err !== null) return err;
    }
  }
  return null;
}

/**
 * C11 (v1.17.0) — walk AR-PACKAGES to collect `<MODULE-REF>` elements.
 *
 * Mirrors `walkPackagesForModules` recursion: descends into nested
 * AR-PACKAGES and walks ELEMENTS at each level, but instead of building
 * module defs it extracts `<MODULE-REF>` children. Each `<MODULE-REF>`
 * carries a target path (text body) and is attributed to the parent
 * AR-PACKAGE for debugging.
 *
 * AR-PACKAGES are bounded by tree depth (typically < 10 levels), so no
 * DepthGuard is needed — moduleRefs walking only recurses into
 * AR-PACKAGES, never into ELEMENTS / container sub-trees that drove the
 * depth-guard rationale for `walkPackagesForModules`.
 *
 * Empty AR-PACKAGES (no `<MODULE-REF>` children anywhere) → no entries
 * appended; the caller decides whether to surface an empty array vs.
 * `undefined` at the document level.
 */
export function walkPackagesForModuleRefs(
  node: Record<string, unknown>,
  parentPath: string,
  out: ModuleRefEntry[],
): void {
  for (const pkg of asArrayLocal<Record<string, unknown>>(node['AR-PACKAGE'])) {
    const shortName = readShortName(pkg);
    if (shortName === undefined) continue;
    const path = `${parentPath}/${shortName}`;
    const elementsRaw = pkg['ELEMENTS'];
    if (typeof elementsRaw === 'object' && elementsRaw !== null) {
      const moduleRefRaw = (elementsRaw as Record<string, unknown>)['MODULE-REF'];
      if (moduleRefRaw !== undefined) {
        for (const item of asArrayLocal<Record<string, unknown>>(moduleRefRaw)) {
          const target = readElementText(item);
          if (target !== '') {
            out.push({ target, source: path });
          }
        }
      }
    }
    const nestedRaw = pkg['AR-PACKAGES'];
    if (typeof nestedRaw === 'object' && nestedRaw !== null) {
      walkPackagesForModuleRefs(nestedRaw as Record<string, unknown>, path, out);
    }
  }
}

export function walkElementsForModules(
  node: Record<string, unknown>,
  parentPath: string,
  out: BswModuleDef[],
  warnings: string[],
  guard?: DepthGuard,
): BswmdError | null {
  // Short-circuit if the guard has already tripped (the depth check in
  // buildContainer set the error). Returning the same error keeps the
  // unwind symmetric — no more recursion happens, no more modules are
  // emitted.
  if (guard?.error !== null && guard?.error !== undefined) return guard.error;
  // Sprint 13+ Q6 — duplicate module shortName detection. We keep both
  // modules in `out` (existing behaviour) but emit a warning so the
  // BswmdPanel can flag the file. Per-scope: this set is fresh for each
  // <ELEMENTS> block we walk, so it catches sibling <ECUC-MODULE-DEF> /
  // <BSW-MODULE-DESCRIPTION> collisions inside the same parent AR-PACKAGE.
  const seenModuleShortNames = new Set<string>();
  for (const [tagName, raw] of Object.entries(node)) {
    if (tagName.startsWith('@_') || tagName === '#text') continue;
    for (const item of asArrayLocal<Record<string, unknown>>(raw)) {
      if (tagName === 'BSW-MODULE-DESCRIPTION') {
        const mod = buildEbModule(item, parentPath, warnings);
        if (mod !== null) {
          if (seenModuleShortNames.has(mod.shortName)) {
            warnings.push(
              `Duplicate module definition "${mod.shortName}" at ${mod.path} — first-wins, later copy retained but shadowed by the first lookup`,
            );
          }
          seenModuleShortNames.add(mod.shortName);
          out.push(mod);
        } else {
          // Missing SHORT-NAME at the module level is fatal: the module
          // would have an empty path and the lookup helpers would never
          // find it. Better to fail loud than to silently produce an
          // unreachable module.
          return {
            kind: 'invalid-structure',
            path: parentPath,
            message: `BSW-MODULE-DESCRIPTION at ${parentPath} is missing <SHORT-NAME>`,
          };
        }
        continue;
      }
      if (tagName === 'ECUC-MODULE-DEF') {
        const mod = buildEcucModule(item, parentPath, warnings, guard);
        if (mod !== null) {
          if (seenModuleShortNames.has(mod.shortName)) {
            warnings.push(
              `Duplicate module definition "${mod.shortName}" at ${mod.path} — first-wins, later copy retained but shadowed by the first lookup`,
            );
          }
          seenModuleShortNames.add(mod.shortName);
          out.push(mod);
        } else {
          return {
            kind: 'invalid-structure',
            path: parentPath,
            message: `ECUC-MODULE-DEF at ${parentPath} is missing <SHORT-NAME>`,
          };
        }
        // After each module build, check whether the depth guard tripped
        // (the recursion has already unwound by this point). Returning
        // the error from the walk stops further module processing.
        if (guard?.error !== null && guard?.error !== undefined) return guard.error;
        continue;
      }
      // Unknown top-level module kind — record and skip without aborting.
      //
      // Design note: we deliberately do NOT promote these to
      // `invalid-structure`. Real EB tresos BSWMD files place value-side
      // and implementation-side siblings inside the same `<ELEMENTS>`
      // block as the schema-side `<BSW-MODULE-DESCRIPTION>` — for example
      // `<BSW-MODULE-ENTRY>` (entry definition) and `<BSW-IMPLEMENTATION>`
      // (implementation metadata) appear under sibling `<AR-PACKAGE>`
      // nodes. Bumping these to errors would reject valid vendor files
      // (tests/fixtures/bswmd/Can_Bswmd.arxml currently records 3 such
      // warnings). The schema-side validator (Sprint 13) only needs to
      // look up `ECUC-MODULE-DEF` / `BSW-MODULE-DESCRIPTION` by path —
      // unknown kinds are unreachable to that lookup anyway, so
      // warning-and-skip is the correct surface. The `warnings` array is
      // the renderer's signal to display a degraded-state banner.
      warnings.push(`Unknown module kind '${tagName}' at ${parentPath}`);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Internal helpers (scoped to this file; not re-exported via index.ts)
// ---------------------------------------------------------------------------

/**
 * Local copy of `asArray` — same approach as `parse-eb-dialect.ts` and
 * `parse-ecuc-dialect.ts`. Once all three walker files use the same
 * private copy pattern, a future cycle can hoist to `helpers/array.ts`.
 */
function asArrayLocal<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v === undefined || v === null) return [];
  return [v as T];
}
