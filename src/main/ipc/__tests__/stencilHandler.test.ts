// v1.8.0 K Stencil Wizard — Task 4 IPC handler tests.
//
// Mirrors the script-handler test style: call the exported
// `handleStencilGenerate` directly (no `ipcMain.handle` round-trip)
// so the suite stays fast and deterministic. The handler is pure with
// respect to its inputs — it builds the family schema in memory and
// serializes via the real `serializeArxml` from
// `src/core/arxml/serializer.ts`. No disk I/O, no Electron mocks.
//
// Cases (3):
//   1. free mode, gate:false → ok=true, xml contains `<Com`,
//      suggestedFilename === 'Com.arxml'
//   2. comm family smoke → ok=true, suggestedFilename === 'ComM.arxml'
//      (verifies the dispatcher is wired up for the second family)
//   3. unknown family (cast as never to bypass compile-time gate) →
//      ok=false with a typed `{ error: { code, i18nKey } }` envelope

import { describe, expect, it } from 'vitest';

import type { StencilRequest } from '../../stencil/types.js';
import { handleStencilGenerate } from '../stencilHandler.js';

describe('handleStencilGenerate (Task 4 — no gate)', () => {
  it('returns ok with serialized XML for free mode', async () => {
    const req: StencilRequest = { family: 'com', mode: 'free', gate: false };
    const result = await handleStencilGenerate(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Round-trip smoke: the family shortName appears in the emitted
      // XML. We check the value-side `<SHORT-NAME>Com</SHORT-NAME>`
      // marker because the serializer never emits a literal `<Com>` tag
      // (the family name only appears inside SHORT-NAME / DEFINITION-REF).
      expect(result.xml).toContain('<SHORT-NAME>Com</SHORT-NAME>');
      expect(result.suggestedFilename).toBe('Com.arxml');
    }
  });

  it('dispatches to comm builder for family=comm', async () => {
    const req: StencilRequest = { family: 'comm', mode: 'free', gate: false };
    const result = await handleStencilGenerate(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.suggestedFilename).toBe('ComM.arxml');
      // The ComM package short-name appears in the serialized XML —
      // confirms the dispatcher reached the right family builder (not
      // just defaulted). Same SHORT-NAME marker as the Com test above.
      expect(result.xml).toContain('<SHORT-NAME>ComM</SHORT-NAME>');
    }
  });

  it('returns error envelope for unknown family', async () => {
    // Bypass the StencilFamily literal gate with `as never` so the type-
    // checked runtime path is exercised. The dispatcher must surface a
    // typed `{ error: { code, i18nKey } }` response rather than throw.
    const req = { family: 'unknown', mode: 'free', gate: false } as unknown as StencilRequest;
    const result = await handleStencilGenerate(req);
    expect(result.ok).toBe(false);
    if (!result.ok && 'error' in result) {
      expect(result.error.code).toBe('UNKNOWN_FAMILY');
      expect(result.error.i18nKey).toBe('stencil.error.unknownFamily');
    } else {
      // Surface the actual shape so a future refactor that changes the
      // envelope fails this test loudly.
      throw new Error(`expected error envelope, got ${JSON.stringify(result)}`);
    }
  });
});