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
import type { PanelId } from '../../panels/registry.js';

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
  // v1.21.0 Bug #5 — "File Operations → Open DBC…" menu entry. The
  // parent (App.tsx) owns the parse state machine and the modal; the
  // header just forwards the click. `dbcBusy` is the in-flight gate
  // (true while `openDbc → parseDbc` round-trip is in progress) so
  // the menu entry's `disabled` is scoped to DBC busy only — ARXML
  // save / open in-flight does not block DBC open (Bug #5 code-review
  // MEDIUM decoupling).
  readonly onOpenDbc: () => void;
  readonly dbcBusy: boolean;
  // v1.22.0 T3 — "File Operations → Open ODX…" menu entry. Mirrors
  // the DBC pattern: parent (App.tsx) owns the parse state machine
  // + the OdxViewer modal; AppHeader just forwards the click.
  // `odxBusy` is the in-flight gate (true while `openOdx → parseOdx`
  // round-trip is in progress) — decoupled from `dbcBusy` so
  // concurrent operations don't block each other (T3 code-review
  // MEDIUM decoupling).
  readonly onOpenOdx: () => void;
  readonly odxBusy: boolean;
  // v1.58.0 — explicit one-shot "Import ODX-D → Diagnostic Extract" entry.
  // The host picks/parses the ODX-D file and immediately invokes the
  // existing diagnostic-extract IPC; AppHeader only forwards intent.
  readonly onImportOdxExtract?: () => void;
  readonly odxExtractBusy?: boolean;  // v1.23.0 T4 — "File Operations → Import DBC → Com Stack…" menu
  // entry. The parent (App.tsx) owns the openDbc → parseDbc round
  // trip + the DbcImportWizard state machine + the v1.23.0 T3 IPC
  // apply handler. AppHeader just forwards the click + renders the
  // icon + label. `dbcImportBusy` is the in-flight gate (true while
  // the openDbc → parseDbc round-trip is in progress OR the wizard's
  // apply is running) — decoupled from `dbcBusy` (read-only viewer)
  // and `odxBusy` so the three importer/viewer operations can run
  // independently without false-disabled menu entries.
  readonly onOpenDbcImport: () => void;
  readonly dbcImportBusy: boolean;
  // v1.25.0 T5 — "File Operations → Batch create ECUC from Excel…"
  // menu entry. The parent (App.tsx) owns the XlsxBatchWizard open
  // flag + the 3-IPC pipeline (writeBatchTemplate / parseBatch /
  // commitBatch) — AppHeader just forwards the click + renders the
  // icon + label. `xlsxBatchBusy` is the in-flight gate (true while
  // any of the 3 IPC round-trips is in progress) so a user can't
  // double-open the wizard while the previous instance is still
  // resolving. Decoupled from `dbcImportBusy` / `odxBusy` so the
  // 3 importer surfaces (DBC / ODX / XLSX) can run independently.
  readonly onOpenXlsxBatch: () => void;
  readonly xlsxBatchBusy: boolean;
  // v1.31.0 PATCH — "File Operations → Open Dcm Config…" menu entry.
  // Mirrors the DBC / ODX / XLSX pattern: parent (App.tsx) owns the
  // launcher hook + the modal/toast state; AppHeader just forwards
  // the click + renders the icon + label. `dcmConfigBusy` is the
  // in-flight gate (true while the dcm:config IPC round-trip is in
  // progress) — decoupled from the other importer/viewer busy flags
  // so the 4 importer surfaces (DBC / ODX / XLSX / DCM-CONFIG) can
  // run independently without false-disabled menu entries.
  readonly onOpenDcmConfig: () => void;
  readonly canOpenDcmConfig: boolean;
  readonly dcmConfigBusy: boolean;
  // P3 Dock 工作台 (spec §5.6) — View menu callbacks. AppHeader forwards
  // the clicks to App which wires them to the DockviewApi.
  readonly onTogglePanel?: (panelId: PanelId) => void;
  readonly onResetLayout?: () => void;
}
