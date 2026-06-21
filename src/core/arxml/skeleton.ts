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
//     first wins the un-suffixed `<moduleShortName>_EcucValues.arxml`; later
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
export function generateEcucSkeleton(doc: BswmdDocument, moduleShortName: string): ArxmlDocument {
  const mod = doc.modules.find((m) => m.shortName === moduleShortName);
  if (mod === undefined) {
    throw new Error(`BSWMD module "${moduleShortName}" not found in document`);
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
  // defaults are skipped per the `buildDefaultValue` contract EXCEPT for
  // text-shaped params (enumeration / string / function-name), which the
  // skeleton intentionally materializes as an empty-string placeholder so
  // the user gets an editable cell in the ParamEditor. This fallback lives
  // here, not in `buildDefaultValue`, because mutation.addParameter
  // deliberately surfaces `invalid-param-type` for the same input — the
  // two layers diverge intentionally (skeleton = "give the user a cell to
  // fill"; mutation = "reject an unusable default").
  //
  // Sprint 16 — every default-filled (or text-shape fallback) param
  // carries the BSWMD-side definition path on `definitionRef`. The
  // serializer prefers this over the legacy `/__synthesized__/<shortName>`
  // placeholder so vendor tools can resolve the DEFINITION-REF.
  const params: Record<string, ParamValue> = {};
  for (const p of c.parameters) {
    const v = buildDefaultValue(p);
    if (v !== null) {
      params[p.shortName] = { ...v, definitionRef: p.path };
      continue;
    }
    if (p.kind === 'enumeration') {
      params[p.shortName] = { type: 'enum', value: '', definitionRef: p.path };
    } else if (p.kind === 'string' || p.kind === 'function-name') {
      params[p.shortName] = { type: 'string', value: '', definitionRef: p.path };
    }
    // integer / float / boolean / reference null defaults stay skipped.
  }
  return {
    kind: 'container',
    // Bug 2a (v1.4.1) — value-side containers must use the value-side tag
    // `ECUC-CONTAINER-VALUE` (AUTOSAR TPS_StandardizationTemplate). The
    // pre-fix code emitted `ECUC-CONFIGURATION-CONTAINER` which is the
    // schema-side / BSWMD tag. The parser is lenient and accepts both
    // on round-trip, but the XML was non-spec-compliant — sibling
    // containers added via mutation would emit the value-side tag,
    // producing inconsistent XML.
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: c.shortName,
    params,
    // Both `subContainers` (plain ECUC-PARAM-CONF-CONTAINER-DEF) and
    // `choices` (ECUC-CHOICE-CONTAINER-DEF) get pre-created shells.
    // Choice branches themselves are user-instanced — see the spec at
    // docs/superpowers/specs/2026-06-18-bswmd-ecuc-skeleton-defaults-design.md
    // §"Edge cases" — so the choice shell is emitted as an empty
    // ECUC-CONTAINER-VALUE (no branch pre-selected) that the user
    // descends into via the picker. Without `c.choices.flatMap(...)`,
    // required choice containers like JWQ3399SpiCsConfig / SpiHWUnitRef
    // were silently dropped from the skeleton, leaving the parent
    // container empty even though BSWMD declares them as lower=1.
    children: [
      ...c.subContainers.flatMap(buildSubContainerShell),
      ...c.choices.flatMap(buildChoiceShell),
    ],
  };
}

function buildSubContainerShell(c: ContainerDef): ArxmlContainer[] {
  // Bug 2b (v1.4.1) — only pre-create a shell when the BSWMD declares
  // `lowerMultiplicity > 0`. Optional containers (lower=0, upper=1) were
  // being created as empty shells regardless, leaving the user with a
  // ghost placeholder that has no `DEFINITION-REF` and confuses the
  // picker (it counted the shell as a real instance). Containers with
  // `lowerMultiplicity >= 1` keep the existing auto-create behaviour so
  // the skeleton's multiplicity contract is honoured.
  //
  // Returning an array (not a single container or null) lets the caller
  // use `flatMap(buildSubContainerShell)` — optional children produce
  // an empty array which `flatMap` drops automatically.
  if (c.lowerMultiplicity <= 0) return [];
  return [
    {
      kind: 'container',
      tagName: 'ECUC-CONTAINER-VALUE',
      shortName: c.shortName,
      params: {},
      // Same `choices` traversal as `buildTopContainer` — required
      // choice branches must be reachable from any depth, not only
      // from the top-level module containers.
      children: [
        ...c.subContainers.flatMap(buildSubContainerShell),
        ...c.choices.flatMap(buildChoiceShell),
      ],
    },
  ];
}

/**
 * Pre-create a value-side shell for a BSWMD choice container
 * (`<ECUC-CHOICE-CONTAINER-DEF>`) when its `lowerMultiplicity > 0`.
 *
 * Choice containers in AUTOSAR are runtime-exclusive alternatives: the
 * user picks at most one branch from `<CHOICES>` to instance. The
 * value-side encoding has no `ECUC-CHOICE-CONTAINER-VALUE` tag — the
 * choice is implicit from which branch container the user added. So
 * a choice-container shell in the skeleton is simply an empty
 * `ECUC-CONTAINER-VALUE` carrying the choice's own shortName; the
 * concrete branch is selected via the picker (`addContainer` +
 * `listAllowedSubElements`).
 *
 * `lowerMultiplicity <= 0` returns `[]` so the optional-choice case
 * stays out of the skeleton — matching the `buildSubContainerShell`
 * gate for plain containers.
 */
function buildChoiceShell(c: ContainerDef): ArxmlContainer[] {
  if (c.lowerMultiplicity <= 0) return [];
  return [
    {
      kind: 'container',
      tagName: 'ECUC-CONTAINER-VALUE',
      shortName: c.shortName,
      params: {},
      // v1.7.1 S1 — mark this shell as a choice container and list its
      // branch shortNames so the UI can distinguish it from a plain
      // sub-container shell (which omits both fields). The branch list
      // is sourced from `c.choices` directly (each entry is one
      // `<ECUC-PARAM-CONF-CONTAINER-DEF>` branch under the choice's
      // `<CHOICES>` block) and preserves BSWMD source order. The
      // branches themselves are NOT pre-created as children — see
      // the comment on `children: []` below.
      isChoiceContainer: true,
      choiceBranches: c.choices.map((b) => b.shortName),
      // A choice container in BSWMD exposes its alternatives under
      // `c.choices` (not `c.subContainers`) — see
      // bswmd.ts::buildChoiceContainer. We do NOT pre-create the
      // branches here; the user picks one via the editor and `addContainer`
      // wires the correct `DEFINITION-REF` via the picker.
      children: [],
    },
  ];
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
 *      `<moduleShortName>_EcucValues.arxml` un-suffixed.
 *   2. **Multiple picks, distinct basenames** — the first in iteration
 *      order keeps `<moduleShortName>_EcucValues.arxml`; later picks get
 *      `<moduleShortName>__<vendorKey>_EcucValues.arxml` where `vendorKey` is
 *      the lowercased BSWMD basename (without `.arxml`).
 *   3. **Multiple picks, colliding basenames** — same as (2) but with a
 *      numeric suffix: `<moduleShortName>__<vendorKey>_<N>_EcucValues.arxml`
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
  // Normalize trailing slash on projectDir so callers can pass either
  // `/proj` or `/proj/` and get the same path shape. Without this the
  // template literal would emit `/proj//ecuc/...` which downstream
  // consumers (file list equality, log output) may not tolerate.
  const dir = projectDir.replace(/\/+$/, '');
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
      out.set(keyOf(p), `${dir}/ecuc/${p.moduleShortName}_EcucValues.arxml`);
      continue;
    }
    // Multiple picks share this `moduleShortName`. The first pick in
    // iteration order wins the un-suffixed `<moduleShortName>_EcucValues.arxml`;
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
        out.set(keyOf(p), `${dir}/ecuc/${p.moduleShortName}_EcucValues.arxml`);
        return;
      }
      // Later picks: always suffixed; numeric suffix on top when
      // basename collides with a previously-seen one in this group.
      const seenCount = seen.get(baseKey) ?? 0;
      seen.set(baseKey, seenCount + 1);
      const numericPart = seenCount === 0 ? '' : `_${seenCount}`;
      const vendorPart = `${baseKey}${numericPart}`;
      out.set(keyOf(p), `${dir}/ecuc/${p.moduleShortName}__${vendorPart}_EcucValues.arxml`);
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
