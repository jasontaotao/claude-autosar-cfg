// Exit code constants + helpers (v1.6.0 A+C-1).
//
// Per A+C spec §7.5 + Q4: 4 exit codes — 0 success, 1 fatal, 2 partial
// success w/ warnings, 3 invalid input. These match POSIX conventions
// and let CI distinguish fatal from warning from bad-input failures.

/** Operation completed successfully (or with `--quiet` and no body). */
export const EXIT_SUCCESS = 0 as const;

/** Fatal error (parse, IO, internal). */
export const EXIT_FATAL = 1 as const;

/** Partial success: at least one warning, no error. `--strict` promotes → 1. */
export const EXIT_WARNING = 2 as const;

/** Invalid input (bad flag, bad patch, unsupported version). */
export const EXIT_INVALID_INPUT = 3 as const;

/** Tuple of all valid exit code values for runtime checks. */
export const ALL_EXIT_CODES = [EXIT_SUCCESS, EXIT_FATAL, EXIT_WARNING, EXIT_INVALID_INPUT] as const;

/** Numeric exit code type (narrowed to the 4 valid values). */
export type HeadlessExitCode = (typeof ALL_EXIT_CODES)[number];

/** Type guard — narrows an arbitrary number to the exit-code union. */
export function isValidExitCode(code: number): code is HeadlessExitCode {
  return code === EXIT_SUCCESS || code === EXIT_FATAL || code === EXIT_WARNING || code === EXIT_INVALID_INPUT;
}

/**
 * Human-readable description for the 4 exit codes. Used by `--format
 * summary` error output and the code-reviewer-friendly grep banner.
 */
export function exitCodeToString(code: HeadlessExitCode): string {
  switch (code) {
    case EXIT_SUCCESS:
      return 'success';
    case EXIT_FATAL:
      return 'fatal error';
    case EXIT_WARNING:
      return 'partial success with warnings';
    case EXIT_INVALID_INPUT:
      return 'invalid input';
  }
}