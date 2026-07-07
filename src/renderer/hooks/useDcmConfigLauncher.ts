// useDcmConfigLauncher — v1.31.0 PATCH T3 + v1.32.0 MINOR T2.
//
// State machine + IPC + error classifier for the v1.30.0
// `dcm:config` IPC channel. Consumed by AppHeader (T5) and
// indirectly by ContextMenu (T6 — fires through AppHeader).
//
// IPC surface is unchanged from v1.30.0:
//   - Request:  { odxPath, xlsxRows, bswmdPath? }
//   - Response: { ok: true, value: DcmConfigHandlerResult }
//             | { ok: false, error: { kind, message, cause? } }   (v1.32.0: kind is additive)
//
// v1.32.0 MINOR T2 — classifyError reads DcmConfigError.kind FIRST and
// falls back to classifyErrorByRegex when kind is absent (pre-v1.32.0
// IPC handler payloads). Regex fallback is kept for ONE release and
// removed in v1.33.0 (lesson
// error-classification-via-regex-prefix-vs-envelope-kind-trade-off).

import { useCallback, useRef, useState } from 'react';

import type {
  DcmConfigError,
  DcmConfigErrorKind,
  DcmConfigHandlerResult,
  EcucInstanceRow,
} from '../../shared/types.js';
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
 * v1.32.0 MINOR T2 — 9-value renderer-distinguishable error class union.
 *
 * Distinct from the toast's 6-value `DcmConfigErrorClass` (camelCase,
 * v1.31.x) so the launcher's classifier can address the 3 new
 * v1.32.0 error sites (`ODX_DCM_LINKAGE`, `DCM_MODULE_MISSING`,
 * `CONTAINER_NOT_FOUND`, `PATCH_FAILED`) without inflating the toast's
 * union before the i18n T7 work ships. The launcher maps these 9
 * values down to the 6-value toast union via `NEW_CLASS_TO_OLD_KEY`
 * when storing in `state.error.classKey`, preserving the existing
 * toast's localized rendering.
 */
export type RendererDcmConfigErrorClass =
  | 'ODX_FILE_UNREADABLE'
  | 'ODX_PARSE_FAILED'
  | 'BSWMD_FILE_UNREADABLE'
  | 'ODX_DCM_LINKAGE'
  | 'DCM_MODULE_MISSING'
  | 'CONTAINER_NOT_FOUND'
  | 'PATCH_FAILED'
  | 'ATOMIC_WRITE_FAILED'
  | 'UNKNOWN';

/**
 * v1.32.0 MINOR T2 — DcmConfigErrorKind → RendererDcmConfigErrorClass.
 * Order matters in case of future kind additions; today it is total
 * (every DcmConfigErrorKind has a row).
 */
const KIND_TO_CLASS: Readonly<Record<DcmConfigErrorKind, RendererDcmConfigErrorClass>> = {
  'odx-unreadable': 'ODX_FILE_UNREADABLE',
  'odx-parse-failed': 'ODX_PARSE_FAILED',
  'bswmd-unreadable': 'BSWMD_FILE_UNREADABLE',
  'odx-dcm-linkage': 'ODX_DCM_LINKAGE',
  'dcm-module-missing': 'DCM_MODULE_MISSING',
  'container-not-found': 'CONTAINER_NOT_FOUND',
  'patch-failed': 'PATCH_FAILED',
  'atomic-write-failed': 'ATOMIC_WRITE_FAILED',
  'unknown': 'UNKNOWN',
};

/**
 * v1.32.0 MINOR T2 — RendererDcmConfigErrorClass → toast's
 * DcmConfigErrorClass (camelCase, v1.31.x 6-value union).
 *
 * 3 new classes collapse onto existing toast keys:
 *   - `ODX_DCM_LINKAGE`     → `bswmdMapMissing` (best UX match — same
 *                             "missing linkage between ODX & Dcm"
 *                             message territory)
 *   - `CONTAINER_NOT_FOUND` → `bswmdMapMissing` (same UX bucket)
 *   - `DCM_MODULE_MISSING`  → `bswmdMapMissing` (same UX bucket)
 *   - `PATCH_FAILED`        → `unexpected` (no dedicated i18n key yet)
 *
 * The mapping is intentionally lossy: the launcher's state.error.classKey
 * remains in the toast's 6-value union so DcmConfigErrorToast renders
 * unchanged. A future v1.32.x+ PATCH can split these out as the i18n
 * catalog grows. Pinned by the v1.32.0 spec §3 T7 / T8 (i18n keys
 * added incrementally per release).
 */
const NEW_CLASS_TO_OLD_KEY: Readonly<
  Record<RendererDcmConfigErrorClass, DcmConfigErrorClass>
