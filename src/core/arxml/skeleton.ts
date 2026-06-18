// core/arxml/skeleton.ts
// Sprint 14 — pure builders for the BSWMD-to-ECUC skeleton flow.
//
// Two factories live here:
//
//   * `generateEcucSkeleton(doc, moduleShortName)` — value-side
//     `ArxmlDocument` whose packages carry a single
//     `ECUC-MODULE-CONFIGURATION-VALUES` module + one
//     `ECUC-CONFIGURATION-CONTAINER` per BSWMD top-level container (and
//     recursively for sub-containers). User fills params/references via
//     ParamEditor; the skeleton itself is intentionally empty there.
//
//   * `resolveCollisionFilename(picks, projectDir)` — given the user's
//     selected (bswmdPath, moduleShortName) picks, returns a Map whose key
//     is the unique pick tuple and whose value is the on-disk path where
//     the ECUC value-side file should be written. Applies collision
//     resolution: when multiple picks share a `moduleShortName`, the
//     first wins the un-suffixed `<moduleShortName>_Cfg.arxml`; later
//     picks are suffixed with `__<vendorKey>` derived from the BSWMD
//     basename; if basenames collide too, a numeric suffix (`_1`, `_2`)
//     is appended.
//
// Both are pure of I/O: the only "filesystem-shaped" concern is path
// construction. The caller is responsible for the actual `mkdir` /
// `writeFile` / `stat`. Keeping this file I/O-free means the whole
// skeleton flow is unit-testable without `fs` mocks.
//
// Pure: no I/O, no React, no Zustand, no electron.
//
// T2 contract: `generateEcucSkeleton`. T3 contract: `resolveCollisionFilename`.

import type { BswModuleDef, BswmdDocument, ContainerDef } from '../project/bswmd.js';

import { buildDefaultValue } from './defaultValue.js';
import type { ArxmlContainer, ArxmlDocument, ArxmlModule, ParamValue } from './types.js';

/**
 * One user pick from the "create ECUC from BSWMD" picker. The shape is the
 * minimum needed to resolve a write target — the caller hands in the list of
 * picked rows from the picker UI and we return a Map of write paths keyed
 * by the unique `${bswmdPath}::${moduleShortName}` tuple.
 */
export interface PickedModule {
  /** Absolute path of the source BSWMD `.arxml` file the user picked. */
  readonly bswmdPath: string;
  /** Module shortName within that BSWMD file (e.g. `Can`, `CanIf`). */
  readonly moduleShortName: string;
  /**
   * Optional explicit ECUC output path override. When supplied, this wins
   * over the auto-derived path. Used when the user manually types a path in
   * the picker.
   *
   * **T3 status:** not yet acted on. The current collision logic only
   * resolves derived paths; a future task may wire `explicitPath` through
   * the same `Map` (typically by short-circuiting before the vendor-key
   * derivation). Reserving the field now keeps the picker UI's
   * round-trip data model stable.
   */
  readonly explicitPath?: string;
}

/**
 * Sprint 14 — generate a value-side ECUC skeleton from a BSWMD module.
 *
 * The output document is a minimal `<ECUC-MODULE-CONFIGURATION-VALUES>`
 * shell: one root `ArxmlPackage` named after the module, containing one
 * `ArxmlModule` (kind: `module`, tagName: `ECUC-MODULE-CONFIGURATION-VALUES`)
 * whose `children` are `ArxmlContainer` shells, one per BSWMD top-level
 * container, recursively expanded through `subContainers`. PARAMETERS and
 * REFERENCES blocks are emitted but empty — the user fills them in via
 * ParamEditor after creation.
 *
 * Pure: no I/O, no React, no Zustand. The returned document has
 * `path = ''` and `sourceBswmdPath = undefined`; the caller attaches both
 * after the skeleton is built.
 *
 * @throws if `moduleShortName` is not found in `doc.modules`.
 */
export function generateEcucSkeleton(
  doc: BswmdDocument,
  moduleShortName: string,
): ArxmlDocument {
  const mod = doc.modules.find((m) => m.shortName === moduleShortName);
  if (mod === undefined) {
    throw new Error(
      `BSWMD module "${moduleShortName}" not found in document`,
    );
  }
  const packagePath = `/${mod.shortName}`;
  const moduleEl: ArxmlModule = buildModule(mod);
  return {
    path: '',
    version: '4.6',
    packages: [
      {
        shortName: mod.shortName,
        path: packagePath,
        elements: [moduleEl],
      },
    ],
  };
}

function buildModule(mod: BswModuleDef): ArxmlModule {
  // Module-level parameters are rare in BSWMD and `BswModuleDef` does not
  // carry a `parameters` field today. Keep `params` as `{}` so the call
  // site is forward-compatible if the field is added in the future.
  //
  // Top-level container `params` are filled from BSWMD defaults via
  // `buildDefaultValue`; sub-containers stay empty shells so the user
  // chooses which sub-containers to instance via the editor.
  return {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: mod.shortName,
    params: {},
    children: mod.containers.map(buildTopContainer),
    references: [],
  };
}

