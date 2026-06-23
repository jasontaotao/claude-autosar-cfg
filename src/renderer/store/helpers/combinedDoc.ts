// src/renderer/store/helpers/combinedDoc.ts
// Sprint 13 Stage 3.5 — Combined Tree View helpers + the exported
// `resolveContainerTarget` helper used by BswmdPickerDialog and tests.
// Pure — no store closure. Extracted from useArxmlStore.ts in PR(5).

import { findByPathMultiDoc } from '@core/arxml/path';
import type { ArxmlDocument, ArxmlElement, ArxmlPackage } from '@core/arxml/types';
import type { BswmdDocument } from '@core/project/bswmd.js';

export interface ResolvedContainerTarget {
  readonly doc: ArxmlDocument;
  readonly filePath: string;
  readonly innerPath: string;
}

/**
 * Resolve a container path to its source document + filePath + innerPath.
 *
 * - 'combined' mode: routes via `findByPathMultiDoc` (path may carry a
 *   source file's basename as a prefix; the inner path is identical to
 *   the input because the per-doc lookup inside `findByPathMultiDoc`
 *   already strips the prefix when needed).
 * - 'single' mode: returns the active document; innerPath equals the
 *   input path verbatim.
 * - Returns `null` when the combined-mode lookup misses or the
 *   single-mode store has no active document — callers treat null as
 *   a 'path-not-found' error.
 *
 * The `state` parameter accepts the structural minimum — every field
 * used is read by name, so any object matching this shape (including
 * the full ArxmlState) is accepted. Defined this way to avoid a
 * circular import between useArxmlStore.ts and this helper module.
 */
export function resolveContainerTarget(
  state: ResolveContainerTargetState,
  containerPath: string,
): ResolvedContainerTarget | null {
  if (state.viewMode === 'combined') {
    const hit = findByPathMultiDoc(state.documents, state.documentPaths, containerPath);
    if (hit === null) return null;
    return { doc: hit.doc, filePath: hit.filePath, innerPath: containerPath };
  }
  if (state.doc === null) return null;
  return { doc: state.doc, filePath: state.filePath ?? '', innerPath: containerPath };
}

/**
 * Structural minimum that `resolveContainerTarget` reads. The full
 * `ArxmlState` satisfies this trivially; tests that build a fake state
 * only need to supply these fields.
 */
export interface ResolveContainerTargetState {
  readonly viewMode: 'single' | 'combined' | 'import-merged';
  readonly documents: readonly ArxmlDocument[];
  readonly documentPaths: readonly string[];
  readonly doc: ArxmlDocument | null;
  readonly filePath: string | null;
}

/**
 * Compute `displayDoc` based on the current viewMode and document set.
 * Pure helper extracted so every mutator can recompute consistently
 * without inline branching. In 'single' mode it returns the active
 * `doc`; in 'combined' mode it returns a freshly synthesised virtual
 * document (or null when no docs are loaded).
 *
 * v1.9.0 Sprint X T7 — added optional `bswmdSchemas` so the vendor-
 * prefix fold has up-to-date module coverage. Both single-mode and
 * combined-mode now run `foldVendorPackages` so the Tree shows only
 * the deepest AR-PACKAGE (vendor-private wrappers are hidden).
 */
export function computeDisplayDoc(
  mode: 'single' | 'combined' | 'import-merged',
  activeDoc: ArxmlDocument | null,
  documents: readonly ArxmlDocument[],
  filePaths: readonly string[],
  bswmdSchemas?: readonly BswmdDocument[],
): CombinedDocumentResult | null {
  if (mode === 'single' || mode === 'import-merged') {
    // Single / import-merged mode passes the active doc through the
    // vendor fold so the Tree shows only the deepest AR-PACKAGE
    // (matches user's mental model: vendor-private wrapper layers
    // are hidden). `activeDoc` may be null when no source documents
    // are loaded; callers treat that as "no display content".
    if (activeDoc === null) return { doc: null, warnings: [] };
    return {
      doc: foldVendorPackages(activeDoc, bswmdSchemas ?? []),
      warnings: [],
    };
  }
  if (documents.length === 0) return null;
  const built = buildCombinedDocument(documents, filePaths);
  return {
    doc: built.doc === null ? null : foldVendorPackages(built.doc, bswmdSchemas ?? []),
    warnings: built.warnings,
  };
}

