// v1.18.6 PATCH — extracted from AppHeader.tsx (lines 84-151).
//
// Module-level helpers used by the `AppHeader` component. Co-located in
// the subdir so the main component file can stay focused on the JSX body.
// C13 Option B split 2/2.

import { t, type Locale } from '../../../shared/i18n.js';
import { basename } from '../../../shared/path.js';
import type { ParseError } from '../../../shared/types.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';

// Sprint 13+ Stage 4 M8 — route ParseError rendering through the shared
// i18n helper. Caller passes the current `locale` so the user sees the
// same language in the error toast they see in the rest of the header.
export function formatParseError(e: ParseError, locale: Locale): string {
  switch (e.kind) {
    case 'xml-malformed':
      return t(locale, 'parserError.xmlMalformed', { message: e.message });
    case 'missing-root':
      return t(locale, 'parserError.missingRoot', { message: e.message });
    case 'unsupported-version':
      return t(locale, 'parserError.unsupportedVersion', { version: e.version });
    case 'invalid-structure':
      return t(locale, 'parserError.invalidStructure', {
        path: e.path,
        message: e.message,
      });
  }
}

// v1.12.0 PATCH D2 (H1 dedup) — silent-save every dirty ARXML
// document via the T2 contract (no dialog per file). Returns
// `{ saved, failed }` so callers can render the result with their
// own UX (toast vs. close-on-success). Busy state and the leading
// `setStoreError(null)` live here so both callers stay tiny.
//
// Module-level (not a hook or exported util) because it has no React
// state of its own — both callers (`onSaveAll`,
// `onCloseProjectClick.saveAndProceed`) pass a `setBusy` adapter to
// route into their `setState({ busy })` slot.
//
// Fresh-snapshot semantics: the helper reads `useArxmlStore.getState()`
// at entry, after any caller-side `await` (notably the confirm dialog
// in the close-project path). Strict improvement over the pre-D2 code,
// which captured the dirty set before the dialog resolved — a doc
// marked dirty during the modal would have been silently dropped.
export async function saveAllDirty(
  setStoreError: (msg: string | null) => void,
  setBusy: (busy: boolean) => void,
): Promise<{ saved: number; failed: string[] }> {
  const storeState = useArxmlStore.getState();
  const dirty = Array.from(storeState.dirtyPaths);
  setBusy(true);
  setStoreError(null);
  let saved = 0;
  const failed: string[] = [];
  for (const path of dirty) {
    // Resolve the path to its ArxmlDocument via the parallel-array
    // index. `documents[i]` corresponds to `documentPaths[i]` (the
    // contract `addDocument` enforces); we cannot match by `doc.path`
    // because docs carry their OWN in-memory path (`/in-memory` in
    // tests, the source path in production) rather than the filePath
    // keying the documentPaths set.
    const idx = storeState.documentPaths.indexOf(path);
    if (idx === -1) continue;
    const docEntry = storeState.documents[idx];
    if (docEntry === undefined) continue;
    const r = await window.autosarApi.saveArxml({
      doc: docEntry,
      defaultName: basename(path) || 'untitled.arxml',
      currentPath: path,
    });
    if (r.ok && !r.value.canceled) {
      useArxmlStore.getState().markSaved(r.value.path ?? path);
      saved += 1;
    } else if (!r.ok) {
      failed.push(r.error.message);
    }
  }
  setBusy(false);
  return { saved, failed };
}
