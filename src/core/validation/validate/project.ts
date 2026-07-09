// core/validation/validate/project.ts
// Sprint 6 / Sprint 9 — project-level validation: cross-container
// reference resolution and graph-level cycle detection.
//
// Split from `src/core/validation/validate.ts` as part of v1.41.x
// PATCH T1 (file-size backlog). Owns the public `validateProject`
// entry point plus the path-index / ref-site walkers
// (`buildPathIndex` + `walkPathIndex` + `extractReferences` +
// `walkRefs`).

import type { ArxmlDocument, ArxmlElement } from '../../arxml/types.js';
import type { SchemaLayer } from '../runtimeSchema.js';
import type { PathIndexEntry, RefSite, ValidationError } from '../types.js';

import { checkCrossRefs, checkRefCycles, checkRefDests } from './checks.js';
import { validate } from './walk.js';

/**
 * Validate the entire loaded project: every single-document check from
 * Sprint 5 plus the new 'cross-ref' kind that verifies every reference's
 * target exists somewhere in the project's path index.
 *
 * Single-document checks still run per document for backwards compatibility:
 * range / enum / required / schema / multiplicity surface even when only
 * one ARXML is loaded. Cross-ref checks only run when ≥1 document exists
 * (no-op for empty project).
 *
 * The optional `layer` argument (Sprint 12 #2) threads a runtime
 * BSWMD-derived `SchemaLayer` into every single-document `validate()`
 * call so `'schema-unknown'` errors fire consistently across the whole
 * project (see `validate()` for the semantics). Project-level checks
 * (cross-ref / ref-dest / ref-cycle) are unaffected by the layer — they
 * operate on the project path index, not on schema lookups.
 *
 * Returns `readonly ValidationError[]` to match the single-document
 * validate() contract — caller treats `.length === 0` as success.
 */
export function validateProject(
  documents: readonly ArxmlDocument[],
  layer?: SchemaLayer,
): readonly ValidationError[] {
  const errors: ValidationError[] = [];

  // Step 1: aggregate single-document errors (preserves Sprint 5 semantics)
  for (const doc of documents) {
    errors.push(...validate(doc, layer));
  }

  if (documents.length === 0) return errors;

  // Step 2: build path index covering all documents
  const pathIndex = buildPathIndex(documents);

  // Step 3: extract every reference consumption site
  const refSites = extractReferences(documents);

  // Step 4: run cross-ref existence check
  errors.push(...checkCrossRefs(refSites, pathIndex));

  // Step 5: run target-side DEST-kind check (Sprint 9 #2)
  errors.push(...checkRefDests(refSites, pathIndex));

  // Step 6: run cyclic-ref detection (Sprint 9 #3)
  errors.push(...checkRefCycles(refSites, pathIndex));

  return errors;
}

/**
 * Build path → element-metadata index covering every container, module, and
 * named reference across the project. Pure / testable.
 *
 * Path format: "/<pkg.shortName>/<module.shortName>/.../<leaf.shortName>"
 * (matches VALUE-REF strings emitted by AUTOSAR ARXML serializers).
 *
 * Note we key by pkg.shortName, NOT pkg.path — VALUE-REF targets are absolute
 * AUTOSAR paths beginning with "/<pkgShortName>/...", which is what walkPathIndex
 * builds. Iterating doc.packages and starting with `/${pkg.shortName}` keeps
 * the index keys consistent with target strings.
 */
export function buildPathIndex(documents: readonly ArxmlDocument[]): Map<string, PathIndexEntry> {
  const index = new Map<string, PathIndexEntry>();
  for (const doc of documents) {
    for (const pkg of doc.packages) {
      walkPathIndex(`/${pkg.shortName}`, pkg.elements, index);
    }
  }
  return index;
}