export type CombinedDocumentWarning = {
  readonly kind: 'duplicate-root-conflict';
  readonly shortName: string;
  /** File path of the document whose root was kept. */
  readonly keptFrom: string;
};

export interface CombinedDocumentResult {
  readonly doc: ArxmlDocument | null;
  readonly warnings: readonly CombinedDocumentWarning[];
}

/**
 * Last segment of a file path (after the last `/` or `\`). Mirrors
 * `@shared/path#basename` but kept inline so the store has no shared
 * dependency (the store is consumed in the renderer; this also keeps
 * the `core/` import graph one-way).
 */
function lastSegment(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/**
 * Sprint 13 Stage 3.5 — Combined Tree View. Synthesise a virtual
 * ArxmlDocument whose top-level packages are the per-file basenames of
 * the loaded documents, and whose child paths are prefixed with the
 * source file's basename (or `[doc:N]` for same-basename duplicates).
 * Used as the `displayDoc` value when `viewMode === 'combined'`. The
 * Tree component reads `displayDoc` instead of `doc` and renders one
 * branch per loaded file.
 *
 * Wrapping is shallow: each package is a fresh object with its
 * `shortName` / `path` rewritten, but the original `elements` array
 * is reused. Mutation through `updateParam` reaches the source
 * document because it routes via `findByPathMultiDoc` rather than
 * mutating the wrapped packages.
 */
function buildCombinedDocument(
  documents: readonly ArxmlDocument[],
  filePaths: readonly string[],
): CombinedDocumentResult {
  // Sprint 16 — smart basename wrapper skip. When no collision exists
  // (basenames all unique AND module shortNames don't overlap across
  // docs), synthesise a flat displayDoc by concatenating the docs'
  // root packages directly. The Tree then renders the docs' own
  // module hierarchy at the top level — no ' package'
  // wrapper. findByPathMultiDoc falls back to per-doc lookup for
  // unprefixed paths (see core/arxml/path.ts).
  //
  // Sprint 17c T10 — root-package dedup runs BEFORE the
  // flat/collision branch, so the result is consistent: a root
  // package with the same `<SHORT-NAME>` is deduped to 1 entry
  // (silent if content matches, kept-first + warning if not).
  // In flat mode this prevents the "two EAS" UX regression
  // (the original bug). In collision mode the wrap step
  // disambiguates the source doc via the basename prefix; the
  // dedup removes the second copy (the one that would have
  // been wrapped under `[doc:1]`), and the warning tells the
  // user why the second file's content didn't make it into the
  // tree.
  const allPackages: { readonly pkg: ArxmlPackage; readonly filePath: string }[] = [];
  for (let i = 0; i < documents.length; i += 1) {
    const filePath = filePaths[i] ?? '';
    for (const pkg of documents[i]?.packages ?? []) {
      allPackages.push({ pkg, filePath });
    }
  }
  const { dedupedPackages, warnings: dedupWarnings } = dedupRootPackages(allPackages);

  if (!detectCombinedCollision(documents, filePaths)) {
    return {
      doc: {
        path: '[Combined]',
        version: '4.6',
        packages: dedupedPackages,
      },
      warnings: dedupWarnings,
    };
  }

  // Collision path — wrap each file's packages under its basename
  // (or [doc:N] for disambiguation). Disambiguate basenames that
  // collide across files. The first file keeps its literal basename;
  // subsequent collisions fall back to `[doc:N]`. This is the inverse
  // of `findByPathMultiDoc`'s index parsing, so a round-trip
  // `select(path)` then `updateParam(path)` resolves back to the
  // same source.
  //
  // Sprint 17c T10 — the dedup pass already ran on the raw
  // packages. Iterate the deduped list and pick the packages
  // whose source file is the current iteration's. Reference
  // equality is the contract: dedup keeps the FIRST occurrence's
  // reference, and the source docs own those references.
  const basenameSeen = new Map<string, number>();
  const combinedPackages: ArxmlPackage[] = [];
  for (let i = 0; i < documents.length; i += 1) {
    const filePath = filePaths[i] ?? '';
    const base = lastSegment(filePath);
    const seen = basenameSeen.get(base) ?? 0;
    basenameSeen.set(base, seen + 1);
    const segmentName = seen === 0 ? base : `[doc:${i}]`;
    for (const pkg of dedupedPackages) {
      let isFromThisFile = false;
      for (const p of documents[i]?.packages ?? []) {
        if (p === pkg) {
          isFromThisFile = true;
          break;
        }
      }
      if (!isFromThisFile) continue;
      combinedPackages.push(wrapPackageUnderSegment(pkg, segmentName));
    }
  }
  return {
    doc: {
      path: '[Combined]',
      // Combined docs share the version of the most-recently-added
      // source — Tree doesn't render the version so this only matters
      // for `app.docVersion` in ArxmlPanel. The footer uses the last
      // loaded doc; carrying a placeholder here is acceptable.
      version: '4.6',
      packages: combinedPackages,
    },
    // Sprint 17c T10 — the dedup pass emitted `dedupWarnings` on
    // the raw packages; surface them in the result so the store's
    // `warnings` slice reflects the dedup outcome even in collision
    // mode.
    warnings: dedupWarnings,
  };
}

/**
 * Sprint 17c T10 — deduplicate root packages across the loaded
 * document set. The combined view used to render BOTH packages
 * when two docs shared a root `<SHORT-NAME>` (e.g. two `EAS`
 * roots from two BSWMD-derived ARXML files) — a "two EAS" UX
 * regression documented in `sprint-16-shipped.md`.
 *
 * Algorithm:
 *   1. Group packages by `shortName` (preserves insertion order).
 *   2. For each group with 2+ entries:
 *      - Compare pairwise against the FIRST entry using
 *        `packagesDeepEqual` (recursive: same shortName, same
 *        elements + nested packages, same param values).
 *      - If all entries equal the first → keep first only
 *        (silent dedup, no warning).
 *      - If any entry differs from the first → keep first only +
 *        emit ONE `duplicate-root-conflict` warning with the
 *        first entry's source filePath as `keptFrom`.
 *   3. For singletons, keep as-is.
 *
 * Pure: produces a new `dedupedPackages` array. The dedup
 * preserves the first occurrence's object reference; only the
 * surrounding list shape is rebuilt.
 */
function dedupRootPackages(
  entries: readonly { readonly pkg: ArxmlPackage; readonly filePath: string }[],
): {
  readonly dedupedPackages: readonly ArxmlPackage[];
  readonly warnings: readonly CombinedDocumentWarning[];
} {
  const deduped: ArxmlPackage[] = [];
  const warnings: CombinedDocumentWarning[] = [];
  // Track first-occurrence (package + filePath) keyed by shortName
  // so subsequent occurrences can be compared against the keeper.
  const firstByShortName = new Map<string, { pkg: ArxmlPackage; filePath: string }>();
  for (const entry of entries) {
    const existing = firstByShortName.get(entry.pkg.shortName);
    if (existing === undefined) {
      firstByShortName.set(entry.pkg.shortName, entry);
      deduped.push(entry.pkg);
      continue;
    }
    // Subsequent occurrence of a shortName we've already seen.
    // If the content matches the first, silent dedup; otherwise
    // emit a conflict warning (only once per shortName).
    if (packagesDeepEqual(existing.pkg, entry.pkg)) {
      // Silent dedup — keep the first (already in `deduped`),
      // drop the duplicate. No warning.
      continue;
    }
    // Content differs — emit a conflict warning. The warning
    // shape is keyed by shortName; suppress duplicates so 3+ docs
    // with the same conflict shortName produce ONE warning, not
    // N-1.
    if (
      !warnings.some(
        (w) => w.kind === 'duplicate-root-conflict' && w.shortName === entry.pkg.shortName,
      )
    ) {
      warnings.push({
        kind: 'duplicate-root-conflict',
        shortName: entry.pkg.shortName,
        keptFrom: existing.filePath,
      });
    }
  }
  return { dedupedPackages: deduped, warnings };
}

/**
 * Sprint 17c T10 — recursive deep-equality on two
 * ArxmlPackage trees. Two packages are "equal" if:
 *   - same `shortName` and `path`
 *   - same `elements` (each element compared via `elementsEqual`)
 *   - same nested `packages` (each compared via recursion)
 *
 * Element comparison: same `kind`, same `shortName`, same
 * `params` (via JSON key-by-key), same `children`, same
 * `references` (modules only), same `value` (references).
 *
 * Pure / allocation-free on the happy path. JSON.stringify on
 * the params dict is acceptable for the dedup use case (small
 * counts — typically 1-2 root packages per doc).
 */
function packagesDeepEqual(a: ArxmlPackage, b: ArxmlPackage): boolean {
  if (a.shortName !== b.shortName) return false;
  if (a.path !== b.path) return false;
  if (a.longName !== b.longName) return false;
  if (a.elements.length !== b.elements.length) return false;
  for (let i = 0; i < a.elements.length; i += 1) {
    const ea = a.elements[i];
    const eb = b.elements[i];
    if (ea === undefined || eb === undefined) return false;
    if (!elementsEqual(ea, eb)) return false;
  }
  const aNested = a.packages ?? [];
  const bNested = b.packages ?? [];
  if (aNested.length !== bNested.length) return false;
  for (let i = 0; i < aNested.length; i += 1) {
    const na = aNested[i];
    const nb = bNested[i];
    if (na === undefined || nb === undefined) return false;
    if (!packagesDeepEqual(na, nb)) return false;
  }
  return true;
}

function elementsEqual(a: ArxmlElement, b: ArxmlElement): boolean {
  if (a.kind !== b.kind) return false;
  // v1.4.0 trust sprint — 17c. Unknown elements are identified by
  // tagName (no SHORT-NAME). Compare the captured `parsed` payload
  // verbatim so any structural drift in the re-emitted XML is detected.
  if (a.kind === 'unknown' && b.kind === 'unknown') {
    return JSON.stringify(a.parsed) === JSON.stringify(b.parsed);
  }
  if (a.kind === 'reference' && b.kind === 'reference') {
    if (a.shortName !== b.shortName) return false;
    if (a.value !== b.value) return false;
    if (a.dest !== b.dest) return false;
    return true;
  }
  if (
    (a.kind === 'module' || a.kind === 'container') &&
    (b.kind === 'module' || b.kind === 'container')
  ) {
    if (a.shortName !== b.shortName) return false;
    if (a.tagName !== b.tagName) return false;
    if (!paramsDeepEqual(a.params, b.params)) return false;
    if (a.children.length !== b.children.length) return false;
    for (let i = 0; i < a.children.length; i += 1) {
      const ca = a.children[i];
      const cb = b.children[i];
      if (ca === undefined || cb === undefined) return false;
      if (!elementsEqual(ca, cb)) return false;
    }
    if (a.kind === 'module' && b.kind === 'module') {
      if (a.references.length !== b.references.length) return false;
      for (let i = 0; i < a.references.length; i += 1) {
        if (a.references[i] !== b.references[i]) return false;
      }
    }
    return true;
  }
  return false;
}

function paramsDeepEqual(
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
  }
  return true;
}

