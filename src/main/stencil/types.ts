// v1.8.0 K Stencil Wizard — type definitions.
//
// Pin the union literals exactly as documented in
// `docs/superpowers/specs/2026-06-21-v1-8-0-k-stencil-design.md` §3.4
// and the implementation plan Task 1. Consumers (Task 2+ builders,
// the IPC handler, the renderer wizard) import from this module so
// later additions (new family, new mode) are a single-file change.

export type StencilFamily = 'com' | 'comm' | 'pdur' | 'ecuc';

export type StencilMode = 'free' | 'with-bswmd';

export interface StencilRequest {
  family: StencilFamily;
  mode: StencilMode;
  gate: boolean;
  projectPath?: string;
}

export type StencilResponse =
  | { ok: true; xml: string; suggestedFilename: string }
  | { ok: false; errors: ReadonlyArray<{ ruleId: string; severity: string; message: string }> }
  | { ok: false; error: { code: string; i18nKey: string } };