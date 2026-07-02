// useGenerateCode — GUI bridge for the BSW code generator.
//
// Closes the v1.20.x gap where `autosarcfg generate` worked on the
// CLI + IPC layer (HEADLESS_RUN_COMMAND → headlessRunCommandHandler
// → CLI dispatcher → runPipeline → writeOutputTree) but the
// renderer never exposed a way to call it.
//
// Contract:
//   - `generate(projectPath)` invokes the existing IPC channel with a
//     `kind: 'generate'` parsedArgs. Main threads it through the CLI
//     dispatcher (same path as `autosarcfg generate --project <manifest>`).
//   - The Promise resolves with a `GenerateOutcome` discriminated
//     union so callers can dispatch toasts WITHOUT reading post-IPC
//     React state across an async boundary (closes the v1.21.0 code-
//     reviewer HIGH finding about stale closures — the resolved
//     Promise is the only reliable channel between the in-flight
//     IPC reply and the caller; `state` / `result` in the hook
//     return value are still useful for live UI (button label) but
//     should not be relied on for one-shot side effects).
//   - Re-entrancy is gated by `state === 'running'` at the entry of
//     `generate()` — protects against a future caller that constructs
//     `handleGenerateClick` independently of the `canGenerate` UI
//     gate (e.g. a Cmd-K palette shortcut fired while the IPC round-
//     trip is in flight would otherwise start a second concurrent
//     `generate` and race the atomic-write path on `outDir`).
//
// State machine (single-fire per click — re-entrancy is gated by
// `state === 'running'`):
//
//   idle → running → ok | error
//         ↑
//         └─ (next click resets to idle; concurrent click during
//            `running` is a no-op)
//
// The hook is intentionally NOT feature-flagged. The CLI path has
// shipped since v1.11.0; the GUI entry is a UX improvement that
// surfaces an existing capability. Gating it behind a flag would
// hide a working feature for no benefit.

import { useCallback, useRef, useState } from 'react';

import type {
  GenerateResult,
  HeadlessRunCommandRequest,
  HeadlessRunCommandResult,
} from '@shared/headless/ipc-contract.js';

export type GenerateState = 'idle' | 'running' | 'ok' | 'error';

/**
 * Outcome of a single `generate()` call. Resolved by the Promise the
 * hook returns so callers don't have to read React state across an
 * async boundary (which would hit the stale-closure trap).
 */
export type GenerateOutcome =
  | { readonly kind: 'ok'; readonly result: GenerateResult }
  | { readonly kind: 'error'; readonly message: string; readonly result: GenerateResult | null };

export interface UseGenerateCodeResult {
  readonly state: GenerateState;
  readonly result: GenerateResult | null;
  readonly errorMessage: string | null;
  readonly generate: (projectPath: string) => Promise<GenerateOutcome>;
  readonly reset: () => void;
}

export function useGenerateCode(): UseGenerateCodeResult {
  const [state, setState] = useState<GenerateState>('idle');
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Re-entrancy guard. The hook's `state` is closed over by the
  // `generate` callback; using a ref makes the check see the LATEST
  // state value (not the closure capture from the render at hook-
  // creation time), so a second `generate()` invocation that lands
  // mid-flight sees `running: true` and bails out. A plain
  // `useState`-derived check would suffer the same stale-closure
  // problem the Promise<outcome> design solves for the IPC reply.
  const isRunningRef = useRef(false);

  const generate = useCallback(async (projectPath: string): Promise<GenerateOutcome> => {
    // v1.21.0 HIGH-2 — re-entrancy gate. Doc comment at the top of
    // this file promises single-fire semantics; this is the
    // implementation. The UI also disables the button while
    // `state === 'running'` (AppHeader generateBusy prop), but the
    // hook is callable from anywhere (e.g. a future Cmd-K palette
    // shortcut) — the hook itself must enforce the contract.
    if (isRunningRef.current) {
      return { kind: 'error', message: 'generate already in flight', result: null };
    }
    if (projectPath.trim().length === 0) {
      setState('error');
      setErrorMessage('projectPath is empty');
      return { kind: 'error', message: 'projectPath is empty', result: null };
    }
    isRunningRef.current = true;
    setState('running');
    setErrorMessage(null);
    setResult(null);

    const req: HeadlessRunCommandRequest = {
      parsedArgs: {
        kind: 'generate',
        input: { command: 'generate', projectPath },
      },
      // `patchId` is required by HeadlessRunCommandRequest shape but
      // only consumed by mutate push events (see
      // headlessRunCommandHandler.ts:74-78 — `emitMutateApplied({
      // patchId: req.patchId, ... })`). For generate it's a no-op
      // sink; we use a stable literal so the test can match it
      // without pulling in a UUID generator.
      patchId: 'generate',
    };

    try {
      const reply: HeadlessRunCommandResult = await window.autosarApi.runHeadlessCommand(req);
      if (reply.kind === 'ok') {
        // Narrow: dispatcher returns HeadlessResult which is a union.
        // generate is the only kind we ask for here, but TS doesn't
        // narrow across an IPC bridge so we cast at the boundary.
        const r = reply.result as GenerateResult;
        setResult(r);
        setState(r.ok ? 'ok' : 'error');
        if (!r.ok) {
          // ok: false on a GenerateResult still returns the full envelope
          // (no `HeadlessFailure`); surface the first diagnostic's message
          // so the toast has something actionable.
          const first = r.diagnostics.find((d) => d.severity === 'error');
          const msg = first?.message ?? 'Generate reported errors';
          setErrorMessage(msg);
          return { kind: 'error', message: msg, result: r };
        }
        return { kind: 'ok', result: r };
      }
      // reply.kind === 'error' → HeadlessFailure envelope
      const stderr = reply.failure.stderr.join('\n').trim();
      const msg = stderr.length > 0 ? stderr : `Generate failed (${reply.failure.error.kind})`;
      setState('error');
      setErrorMessage(msg);
      return { kind: 'error', message: msg, result: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState('error');
      setErrorMessage(msg);
      return { kind: 'error', message: msg, result: null };
    } finally {
      // Clear the ref FIRST so a follow-up click in the same render
      // tick can re-enter; the React state update batches and the
      // `state` derived by the UI will catch up on the next render.
      isRunningRef.current = false;
    }
  }, []);

  const reset = useCallback((): void => {
    setState('idle');
    setResult(null);
    setErrorMessage(null);
  }, []);

  return { state, result, errorMessage, generate, reset };
}