> = {
  ODX_FILE_UNREADABLE: 'odxUnreadable',
  ODX_PARSE_FAILED: 'odxParseFailed',
  BSWMD_FILE_UNREADABLE: 'bswmdUnreadable',
  ODX_DCM_LINKAGE: 'bswmdMapMissing',
  DCM_MODULE_MISSING: 'bswmdMapMissing',
  CONTAINER_NOT_FOUND: 'bswmdMapMissing',
  PATCH_FAILED: 'unexpected',
  ATOMIC_WRITE_FAILED: 'atomicWriteFailed',
  UNKNOWN: 'unexpected',
};

/**
 * v1.32.0 MINOR T2 — read DcmConfigError.kind FIRST; fall back to
 * `classifyErrorByRegex` when `kind` is absent (pre-v1.32.0 IPC
 * handler payloads — 1-release compat window). Regex fallback is
 * removed in v1.33.0 (lesson
 * `backward-compat-branch-on-missing-discriminator-field`).
 *
 * Accepts the full `DcmConfigError` shape (not just `message`) so the
 * discriminator check has a stable home — we never inspect
 * `error.message` first.
 */
export function classifyError(error: DcmConfigError): RendererDcmConfigErrorClass {
  if (typeof error === 'object' && error !== null && 'kind' in error) {
    return KIND_TO_CLASS[error.kind];
  }
  // Backward-compat fallback (pre-v1.32.0 handler payloads that lack
  // the kind field). At the type level `DcmConfigError.kind` is required,
  // so by the time we reach this line the discriminant has been
  // confirmed absent via `'kind' in error` above — TypeScript narrows
  // `error` to `never`. The legacy payload shape is `{ message: string }`
  // (no kind), so we re-read `message` through the original parameter
  // with a controlled cast that documents the pre-v1.32.0 contract.
  return classifyErrorByRegex(
    (error as unknown as { message: string }).message,
  );
}

/**
 * v1.32.0 MINOR T2 — legacy regex classifier. Kept for one-release IPC
 * forward-compat with handlers that haven't shipped the kind field.
 * Removed in v1.33.0.
 *
 * Mirrors the v1.31.x 6-prefix regex set, plus the 3 new v1.32.0
 * prefixes (odx-dcm-linkage, dcm-module-missing, container-not-found,
 * patch-failed) so legacy payloads from a pre-v1.32.0 handler still
 * land in a meaningful class.
 */
export function classifyErrorByRegex(message: string): RendererDcmConfigErrorClass {
  if (/^ODX file unreadable/.test(message)) return 'ODX_FILE_UNREADABLE';
  if (/^ODX parse failed/.test(message)) return 'ODX_PARSE_FAILED';
  if (/^BSWMD file unreadable/.test(message)) return 'BSWMD_FILE_UNREADABLE';
  if (/^ODX-Dcm linkage broken/.test(message)) return 'ODX_DCM_LINKAGE';
  if (/^BSWMD map missing module/.test(message)) return 'DCM_MODULE_MISSING';
  if (/^Container .* not found/.test(message)) return 'CONTAINER_NOT_FOUND';
  if (/^Patch application failed/.test(message)) return 'PATCH_FAILED';
  if (/^Atomic write failed/.test(message)) return 'ATOMIC_WRITE_FAILED';
  return 'UNKNOWN';
}

/**
 * v1.32.0 MINOR T2 — internal adapter from the 9-class
 * RendererDcmConfigErrorClass union down to the toast's 6-value
 * DcmConfigErrorClass (camelCase) so `state.error.classKey` still
 * round-trips through `DcmConfigErrorToast` unchanged. Test code
 * that asserts on `state.error.classKey` continues to expect the
 * v1.31.x camelCase keys.
 */
function toToastClassKey(cls: RendererDcmConfigErrorClass): DcmConfigErrorClass {
  return NEW_CLASS_TO_OLD_KEY[cls];
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
          // v1.32.0 MINOR T2 — classifyError reads DcmConfigError.kind
          // FIRST. Forward-compat: pre-v1.32.0 handlers may still send
          // payloads without `kind`; the `kind in error` check inside
          // classifyError routes those to the regex fallback (1-release
          // compat window, removed in v1.33.0). We pass the whole
          // `res.error` object, not just `message`, so the discriminator
          // has a stable home.
          const errorForClassify: DcmConfigError = res.error as DcmConfigError;
          const toastKey = toToastClassKey(classifyError(errorForClassify));
          setState({
            mode: 'error',
            result: null,
            error: { message, classKey: toastKey },
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
        // v1.32.0 MINOR T2 — bridge throws are not DcmConfigErrors
        // (no IPC envelope reached). Build an envelope-shaped object
        // with `kind: 'unknown'` so classifyError takes the kind-first
        // path and returns 'UNKNOWN' (toast key 'unexpected').
        const errorForClassify: DcmConfigError = { kind: 'unknown', message };
        const toastKey = toToastClassKey(classifyError(errorForClassify));
        setState({
          mode: 'error',
          result: null,
          error: { message, classKey: toastKey },
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
