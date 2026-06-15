// Validate an ArxmlDocument against ECUC_SUBSET_SCHEMA.
// Pure function: no side effects, no I/O. Returns a readonly list of
// violations; empty list = valid.

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlReference,
  ParamValue,
} from '../arxml/types.js';

import { lookupContainerSchema, lookupSchema } from './schema/ecucSubset.js';
import type { EcucSchemaEntry, PathIndexEntry, RefSite, ValidationError } from './types.js';

/**
 * Validate `doc` against `ECUC_SUBSET_SCHEMA`.
 *
 * Walks every package, module, container and reference in the document,
 * looks up each param's absolute path in the schema, and emits a
 * `ValidationError` per violation. Returned list is a snapshot — the
 * caller may safely keep the reference for diagnostics.
 */
export function validate(doc: ArxmlDocument): readonly ValidationError[] {
  const errors: ValidationError[] = [];
  for (const pkg of doc.packages) {
    walkElements(pkg.path, pkg.elements, errors);
  }
  return errors;
}

function walkElements(
  parentPath: string,
  elements: readonly ArxmlElement[],
  errors: ValidationError[],
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
        checkContainerMultiplicity(childPath, childCounts.get(el.shortName) ?? 0, errors);
      }
      walkContainer(parentPath, el, errors);
    } else if (el.kind === 'reference') {
      walkReference(parentPath, el, errors);
    }
  }
}

function walkContainer(
  parentPath: string,
  el: ArxmlModule | ArxmlContainer,
  errors: ValidationError[],
): void {
  const elementPath = `${parentPath}/${el.shortName}`;
  for (const [paramKey, value] of Object.entries(el.params)) {
    const paramPath = `${elementPath}/${paramKey}`;
    const entry = lookupSchema(paramPath);
    if (entry === null) continue; // unconstrained
    checkParam(paramPath, paramKey, value, entry, errors);
  }
  walkElements(elementPath, el.children, errors);
}

