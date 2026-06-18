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
//     selected (bswmdPath, moduleShortName) picks, returns a Map keyed by
//     `${bswmdPath}::${moduleShortName}` whose value is the on-disk path
//     where the ECUC value-side file should be written. Handles three
//     collision cases: missing dir (mkdir), existing same-content file
//     (reuse), existing different-content file (rename with `-N` suffix).
//
// Both are pure of I/O: the only "filesystem-shaped" concern is path
// construction (`path.join`). The caller is responsible for the actual
// `mkdir` / `writeFile` / `stat`. Keeping this file I/O-free means the
// whole skeleton flow is unit-testable without `fs` mocks.
//
// Pure: no I/O, no React, no Zustand, no electron.
//
// T2 contract: `generateEcucSkeleton`. T3 contract: `resolveCollisionFilename`.

import path from 'node:path';

import type { BswModuleDef, BswmdDocument, ContainerDef } from '../project/bswmd.js';
import type { ArxmlContainer, ArxmlDocument, ArxmlModule } from './types.js';

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
   * the picker. Reserved for T3 — T2 ships the signature only.
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
    sourceBswmdPath: undefined,
  };
}

function buildModule(mod: BswModuleDef): ArxmlModule {
  return {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: mod.shortName,
    params: {},
    children: mod.containers.map(buildContainer),
    references: [],
  };
}

function buildContainer(c: ContainerDef): ArxmlContainer {
  return {
    kind: 'container',
    tagName: 'ECUC-CONFIGURATION-CONTAINER',
    shortName: c.shortName,
    params: {},
    children: c.subContainers.map(buildContainer),
  };
}

/**
 * Sprint 14 / T3 — resolve the on-disk write target for each user pick.
 *
 * Key shape: `${bswmdPath}::${moduleShortName}` — collision-safe even when
 * two BSWMDs share a module shortName.
 *
 * For each pick:
 *   - If `explicitPath` is set, use it verbatim.
 *   - Otherwise, derive `<projectDir>/<moduleShortName>.arxml` (the
 *     `<projectDir>/<moduleShortName>.ecuc.arxml` collision-suffixed case is
 *     handled by the caller's write loop — this fn just returns the *base*
 *     path; full collision logic lands in T3).
 *
 * T2 ships the function with the right signature + key shape so T3 can
 * layer the actual `fs.stat`-based collision detection on top without
 * re-touching this file. The current implementation is intentionally
 * minimal: it returns the explicit-or-derived path for every pick and
 * never fails.
 *
 * @param picks    User-selected picks from the BSWMD picker.
 * @param projectDir Absolute path of the user's project directory; the
 *                   default write target when `explicitPath` is unset.
 */
export function resolveCollisionFilename(
  picks: readonly PickedModule[],
  projectDir: string,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const pick of picks) {
    const key = `${pick.bswmdPath}::${pick.moduleShortName}`;
    const target = pick.explicitPath !== undefined && pick.explicitPath !== ''
      ? pick.explicitPath
      : path.join(projectDir, `${pick.moduleShortName}.arxml`);
    out.set(key, target);
  }
  return out;
}
