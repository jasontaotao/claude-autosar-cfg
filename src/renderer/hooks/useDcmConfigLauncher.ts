// useDcmConfigLauncher — v1.31.0 PATCH T3 + v1.32.0 MINOR T2 + T5 + v1.33.0 MINOR T4.
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
// v1.32.0 MINOR T2 — classifyError reads DcmConfigError.kind FIRST
// (lesson error-classification-via-regex-prefix-vs-envelope-kind-trade-off).
//
// v1.33.0 MINOR T4 — classifyErrorByRegex removed (1-release compat
// window per v1.32.0 spec §5 has expired). Renderer classifyError
// reads kind discriminator exclusively. Defensive 'UNKNOWN' fallback
// for legacy typed-cast payloads (should never occur in v1.32.0+
// production but kept for type-safety).
// Lesson: 1-release-compat-window-explicit-removal
//
// v1.32.0 MINOR T5 — state machine gains a `picking-odx` substate.
// Flow: idle → (promptAndOpen: no active ODX) → picking-odx → (resolve)
// → pending → (ok|err) → success|error.  When activeDocumentPath is
// already an .odx file, promptAndOpen skips the picker and calls open()
// directly. bswmdHasDcm is the T4 parse-based gate (replaces the v1.31.x
// filename regex); it is memoized per-path so re-renders on store
// updates with unchanged paths avoid re-parsing (lesson
// filename-regex-for-ux-gate-vs-parse-based-detection-trade-off).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  DcmConfigError,
  DcmConfigErrorKind,
  DcmConfigHandlerResult,
  EcucInstanceRow,
} from '../../shared/types.js';
import type { DcmConfigErrorClass } from '../components/dcmConfig/DcmConfigErrorToast.js';
import { findDcmBswmd, type BswmdHasDcmResult } from '../components/dcmConfig/bswmdHasDcm.js';
import { useArxmlStore } from '../store/useArxmlStore.js';

export interface DcmConfigLauncherState {
  readonly mode: 'idle' | 'picking-odx' | 'pending' | 'success' | 'error';
  readonly result: DcmConfigHandlerResult | null;
  readonly error: { message: string; classKey: DcmConfigErrorClass } | null;
  readonly dialogOpen: boolean;
  readonly toastVisible: boolean;
  /** v1.32.0 T5 — last (re-entrant) autofill hint surfaced to App.tsx
   * after a successful picker resolve. Stays stable across renders so
   * `<DcmConfigSuccessDialog />` can show the "auto-selected from
   * project manifest" line (T7 i18n key). */
  readonly bswmdPathAutofill: string | null;
  /** v1.32.0 T5 fix — transient i18n-key status surfaced to App.tsx
   * after a picker cancel. App.tsx renders the localized "cancelled"
   * toast via this key (T7 ships the catalog string). Reset to null by
   * `dismissToast` and by any subsequent open()/promptAndOpen(). */
  readonly statusMessage: string | null;
  /** v1.33.1 PATCH — captures the `odxPath` of the last successful
   * `dcm:config` invocation, so `handleGenerateNew()` (T2) can re-fire
   * with `{odxPath: lastOdxPath ?? activeDocumentPath, xlsxRows, bswmdPath}`
   * after the user picks a new BSWMD via the SuccessDialog "Generate
   * New" button (T3). Lesson: store-as-source-of-truth-for-async-args —
   * re-fire args belong on the launcher state shape, not a hook local. */
  readonly lastOdxPath: string | null;
}

export interface DcmConfigLauncher {
  readonly state: DcmConfigLauncherState;
  /** v1.32.0 T5 — bswmdHasDcm gate (T4 parse-based). Drives
   * `canOpenDcmConfig` in App.tsx + autofills bswmdPath on resolve. */
  readonly bswmdHasDcm: BswmdHasDcmResult;
  /** v1.32.0 T5 — derived from `useArxmlStore.activeDocumentPath`.
   * Lets AppHeader/ContextMenu render the entry as "active" when an
   * .odx doc is already loaded (shortcut path skips picker). */
  readonly isActiveOdx: boolean;
  /** v1.31.0 + T5 — IPC entry. Takes resolved bswmdPath. Still the
   * underlying primitive; `promptAndOpen` is the new entry point and
   * `handlePickerResolve` calls this internally. */
  open(args: {
    odxPath: string;
    xlsxRows: readonly EcucInstanceRow[];
    bswmdPath?: string;
  }): Promise<void>;
  /** v1.32.0 T5 — top-level entry. Decides between the picker
   * (when no active .odx doc) and the shortcut (when one is loaded).
   * Re-entrancy-guarded via inFlightRef (existing lesson
   * re-entrancy-guard-via-useref-not-setstate-callback-state). */
  promptAndOpen(): Promise<void>;
  /** v1.32.0 T5 — wiring hook for `<DcmConfigPicker />`. Resolves
   * the picked path into `open()` and transitions picking-odx → pending. */
  handlePickerResolve(odxPath: string): Promise<void>;
  /** v1.32.0 T5 — wiring hook for `<DcmConfigPicker />`. Returns
   * to idle; App.tsx can mount a localized "cancelled" toast via the
   * existing `setError` action. */
  handlePickerCancel(): void;
  closeDialog(): void;
  dismissToast(): void;
}

