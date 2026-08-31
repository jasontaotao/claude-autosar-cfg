// Renderer diagnostics envelope. Kept beside uiSlice because the first
// implementation is renderer-only; a future main-process bridge can reuse it.
export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

export interface DiagnosticEntry {
  readonly id: string;
  readonly ts: number;
  readonly level: DiagnosticLevel;
  readonly source: string;
  readonly message: string;
  readonly detail?: string;
  readonly stack?: string;
  readonly correlationId?: string;
}
