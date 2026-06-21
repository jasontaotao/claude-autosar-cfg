// src/renderer/store/useArxmlStore.ts
// Root zustand store. Composed of 7 slices (PR(5) split).
// Pure refactor — no behavior change.
//
// Public API (unchanged from pre-PR(5)):
//   - `useArxmlStore` — the zustand hook (consumed via
//     `useArxmlStore((s) => s.someField)` in 60+ files)
//   - `resolveContainerTarget` — exported helper used by
//     BswmdPickerDialog + 2 tests
//   - The full `ArxmlState` type and slice-specific types
//
// The 3446-line monolithic file has been split into:
//   - 7 helper modules under `helpers/` (pure utility, no store access)
//   - 7 slice creators under `slices/` (each owns a domain)
//   - This file (types + composition + re-exports, ~150 lines)

import { create } from 'zustand';

import type { BswmdDocument } from '@core/project/bswmd.js';

import { resolveContainerTarget } from './helpers/combinedDoc.js';
import type {
  CombinedDocumentResult,
  CombinedDocumentWarning,
  ResolvedContainerTarget,
} from './helpers/combinedDoc.js';
export { resolveContainerTarget };
export type { CombinedDocumentResult, CombinedDocumentWarning, ResolvedContainerTarget };
import { createBswmdSlice, type BswmdSlice } from './slices/bswmdSlice.js';
import { createEcucSlice, type EcucSlice } from './slices/ecucSlice.js';
import { createI18nSlice, type I18nSlice } from './slices/i18nSlice.js';
import { createImportSlice, type ImportSlice } from './slices/importSlice.js';
import { createMutationSlice, type MutationSlice } from './slices/mutationSlice.js';
import { createProjectSlice, type ProjectSlice } from './slices/projectSlice.js';
import { createTourSlice, type TourSlice } from './slices/tourSlice.js';
import { createUiSlice, type UiSlice } from './slices/uiSlice.js';

// ---------------------------------------------------------------------------
// Shared types (kept in the root so every slice imports from one place).
// ---------------------------------------------------------------------------

/**
 * Sprint 13 refactor — left-tab id for the refactored left column. The
 * three tabs are mutually exclusive; the user switches between them via
 * the `setLeftTab` action. The default is `'files'` because the existing
 * UX flow is "open or create a project first" — the project tab only
 * makes sense after a project is open, and the files tab is always
 * visible. Loose-mode consumers hide the project tab entirely; the
 * 'project' id stays in the union for type completeness.
 */
export type LeftTabId = 'project' | 'files' | 'validate';

/**
 * Sprint 17b T6 — toast discriminator. The banner reads the typed
 * `toast` field on the store and renders a different color + dismiss
 * policy per kind. `error` is the only manual-dismiss kind; the other
 * three auto-clear after a per-kind default (3s info/success, 5s
 * warning). The store's `setError` / `setInfo` / `setSuccess` /
 * `setWarning` actions stamp the kind and a sensible default timer.
 */
export type ToastKind = 'error' | 'warning' | 'info' | 'success';

/**
 * Sprint 17b T6 — typed toast envelope. `autoDismissMs === 0` (or
 * undefined for `'error'`) means manual dismiss only. The
 * ErrorBanner's `useEffect` reads this field to schedule the
 * auto-clear; the rest of the renderer treats `toast` as the source
 * of truth (the legacy `error: string | null` field is kept in sync
 * for back-compat with existing selectors and tests).
 */
export interface ToastState {
  readonly kind: ToastKind;
  readonly message: string;
  /**
   * Auto-dismiss timeout in ms. Omit (or 0) for manual dismiss only.
   * The store's `setInfo` / `setSuccess` / `setWarning` defaults are
   * 3000 / 3000 / 5000 respectively; `setError` leaves it undefined
   * because errors demand explicit acknowledgment.
   */
  readonly autoDismissMs?: number;
}

/**
 * Sprint 17 P1 — single-level undo payload for `removeBswmdFromDisk`.
 *
 * `path` is the absolute on-disk path the user just removed (the
 * `bswmdPaths` entry that was dropped). `schema` is the parsed
 * `BswmdDocument` captured just before the disk unlink, so
 * `undoLastRemoveBswmd` can put the in-memory state back without
 * re-reading the file (which is now gone from disk). `timestamp`
 * is `Date.now()` at capture time, exposed for the future
 * "expire after N seconds" policy — v1 keeps the snapshot
 * forever (cleared on the next `removeBswmdFromDisk` or
 * `undoLastRemoveBswmd`).
 */
export interface BswmdRemoveSnapshot {
  readonly path: string;
  readonly schema: BswmdDocument;
  readonly timestamp: number;
}

// ---------------------------------------------------------------------------
// ArxmlState — the full intersection of all slice types.
// Re-exported so consumers can write `useArxmlStore((s: ArxmlState) => ...)`
// or destructure via `import type { ArxmlState }`.
// ---------------------------------------------------------------------------

export interface ArxmlState
  extends
    EcucSlice,
    BswmdSlice,
    ProjectSlice,
    I18nSlice,
    UiSlice,
    ImportSlice,
    MutationSlice,
    TourSlice {
  // Every field is declared on its owning slice interface above; this
  // type is the public intersection. The body is intentionally empty.
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export const useArxmlStore = create<ArxmlState>()((...a) => ({
  ...createEcucSlice(...a),
  ...createBswmdSlice(...a),
  ...createProjectSlice(...a),
  ...createI18nSlice(...a),
  ...createUiSlice(...a),
  ...createImportSlice(...a),
  ...createMutationSlice(...a),
  ...createTourSlice(...a),
}));

// Re-export slice types so downstream consumers can pick a slice's
// shape without importing the slice file directly.
export type {
  EcucSlice,
  BswmdSlice,
  ProjectSlice,
  I18nSlice,
  UiSlice,
  ImportSlice,
  MutationSlice,
  TourSlice,
};