/**
 * Sprint 16 — collision detection for the combined Tree View.
 *
 * Returns true when the per-file basename wrapper is required to
 * disambiguate paths in the combined view. Two collision sources:
 *
 *   1. **Basename collision** — two files share the same basename
 *      (e.g. `/a/Can.arxml` and `/b/Can.arxml`). The wrapper uses
 *      `[doc:N]` for later occurrences, so prefix → source mapping
 *      is unambiguous. Without the wrapper, two source docs would
 *      both contribute identical unprefixed paths.
 *
 *   2. **Module shortName collision** — two files declare a module
 *      with the same `<SHORT-NAME>` (e.g. `Can` from two BSWMDs).
 *      Without the wrapper, both files contribute `…/Can/…` paths
 *      that can't be told apart.
 *
 * When neither collision exists the wrapper is pure noise and
 * `buildCombinedDocument` returns a flat displayDoc.
 */
function detectCombinedCollision(
  documents: readonly ArxmlDocument[],
  filePaths: readonly string[],
): boolean {
  // Module shortName collision: track which filePath owns each module.
  const moduleOwners = new Map<string, string>();
  for (let i = 0; i < documents.length; i += 1) {
    const filePath = filePaths[i] ?? '';
    for (const pkg of documents[i]?.packages ?? []) {
      for (const el of pkg.elements) {
        if (el.kind !== 'module') continue;
        const owner = moduleOwners.get(el.shortName);
        if (owner !== undefined && owner !== filePath) return true;
        moduleOwners.set(el.shortName, filePath);
      }
    }
  }
  // Basename collision.
  const basenameSeen = new Set<string>();
  for (const fp of filePaths) {
    const base = lastSegment(fp);
    if (basenameSeen.has(base)) return true;
    basenameSeen.add(base);
  }
  return false;
}

