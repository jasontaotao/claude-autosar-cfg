import { describe, expect, it } from 'vitest';

import { ODX_WARNING_CODES } from '../dim.js';

describe('ODX warning codes', () => {
  it('uses the exact closed set from the ODX import spec', () => {
    expect([...ODX_WARNING_CODES].sort()).toEqual([
      'odx-bswmd-def-missing',
      'odx-comparam-external',
      'odx-compu-not-mapped',
      'odx-default-param-used',
      'odx-dem-cycle-ref-check',
      'odx-did-no-identifier',
      'odx-dtc-code-invalid',
      'odx-dtc-severity-unmapped',
      'odx-element-skipped',
      'odx-manifest-ignored',
      'odx-memory-service-not-mapped',
      'odx-routine-params-not-mapped',
      'odx-security-unpaired',
      'odx-service-sid-invalid',
      'odx-session-value-conflict',
      'odx-unknown-service-class',
      'odx-unsupported-compu',
      'odx-unsupported-datatype',
      'odx-type-promotion',
      'odx-unresolved-parent-ref',
    ].sort());
  });
});
