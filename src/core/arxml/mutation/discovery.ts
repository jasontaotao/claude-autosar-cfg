// core/arxml/mutation/discovery.ts
// Read-only helpers for enumerating addable sub-elements and scanning for
// inbound references. Split from `src/core/arxml/mutation.ts` as part of
// v1.41.x PATCH T2 (file-size backlog).
//
// Public API: listAllowedSubElements, findReferencesTo.
// Internal helpers: buildContainerAllowed, scanDocForRefs, scanPackage,
// scanElement, endsWithPath.

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlPackage,
} from '../../arxml/types.js';
import type { BswModuleDef, ContainerDef } from '../../project/bswmd.js';

import { countChildrenWithShortName, shortNameOf } from './tree-ops.js';
import type { AllowedSubElement, ReferenceHit } from './types.js';

// ---------------------------------------------------------------------------
// Public API — read-only helpers
// ---------------------------------------------------------------------------

/**
 * Enumerate the addable sub-elements (parameters, references, sub-containers)
 * for the BSWMD-defined container `containerDef`, annotated with the
 * current instance count under `currentContainer` so the picker can
 * grey out rows that would violate the upper bound.
 *
 * `moduleDef` is accepted for symmetry with future cross-container checks
 * (e.g. choice-branch alternatives) but is not consulted today.
 */
export function listAllowedSubElements(
  _moduleDef: BswModuleDef,
  containerDef: ContainerDef,
  currentContainer: ArxmlContainer | ArxmlModule,
): readonly AllowedSubElement[] {
  const out: AllowedSubElement[] = [];

  for (const p of containerDef.parameters) {
    const current = currentContainer.params[p.shortName] !== undefined ? 1 : 0;
    // AUTOSAR parameters are inherently 1..1 — a second add would hit
    // `name-conflict` in `addParameter` (the core path is correct per
    // spec). Mark the picker row disabled with a typed reason so the
    // UI can surface the constraint up-front instead of letting the
    // user click through and hit a silent error. Bug 2 follow-up.
    const alreadyAdded = current >= 1;
    out.push({
      kind: 'parameter',
      shortName: p.shortName,
      displayLabel: p.shortName,
      multiplicity: { lower: 1, upper: 1, current },
      disabled: alreadyAdded,
      ...(alreadyAdded ? { disabledReason: 'already-added' as const } : {}),
    });
  }

  for (const r of containerDef.references) {
    const current = currentContainer.params[r.shortName] !== undefined ? 1 : 0;
    // AUTOSAR references are also 1..1 within a parent container.
    // Same UX fix as parameters above — surface the constraint in the
    // picker rather than via a silent name-conflict on submit.
    const alreadyAdded = current >= 1;
    out.push({
      kind: 'reference',
      shortName: r.shortName,
      displayLabel: r.shortName,
      multiplicity: { lower: 1, upper: 1, current },
      disabled: alreadyAdded,
      ...(alreadyAdded ? { disabledReason: 'already-added' as const } : {}),
    });
  }

  // subContainers and choice branches share the same "addable" surface
  // from the user's perspective. Use the merged list here so the picker
  // gets a unified enumeration; the choice badge is rendered by the
  // picker's row when `c.choices.length > 0`.
  for (const sub of containerDef.subContainers) {
    out.push(buildContainerAllowed(sub, currentContainer));
  }
  for (const choice of containerDef.choices) {
    out.push(buildContainerAllowed(choice, currentContainer));
  }
  return out;
}

export function buildContainerAllowed(
  sub: ContainerDef,
  currentContainer: ArxmlContainer | ArxmlModule,
): AllowedSubElement {
  const current = countChildrenWithShortName(currentContainer, sub.shortName);
  const atMax = sub.upperMultiplicity !== 'infinite' && current >= sub.upperMultiplicity;
  // `exactOptionalPropertyTypes` forbids assigning `undefined` to an
  // optional field; conditionally spread the property so the shape is
  // precise.
  return {
    kind: 'container',
    shortName: sub.shortName,
    displayLabel: sub.shortName,
    multiplicity: { lower: sub.lowerMultiplicity, upper: sub.upperMultiplicity, current },
    disabled: atMax,
    ...(atMax ? { disabledReason: 'at-max' as const } : {}),
  };
}

/**
 * Scan every loaded document for reference-typed parameters whose `value`
 * ends with `targetPath`. The path is matched by suffix because ECUC
 * `<VALUE-REF>` content is an absolute path string and we don't want to
 * require an exact match when the target is the trailing portion.
 *
 * Returned hits are ready for the cascade-delete dialog to render.
 */
export function findReferencesTo(
  documents: readonly { readonly doc: ArxmlDocument; readonly filePath: string }[],
  targetPath: string,
): readonly ReferenceHit[] {
  const out: ReferenceHit[] = [];
  for (const { doc, filePath } of documents) {
    for (const hit of scanDocForRefs(doc, filePath, targetPath)) {
      out.push(hit);
    }
  }
  return out;
}

export function scanDocForRefs(
  doc: ArxmlDocument,
  filePath: string,
  targetPath: string,
): readonly ReferenceHit[] {
  const out: ReferenceHit[] = [];
  for (const pkg of doc.packages) {
    scanPackage(pkg, filePath, targetPath, out);
  }
  return out;
}

export function scanPackage(
  pkg: ArxmlPackage,
  filePath: string,
  targetPath: string,
  out: ReferenceHit[],
): void {
  for (const el of pkg.elements) {
    const elPath = `/${pkg.shortName}/${shortNameOf(el)}`;
    scanElement(el, elPath, filePath, targetPath, out);
  }
  if (pkg.packages !== undefined) {
    for (const nested of pkg.packages) {
      scanPackage(nested, filePath, targetPath, out);
    }
  }
}

export function scanElement(
  el: ArxmlElement,
  elPath: string,
  filePath: string,
  targetPath: string,
  out: ReferenceHit[],
): void {
  if (el.kind === 'reference') return;
  // v1.4.0 trust sprint — 17c. Unknown vendor extensions are leaves
  // and carry no params / children to scan for cross-refs. They
  // contain opaque data captured verbatim and cannot host any
  // project-internal VALUE-REFs (those would have been classified as
  // ArxmlReference / ArxmlContainer in `classifyElement`).
  if (el.kind === 'unknown') return;
  for (const [key, value] of Object.entries(el.params)) {
    if (value.type === 'reference' && endsWithPath(value.value, targetPath)) {
      out.push({ filePath, containerPath: elPath, paramKey: key });
    }
  }
  for (const child of el.children) {
    const childPath = `${elPath}/${shortNameOf(child)}`;
    scanElement(child, childPath, filePath, targetPath, out);
  }
}

export function endsWithPath(value: string, targetPath: string): boolean {
  if (value === targetPath) return true;
  if (!value.endsWith(targetPath)) return false;
  // Verify a path-segment boundary at the join. Without this, a value of
  // "/EAS/SomeOtherCanIfBufferCfg" would match a target of
  // "/EAS/CanIfBufferCfg" via suffix alone (the trailing 13 characters
  // match), causing the cascade-delete dialog to surface the wrong
  // dangling references. The boundary char must be `/` for a true
  // sub-path match.
  const beforeIdx = value.length - targetPath.length - 1;
  if (beforeIdx < 0) return true; // length-equal but not === case is unreachable
  return value.charCodeAt(beforeIdx) === 47; // 47 === '/'
}