/**
 * Return a new ArxmlPackage whose `shortName` and `path` are prefixed
 * with the basename segment, with `elements` / nested `packages`
 * shallowly re-wrapped so every descendant path carries the prefix.
 * The original element/param objects are reused (immutable contract);
 * only path-bearing objects are re-created.
 */
function wrapPackageUnderSegment(pkg: ArxmlPackage, segment: string): ArxmlPackage {
  const newPath = `/${segment}${pkg.path}`;
  const wrappedPackages = pkg.packages?.map((sp) => wrapNestedPackage(sp, segment));
  return {
    ...pkg,
    shortName: segment,
    path: newPath,
    ...(wrappedPackages !== undefined ? { packages: wrappedPackages } : {}),
    elements: pkg.elements.map((el) => wrapElement(el, newPath)),
  };
}

function wrapNestedPackage(pkg: ArxmlPackage, segment: string): ArxmlPackage {
  const newPath = `/${segment}${pkg.path}`;
  const wrappedPackages = pkg.packages?.map((sp) => wrapNestedPackage(sp, segment));
  return {
    ...pkg,
    path: newPath,
    ...(wrappedPackages !== undefined ? { packages: wrappedPackages } : {}),
    elements: pkg.elements.map((el) => wrapElement(el, newPath)),
  };
}

