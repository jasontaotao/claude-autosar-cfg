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
//   B. Otherwise fall back to walking the selected path. The module
//      shortName lives at an unknown segment index because:
//        - the AUTOSAR standard layout puts it at index 1
//          (`/EcucDefs/<module>/<container...>`)
//        - vendor CDD BSWMDs (e.g. JWQ3399) nest 2 vendor packages
//          (`/JWQ_CDD_PACK/JWQ_Packet/<module>/<container...>`) pushing
//          the module to index 2
//        - the combined Tree View (Sprint 13 Stage 3.5) prefixes every
//          path with the source file basename, pushing everything
//          another index to the right
//      The single-segment index assumption (`segments[1]`) silently
//      disabled the + Add buttons on every project with a non-standard
//      vendor wrapper (Bug 8, 2026-07-15 — JWQ3399 user-reported).
//      Walk every segment and short-circuit on the first match.
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

export function hasBswmdForModule(state: HasBswmdInput, selectedPath: string): boolean {
  // A. Source-path priority (picker-created ECUC).
  //    Only consult the documents[] array when looking for sourceBswmdPath;
  //    a missing doc just means A-priority can't apply, so we fall through to B.
  const doc = state.documents.find((d) => d.path === selectedPath);
  if (doc !== undefined && doc.sourceBswmdPath !== undefined) {
    return state.bswmdPaths.includes(doc.sourceBswmdPath);
  }

  // B. Fallback: path-segment inference (legacy / manually-imported ECUC).
  // Walk every segment of the selected path and short-circuit on the
  // first match against any loaded BSWMD module shortName. Vendor
  // wrapper depth (0/1/2 segments before the module) and the
  // combined-mode basename prefix are both handled by the same walk
  // — the old `segments[1]` assumption broke every project that
  // nested a 2-segment vendor package around the module (Bug 8,
  // 2026-07-15).
  const segments = selectedPath.split('/').filter((s) => s.length > 0);
  for (const seg of segments) {
    for (const schema of state.bswmdSchemas) {
      for (const mod of schema.modules) {
        if (mod.shortName === seg) return true;
      }
    }
  }
  return false;
}
