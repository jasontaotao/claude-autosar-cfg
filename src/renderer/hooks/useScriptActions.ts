// useScriptActions — Sprint 14 #1 Phase C (T11) — IPC client wrappers
// for the script engine.
//
// Pure pass-through to the `useScriptStore` actions; the split mirrors
// `useProjectActions` so renderer components import a stable hook
// surface and the store stays pure (no-electron). The hook itself
// adds:
//
//   - onScriptProgress subscription (wires the IPC push channel into
//     store.appendProgress + auto-unsubscribe on unmount)
//   - a `useEffect`-friendly `subscribeProgress` for components that
//     need to drive their own lifecycle
//
// The `useEffect` lives in `ScriptPanel.tsx` (T14) — this file just
// exposes the imperative API.

import { useCallback } from 'react';

import type { ScriptKind, ScriptRunResult } from '@shared/script/types';

import { useScriptStore } from '../store/useScriptStore';

export interface ScriptActionResult<T = void> {
  readonly ok: boolean;
  readonly value?: T;
  readonly message?: string;
}

/**
 * Returns the imperative script lifecycle actions. Each method maps
 * 1:1 onto a `useScriptStore` action so consumers can subscribe to
 * loading flags via the store without coupling to its internal shape.
 */
export function useScriptActions(): {
  readonly loadScripts: () => Promise<void>;
  readonly save: (input: {
    readonly id?: string;
    readonly name: string;
    readonly shortName: string;
    readonly kind: ScriptKind;
    readonly source: string;
  }) => Promise<ScriptActionResult<{ readonly id: string }>>;
  readonly remove: (id: string) => Promise<ScriptActionResult>;
  readonly run: (id: string, timeoutMs?: number) => Promise<ScriptRunResult | null>;
  readonly subscribeProgress: (
    handler: (e: {
      readonly runId: string;
      readonly level: 'info' | 'warn' | 'error' | 'debug';
      readonly message: string;
      readonly ts: number;
    }) => void,
  ) => () => void;
} {
  const loadScripts = useCallback(async (): Promise<void> => {
    await useScriptStore.getState().loadScripts(true);
  }, []);

  const save = useCallback(
    async (input: {
      readonly id?: string;
      readonly name: string;
      readonly shortName: string;
      readonly kind: ScriptKind;
      readonly source: string;
    }): Promise<ScriptActionResult<{ readonly id: string }>> => {
      const r = await useScriptStore.getState().saveScript(input);
      if (r.ok) return { ok: true, value: { id: r.id } };
      return { ok: false, message: r.message };
    },
    [],
  );

  const remove = useCallback(async (id: string): Promise<ScriptActionResult> => {
    const r = await useScriptStore.getState().deleteScript(id);
    if (r.ok) return { ok: true };
    return { ok: false, message: r.message };
  }, []);

  const run = useCallback(
    async (id: string, timeoutMs?: number): Promise<ScriptRunResult | null> => {
      return useScriptStore.getState().runScript(id, timeoutMs);
    },
    [],
  );

  const subscribeProgress = useCallback(
    (
      handler: (e: {
        readonly runId: string;
        readonly level: 'info' | 'warn' | 'error' | 'debug';
        readonly message: string;
        readonly ts: number;
      }) => void,
    ): (() => void) => {
      const unsubscribe = window.autosarApi.onScriptProgress((e) => {
        handler(e);
        // Also forward into the store so subscribers don't have to
        // manage their own buffer. The store's appendProgress is a
        // single set call, so even double-dispatch is fine.
        useScriptStore.getState().appendProgress({
          runId: e.runId,
          level: e.level,
          message: e.message,
          ts: e.ts,
        });
      });
      return unsubscribe;
    },
    [],
  );

  return { loadScripts, save, remove, run, subscribeProgress };
}