function wrapElement(el: ArxmlElement, parentPath: string): ArxmlElement {
  // v1.4.0 trust sprint — 17c. Unknown elements have no SHORT-NAME and
  // no children to recurse into; pass them through with the parent path
  // attached for downstream debugging (the renderer still sees them via
  // the package's `elements` list).
  if (el.kind === 'unknown') return { ...el };
  const childPath = `${parentPath}/${el.shortName}`;
  if (el.kind === 'reference') return { ...el };
  return {
    ...el,
    children: el.children.map((c) => wrapElement(c, childPath)),
  };
}

/**
 * Strip the basename / `[doc:N]` prefix from a combined-mode path so
 * the inner path can be passed to `applyParamUpdate` (which expects a
 * regular path inside the source document). Mirrors
 * `findByPathMultiDoc`'s prefix-parsing logic.
 *
 * Sprint 16 — flat-mode passthrough: when the head segment doesn't
 * match the source file's basename and isn't a `[doc:N]` index, the
 * combined view is using the flat (no-wrapper) shape. Return the
 * path verbatim so `applyParamUpdate` receives the inner path it
 * expects. Returns null only when the path is too short to be a
 * valid inner path (< 2 segments).
 */
export function stripCombinedPrefix(combinedPath: string, sourceFilePath: string): string | null {
  const segments = combinedPath.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const [head, ...rest] = segments;
  if (head === undefined) return null;
  // Accept either the literal basename or the [doc:N] index form.
  if (head === lastSegment(sourceFilePath) || /^\[doc:\d+\]$/.test(head)) {
    return `/${rest.join('/')}`;
  }
  // Flat mode: no wrapper in the combined view — the path is already
  // an inner path. Return verbatim.
  return combinedPath;
}

// ---------------------------------------------------------------------------
// v1.9.0 Sprint X — vendor-prefix package fold (T7)
// ---------------------------------------------------------------------------

