// v1.8.0 K Stencil Wizard — Task 3 (BSWMD-free builder) dispatcher tests.
//
// Pins the public contract for `buildStencil`: each family key in
// `StencilFamily` dispatches to the matching hand-curated family
// builder (Com / ComM / PduR / EcuC). The assertion reads the top
// package shortName from `packages[0]?.shortName` per the project's
// actual `ArxmlDocument` shape (NOT `rootPackages[0]` from the
// pre-Task-2 plan draft — that field name was wrong).
//
// Deviations vs the plan example:
//   - The plan's import path `../../core/arxml/types.js` is the
//     builder's path; for the test file the equivalent is
//     `../../../core/arxml/types.js` (one more `..` to escape the
//     __tests__ directory). This file does not import the type
//     directly because the test asserts only on shape; the type is
//     inferred from the schemas barrel's return type.

import { describe, it, expect } from 'vitest';

import { buildStencil } from '../builder.js';

describe('buildStencil (BSWMD-free dispatcher)', () => {
  it('dispatches to Com builder for family=com', () => {
    const doc = buildStencil('com');
    expect(doc.packages[0]?.shortName).toBe('Com');
  });

  it('dispatches to ComM builder for family=comm', () => {
    expect(buildStencil('comm').packages[0]?.shortName).toBe('ComM');
  });

  it('dispatches to PduR builder for family=pdur', () => {
    expect(buildStencil('pdur').packages[0]?.shortName).toBe('PduR');
  });

  it('dispatches to EcuC builder for family=ecuc', () => {
    expect(buildStencil('ecuc').packages[0]?.shortName).toBe('EcuC');
  });
});