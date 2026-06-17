// `validateProjectName` — pure project-name validator (Sprint 12 #3
// Task 2). Used by `NewProjectDialog` for live validation feedback.
//
// Why a separate file? The validator is pure / sync / sync-importable
// from any layer (renderer component, future unit-only test runner, or
// a hypothetical CLI dry-run). Splitting it out of the React component
// keeps the component file focused on UI and lets us drop the function
// in a `node` test environment without dragging React + jsdom along.
//
// Three error kinds, ordered in the function as:
//   1. `'empty'`   — `.trim().length === 0` (catches '' / '   ' / '\t\n')
//   2. `'invalid'` — contains any path-unsafe char (`<>:"|?*` and `/\`)
//   3. `'tooLong'` — `> 64` characters (the autosarcfg.json suffix and
//                    filesystem caps together keep us well under any
//                    OS path limit, but 64 chars is a defensive guard)
//
// Same-name detection is intentionally NOT here: it requires a
// filesystem race-free check that belongs in the main-process handler
// (`PROJECT_NEW` returns `{ kind: 'overwrite-confirm', path }`). The
// renderer-side keys `app.error.projectNameExists` exists in i18n for
// completeness but is wired in Task 5 (overwrite-confirm flow).

/** Maximum allowed project-name length, in characters. */
export const MAX_NAME_LENGTH = 64;

/**
 * Validation error kind. The UI maps each to a localized message:
 * - `'empty'`   → `'app.error.projectNameEmpty'`
 * - `'invalid'` → `'app.error.projectNameInvalid'`
 * - `'tooLong'` → `'app.error.projectNameTooLong'`
 */
export type ProjectNameError = 'empty' | 'invalid' | 'tooLong';

/**
 * Path-unsafe characters disallowed in a project name. This is the
 * intersection of:
 *   - Windows reserved chars (`<>:"|?*`)
 *   - POSIX path separators (`/`)
 *   - Windows path separators (`\`)
 *
 * We don't bother validating against Windows-reserved filenames
 * (CON, PRN, AUX, NUL, COM1-9, LPT1-9) — those are filesystem-specific
 * and would race against the filesystem-touch in main anyway. The
 * main handler rejects anything that slips through here.
 */
const INVALID_CHARS = /[<>:"/\\|?*]/;

/**
 * Validate a user-supplied project name. Returns `null` for a valid name
 * or one of the three error kinds above. Pure / sync / allocation-free.
 */
export function validateProjectName(name: string): ProjectNameError | null {
  if (name.trim().length === 0) return 'empty';
  if (INVALID_CHARS.test(name)) return 'invalid';
  if (name.length > MAX_NAME_LENGTH) return 'tooLong';
  return null;
}