/**
 * Heuristic: a top-level AR-PACKAGE chain `/A/B/C` where C is a BSWMD
 * module shortName (e.g. `/JWQ_CDD_PACK/JWQ_Packet/JWQ3399` with
 * C=JWQ3399 loaded from a BSWMD) should be visually flattened so the
 * UI shows only C. Vendor-private wrapper layers (JWQ_CDD_PACK,
 * JWQ_Packet) collapse into C; the serialised arxml keeps the full
 * 3-layer shape so it remains AUTOSAR-tooling-compatible
 * (skeleton.ts emits the full chain; this is displayDoc-only).
 *
 * Detection rule (depth-first, top-down):
 *   1. If a top-level package P has exactly one nested package P1
 *      (and P1 has no `elements` of its own — vendor wrappers carry
 *      elements=[]), AND either:
 *      a. P1.shortName matches any shortName in
 *         `bswmdSchemas[*].modules[*]` (gold path — BSWMD match),
 *      b. P.shortName matches a trusted vendor-pack prefix
 *         (`JWQ_.*_PACK`, see Phase 5c below), OR
 *      c. P.shortName matches a generic vendor prefix
 *         (`EAS`/`EcucDefs`/`AUTOSAR(_.*)?`) AND P1.shortName matches
 *         a BSWMD module shortName (sanity gate against
 *         user-defined `EcucDefs`).
 *      then collapse: hoist P1 to the top, preserving P1.shortName /
 *      path / elements / packages, and continue the fold recursively
 *      into P1.
 *   2. Otherwise, leave the package as-is (and recurse into its
 *      children).
 *
 * Path rewriting: the hoisted package's path is rewritten to drop the
 * vendor wrapper prefix so the post-fold path is the deepest segment
 * alone (e.g. `/JWQ3399` instead of `/JWQ_CDD_PACK/JWQ_Packet/JWQ3399`).
 * This keeps `selectedPath` consistent across the fold — ParamEditor /
 * ContextMenu consume the post-fold paths and `findByPath` on the
 * source `doc` still resolves them via the fold-aware lookup paths.
 *
 * Pure: no I/O, no React, no Zustand. Returns a new ArxmlDocument
 * when at least one package was folded; returns the same reference
 * otherwise (so `useMemo` callers skip re-render).
 */
function foldVendorPackages(
  doc: ArxmlDocument,
  bswmdSchemas: readonly BswmdDocument[],
): ArxmlDocument {
  const bswmdModuleNames = new Set<string>();
  for (const schema of bswmdSchemas) {
    for (const mod of schema.modules) {
      bswmdModuleNames.add(mod.shortName);
    }
  }
  // v1.9.0 Sprint X Phase 5c — split vendor prefix matching into
  // two tiers:
  //   - TRUSTED: `JWQ_.*_PACK` (经纬恒润 Intewell vendor pack
  //     convention). Specific enough that we trust the fold on
  //     naming alone — the full chain `JWQ_CDD_PACK > JWQ_Packet >
  //     JWQ3399` collapses even when `JWQ3399` isn't (yet) loaded
  //     as a BSWMD module. Restores the user requirement "不在 UI
  //     里显示 vendor 父层".
  //   - GENERIC: `EAS` / `EcucDefs` / `AUTOSAR(_.*)?` (AUTOSAR
  //     standard namespaces). These are short and common enough
  //     that a user could plausibly name a project-local package
  //     after them; we keep the BSWMD AND gate for these so the
  //     fold only triggers when the inner is positively known.
  const TRUSTED_VENDOR_PACK_RE = /^JWQ_.*_PACK$/;
  const GENERIC_VENDOR_PREFIX_RE = /^(EAS|EcucDefs|AUTOSAR(_.*)?)$/;

  const foldedPackages = doc.packages
    .map((p) =>
      foldPackage(p, '', bswmdModuleNames, TRUSTED_VENDOR_PACK_RE, GENERIC_VENDOR_PREFIX_RE),
    )
    .filter((p): p is ArxmlPackage => p !== null);

  // Reference-equal fast path: if no package was actually folded,
  // return the same ArxmlDocument reference so downstream `useMemo`
  // callers (Tree.tsx) skip re-render.
  if (
    foldedPackages.length === doc.packages.length &&
    foldedPackages.every((p, i) => p === doc.packages[i])
  ) {
    return doc;
  }
  return { ...doc, packages: foldedPackages };
}