function walkPathIndex(
  basePath: string,
  elements: readonly ArxmlElement[],
  index: Map<string, PathIndexEntry>,
): void {
  for (const el of elements) {
    if (el.kind === 'reference') {
      // Named references are addressable; nameless ones (rare, inline VALUE-REF
      // inside SHORT-NAME-PATTERN) are not indexable as targets.
      if (el.shortName !== undefined && el.shortName.length > 0) {
        const p = `${basePath}/${el.shortName}`;
        const entry: PathIndexEntry =
          el.dest !== undefined
            ? { path: p, kind: 'reference', shortName: el.shortName, dest: el.dest }
            : { path: p, kind: 'reference', shortName: el.shortName };
        index.set(p, entry);
      }
      continue;
    }
    // v1.4.0 trust sprint — 17c. Unknown vendor extensions are not
    // addressable through the cross-ref path index; they have no
    // SHORT-NAME and no children to recurse into. Skip them.
    if (el.kind === 'unknown') continue;
    // module or container
    const p = `${basePath}/${el.shortName}`;
    index.set(p, { path: p, kind: el.kind, shortName: el.shortName });
    walkPathIndex(p, el.children, index);
  }
}

/**
 * Walk all documents to collect every reference consumption site (every
 * ArxmlReference element). `sourcePath` records the parent container's
 * absolute path so error messages can locate the consumer.
 *
 * Pure / testable.
 */
export function extractReferences(documents: readonly ArxmlDocument[]): readonly RefSite[] {
  const sites: RefSite[] = [];
  for (const doc of documents) {
    for (const pkg of doc.packages) {
      walkRefs(`/${pkg.shortName}`, pkg.elements, sites);
    }
  }
  return sites;
}

function walkRefs(parentPath: string, elements: readonly ArxmlElement[], sites: RefSite[]): void {
  for (const el of elements) {
    if (el.kind === 'reference') {
      const site: RefSite =
        el.dest !== undefined
          ? {
              sourcePath: parentPath,
              targetPath: el.value,
              targetDest: el.dest,
              tagName: el.tagName,
            }
          : {
              sourcePath: parentPath,
              targetPath: el.value,
              tagName: el.tagName,
            };
      sites.push(site);
      continue;
    }
    // v1.4.0 trust sprint — 17c. Unknown vendor extensions are leaves
    // and carry no SHORT-NAME / params / children. Skip the
    // ref-scan + recurse for this variant.
    if (el.kind === 'unknown') continue;
    // module or container — also scan `params[]` for type:'reference' values
    // (the parser folds VALUE-REFs inside ECUC-NUMERICAL-PARAM-VALUE /
    // ECUC-REFERENCE-VALUE wrappers into container.params[], not as discrete
    // ArxmlReference children).
    //
    // NOTE (Sprint 6 / D): we deliberately do NOT scan ArxmlModule.references[]
    // here. Those strings are the module's own DEFINITION-REF (e.g.
    // "/EAS/Det"), which point at the *schema definition* namespace
    // (ECUC-MODULE-DEF), not at user-configured cross-container values.
    // They are not project-internal cross-refs and would always fire as
    // false-positive "cross-ref" errors against the value-side path index.
    // Schema-side ref validation is out of scope for Sprint 6 — see Sprint 7
    // backlog for REFERENCE-VALUES parser support + ref dest type checking.
    const childPath = `${parentPath}/${el.shortName}`;
    for (const [paramKey, value] of Object.entries(el.params)) {
      if (value.type === 'reference') {
        // Sprint 9 #2 fix: propagate ParamValue.dest (carried from the
        // VALUE-REF's DEST attribute by the parser) into RefSite.targetDest
        // so `checkRefDests` can run target-side validation on VALUE-REF
        // params, not just ArxmlReference elements. Without this, param-
        // level refs (the dominant case in 5-fixture data) always have
        // targetDest === undefined and silently skip the dest-kind rule.
        sites.push({
          sourcePath: childPath,
          targetPath: value.value,
          ...(value.dest !== undefined ? { targetDest: value.dest } : {}),
          tagName: paramKey,
          paramKey,
        });
      }
    }
    // recurse into module / container children
    walkRefs(childPath, el.children, sites);
  }
}
