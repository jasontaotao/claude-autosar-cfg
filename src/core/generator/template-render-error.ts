// core/generator/template-render-error.ts
//
// E7 of v1.12.0 MINOR E — sentinel error class that module generators
// (notably EcuCGenerator) throw when a Handlebars compile or render
// fails. The pipeline's outer try/catch distinguishes this from a
// generic THROW and pushes ECUC-GEN-030 (TEMPLATE_RENDER) instead.
//
// A thrown `TemplateRenderError` carries:
//   - `message`: the original HandlebarsRuntimeError.message (or
//     compile-error message)
//   - `cause`:  the underlying error (preserved for debugging)
//
// Other thrown errors (TypeError, logic bugs, etc.) fall through to
// ECUC-GEN-003 (THROW).

export class TemplateRenderError extends Error {
  override readonly name = 'TemplateRenderError';
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}
