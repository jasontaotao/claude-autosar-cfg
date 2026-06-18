// core/ecuc/moduleMatch.ts
// Sprint post-v1.0.0 — extract hasBswmdForModule from the inline IIFE
// in ParamEditor.tsx so it can be tested and so the BSWMD-driven "+ Add
// Parameter" button works for ECUC files created via the BSWMD picker.
//
// Priority:
//   A. If the document has `sourceBswmdPath` set AND that path is in the
//      loaded BSWMD set, return true. This is the path the picker creates:
//      addDocumentWithSource stamps the originating BSWMD path so we can
//      answer the gate without re-parsing the document tree.
//
//   B. Otherwise fall back to the original segment-based inference: take
//      `segments[1]` of the selected path (the value path is
//      `/<pkg>/<module>/<container...>` so the module shortName sits at
//      index 1) and check whether any loaded BSWMD schema declares that
//      shortName. This preserves the existing behavior for manually-
//      imported ECUC files.
//
// Pure: no I/O, no React, no Zustand. Caller passes the slice of store
// state the function needs.

import type { ArxmlDocument } from '../arxml/types.js';
import type { BswmdDocument } from '../project/bswmd.js';

export interface HasBswmdInput {
  readonly bswmdPaths: readonly string[];
  readonly bswmdSchemas: readonly BswmdDocument[];
  readonly documents: readonly ArxmlDocument[];
}

export function hasBswmdForModule(
  state: HasBswmdInput,
  selectedPath: string,
): boolean {
  const doc = state.documents.find((d) => d.path === selectedPath);
  if (doc === undefined) return false;

  // A. Source-path priority (picker-created ECUC).
  if (doc.sourceBswmdPath !== undefined) {
    return state.bswmdPaths.includes(doc.sourceBswmdPath);
  }

  // B. Fallback: path-segment inference (legacy / manually-imported ECUC).
  const segments = selectedPath.split('/').filter((s) => s.length > 0);
  const moduleShortName = segments[1];
  if (moduleShortName === undefined) return false;
  for (const schema of state.bswmdSchemas) {
    for (const mod of schema.modules) {
      if (mod.shortName === moduleShortName) return true;
    }
  }
  return false;
}
