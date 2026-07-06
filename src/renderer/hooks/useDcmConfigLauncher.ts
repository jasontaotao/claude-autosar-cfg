// useDcmConfigLauncher — v1.31.0 PATCH T3.
//
// State machine + IPC + error classifier for the v1.30.0
// `dcm:config` IPC channel. Consumed by AppHeader (T5) and
// indirectly by ContextMenu (T6 — fires through AppHeader).
//
// IPC surface is unchanged from v1.30.0:
//   - Request:  { odxPath, xlsxRows, bswmdPath? }
//   - Response: { ok: true, value: DcmConfigHandlerResult }
//             | { ok: false, error: { message, cause? } }
//
// Error classification maps the 6 v1.30.0 handler error
// sites (5 anchored prefixes + 1 substring for the propagated
// dcmConfigPipeline error) to renderer-distinguishable class
// keys. The 6th class (`unexpected`) catches anything else so
// the renderer can still surface a toast (never silent).

import { useCallback, useRef, useState } from 'react';

import type { DcmConfigHandlerResult, EcucInstanceRow } from '../../shared/types.js';
import type { DcmConfigErrorClass } from '../components/dcmConfig/DcmConfigErrorToast.js';

export interface DcmConfigLauncherState {
  readonly mode: 'idle' | 'pending' | 'success' | 'error';
  readonly result: DcmConfigHandlerResult | null;
  readonly error: { message: string; classKey: DcmConfigErrorClass } | null;
  readonly dialogOpen: boolean;
  readonly toastVisible: boolean;
}

export interface DcmConfigLauncher {
  readonly state: DcmConfigLauncherState;
  open(args: {
    odxPath: string;
    xlsxRows: readonly EcucInstanceRow[];
    bswmdPath?: string;
  }): Promise<void>;
  closeDialog(): void;
  dismissToast(): void;
}

const INITIAL_STATE: DcmConfigLauncherState = {
  mode: 'idle',
  result: null,
  error: null,
  dialogOpen: false,
  toastVisible: false,
};

/**
 * Map a v1.30.0 handler `error.message` literal to one of the
 * 6 renderer-distinguishable class keys. Order matters: anchored
 * prefixes first (each matches exactly one v1.30.0 error site),
 * then the propagated `BSWMD map missing` substring, then the
 * catch-all `unexpected` for anything that slips through (e.g. a
 * future v1.32.0 error class that hasn't been wired yet — the
 * user still sees a toast).
 */
export function classifyError(message: string): DcmConfigErrorClass {
  if (/^BSWMD file unreadable:/.test(message)) return 'bswmdUnreadable';
  if (/^ODX file unreadable:/.test(message)) return 'odxUnreadable';
  if (/^ODX parse failed:/.test(message)) return 'odxParseFailed';
  if (/BSWMD map missing/.test(message)) return 'bswmdMapMissing';
  if (/^Atomic write failed:/.test(message)) return 'atomicWriteFailed';
  return 'unexpected';
}

/** Minimal `window.autosarApi.dcmConfig` shape (cast in caller). */
interface DcmConfigApi {
  dcmConfig(req: {
    odxPath: string;
    xlsxRows: readonly EcucInstanceRow[];
    bswmdPath?: string;
  }): Promise<
    | { readonly ok: true; readonly value: DcmConfigHandlerResult }
    | { readonly ok: false; readonly error: { readonly message: string; readonly cause?: unknown } }
  >;
}

function getApi(): DcmConfigApi {
  return (window as unknown as { autosarApi: DcmConfigApi }).autosarApi;
}

export function useDcmConfigLauncher(): DcmConfigLauncher {
  const [state, setState] = useState<DcmConfigLauncherState>(INITIAL_STATE);

  // Re-entrancy guard — see brief step 3 IMPORTANT note: a
  // setState-based guard reads stale state across renders, so a
  // second open() fired in the same tick would slip through. The
  // ref reads latest synchronous state and gates the IPC call.
  const inFlightRef = useRef(false);

  const open = useCallback(
    async (args: {
      odxPath: string;
      xlsxRows: readonly EcucInstanceRow[];
      bswmdPath?: string;
    }): Promise<void> => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setState({ ...INITIAL_STATE, mode: 'pending' });
      try {
        const res = await getApi().dcmConfig(args);
        if (res.ok) {
          setState({
            mode: 'success',
            result: res.value,
            error: null,
            dialogOpen: true,
            toastVisible: false,
          });
        } else {
          const message = res.error.message;
          setState({
            mode: 'error',
            result: null,
            error: { message, classKey: classifyError(message) },
            dialogOpen: false,
            toastVisible: true,
          });
        }
      } catch (e) {
        // v1.31.1 PATCH — defensive IPC try/catch (T4 whole-branch
        // review Minor plan-mandated). The IPC envelope is in
        // practice guaranteed (the handler always returns a
        // DcmConfigResponse), but if the bridge ever throws (e.g.
        // contextBridge serialization failure on a malformed
        // bswmdPath argument), surface it as an `unexpected`
        // toast so the user gets feedback instead of an unhandled
        // rejection. The `finally` block below still releases the
        // re-entrancy ref so subsequent open() calls work.
        const message = e instanceof Error ? e.message : String(e);
        setState({
          mode: 'error',
          result: null,
          error: { message, classKey: classifyError(message) },
          dialogOpen: false,
          toastVisible: true,
        });
      } finally {
        inFlightRef.current = false;
      }
    },
    [],
  );

  const closeDialog = useCallback((): void => {
    setState((prev) => ({ ...prev, mode: 'idle', dialogOpen: false }));
  }, []);

  const dismissToast = useCallback((): void => {
    setState((prev) => ({ ...prev, mode: 'idle', toastVisible: false, error: null }));
  }, []);

  return { state, open, closeDialog, dismissToast };
}