const INITIAL_STATE: DcmConfigLauncherState = {
  mode: 'idle',
  result: null,
  error: null,
  dialogOpen: false,
  toastVisible: false,
  bswmdPathAutofill: null,
  statusMessage: null,
  lastOdxPath: null,
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
  unknown: 'UNKNOWN',
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
const NEW_CLASS_TO_OLD_KEY: Readonly<Record<RendererDcmConfigErrorClass, DcmConfigErrorClass>> = {
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
 * v1.33.0 MINOR T4 — read DcmConfigError.kind exclusively. The
 * pre-v1.32.0 regex fallback was removed when the 1-release compat
 * window expired (v1.32.0 spec §5). Defensive 'UNKNOWN' return keeps
 * the type-safe path for any typed-cast anomaly that bypasses the
 * discriminant (should never occur in v1.32.0+ IPC payloads).
 *
 * Accepts the full `DcmConfigError` shape (not just `message`) so the
 * discriminator check has a stable home — we never inspect
 * `error.message` first.
 */
export function classifyError(error: DcmConfigError): RendererDcmConfigErrorClass {
  if (typeof error === 'object' && error !== null && 'kind' in error) {
    return KIND_TO_CLASS[error.kind];
  }
  return 'UNKNOWN';
}

// v1.33.0 MINOR T4 — classifyErrorByRegex removed (1-release compat
// window per v1.32.0 spec §5 has expired). Renderer classifyError
// reads kind discriminator exclusively. Defensive 'UNKNOWN' fallback
// for legacy typed-cast payloads (should never occur in v1.32.0+
// production but kept for type-safety).
// Lesson: 1-release-compat-window-explicit-removal

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

// v1.32.0 T5 — stable empty-array fallback for the bswmdPaths
// selector. Without it, `s.project?.bswmdPaths ?? []` returns a fresh
// `[]` reference on every store read → Zustand reports "changed" via
// Object.is → useEffect re-runs forever → React renders in a tight
// loop → heap exhaustion (verified once already in the T5 cycle).
// Hoisting the empty array to a module-level const keeps the identity
// stable across renders.
const EMPTY_BSWMD_PATHS: readonly string[] = Object.freeze([]) as readonly string[];

export function useDcmConfigLauncher(): DcmConfigLauncher {
  const [state, setState] = useState<DcmConfigLauncherState>(INITIAL_STATE);

  // Re-entrancy guard — see brief step 3 IMPORTANT note: a
  // setState-based guard reads stale state across renders, so a
  // second open() fired in the same tick would slip through. The
  // ref reads latest synchronous state and gates the IPC call.
  // v1.32.0 T5 — same guard covers BOTH the existing `open` IPC
  // entry AND the new `promptAndOpen` top-level entry; both call
  // paths funnel through `open()` so the guard releases only once.
  const inFlightRef = useRef(false);

  // v1.32.0 T5 — store-derived inputs.
  //
  // `bswmdPaths` lists the project's loaded BSWMD files; we feed them
  // to `findDcmBswmd` (T4) to compute which (if any) is the Dcm BSWMD.
  // The hook owns the per-path memo so the helper stays pure and the
  // memoization is keyed by the exact path strings the store emits.
  //
  // `activeDocumentPath` is consumed both by `isActiveOdx` (derived
  // shortcut that gates picker on/off) and by `promptAndOpen` when the
  // shortcut path needs to call `open({ odxPath: activePath })`.
  const bswmdPaths = useArxmlStore((s) => s.project?.bswmdPaths ?? EMPTY_BSWMD_PATHS);
  const activeDocumentPath = useArxmlStore((s) => s.activeDocumentPath);

  // v1.32.0 T5 — `isActiveOdx` is reactive so the menu entry stays
  // accurate as the user switches between docs (AppHeader gates the
  // "Open Dcm Config" entry off when an .odx is loaded — matches the
  // pre-existing `odxLoaded` UX contract from v1.31.0).
  const isActiveOdx = useMemo(
    () => activeDocumentPath !== null && activeDocumentPath.toLowerCase().endsWith('.odx'),
    [activeDocumentPath],
  );

  // v1.32.0 T5 — per-path memoized parse gate.
  //
  // `findDcmBswmd` re-parses any path it hasn't seen before and
  // reuses results for paths already cached. Kept in a `useRef` Map
  // so the memo survives renders and is keyed by exact path string.
  // When ALL paths are cached, we aggregate from the memo directly
  // (no async hop); otherwise we kick off one `findDcmBswmd`
  // invocation per "uncached subset" change.
  const memoRef = useRef<Map<string, BswmdHasDcmResult>>(new Map());
  const [bswmdHasDcm, setBswmdHasDcm] = useState<BswmdHasDcmResult>({ hasDcm: false });

  useEffect(() => {
    // Defensive copy: store-derived `bswmdPaths` may be `readonly string[]`,
    // but `findDcmBswmd` asks for `readonly string[]` too. We treat the
    // snapshot as the effect's deps intentionally — re-running when the
    // referenced list identity changes is the right granularity for the
    // re-parse decision (length-1 case still caches hits across renders).
    const pathsSnapshot: readonly string[] = bswmdPaths;
    const memo = memoRef.current;

    const cachedAggregate = (): BswmdHasDcmResult => {
      for (const p of pathsSnapshot) {
        const cached = memo.get(p);
        if (cached !== undefined && cached.hasDcm) {
          return cached;
        }
      }
      return { hasDcm: false };
    };

    const uncached = pathsSnapshot.filter((p) => !memo.has(p));
    if (uncached.length === 0) {
      // All paths cached — aggregate synchronously so we don't lag a
      // render behind an async setState flip.
      setBswmdHasDcm(cachedAggregate());
      return;
    }

    let cancelled = false;
    void findDcmBswmd(pathsSnapshot, {
      readFile: async (p) => {
        const api = (
          window as unknown as {
            autosarApi?: {
              readBswmd?: (req: {
                path: string;
              }) => Promise<
                | { readonly ok: true; readonly value: { readonly content: string } }
                | { readonly ok: false; readonly error: { readonly message: string } }
              >;
            };
          }
        ).autosarApi;
        if (api?.readBswmd === undefined) {
          throw new Error('readBswmd IPC is unavailable');
        }
        const res = await api.readBswmd({ path: p });
        if (!res.ok) {
          throw new Error(res.error.message);
        }
        return res.value.content;
      },
    })
      .then((result) => {
        if (cancelled) return;
        // Cache the aggregate result keyed by the first path (mirrors
        // findDcmBswmd's "first Dcm path in input array order" semantics
        // when `hasDcm === true`). On `hasDcm === false` we cache a
        // `{hasDcm: false}` entry per path so subsequent equality checks
        // see them as resolved and skip the parse hop.
        if (result.hasDcm && result.dcmBswmdPath !== undefined) {
          memo.set(result.dcmBswmdPath, result);
        } else {
          for (const p of pathsSnapshot) memo.set(p, result);
        }
        setBswmdHasDcm(cachedAggregate());
      })
      .catch(() => {
        if (cancelled) return;
        // Fail-soft: UX gate stays closed; real errors surface later
        // via the `'bswmd-unreadable'` IPC error class at click time.
        for (const p of pathsSnapshot) memo.set(p, { hasDcm: false });
        setBswmdHasDcm({ hasDcm: false });
      });
    return () => {
      cancelled = true;
    };
    // bswmdPaths is the sole trigger: re-parse when the project's
    // BSWMD list actually changes. locale is intentionally NOT in the
    // dep array — bswmdHasDcm is independent of locale, and adding
    // it would surface a fresh `bswmdHasDcm` aggregate on every locale
    // toggle for no UX benefit (and risks the same render-loop trap
    // as `?? []` if a future fix lets locale change trigger state).
  }, [bswmdPaths]);

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
            // v1.32.0 T5 — surface the autofill so <DcmConfigSuccessDialog />
            // (T7) can render the "auto-selected from project manifest"
            // line. Always recorded on success regardless of entry path
            // (promptAndOpen shortcut vs handlePickerResolve).
            bswmdPathAutofill: args.bswmdPath ?? null,
            // v1.32.0 T5 fix — clear any stale status message (e.g.
            // 'dcmConfig.picker.cancelled') from a prior cancel that
            // transitioned through idle before the user re-fired the
            // IPC. App.tsx reads statusMessage off the success/error
            // states for no-op cleanup.
            statusMessage: null,
            // v1.33.1 PATCH — TODO(v1.33.1 T2): replace with args.odxPath on success
            lastOdxPath: null,
          });
        } else {
          const message = res.error.message;
          // v1.32.0 MINOR T2 — classifyError reads DcmConfigError.kind
          // FIRST. We pass the whole `res.error` object, not just
          // `message`, so the discriminator has a stable home.
          const errorForClassify: DcmConfigError = res.error as DcmConfigError;
          const toastKey = toToastClassKey(classifyError(errorForClassify));
          setState({
            mode: 'error',
            result: null,
            error: { message, classKey: toastKey },
            dialogOpen: false,
            toastVisible: true,
            bswmdPathAutofill: null,
            statusMessage: null,
            // v1.33.1 PATCH — error/throw paths reset lastOdxPath to null
            // (no successful invocation captured since prior success). T2 may
            // refine this to preserve the prior value.
            lastOdxPath: null,
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
          bswmdPathAutofill: null,
          statusMessage: null,
          // v1.33.1 PATCH — see error-branch comment above; bridge-throw
          // path also resets lastOdxPath to null (no successful
          // invocation captured). T2 may refine this to preserve.
          lastOdxPath: null,
        });
      } finally {
        inFlightRef.current = false;
      }
    },
    [],
  );

  // v1.32.0 T5 — top-level entry. Decides picker-vs-shortcut based on
  // the active document. Both branches funnel through the existing
  // `open` IPC call so the in-flight guard + classifier + error
  // envelope remain a single source of truth.
  const promptAndOpen = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return;
    if (!bswmdHasDcm.hasDcm) return;
    if (isActiveOdx && activeDocumentPath !== null) {
      // Shortcut: an .odx doc is already loaded — skip picker, fire
      // open() directly. The T5 autofill pipes the T4-discovered
      // bswmdPath into the IPC payload so the handler skips its
      // sample-fixture walk-up.
      // v1.33.0 MINOR T5 — xlsxRows sourced from xlsxLastImport store
      // slice (lesson store-as-source-of-truth-for-async-args). The
      // empty `[]` placeholder from v1.31.x+v1.32.x is gone.
      // v1.33.1 PATCH — bswmdPathOverride removed; bswmdPath is plain
      // autofill (override UI deleted in T3).
      await open({
        odxPath: activeDocumentPath,
        xlsxRows: useArxmlStore.getState().xlsxLastImport?.rows ?? [],
        bswmdPath: bswmdHasDcm.dcmBswmdPath,
      });
      return;
    }
    // No active .odx — switch to the picker substate. App.tsx renders
    // <DcmConfigPicker/> on top of this state and calls
    // handlePickerResolve(odxPath) on user choice (or handlePickerCancel
    // on dismiss).
    setState((prev) => ({ ...prev, mode: 'picking-odx' }));
  }, [bswmdHasDcm, isActiveOdx, activeDocumentPath, open]);

  // v1.32.0 T5 — picker resolve callback. The <DcmConfigPicker />
  // component calls this with the OS-picked .odx path. We transition
  // to `pending` so the spinner renders, then fire the IPC.
  // v1.33.0 MINOR T5 — xlsxRows sourced from xlsxLastImport store
  // slice identically to the shortcut path (lesson
  // store-as-source-of-truth-for-async-args).
  // v1.33.1 PATCH — bswmdPathOverride removed.
  const handlePickerResolve = useCallback(
    async (odxPath: string): Promise<void> => {
      await open({
        odxPath,
        xlsxRows: useArxmlStore.getState().xlsxLastImport?.rows ?? [],
        bswmdPath: bswmdHasDcm.dcmBswmdPath,
      });
    },
    [bswmdHasDcm.dcmBswmdPath, open],
  );

  // v1.32.0 T5 — picker cancel callback. Returns mode to idle; the
  // app-level `<DcmConfigPicker />` unmounts because App.tsx gates
  // it on `state.mode === 'picking-odx'`. Surfaces the i18n key
  // `dcmConfig.picker.cancelled` via `state.statusMessage` so App.tsx
  // can render the localized "cancelled" toast (T7 ships the catalog
  // string). Reviewer flagged the prior drop-only behavior (mode→idle
  // with no status) as unverified UX; this restores the brief's
  // Step 5.3 contract and is guarded by the new 4th test.
  const handlePickerCancel = useCallback((): void => {
    setState((prev) => ({
      ...prev,
      mode: 'idle',
      statusMessage: 'dcmConfig.picker.cancelled',
    }));
  }, []);

  const closeDialog = useCallback((): void => {
    setState((prev) => ({ ...prev, mode: 'idle', dialogOpen: false }));
  }, []);

  const dismissToast = useCallback((): void => {
    setState((prev) => ({ ...prev, mode: 'idle', toastVisible: false, error: null }));
  }, []);

  return {
    state,
    bswmdHasDcm,
    isActiveOdx,
    open,
    promptAndOpen,
    handlePickerResolve,
    handlePickerCancel,
    closeDialog,
    dismissToast,
  };
}
