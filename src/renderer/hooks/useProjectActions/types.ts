// v1.18.5 PATCH — extracted from useProjectActions.ts (lines 80-122).
//
// Public types stay public (re-exported from the parent file); internal
// types stay internal to the subdir module graph. C13 Option B split 1/2:
// keeps the parent file as the entry point for callers; no barrel
// re-export added.

/**
 * Discriminated union returned by every `useProjectActions` method.
 * Public API; callers branch on success / failure / canceled.
 */
export type ProjectActionResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'canceled' }
  | { readonly kind: 'error'; readonly message: string };

/**
 * camelCase verb matching `useProjectActions` method names. The
 * `toI18nAxis` helper maps it to the short axis used in i18n key
 * suffixes (`message.new` not `message.newProject`).
 *
 * Sprint A+ — added 'deleteModule' for the ECUC module dirty-guard
 * flow (spec invariant I3).
 */
export type SwitchingAction =
  | 'newProject'
  | 'openProject'
  | 'addBswmd'
  | 'removeBswmd'
  | 'deleteModule';
