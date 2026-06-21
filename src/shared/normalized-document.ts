// shared/normalized-document.ts
// v1.5.1 PR(4) → v1.6.0 interface contract.
//
// `NormalizedDocument` is the abstraction that unifies DOM-parser output
// and the new streaming reader (PR(6) of the v1.5.1 plan). All store
// actions operate on `NormalizedDocument`, not on raw XML strings. The
// arxml-stream router (PR(6)) routes to DOM or streaming path based
// on file size + feature flag, but the output type is always this
// interface.
//
// For v1.5.1 PR(4) this file is a *type contract* only — no
// implementation lands here yet. The DOM path keeps using
// `ArxmlDocument` directly in this PR; the v1.6.0 work will introduce
// `fromArxmlDocument(doc, origin)` and a parallel `fromStreamedEvents(events)`
// constructor, both of which produce the same `NormalizedDocument`
// shape. The current PR exists so the renderer-side `applyMutation`
// can be typed against the future interface without churn.

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlReference,
  ArxmlVersion,
} from '../core/arxml/types.js';

/**
 * v1.5.1 PR(4) — Stable read-side abstraction for an ARXML document.
 *
 * Producers (DOM parser today, streaming reader in PR(6)) emit this
 * shape. Consumers (store actions, validators, the headless CLI in
 * v1.6.0) read this shape. The contract is intentionally
 * source-order-preserving (`sourceOrder`) so the round-trip tolerance
 * rules (Q5 B in the v1.5.1 spec) stay meaningful.
 */
export interface NormalizedDocument {
  /** ARXML schema version extracted from <AR-PACKAGES> root attribute. */
  readonly version: ArxmlVersion;
  /** Top-level <AR-PACKAGE> elements, in source order. */
  readonly packages: ReadonlyArray<NormalizedPackage>;
  /** Flattened <ECUC-MODULE-DEF-VALUES> for quick iteration. */
  readonly modules: ReadonlyArray<NormalizedModule>;
  /** Flattened <REFERENCE> table (target → source) for O(1) lookup. */
  readonly references: ReadonlyArray<NormalizedReference>;
  /** Ordered list of all container paths in source order
   *  (the preserveSourceOrder input from PR(2)). */
  readonly sourceOrder: ReadonlyArray<string>;
  /** Which reader produced this doc (used for diagnostics). */
  readonly origin: 'dom' | 'stream';
}

export interface NormalizedPackage {
  readonly shortName: string;
  readonly path: string;
  readonly elements: ReadonlyArray<NormalizedElement>;
}

export type NormalizedElement =
  | {
      readonly kind: 'module';
      readonly shortName: string;
      readonly path: string;
      readonly children: ReadonlyArray<NormalizedElement>;
    }
  | {
      readonly kind: 'container';
      readonly shortName: string;
      readonly path: string;
      readonly children: ReadonlyArray<NormalizedElement>;
    }
  | { readonly kind: 'reference'; readonly shortName: string; readonly path: string; readonly target: string }
  | { readonly kind: 'unknown'; readonly shortName: string; readonly path: string };

export interface NormalizedModule {
  readonly shortName: string;
  readonly path: string;
  readonly definitionRef: string;
}

export interface NormalizedReference {
  /** Path of the <REFERENCE> element. */
  readonly source: string;
  /** DEST attribute value. */
  readonly target: string;
}

/**
 * v1.5.1 PR(4) — The mutation plan that the v1.6.0 headless CLI will
 * accept on stdin. Today, the script engine emits `ScriptMutation` (a
 * narrower shape); the headless CLI adapter in v1.6.0 will lift
 * `ScriptMutation[]` into a `MutationPlan`. The shape here is the
 * forward-looking contract so PR(4) consumers can be typed today.
 */
export interface MutationPlan {
  readonly planId: string;
  readonly createdAt: string; // ISO timestamp
  readonly mutations: ReadonlyArray<MutationStep>;
}

export type MutationStep =
  | {
      readonly kind: 'set-param';
      readonly path: string;
      readonly key: string;
      readonly value: string | number | boolean | null;
    }
  | { readonly kind: 'add-child'; readonly path: string; readonly shortName: string }
  | { readonly kind: 'remove'; readonly path: string; readonly cascade: boolean };

/**
 * v1.5.1 PR(4) — Outcome of replaying a `MutationPlan` against a
 * `NormalizedDocument`. Returned to the renderer / CLI consumer so it
 * can surface per-step errors and decide whether to keep the
 * in-memory change (a write failure should NOT roll back a successful
 * in-memory mutation — losing data silently is worse than leaving a
 * dirty file).
 */
export interface MutationResult {
  readonly planId: string;
  readonly stepsApplied: number;
  readonly stepsTotal: number;
  readonly errors: ReadonlyArray<MutationStepError>;
  readonly document: NormalizedDocument;
}

export interface MutationStepError {
  readonly stepIndex: number;
  readonly kind: MutationStep['kind'];
  readonly error: string;
}

/**
 * Convert an `ArxmlDocument` (the current DOM-parser output) to a
 * `NormalizedDocument`. The `origin` defaults to `'dom'`; pass
 * `'stream'` when adapting an event-stream reader (PR(6)).
 *
 * This is the v1.5.1 stub — it walks the model synchronously and
 * preserves source order via the `sourceOrder` array. The v1.6.0
 * implementation will replace the body with a streaming adapter.
 */
export function fromArxmlDocument(
  doc: ArxmlDocument,
  origin: 'dom' | 'stream' = 'dom',
): NormalizedDocument {
  const packages: NormalizedPackage[] = [];
  const modules: NormalizedModule[] = [];
  const references: NormalizedReference[] = [];
  const sourceOrder: string[] = [];

  function walkElement(el: ArxmlElement, parentPath: string): NormalizedElement {
    const path = `${parentPath}/${shortNameOfElement(el)}`;
    sourceOrder.push(path);
    if (el.kind === 'reference') {
      const ref: ArxmlReference = el;
      const target = ref.value;
      references.push({ source: path, target });
      return { kind: 'reference', shortName: ref.shortName ?? target, path, target };
    }
    if (el.kind === 'unknown') {
      return { kind: 'unknown', shortName: el.tagName, path };
    }
    // Module or container — recurse into children.
    if (el.kind === 'module') {
      const moduleEl: ArxmlModule = el;
      modules.push({ shortName: moduleEl.shortName, path, definitionRef: '' });
    }
    const children: NormalizedElement[] = [];
    for (const child of el.children) {
      children.push(walkElement(child, path));
    }
    const kind = el.kind;
    if (kind === 'module') {
      return { kind: 'module', shortName: el.shortName, path, children };
    }
    const containerEl: ArxmlContainer = el as ArxmlContainer;
    return { kind: 'container', shortName: containerEl.shortName, path, children };
  }

  for (const pkg of doc.packages) {
    sourceOrder.push(pkg.path);
    const elements: NormalizedElement[] = [];
    for (const el of pkg.elements) {
      elements.push(walkElement(el, pkg.path));
    }
    packages.push({ shortName: pkg.shortName, path: pkg.path, elements });
  }

  return { version: doc.version, packages, modules, references, sourceOrder, origin };
}

/** Tag-or-fallback shortName for a non-package element. Mirrors
 *  the convention in `core/arxml/mutation.ts:shortNameOf`. */
function shortNameOfElement(el: ArxmlElement): string {
  if (el.kind === 'reference') return el.shortName ?? el.value;
  if (el.kind === 'unknown') return el.tagName;
  return el.shortName;
}
