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
  readonly 'dbc.viewer.errorTitle': string;
  readonly 'dbc.open.failed': string; // {message}
  readonly 'dbc.parse.failed': string; // {message}

  // --- v1.23.0 MINOR T4 — DBC→Com-Stack 3-step wizard ---
  readonly 'dbc.import.wizard.title': string;
  readonly 'dbc.import.step.preview': string;
  readonly 'dbc.import.step.confirm': string;
  readonly 'dbc.import.menu.label': string;
  readonly 'dbc.import.menu.icon': string;
  readonly 'dbc.import.select.button': string;
  readonly 'dbc.import.preview.messages': string; // {count}
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
  readonly 'dbc.import.success': string; // {count}
}
