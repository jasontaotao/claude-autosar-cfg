// v1.32.0 MINOR T1 — typed error carrying the DcmConfigErrorKind discriminator.
//
// The dcm:config IPC response.error.kind field is `DcmConfigErrorKind`
// (defined in src/shared/types.ts). Pipeline/mapper functions throw
// instances of this class so the handler's outer catch can project the
// kind without re-parsing the message string (lesson
// error-classification-via-regex-prefix-vs-envelope-kind-trade-off).
//
// Constructors: prefer `new DcmConfigError({ kind: 'odx-dcm-linkage', message: '...' })`
// over free-form `throw new Error('ODX-Dcm linkage broken: ...')` so the
// kind survives the IPC boundary intact.

import type { DcmConfigErrorKind } from '../../shared/types.js';

export class DcmConfigError extends Error {
  public readonly kind: DcmConfigErrorKind;
  public override readonly cause?: unknown;

  public constructor(opts: {
    kind: DcmConfigErrorKind;
    message: string;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = 'DcmConfigError';
    this.kind = opts.kind;
    if (opts.cause !== undefined) {
      this.cause = opts.cause;
    }
  }
}