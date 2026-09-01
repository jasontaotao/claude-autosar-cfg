// i18n — DBC cluster types.
//
// Contains all `dbc.*` keys covering the read-only DbcViewer modal
// AND the v1.23.0 DBC→Com-Stack 3-step wizard (T4) + the v1.23.1 T1
// 2-phase write diagnostic (rolledBack / partial split).

export interface DbcMessages {
  // --- v1.21.0 Bug #5 — DbcViewer read-only modal ---
  readonly 'dbc.viewer.title': string;
  readonly 'dbc.viewer.close': string;
  readonly 'dbc.viewer.version': string;
  readonly 'dbc.viewer.nodes': string;
  readonly 'dbc.viewer.messages': string;
  readonly 'dbc.viewer.column.id': string;
  readonly 'dbc.viewer.column.name': string;
  readonly 'dbc.viewer.column.dlc': string;
  readonly 'dbc.viewer.column.transmitter': string;
  readonly 'dbc.viewer.column.signals': string;
  readonly 'dbc.viewer.column.frame': string;
  readonly 'dbc.viewer.frame.standard': string;
  readonly 'dbc.viewer.frame.extended': string;
  readonly 'dbc.viewer.errorTitle': string;
  readonly 'dbc.open.failed': string; // {message}
  readonly 'dbc.parse.failed': string; // {message}

  // --- v1.23.0 MINOR T4 — DBC→Com-Stack 3-step wizard ---
  readonly 'dbc.import.wizard.title': string;
  readonly 'dbc.import.step.preview': string;
  readonly 'dbc.import.step.confirm': string;
  readonly 'dbc.import.menu.label': string;
  readonly 'dbc.import.select.button': string;
  readonly 'dbc.import.preview.messages': string; // {count}
  readonly 'dbc.import.preview.search': string;
  readonly 'dbc.import.preview.filter.all': string;
  readonly 'dbc.import.preview.filter.standard': string;
  readonly 'dbc.import.preview.filter.extended': string;
  readonly 'dbc.import.preview.noMatches': string;
  readonly 'dbc.import.preview.table.name': string;
  readonly 'dbc.import.preview.table.id': string;
  readonly 'dbc.import.preview.table.frame': string;
  readonly 'dbc.import.preview.table.dlc': string;
  readonly 'dbc.import.preview.table.transmitter': string;
  readonly 'dbc.import.preview.table.signals': string;
  readonly 'dbc.import.preview.next': string;
  readonly 'dbc.import.confirm.warning': string; // {targetNode}
  readonly 'dbc.import.confirm.apply': string;
  readonly 'dbc.import.confirm.applying': string;
  readonly 'dbc.import.close': string;
  readonly 'dbc.import.error.read': string; // {message}
  readonly 'dbc.import.error.bridge': string; // {message}
  readonly 'dbc.import.error.write': string; // {message}
  // v1.23.1 T1 — 2-phase write reports `rolledBack` so the user knows
  // whether the project is in a clean state (rolledBack=true) or
  // partially-bridged (rolledBack=false — they need to check git
  // status). Split into 2 keys to keep the localiser in control of
  // the user-facing diagnostic (replaces the hardcoded English
  // template-string concatenation in App.tsx:841-842 flagged by
  // code-review as MEDIUM-1).
  readonly 'dbc.import.error.write.rolledBack': string; // {message}
  readonly 'dbc.import.error.write.partial': string; // {message}
  readonly 'dbc.import.warning.noChanges': string;
  readonly 'dbc.import.error.noMessages': string;
  readonly 'dbc.import.success': string; // {count}

  // --- v1.24.0 MINOR T3 — ODX→Diagnostic Extract export UI ---
  // v1.23.0 T4 placed DBC-cluster UI strings here (not a separate
  // `odx.*` cluster) because the keys describe the same DBC-import
  // flow. T3 keeps the same pattern: these keys drive the new
  // Export Diagnostic Extract button in OdxViewer + the success
  // dialog that surfaces 2 ARXML file paths + counts after the
  // T2 IPC handler returns ok=true.
  readonly 'odx.import.diagnosticExtract.menu.label': string;
  readonly 'odx.export.diagnosticExtract.button': string;
  readonly 'odx.export.diagnosticExtract.exporting': string;
  readonly 'diagExtract.openInWorkspace.button': string;
  readonly 'odx.export.diagnosticExtract.success.title': string;
  readonly 'odx.export.diagnosticExtract.success.body': string; // {dtcCount} {didCount} {routineCount}
  readonly 'odx.export.diagnosticExtract.error': string; // {error}
  // v1.24.0 T3.1 — 2-phase write reports `rolledBack` so the user knows
  // whether the project is in a clean state (rolledBack=true) or
  // whether partial state may remain on disk (rolledBack=false).
  // Mirrors the v1.23.1 T1 MEDIUM-1 fix shape from the DBC wizard;
  // the alternative (template-string concatenation with hardcoded
  // English parenthetical) breaks zh-CN users per the v1.23.1 T1 L1
  // i18n-bypass anti-pattern lesson.
  readonly 'odx.export.diagnosticExtract.error.write.rolledBack': string; // {message}
  readonly 'odx.export.diagnosticExtract.error.write.partial': string; // {message}
}
