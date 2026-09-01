// core/validation/validate/walk.ts
// Single-document validation walker — validate + walkElements +
// walkContainer + walkReference + emitSchemaUnknownIfInKnownModule.
//
// Split from `src/core/validation/validate.ts` as part of v1.41.x
// PATCH T1 (file-size backlog). Owns the public `validate(doc, layer)`
// entry point plus the recursive `walkElements` / `walkContainer` /
// `walkReference` helpers and the schema-unknown disambiguator
// `emitSchemaUnknownIfInKnownModule`.

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlReference,
} from '../../arxml/types.js';
import { normalizePath, resolveTargetPath } from '../pathNormalize.js';
import type { SchemaLayer } from '../runtimeSchema.js';
import { findModuleForPath } from '../runtimeSchema.js';
import { lookupSchema } from '../schema/ecucSubset.js';
import type { ValidationError } from '../types.js';

import { checkContainerMultiplicity, checkParam } from './checks.js';

/**
 * Validate `doc` against a runtime BSWMD-derived `SchemaLayer`.
 *
 * Walks every package, module, container and reference in the document,
 * looks up each param's absolute path in the layer, and emits a
 * `ValidationError` per violation. Returned list is a snapshot — the
 * caller may safely keep the reference for diagnostics.
 *
 * The optional `layer` argument (Sprint 12 #2) supplies the param-level
 * schema. When provided, the validator emits `'schema-unknown'` errors
 * for paths that are not catalogued by the layer — the disambiguator
 * for "outside any schema we know about" vs. the silent-skip behaviour
 * for "in-schema-but-unconstrained" paths.
 *
 * Without a layer the validator silently skips every param — callers
 * that want baseline 5/5 0-error coverage must wire a layer explicitly
 * (see `core/validation/__tests__/_testSchemaLayer.ts`).
 */
export function validate(doc: ArxmlDocument, layer?: SchemaLayer): readonly ValidationError[] {
  const errors: ValidationError[] = [];
  for (const pkg of doc.packages) {
    walkElements(pkg.path, pkg.elements, errors, layer);
  }
  return errors;
}

function walkElements(
  parentPath: string,
  elements: readonly ArxmlElement[],
  errors: ValidationError[],
  layer?: SchemaLayer,
): void {
  // Collect the child container types (shortName + count) at this level
  // so we can run multiplicity checks against siblings in one pass.
  const childCounts = new Map<string, number>();
  for (const el of elements) {
    if (el.kind === 'container' || el.kind === 'module') {
      childCounts.set(el.shortName, (childCounts.get(el.shortName) ?? 0) + 1);
    }
  }

  // Track which schema paths we've already checked so we emit at most
  // one `multiplicity` error per parent+shortName even when there are
  // many sibling containers of the same type.
  const checked = new Set<string>();

  for (const el of elements) {
    if (el.kind === 'module' || el.kind === 'container') {
      // NEW: container-level multiplicity check using pre-computed sibling
      // counts. Schema entries are keyed by the *child's* path
      // (e.g. /EcucDefs/EcuC/EcucPduCollection/Pdu), so we look up
      // `${parentPath}/${el.shortName}` against ECUC_CONTAINER_SCHEMA
      // and compare its `lower`/`upper` bounds against the sibling count
      // already computed above.
      const childPath = `${parentPath}/${el.shortName}`;
      if (!checked.has(childPath)) {
        checked.add(childPath);
        checkContainerMultiplicity(
          childPath,
          childCounts.get(el.shortName) ?? 0,
          errors,
          layer,
          el.kind === 'container' ? el.definitionRef : undefined,
        );
      }
      walkContainer(parentPath, el, errors, layer);
    } else if (el.kind === 'reference') {
      walkReference(parentPath, el, errors, layer);
    }
    // else: `unknown` elements are skipped — they have no params
    // / refs / children to validate (Sprint 17c v1.4.0 trust
    // sprint). They are preserved on round-trip via the model's
    // ArxmlUnknown variant; validation just doesn't address them.
  }
}

