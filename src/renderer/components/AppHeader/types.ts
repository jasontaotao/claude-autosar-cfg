// v1.18.6 PATCH — extracted from AppHeader.tsx (lines 49-79).
//
// Public types stay public (re-exported from the parent file); internal
// types stay internal to the subdir module graph. C13 Option B split 2/2:
// keeps the parent file as the entry point for callers; no barrel
// re-export added.

export interface AppHeaderState {
  readonly busy: boolean;
}

export const INITIAL: AppHeaderState = { busy: false };

/**
 * Sprint 14 / Task 11 — props for `AppHeader` (the menu dropdown trigger).
 *
 * The `onEcucModuleSelect` callback is invoked when the user clicks the new
 * "ECUC Module Selection…" entry under the `fileOps` group (T11). The host
 * (App.tsx) owns the picker open/close state and the `useCreateEcucFromBswmd`
 * orchestration — AppHeader only flips the menu closed and forwards the
 * intent. `canSelectEcucModule` is the disabled-state predicate (BSWMD
 * loaded AND a project is open) sourced from the store by the parent.
 *
 * Rationale: explicit props keep this component testable in isolation
 * (matches the existing `useProjectActions` injection pattern in `ProjectPanel`)
 * and avoid coupling AppHeader to the ECUC-picker state machine.
 *
 * Sprint 14 / Phase C (T14) — ScriptPanel toggle. The parent owns
 * the open flag so it can keep `ScriptPanel` mount conditional
 * (lazy CodeMirror bundle). The button below flips it.
 */
export interface AppHeaderProps {
  readonly onEcucModuleSelect: () => void;
  readonly canSelectEcucModule: boolean;
  readonly scriptPanelOpen: boolean;
  readonly onToggleScriptPanel: () => void;
  // v1.21.0 MINOR T1 — BSW code generator GUI entry. The parent
  // (App.tsx) owns the `useGenerateCode` hook (so it can write the
  // success/failure toast to the global ErrorBanner). AppHeader
  // just flips the button enabled-state and forwards the click.
  // `canGenerate` is the disabled-state predicate — true when a
  // project is open (the BSW generator requires a manifest path).
  readonly onGenerate: () => void;
  readonly canGenerate: boolean;
  readonly generateBusy: boolean;
}
