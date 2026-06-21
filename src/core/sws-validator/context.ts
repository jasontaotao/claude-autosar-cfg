// src/core/sws-validator/context.ts
// Cluster G (v1.6.0) — ValidationContext builder.
//
// Constructs the read-only view passed to each rule's `check()`.
// Pure / sync / no I/O. Builders operate on `NormalizedDocument` (v1.5.1
// PR(4)) + `SchemaLayer` (Sprint 12 #2).

import type { Locale } from '../../shared/i18n.js';
import type {
  NormalizedDocument,
  NormalizedElement,
  NormalizedModule,
} from '../../shared/normalized-document.js';
import type { SchemaLayer } from '../validation/runtimeSchema.js';
import type { ValidationContext } from './types.js';

/**
 * Build a `ValidationContext` for a single `runValidation` call.
 * All helpers (readAt, findAll, findModules) are pure functions over
 * `project.modules` / `project.packages` / `sourceOrder`.
 */
export function buildValidationContext(input: {
  readonly document: NormalizedDocument;
  readonly schemaLayer: SchemaLayer | null;
  readonly locale: Locale;
  readonly tourState?: { readonly validationPaused: boolean };
}): ValidationContext {
  const { document, schemaLayer, locale } = input;
  const tourState = input.tourState ?? { validationPaused: false };

  // Pre-compute path → element index for O(1) readAt. Walks modules +
  // containers recursively.
  const pathIndex = new Map<string, NormalizedElement>();
  const moduleShortNames: string[] = [];

  for (const pkg of document.packages) {
    for (const el of pkg.elements) {
      indexElement(el, pathIndex);
    }
  }
  for (const m of document.modules) {
    moduleShortNames.push(m.shortName);
  }

  function readAt(path: string): NormalizedElement | undefined {
    if (path === '') return undefined;
    return pathIndex.get(path);
  }

  function findAll(predicate: (el: NormalizedElement) => boolean): readonly NormalizedElement[] {
    const out: NormalizedElement[] = [];
    for (const el of pathIndex.values()) {
      if (predicate(el)) out.push(el);
    }
    return out;
  }

  function findModules(shortName: string): readonly NormalizedModule[] {
    return document.modules.filter((m) => m.shortName === shortName);
  }

  return {
    project: document,
    schemaLayer,
    locale,
    moduleShortNames,
    tourState,
    readAt,
    findAll,
    findModules,
  };
}

function indexElement(el: NormalizedElement, idx: Map<string, NormalizedElement>): void {
  idx.set(el.path, el);
  if (el.kind === 'module' || el.kind === 'container') {
    for (const child of el.children) {
      indexElement(child, idx);
    }
  }
}