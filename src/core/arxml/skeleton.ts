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

import { fillParamsFromBswmd } from './defaultValue.js';
import type { ArxmlContainer, ArxmlDocument, ArxmlModule, ArxmlPackage } from './types.js';
import { mapBswmdVersionToArxml } from './version.js';

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
  const moduleEl: ArxmlModule = buildModule(mod);
  // v1.9.0 Sprint X — preserve the vendor-prefix AR-PACKAGE hierarchy
  // from `mod.path`. Standard AUTOSAR modules (`/Can`, 1 segment) keep
  // the legacy single-layer shape; vendor-prefix modules (e.g.
  // `/JWQ_CDD_PACK/JWQ_Packet/JWQ3399`, 3 segments) emit a nested
  // `ArxmlPackage.packages` chain so the serialised arxml preserves the
  // full hierarchy (required by EB tresos / Vector / Intewell tooling
  // that walks <AR-PACKAGES>). The renderer (Phase 3) folds the chain
  // back to the deepest package via `foldVendorPackages` in
  // `combinedDoc.ts` so users see a single AR-PACKAGE in the Tree.
  const segments = mod.path.split('/').filter(Boolean);
  if (segments.length <= 1) {
    // Standard AUTOSAR or pathological single-segment path: emit the
    // existing single-layer shape so the 5 round-trip fixtures stay
    // field-equal. This includes the `mod.path === '/'` edge case
    // (`split('/').filter(Boolean)` drops the lone empty segment).
    return {
      path: '',
      version: mapBswmdVersionToArxml(doc.version),
      packages: [
        {
          shortName: mod.shortName,
          path: `/${mod.shortName}`,
          elements: [moduleEl],
        },
      ],
    };
  }
  // Vendor-prefix: build the nested chain bottom-up. The deepest leaf
  // package carries `elements: [moduleEl]`; intermediate packages are
  // empty wrappers (`elements: []`, no definitionRef stamp because
  // vendor wrappers carry no BSWMD definitions). Each package's
  // `path` is the cumulative `/<seg1>/<seg2>/...` shape so the
  // serialised XML produces the right <AR-PACKAGE PATH="..."> attrs.
  let current: ArxmlPackage = {
    shortName: segments[segments.length - 1]!,
    path: `/${segments.join('/')}`,
    elements: [moduleEl],
  };
  for (let i = segments.length - 2; i >= 0; i -= 1) {
    const segment = segments[i]!;
    const partialPath = `/${segments.slice(0, i + 1).join('/')}`;
    current = {
      shortName: segment,
      path: partialPath,
      elements: [],
      packages: [current],
    };
  }
  return {
    path: '',
    version: mapBswmdVersionToArxml(doc.version),
    packages: [current],
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
    // v1.9.0 Sprint X — stamp the BSWMD-side path so the serializer
    // emits <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/...</DEFINITION-REF>
    // as a sibling of <SHORT-NAME>. Pre-X the field was omitted and the
    // serializer fell back to the synthesized /__synthesized__/<shortName>
    // placeholder, which fails EB tresos / Vector import validation.
    definitionRef: c.path,
    params: fillParamsFromBswmd(c),
    // v1.7.1 S3 — carry the BSWMD <DESC> text through to the value
    // side so the UI can surface it as a tooltip / helper text next
    // to the container shortName.
    description: c.desc,
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

/**
 * v1.9.0 Sprint X — `fillParamsFromBswmd` is imported from
 * `./defaultValue.ts` (shared with `mutation.ts`). The previous
 * private duplicate was deleted here in Phase 2 so the skeleton and
 * mutation layer apply identical default-fill semantics from one
 * implementation.
 */

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
  //
  // v1.7.1 S2 — params are now filled uniformly via
  // `fillParamsFromBswmd(c)` so every pre-created sub-container starts
  // with its declared defaults. Pre-S2 the field was hardcoded to `{}`.
  //
  // v1.9.0 Sprint X — stamp BSWMD-side path on the shell so the
  // serializer writes <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">.
  if (c.lowerMultiplicity <= 0) return [];
  return [
    {
      kind: 'container',
      tagName: 'ECUC-CONTAINER-VALUE',
      shortName: c.shortName,
      definitionRef: c.path,
      params: fillParamsFromBswmd(c),
      // v1.7.1 S3 — carry the BSWMD <DESC> text through (uniform with
      // top containers).
      description: c.desc,
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
      // v1.9.0 Sprint X — choice shell's definitionRef renders as
      // <DEFINITION-REF DEST="ECUC-CHOICE-CONTAINER-DEF">...</DEFINITION-REF>
      // because the BSWMD source is an ECUC-CHOICE-CONTAINER-DEF. The
      // serializer picks the DEST by inspecting `isChoiceContainer` on
      // the ArxmlContainer; the path itself is the choice container's
      // own BSWMD path (not a branch's path — branches are not
      // pre-created here).
      definitionRef: c.path,
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
      // v1.7.1 S3 — carry the choice container's own <DESC> (e.g.
      // "Pick exactly one of the two branches below") onto the shell.
      // Each branch's own desc stays on its own ContainerDef — branches
      // are user-instanced and aren't pre-created as children.
      description: c.desc,
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
