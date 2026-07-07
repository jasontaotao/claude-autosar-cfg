// i18n — ODX cluster types.
//
// Contains all `odx.*` keys covering the v1.22.0 T2 OdxViewer
// read-only modal (3 tabs: DTC / DID / Routine + stats + error
// envelopes + open / parse failures).

export interface OdxMessages {
  readonly 'odx.viewer.title': string;
  readonly 'odx.viewer.close': string;
  readonly 'odx.viewer.tabs.dtc': string;
  readonly 'odx.viewer.tabs.did': string;
  readonly 'odx.viewer.tabs.routine': string;
  readonly 'odx.viewer.stats.dtc': string; // {count}
  readonly 'odx.viewer.stats.did': string; // {count}
  readonly 'odx.viewer.stats.routine': string; // {count}
  readonly 'odx.viewer.dtc.id': string;
  readonly 'odx.viewer.dtc.name': string;
  readonly 'odx.viewer.dtc.code': string;
  readonly 'odx.viewer.dtc.text': string;
  readonly 'odx.viewer.did.id': string;
  readonly 'odx.viewer.did.name': string;
  readonly 'odx.viewer.routine.id': string;
  readonly 'odx.viewer.routine.name': string;
  readonly 'odx.viewer.empty': string; // {kind}
  readonly 'odx.viewer.errorTitle': string;
  readonly 'odx.open.failed': string; // {message}
  readonly 'odx.parse.failed': string; // {message}
  // v1.31.0 PATCH — Dcm config renderer UX (Success Dialog + Error Toast)
  readonly 'odx.export.dcmConfig.success.title': string;
  readonly 'odx.export.dcmConfig.success.body': string; // {dspCount, routineCount, appliedStepCount}
  readonly 'odx.export.dcmConfig.success.close': string;
  readonly 'odx.export.dcmConfig.error.bswmdUnreadable': string; // {message}
  readonly 'odx.export.dcmConfig.error.odxUnreadable': string; // {message}
  readonly 'odx.export.dcmConfig.error.odxParseFailed': string; // {message}
  readonly 'odx.export.dcmConfig.error.bswmdMapMissing': string; // {message}
  readonly 'odx.export.dcmConfig.error.atomicWriteFailed': string; // {message}
  readonly 'odx.export.dcmConfig.error.unexpected': string; // {message}
  readonly 'odx.export.dcmConfig.error.dismiss': string;
  readonly 'dcmConfig.action.generate': string;
  readonly 'dcmConfig.action.generateAria': string; // {name}
  readonly 'dcmConfig.error.noDcmBswmd': string;
  readonly 'app.open.dcmConfig': string;
  readonly 'app.open.dcmConfig.busy': string;
  // v1.32.0 MINOR T7 — ODX-D picker + bswmdPath autofill label
  // (picker.title dropped in v1.32.1 PATCH P3 — OS dialog title is owned
  // by openOdxHandler.ts:30, picker returns null so no DOM surface).
  readonly 'dcmConfig.picker.cancelled': string;
  readonly 'dcmConfig.bswmdPath.autofill': string;
  // v1.33.0 MINOR T7 — applied step count surface in SuccessDialog.
  // Rendered only when result.appliedStepCount > 0; the dialog
  // omits the <p> entirely otherwise (no empty placeholder).
  readonly 'dcmConfig.appliedCount.summary': string; // {count}
  // v1.33.1 PATCH T3 — "Generate New" button (replaces deleted
  // v1.33.0 Override <details> + Browse/Clear UI). Wired to
  // launcher.handleGenerateNew which re-fires dcm:config with the
  // captured lastOdxPath.
  readonly 'dcmConfig.generateNew.button': string;
  // v1.34.0 MINOR T2 — Xlsx import history surface. Read-only
  // timeline of past xlsx imports (cap-5, prepend-first per
  // v1.33.0 slice invariant). Each row exposes a Reuse button
  // that calls props.onReuse(importedAt) — the parent
  // DcmConfigSuccessDialog owns the history → store binding.
  readonly 'xlsxImportHistory.title': string;
  readonly 'xlsxImportHistory.empty': string;
  readonly 'xlsxImportHistory.rowsCount': string; // {count}
  readonly 'xlsxImportHistory.reuseButton': string;
}
