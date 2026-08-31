// i18n — en bundle: dbc cluster.

import type { DbcMessages } from '../i18n/dbc.js';

export const DbcEn: DbcMessages = {
  // DbcViewer
  'dbc.viewer.title': 'DBC Network',
  'dbc.viewer.close': 'Close',
  'dbc.viewer.version': 'Version',
  'dbc.viewer.nodes': 'Nodes',
  'dbc.viewer.messages': 'Messages',
  'dbc.viewer.column.id': 'ID',
  'dbc.viewer.column.name': 'Name',
  'dbc.viewer.column.dlc': 'DLC',
  'dbc.viewer.column.transmitter': 'Transmitter',
  'dbc.viewer.column.signals': 'Signals',
  'dbc.viewer.column.frame': 'Frame',
  'dbc.viewer.frame.standard': 'Std',
  'dbc.viewer.frame.extended': 'Ext',
  'dbc.viewer.errorTitle': 'DBC parse failed',
  'dbc.open.failed': 'Open DBC failed: {message}',
  'dbc.parse.failed': 'Parse DBC failed: {message}',

  // v1.23.0 MINOR T4 — DBC→Com-Stack 3-step wizard
  'dbc.import.wizard.title': 'Import DBC → Com Stack',
  'dbc.import.step.preview': 'Preview mapping',
  'dbc.import.step.confirm': 'Confirm apply',
  'dbc.import.menu.label': 'Import DBC → Com Stack…',
  'dbc.import.select.button': 'Select DBC file…',
  'dbc.import.preview.messages': '{count} messages will be imported',
  'dbc.import.preview.next': 'Next',
  'dbc.import.confirm.warning':
    'This will write 3 ARXML files (Com / CanIf / PduR) atomically for target node {targetNode}.',
  'dbc.import.confirm.apply': 'Apply',
  'dbc.import.confirm.applying': 'Applying…',
  'dbc.import.close': 'Close',
  'dbc.import.error.read': 'Failed to read DBC file: {message}',
  'dbc.import.error.bridge': 'Bridge mapping failed: {message}',
  'dbc.import.error.write': 'Failed to write 3 ARXML files: {message}',
  // v1.23.1 T1 code-review MEDIUM-1 — see i18n.ts for the rationale.
  // The {message} placeholder interpolates the underlying error
  // (e.g. EACCES, EBUSY) and the parenthetical tells the user the
  // outcome so they know whether retrying is safe (rolledBack=true)
  // or whether they need to audit git status (partial rollback).
  'dbc.import.error.write.rolledBack':
    'Failed to write 3 ARXML files: {message} (rolled back — project unchanged, please retry)',
  'dbc.import.error.write.partial':
    'Failed to write 3 ARXML files: {message} (rolled back partially — please check git status)',
  'dbc.import.success': 'Successfully imported {count} messages',

  // v1.24.0 MINOR T3 — ODX→Diagnostic Extract export UI.
  'odx.export.diagnosticExtract.button': 'Export Diagnostic Extract',
  'odx.export.diagnosticExtract.exporting': 'Exporting…',
  'odx.export.diagnosticExtract.success.title': 'Diagnostic Extract Exported',
  'odx.export.diagnosticExtract.success.body':
    'Generated {dtcCount} DemEvents, {didCount} DIDs, {routineCount} Routines.',
  'odx.export.diagnosticExtract.error': 'Export failed: {error}',
  // v1.24.0 T3.1 — mirrors the v1.23.1 T1 MEDIUM-1 DBC wizard
  // 2-key split. The {message} placeholder interpolates the
  // underlying error (e.g. EACCES, EBUSY) and the parenthetical
  // tells the user the outcome so they know whether retrying is
  // safe (rolledBack=true) or whether they need to audit git
  // status (partial rollback).
  'odx.export.diagnosticExtract.error.write.rolledBack':
    'Export diagnostic extract failed: {message} (rolled back — project unchanged, please retry)',
  'odx.export.diagnosticExtract.error.write.partial':
    'Export diagnostic extract failed: {message} (rolled back partially — please check git status)',
};
