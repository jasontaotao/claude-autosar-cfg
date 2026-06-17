// Sprint 13 #1 — template error envelope.
//
// Two failure modes:
//   1. Discovery failures (samples-root-missing / template-json-invalid /
//      template-id-mismatch) — warn-logged and skipped, NEVER thrown.
//      One bad template cannot block discovery of the others.
//   2. IPC handler failures (unknown-template / dest-dir-missing /
//      file-copy-failed) — thrown from the handler and caught by the
//      preload bridge, surfacing as a rejected Promise.

export type TemplateErrorKind =
  // discovery (warn + skip)
  | 'samples-root-missing'
  | 'template-json-invalid'
  | 'template-id-mismatch'
  // IPC handler (throw)
  | 'unknown-template'
  | 'dest-dir-missing'
  | 'file-copy-failed';

/** A structured error object that IPC handlers can throw. */
export interface TemplateError {
  readonly kind: TemplateErrorKind;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export function classTemplateError(
  kind: TemplateErrorKind,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): TemplateError {
  return details === undefined ? { kind, message } : { kind, message, details };
}
