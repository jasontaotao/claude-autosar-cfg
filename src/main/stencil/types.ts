// v1.8.0 K Stencil Wizard — type definitions.
//
// Pin the union literals exactly as documented in
// `docs/superpowers/specs/2026-06-21-v1-8-0-k-stencil-design.md` §3.4
// and the implementation plan Task 1. Consumers (Task 2+ builders,
// the IPC handler, the renderer wizard) import from this module so
// later additions (new family, new mode) are a single-file change.
//
// Task 9 deviation: `StencilRequest` adds an optional `bswmds`
// field (Task 9 deviation vs the original Task 1 spec — documented
// in the plan as "you may need to extend StencilRequest"). The
// renderer passes its loaded BSWMDs (`useArxmlStore.bswmdSchemas`)
// through this field so the handler can route `with-bswmd` mode
// through the `buildWithBswmd` wrapper. Optional + undefined-when-
// missing keeps the existing `free`-mode callers (which never
// supply BSWMDs) wire-compatible.

import type { ArxmlDocument } from '../../core/arxml/types.js';

export type StencilFamily = 'com' | 'comm' | 'pdur' | 'ecuc';

export type StencilMode = 'free' | 'with-bswmd';

export interface StencilRequest {
  family: StencilFamily;
  mode: StencilMode;
  gate: boolean;
  projectPath?: string;
  /**
   * Task 9 — renderer-loaded BSWMD schemas to merge into the
   * skeleton when `mode === 'with-bswmd'`. Sourced from
   * `useArxmlStore.bswmdSchemas`. Optional: omitted / empty for
   * `free` mode and for `with-bswmd` callers that don't have BSWMDs
   * loaded (the wrapper tolerates an empty list — applyPatchSteps
   * is idempotent on an empty step list).
   */
  bswmds?: ReadonlyArray<ArxmlDocument>;
}

export type StencilResponse =
  | { ok: true; xml: string; suggestedFilename: string }
  | { ok: false; errors: ReadonlyArray<{ ruleId: string; severity: string; message: string }> }
  | { ok: false; error: { code: string; i18nKey: string } };

/**
 * Task 12 — save dialog wire-up. Renderer invokes this channel
 * after a successful `STENCIL_GENERATE_V1` response, passing the
 * pre-serialized XML string + the suggested filename from the
 * generate response. Main shows the native save dialog, writes the
 * file, and returns the same `{ ok, value | error }` Result envelope
 * as `saveArxmlHandler` (so the renderer's per-kind error dispatch
 * works uniformly across both save paths).
 *
 * Lives in a separate channel from `STENCIL_GENERATE_V1` so the
 * generate path stays pure (no IO) and the save path can be re-used
 * by any future feature that needs "write this string to a user-chosen
 * path". See `src/main/ipc/stencilSaveHandler.ts`.
 */
export interface StencilSaveRequest {
  readonly xml: string;
  readonly suggestedFilename: string;
}

export type StencilSaveResponse =
  | { ok: true; value: { canceled: false; path: string } }
  | { ok: true; value: { canceled: true } }
  | {
      ok: false;
      error: {
        kind: 'permission-denied' | 'disk-full' | 'path-not-found' | 'unknown';
        code?: string;
        message: string;
      };
    };