function walkReference(parentPath: string, el: ArxmlReference, errors: ValidationError[]): void {
  const refPath = `${parentPath}/${el.shortName ?? el.value}`;
  const entry = lookupSchema(refPath);
  if (entry === null || entry.type !== 'reference') return;
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

function checkParam(
  paramPath: string,
  paramKey: string,
  value: ParamValue,
  entry: EcucSchemaEntry,
  errors: ValidationError[],
): void {
  if (!typeMatches(value, entry.type)) {
    errors.push({
      kind: 'schema',
      path: paramPath,
      paramKey,
      message: `Type mismatch: expected ${entry.type}, got ${value.type}`,
      expected: entry.type,
      actual: value.type,
    });
    return;
  }
  switch (entry.type) {
    case 'integer':
    case 'float': {
      if (typeof value.value !== 'number') break;
      const num = value.value;
      if (entry.min !== undefined && num < entry.min) {
        errors.push({
          kind: 'range',
          path: paramPath,
          paramKey,
          message: `Value ${num} below min ${entry.min}`,
          expected: `>= ${entry.min}`,
          actual: String(num),
        });
      }
      if (entry.max !== undefined && num > entry.max) {
        errors.push({
          kind: 'range',
          path: paramPath,
          paramKey,
          message: `Value ${num} above max ${entry.max}`,
          expected: `<= ${entry.max}`,
          actual: String(num),
        });
      }
      break;
    }
    case 'string': {
      if (
        entry.maxLength !== undefined &&
        typeof value.value === 'string' &&
        value.value.length > entry.maxLength
      ) {
        errors.push({
          kind: 'range',
          path: paramPath,
          paramKey,
          message: `String length ${value.value.length} exceeds maxLength ${entry.maxLength}`,
          expected: `<= ${entry.maxLength} chars`,
          actual: `${value.value.length} chars`,
        });
      }
      break;
    }
    case 'enumeration': {
      if (entry.enumLiterals !== undefined && !entry.enumLiterals.includes(value.value as string)) {
        errors.push({
          kind: 'enum',
          path: paramPath,
          paramKey,
          message: `Value "${value.value}" not in enum literals`,
          expected: entry.enumLiterals.join(' | '),
          actual: String(value.value),
        });
      }
      break;
    }
    case 'boolean':
    case 'reference':
      // typeMatches already verified the runtime type; nothing more to check.
      break;
  }
}

/**
 * Container-level multiplicity check.
 *
 * Compares the sibling count of a container against the
 * `[lower, upper]` bounds declared in `ECUC_CONTAINER_SCHEMA`.
 * Emits a `'multiplicity'` validation error when the count is
 * out of range.
 *
 * Containers not catalogued in `ECUC_CONTAINER_SCHEMA` are skipped
 * (no error). This matches the `lookupSchema()` behaviour for params
 * and keeps the schema additive: a missing entry == "no constraint".
 *
 * `upper: 'unbounded'` skips the upper-bound check.
 *
 * Schema key convention (per ECUC_CONTAINER_SCHEMA): the schema path
 * ends in the *child container type name*, e.g.
 *   /EcucDefs/EcuC/EcucPduCollection/Pdu
 * meaning "at parent /EcucDefs/EcuC/EcucPduCollection, count children
 * named Pdu". The caller (walkElements) supplies the sibling count for
 * this exact shortName so the check stays O(1) per child.
 */
function checkContainerMultiplicity(
  containerPath: string,
  instanceCount: number,
  errors: ValidationError[],
): void {
  const schema = lookupContainerSchema(containerPath);
  if (schema === null) return;

  if (instanceCount < schema.lower) {
    errors.push({
      kind: 'multiplicity',
      path: containerPath,
      message: `Container instance count ${instanceCount} below lower multiplicity ${schema.lower}`,
      expected: `>= ${schema.lower}`,
      actual: String(instanceCount),
    });
  }
  if (schema.upper !== 'unbounded' && instanceCount > schema.upper) {
    errors.push({
      kind: 'multiplicity',
      path: containerPath,
      message: `Container instance count ${instanceCount} above upper multiplicity ${schema.upper}`,
      expected: `<= ${schema.upper}`,
      actual: String(instanceCount),
    });
  }
}

function typeMatches(value: ParamValue, expected: EcucSchemaEntry['type']): boolean {
  switch (expected) {
    case 'integer':
      return value.type === 'integer';
    case 'float':
      return value.type === 'float';
    case 'boolean':
      return value.type === 'boolean';
    case 'string':
      return value.type === 'string';
    case 'enumeration':
      return value.type === 'enum';
    case 'reference':
      return value.type === 'reference';
  }
}

// ============================================================================
// Sprint 6 — Project-level validation: cross-container reference resolution
// ============================================================================

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
 * Returns `readonly ValidationError[]` to match the single-document
 * validate() contract — caller treats `.length === 0` as success.
 */
export function validateProject(documents: readonly ArxmlDocument[]): readonly ValidationError[] {
  const errors: ValidationError[] = [];

  // Step 1: aggregate single-document errors (preserves Sprint 5 semantics)
  for (const doc of documents) {
    errors.push(...validate(doc));
  }

  if (documents.length === 0) return errors;

  // Step 2: build path index covering all documents
  const pathIndex = buildPathIndex(documents);

  // Step 3: extract every reference consumption site
  const refSites = extractReferences(documents);

  // Step 4: run cross-ref existence check
  errors.push(...checkCrossRefs(refSites, pathIndex));

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
        sites.push({
          sourcePath: childPath,
          targetPath: value.value,
          tagName: paramKey,
          paramKey,
        });
      }
    }
    // recurse into module / container children
    walkRefs(childPath, el.children, sites);
  }
}

/**
 * Verify every reference site's targetPath resolves to an entry in pathIndex.
 * Empty / trailing-slash paths are treated as unset placeholders and skipped —
 * those are already surfaced by the 'required' kind in single-doc validate().
 *
 * Pure / testable. Returns one ValidationError per unresolved ref.
 */
export function checkCrossRefs(
  refSites: readonly RefSite[],
  pathIndex: Map<string, PathIndexEntry>,
): readonly ValidationError[] {
  const errors: ValidationError[] = [];
  for (const site of refSites) {
    if (isUnsetPlaceholder(site.targetPath)) continue;
    if (!pathIndex.has(site.targetPath)) {
      const error: ValidationError =
        site.paramKey !== undefined
          ? {
              kind: 'cross-ref',
              path: site.sourcePath,
              paramKey: site.paramKey,
              message: `Reference target not found: ${site.targetPath}`,
              expected: 'resolvable absolute path',
              actual: site.targetPath,
            }
          : {
              kind: 'cross-ref',
              path: site.sourcePath,
              message: `Reference target not found: ${site.targetPath}`,
              expected: 'resolvable absolute path',
              actual: site.targetPath,
            };
      errors.push(error);
    }
  }
  return errors;
}

function isUnsetPlaceholder(path: string): boolean {
  // Two forms of "developer hasn't filled in target yet":
  //   1. completely empty
  //   2. ends in "/" (e.g. ".../PduRTxBuffer/")
  return path === '' || path.endsWith('/');
}
