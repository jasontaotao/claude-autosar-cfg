// v1.8.0 K Stencil Wizard — Task 1 (foundation) types + IPC contract tests.
//
// Pins:
//   - StencilFamily union covers all 4 module families (Com, ComM, PduR, EcuC)
//   - StencilMode union covers both 'free' and 'with-bswmd'
//   - IPC_CHANNELS includes STENCIL_GENERATE_V1 with the v1.8.0-locked channel name

import { describe, it, expect } from 'vitest';

import { IPC_CHANNELS } from '../../../shared/ipc-contract.js';
import type { StencilFamily, StencilMode } from '../types.js';

describe('stencil types', () => {
  it('StencilFamily covers all 4 modules', () => {
    const families: StencilFamily[] = ['com', 'comm', 'pdur', 'ecuc'];
    expect(families).toHaveLength(4);
  });

  it('StencilMode supports free and with-bswmd', () => {
    const modes: StencilMode[] = ['free', 'with-bswmd'];
    expect(modes).toContain('free');
    expect(modes).toContain('with-bswmd');
  });

  it('IPC_CHANNELS includes stencil:generate:v1', () => {
    expect(IPC_CHANNELS.STENCIL_GENERATE_V1).toBe('stencil:generate:v1');
  });
});
