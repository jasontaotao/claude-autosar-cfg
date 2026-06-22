// v1.8.0 K Stencil Wizard — Task 4 + Task 8 IPC handler tests.
//
// Mirrors the script-handler test style: call the exported
// `handleStencilGenerate` directly (no `ipcMain.handle` round-trip)
// so the suite stays fast and deterministic. The handler is pure with
// respect to its inputs — it builds the family schema in memory and
// serializes via the real `serializeArxml` from
// `src/core/arxml/serializer.ts`. No disk I/O, no Electron mocks.
//
// Task 8 (G RunResult gate) tests mock the SWS validator's
// `runValidation` engine entry point (see vi.mock below). This is the
// canonical seam: the engine module is imported by name in
// `src/main/ipc/stencilHandler.ts`, so vi.mock redirects the import
// resolution at test time. The real engine implementation is not
// stubbed out — `runValidation` is replaced wholesale for these tests
// only.
//
// Cases (Task 4 — 3 + Task 8 — 3):
//   1. free mode, gate:false → ok=true, xml contains `<Com`,
//      suggestedFilename === 'Com.arxml'
//   2. comm family smoke → ok=true, suggestedFilename === 'ComM.arxml'
//      (verifies the dispatcher is wired up for the second family)
//   3. unknown family (cast as never to bypass compile-time gate) →
//      ok=false with a typed `{ error: { code, i18nKey } }` envelope
//   4. gate:true, validator returns error severity → ok=false,
//      envelope has `errors[]` (not `error`) with the offending rule
//   5. gate:true, validator returns only warnings → ok=true (gate does
//      NOT block on warnings; only `severity === 'error'`)
//   6. gate:false, validator never called → runValidation spy is
//      untouched (validates the gate opt-in path)

import { describe, expect, it, vi } from 'vitest';

// Mock the SWS validator engine entry point. The handler imports
// `runValidation` from `src/core/sws-validator/engine.js` (Task 8).
// Vitest hoists vi.mock above the import below, so this redirect
// applies to the handler's import too. `getBuiltinRegistry` is also
// imported by the handler if/when it is wired in Task 8+; mocked
// here to keep the seam narrow.
vi.mock('../../../core/sws-validator/engine.js', () => ({
  runValidation: vi.fn(),
}));

import { runValidation } from '../../../core/sws-validator/engine.js';
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

// ---------------------------------------------------------------------------
// Task 8 — G RunResult gate integration tests.
//
// The handler imports `runValidation` from `src/core/sws-validator/engine.js`
// (Task 8 wiring). The mock at the top of this file replaces that import
// with a `vi.fn()` so we can stage validator output per-case without
// touching disk or registering rules.
//
// The gate logic per K spec §4.1 + plan Task 8:
//   - gate:false → runValidation never invoked (existing behavior).
//   - gate:true, mode:'free' → runValidation invoked after build + serialize.
//     - any `InternalValidatorResult` with `severity === 'error'` ⇒
//       return `{ ok: false, errors: [...] }`. No `error` envelope — the
//       renderer shows the violations in the gate panel.
//     - all severities are warning/info ⇒ continue to existing ok:true.
//   - gate:true, mode:'with-bswmd' → skip gate (Task 9 owns this path).
// ---------------------------------------------------------------------------

describe('handleStencilGenerate (Task 8 — G RunResult gate)', () => {
  it('blocks when gate=true and validator returns error severity', async () => {
    const mockedRun = vi.mocked(runValidation);
    mockedRun.mockResolvedValueOnce({
      results: [
        {
          ruleId: 'SWS_COM_PDUID_UNIQUE',
          severity: 'error',
          messageKey: 'swsValidator.com.duplicatePduId',
          path: '/Com/ComConfig/ComIPdu',
        },
      ],
      durationMs: 1,
      rulesRun: 1,
      rulesSkipped: 0,
      timedOut: [],
    });

    const result = await handleStencilGenerate({
      family: 'com',
      mode: 'free',
      gate: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok && 'errors' in result) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.ruleId).toBe('SWS_COM_PDUID_UNIQUE');
      expect(result.errors[0]?.severity).toBe('error');
    } else {
      // Surface the actual shape so a future refactor that changes the
      // gate envelope fails this test loudly.
      throw new Error(`expected errors[] envelope, got ${JSON.stringify(result)}`);
    }
    expect(mockedRun).toHaveBeenCalledTimes(1);
  });

  it('allows generation when gate=true and validator returns only warnings', async () => {
    const mockedRun = vi.mocked(runValidation);
    mockedRun.mockResolvedValueOnce({
      results: [
        {
          ruleId: 'SWS_PDUR_ROUTING_COMPLETE',
          severity: 'warning',
          messageKey: 'swsValidator.pdur.routingIncomplete',
          path: '/PduR/PduRConfig',
        },
      ],
      durationMs: 1,
      rulesRun: 1,
      rulesSkipped: 0,
      timedOut: [],
    });

    const result = await handleStencilGenerate({
      family: 'com',
      mode: 'free',
      gate: true,
    });

    // WARN must not block per K spec §4.1 — only `severity === 'error'`.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.suggestedFilename).toBe('Com.arxml');
    }
  });

  it('does not call runValidation when gate=false', async () => {
    const mockedRun = vi.mocked(runValidation);
    mockedRun.mockClear();

    const result = await handleStencilGenerate({
      family: 'com',
      mode: 'free',
      gate: false,
    });

    expect(result.ok).toBe(true);
    expect(mockedRun).not.toHaveBeenCalled();
  });

  it('does not call runValidation when mode=with-bswmd (Task 9 owns this path)', async () => {
    const mockedRun = vi.mocked(runValidation);
    mockedRun.mockClear();

    // gate:true is overridden by with-bswmd mode — Task 9 implements
    // its own validation path (BSWMD merge), so the gate here is a
    // no-op. The handler must NOT invoke the G validator in this
    // mode. Per Task 9 scope, with-bswmd currently falls back to the
    // same free-mode build path; the gate is simply skipped so Task 9
    // can wire its own validation hook without conflicting with ours.
    const result = await handleStencilGenerate({
      family: 'com',
      mode: 'with-bswmd',
      gate: true,
    });

    expect(mockedRun).not.toHaveBeenCalled();
    // No gate ⇒ falls through to the existing success path until Task 9
    // lands and routes with-bswmd through the BSWMD merge path.
    expect(result.ok).toBe(true);
  });
});
