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