function walkContainer(
  parentPath: string,
  el: ArxmlModule | ArxmlContainer,
  errors: ValidationError[],
  layer?: SchemaLayer,
): void {
  const elementPath = `${parentPath}/${el.shortName}`;
  for (const [paramKey, value] of Object.entries(el.params)) {
    const rawPath = `${elementPath}/${paramKey}`;
    // Normalise through `resolveTargetPath` so a layer keyed on the
    // value-side namespace (`/EcucDefs/...`) and with schema-side type
    // segments already stripped matches a query built from a
    // definition-side ARXML path (`/AUTOSAR_R<NN>/EcucDefs/...`,
    // `/EAS/EcucDefs/...`, `/.../Pdu/...` with the Pdu type segment).
    // Sprint 17d: `runtimeSchema.ts#indexContainer` runs the same
    // helper at index time so layer keys share this shape.
    const paramPath = resolveTargetPath(rawPath);
    const entry = lookupSchema(paramPath, layer);
    if (entry === null) {
      // Layer-aware schema-unknown disambiguation: when a layer is
      // provided and the path is under a known module, emit a
      // 'schema-unknown' error so the renderer can surface the missing
      // schema definition (e.g. user added a BSWMD-declared CanIf module
      // but forgot to also load the BSWMD that defines CanIfInitConfiguration).
      // Without a layer (5 baseline fixtures), preserve silent-skip.
      if (layer !== undefined) {
        // Pass the *raw* path so the error's `path` field keeps the
        // caller's exact ARXML shape (incl. type segments like `Pdu`).
        emitSchemaUnknownIfInKnownModule(layer, rawPath, errors);
      }
      continue;
    }
    // Same rationale: keep the normalised path on the error so the
    // error shape is stable across ARXML namespace variations and the
    // renderer can pin its lookups against a single canonical form.
    checkParam(paramPath, paramKey, value, entry, errors);
  }
  walkElements(elementPath, el.children, errors, layer);
}

function walkReference(
  parentPath: string,
  el: ArxmlReference,
  errors: ValidationError[],
  layer?: SchemaLayer,
): void {
  const refPath = `${parentPath}/${el.shortName ?? el.value}`;
  // Sprint 17d — normalise query side so a layer keyed on the value-side
  // namespace + stripped type segments matches the reference path.
  const entry = lookupSchema(resolveTargetPath(refPath), layer);
  if (entry === null || entry.type !== 'reference') {
    if (layer !== undefined) {
      emitSchemaUnknownIfInKnownModule(layer, resolveTargetPath(refPath), errors);
    }
    return;
  }
  if (entry.refDest !== undefined && el.dest !== entry.refDest) {
    errors.push({
      kind: 'reference',
      path: refPath,
      message: `Reference DEST mismatch: expected "${entry.refDest}", got "${el.dest ?? '<unset>'}"`,
      expected: entry.refDest,
      actual: el.dest ?? '<unset>',
    });
  }
}

/**
 * Emit a `'schema-unknown'` error when `paramPath` is under a module the
 * layer recognises (i.e. the layer's container index has the module
 * root path) but the specific param path itself is not catalogued
 * anywhere — neither in the layer's `params` map nor in
 * `layer.sourcePaths`. This is the disambiguator between "BSWMD-declared
 * module has no schema for this param" (emit) and "path is in some other
 * schema table somewhere" (silent skip, the old behaviour).
 *
 * Implementation note: the layer's `sourcePaths` set contains every
 * param + container path the BSWMD declares. A path that is *not* in
 * `sourcePaths` but *is* under a known module is the "BSWMD says the
 * module exists, but didn't declare this specific path" case we want
 * to surface. Pure / side-effect-free (only `errors.push`).
 */
function emitSchemaUnknownIfInKnownModule(
  layer: SchemaLayer,
  paramPath: string,
  errors: ValidationError[],
): void {
  // Collapse `/EAS → /EcucDefs` so BSWMD paths that survive a vendor's
  // definition-side namespace collapse onto the same key the layer uses.
  const normalised = normalizePath(paramPath);
  if (layer.sourcePaths.has(normalised)) return;
  const modulePath = findModuleForPath(layer, normalised);
  if (modulePath === null) return;
  errors.push({
    kind: 'schema-unknown',
    path: paramPath,
    message: `BSWMD-declared module '${modulePath}' has no schema for '${paramPath}'`,
  });
}