/**
 * Recursively fold a single package. Returns the same package
 * reference when no fold is needed (preserves ref equality for the
 * fast path).
 *
 * Algorithm: walk DOWN the wrapper chain collapsing each layer that
 * satisfies the fold condition. The deepest leaf stays put; every
 * intermediate wrapper collapses into it. This handles chains of
 * arbitrary depth (1, 2, 3+ segments) with the same code path.
 *
 * @param pkg                  The package to fold.
 * @param prefix               The path prefix accumulated by parent
 *                             hoists (always '' at the top level;
 *                             non-empty when this pkg is itself
 *                             inside a parent chain).
 * @param bswmdNames           Module shortNames loaded from any
 *                             BSWMD schema.
 * @param trustedPackRe        Regex matching trusted vendor pack
 *                             shortNames (e.g. `JWQ_.*_PACK`).
 * @param genericPrefixRe      Regex matching generic vendor prefix
 *                             shortNames (`EAS`/`EcucDefs`/
 *                             `AUTOSAR(_.*)?`). Requires a positive
 *                             BSWMD match on the inner to actually
 *                             trigger a fold.
 */
function foldPackage(
  pkg: ArxmlPackage,
  prefix: string,
  bswmdNames: ReadonlySet<string>,
  trustedPackRe: RegExp,
  genericPrefixRe: RegExp,
): ArxmlPackage {
  const nested = pkg.packages;

  // Foldable? A package is foldable when:
  //   - it has EXACTLY ONE nested package (vendor wrappers don't
  //     carry siblings)
  //   - it carries no `elements` of its own (vendor wrappers are
  //     pass-through)
  //   - any of the following hold:
  //       a. inner.shortName is a BSWMD module (gold path), OR
  //       b. pkg.shortName matches a trusted vendor pack prefix
  //          (folds on naming alone, no BSWMD gate), OR
  //       c. pkg.shortName matches a generic vendor prefix AND
  //          inner.shortName is a BSWMD module (sanity gate
  //          against user-defined `EcucDefs`).
  //
  // v1.9.0 Sprint X Phase 5c — split the former
  // `VENDOR_PREFIX_RE` into trusted (b) vs generic (c) tiers. The
  // generic tier still requires the BSWMD match (MEDIUM #2
  // invariant). The trusted tier is the Phase 5b regression fix:
  // the previous AND-combined rule refused to fold `JWQ_CDD_PACK >
  // JWQ_Packet > JWQ3399` because the outer wrapper's inner
  // (`JWQ_Packet`) wasn't a BSWMD module, leaving the vendor parent
  // visible. The trusted-prefix rule alone is sufficient — naming
  // convention is the contract.
  //
  // This check applies at ANY level — top-level wrappers and
  // intermediate wrappers alike. Recursion walks down the chain
  // until we find a non-foldable package (the leaf).
  const innerMatchesBswmd =
    nested !== undefined && nested.length === 1 && bswmdNames.has(nested[0]!.shortName);
  const isFoldableHere =
    nested !== undefined &&
    nested.length === 1 &&
    pkg.elements.length === 0 &&
    (innerMatchesBswmd ||
      trustedPackRe.test(pkg.shortName) ||
      (genericPrefixRe.test(pkg.shortName) && innerMatchesBswmd));

  if (!isFoldableHere) {
    // Not foldable. If nested exists, recurse into it first to
    // collapse any inner wrappers; only allocate a new pkg if the
    // nested array actually changed.
    if (nested === undefined || nested.length === 0) {
      // No nested → return ref-equal.
      return pkg;
    }
    const mapped = nested.map((sp) =>
      foldPackage(sp, joinPath(prefix, pkg.shortName), bswmdNames, trustedPackRe, genericPrefixRe),
    );
    const changed = mapped.some((m, i) => m !== nested[i]);
    if (!changed) return pkg;
    return {
      ...pkg,
      packages: mapped,
    };
  }

  // Foldable: recurse into the only nested child, then hoist the
  // (now fully folded) child to take our place.
  const child = nested[0]!;
  const foldedChild = foldPackage(
    child,
    joinPath(prefix, pkg.shortName),
    bswmdNames,
    trustedPackRe,
    genericPrefixRe,
  );
  // The hoisted package takes the deepest shortName (already
  // collapsed recursively). Path is rewritten to drop the entire
  // wrapper prefix.
  const hoistedPackages = foldedChild.packages;
  return {
    ...foldedChild,
    path: `/${foldedChild.shortName}`,
    ...(hoistedPackages !== undefined ? { packages: hoistedPackages } : {}),
    elements: foldedChild.elements,
  };
}

function joinPath(prefix: string, segment: string): string {
  if (prefix === '') return `/${segment}`;
  return `${prefix}/${segment}`;
}