function buildTopContainer(c: ContainerDef): ArxmlContainer {
  // Top-layer fill: BSWMD `defaultValue` -> typed `ParamValue`. Null
  // defaults are skipped (per `buildDefaultValue` contract).
  const params: Record<string, ParamValue> = {};
  for (const p of c.parameters) {
    const v = buildDefaultValue(p);
    if (v !== null) params[p.shortName] = v;
  }
  return {
    kind: 'container',
    tagName: 'ECUC-CONFIGURATION-CONTAINER',
    shortName: c.shortName,
    params,
    children: c.subContainers.map(buildSubContainerShell),
  };
}

function buildSubContainerShell(c: ContainerDef): ArxmlContainer {
  // Sub-containers stay as empty shells — the user instanceiates them
  // explicitly. Their params get filled later by the editor's
  // `addSubContainer` flow which clones the BSWMD defaults.
  return {
    kind: 'container',
    tagName: 'ECUC-CONFIGURATION-CONTAINER',
    shortName: c.shortName,
    params: {},
    children: c.subContainers.map(buildSubContainerShell),
  };
}

/**
 * Sprint 14 / T3 — resolve the on-disk write target for each user pick,
 * applying collision resolution when multiple picks share a
 * `moduleShortName`.
 *
 * **Key shape.** The returned `Map` is keyed by
 * `${bswmdPath}::${moduleShortName}` — collision-safe because
 * `bswmdPath` is the absolute path of the source BSWMD file, which is
 * guaranteed unique per pick by the picker UI.
 *
 * **Value shape.** The value is `<projectDir>/<fileName>`. The
 * `fileName` is built as:
 *
 *   1. **Single pick per shortName** — the first (and only) pick wins
 *      `<moduleShortName>_Cfg.arxml` un-suffixed.
 *   2. **Multiple picks, distinct basenames** — the first in iteration
 *      order keeps `<moduleShortName>_Cfg.arxml`; later picks get
 *      `<moduleShortName>__<vendorKey>_Cfg.arxml` where `vendorKey` is
 *      the lowercased BSWMD basename (without `.arxml`).
 *   3. **Multiple picks, colliding basenames** — same as (2) but with a
 *      numeric suffix: `<moduleShortName>__<vendorKey>_<N>_Cfg.arxml`
 *      starting at `_1` for the second occurrence of a given
 *      `vendorKey`.
 *
 * Iteration order is the `picks` array order (which the picker UI
 * supplies stably). The first pick in iteration order is the canonical
 * un-suffixed one.
 *
 * **Pure.** No I/O, no `fs.stat`, no `path.join`. Path concatenation is
 * simple string interpolation with `/`; Windows is fine because the
 * caller normalises `projectDir` to use `/` (the rest of the app does
 * this at the IPC boundary — see `src/main/ipc/*.ts`).
 *
 * @param picks    User-selected picks from the BSWMD picker.
 * @param projectDir Absolute path of the user's project directory; the
 *                   default write target.
 * @returns A `Map` of `pickKey → writePath`. Empty when `picks` is
 *          empty. Order-preserving: insertion order matches `picks`
 *          order.
 */
export function resolveCollisionFilename(
  picks: readonly PickedModule[],
  projectDir: string,
): Map<string, string> {
  const out = new Map<string, string>();
  // Group picks by moduleShortName; first pick in iteration order wins
  // the un-suffixed name, others get a vendor suffix.
  const groups = new Map<string, PickedModule[]>();
  for (const p of picks) {
    const list = groups.get(p.moduleShortName) ?? [];
    list.push(p);
    groups.set(p.moduleShortName, list);
  }
  for (const group of groups.values()) {
    if (group.length === 1) {
      const p = group[0]!;
      out.set(keyOf(p), `${projectDir}/${p.moduleShortName}_Cfg.arxml`);
      continue;
    }
    // Multiple picks share this `moduleShortName`. The first pick in
    // iteration order wins the un-suffixed `<moduleShortName>_Cfg.arxml`;
    // every later pick gets a `__<vendorKey>` suffix derived from the
    // BSWMD basename. If two later picks happen to share a basename
    // (e.g. two different BSWMDs both named `Can.arxml`), a numeric
    // suffix is appended to keep filenames unique.
    const vendorKeys = group.map((p) => vendorKeyFromPath(p.bswmdPath));
    // Tracks how many times each vendorKey has appeared so far; used to
    // disambiguate duplicate basenames within the group.
    const seen = new Map<string, number>();
    group.forEach((p, idx) => {
      const baseKey = vendorKeys[idx]!;
      if (idx === 0) {
        // First pick in the group: canonical un-suffixed name.
        seen.set(baseKey, 1);
        out.set(keyOf(p), `${projectDir}/${p.moduleShortName}_Cfg.arxml`);
        return;
      }
      // Later picks: always suffixed; numeric suffix on top when
      // basename collides with a previously-seen one in this group.
      const seenCount = seen.get(baseKey) ?? 0;
      seen.set(baseKey, seenCount + 1);
      const numericPart = seenCount === 0 ? '' : `_${seenCount}`;
      const vendorPart = `${baseKey}${numericPart}`;
      out.set(
        keyOf(p),
        `${projectDir}/${p.moduleShortName}__${vendorPart}_Cfg.arxml`,
      );
    });
  }
  return out;
}

function keyOf(p: PickedModule): string {
  return `${p.bswmdPath}::${p.moduleShortName}`;
}

function vendorKeyFromPath(p: string): string {
  // Extract basename without ".arxml", lowercased.
  const basename = p.split(/[\\/]/).pop() ?? p;
  return basename.replace(/\.arxml$/i, '').toLowerCase();
}
