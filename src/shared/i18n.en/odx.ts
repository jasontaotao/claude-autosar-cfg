// i18n — en bundle: odx cluster.

import type { OdxMessages } from '../i18n/odx.js';

export const OdxEn: OdxMessages = {
  'odx.viewer.title': 'ODX-D',
  'odx.viewer.close': 'Close',
  'odx.viewer.tabs.dtc': 'DTCs',
  'odx.viewer.tabs.did': 'DIDs',
  'odx.viewer.tabs.routine': 'Routines',
  'odx.viewer.stats.dtc': '{count} DTCs',
  'odx.viewer.stats.did': '{count} DIDs',
  'odx.viewer.stats.routine': '{count} Routines',
  'odx.viewer.dtc.id': 'ID',
  'odx.viewer.dtc.name': 'DOP name',
  'odx.viewer.dtc.code': 'Trouble code',
  'odx.viewer.dtc.text': 'Diagnostic text',
  'odx.viewer.did.id': 'ID',
  'odx.viewer.did.name': 'Name',
  'odx.viewer.routine.id': 'ID',
  'odx.viewer.routine.name': 'Name',
  'odx.viewer.empty': 'No {kind} in this ODX file.',
  'odx.viewer.errorTitle': 'ODX parse failed',
  'odx.open.failed': 'Open ODX failed: {message}',
  'odx.parse.failed': 'Parse ODX failed: {message}',
  // v1.31.0 PATCH — Dcm config renderer UX
  'odx.export.dcmConfig.success.title': 'Dcm Config Generated',
  'odx.export.dcmConfig.success.body':
    'Generated Dcm config: {dspCount} DIDs + {routineCount} routines, {appliedStepCount} steps applied',
  'odx.export.dcmConfig.success.close': 'Close',
  'odx.export.dcmConfig.error.bswmdUnreadable': 'Cannot read BSWMD file: {message}',
  'odx.export.dcmConfig.error.odxUnreadable': 'Cannot read ODX file: {message}',
  'odx.export.dcmConfig.error.odxParseFailed': 'ODX parse failed: {message}',
  'odx.export.dcmConfig.error.bswmdMapMissing': 'BSWMD missing Dcm module: {message}',
  // v1.41.0 MINOR T3 (M3) — typed envelope for the
  // `locateDcmBswmdPath` sample-fixture miss. Pre-T3 fell through to
  // the catch-all 'unexpected' bucket; post-T3 surfaces the actual
  // fixture-discovery-failure message so the user can act on it
  // (check the repo layout / vendor-package the demo-ecu fixture).
  'odx.export.dcmConfig.error.noDcmBswmdFixture': 'Dcm BSWMD fixture not found: {message}',
  'odx.export.dcmConfig.error.atomicWriteFailed': 'Write failed: {message}',
  'odx.export.dcmConfig.error.unexpected': 'Unexpected error: {message}',
  'odx.export.dcmConfig.error.dismiss': 'Dismiss',
  // v1.35.0 MINOR T2 — 4 NEW keys for formerly-collapsed kinds.
  'odx.export.dcmConfig.error.odxDcmLinkage': 'ODX-Dcm linkage broken: {message}',
  'odx.export.dcmConfig.error.dcmModuleMissing': 'BSWMD missing Dcm module: {message}',
  'odx.export.dcmConfig.error.containerNotFound': 'BSWMD container not found: {message}',
  'odx.export.dcmConfig.error.patchFailed': 'Patch application failed: {message}',
  'dcmConfig.action.generate': 'Generate Dcm Config',
  'dcmConfig.action.generateAria': 'Generate Dcm Config for {name}',
  'dcmConfig.error.noDcmBswmd': 'Requires a Dcm BSWMD to be loaded',
  'app.open.dcmConfig': 'Open Dcm Config',
  'app.open.dcmConfig.busy': 'Generating…',
  // v1.32.0 MINOR T7 — ODX-D picker + bswmdPath autofill label
  // (picker.title removed in v1.32.1 PATCH P3 — unused, OS owns the title).
  'dcmConfig.picker.cancelled': 'ODX selection cancelled',
  'dcmConfig.bswmdPath.autofill': 'Auto-selected from project manifest',
  // v1.33.0 MINOR T7 — applied step count surface (SuccessDialog).
  'dcmConfig.appliedCount.summary': 'Applied {count} xlsx rows',
  // v1.33.1 PATCH T3 — "Generate New" button.
  'dcmConfig.generateNew.button': 'Generate New',
  // v1.36.0 MINOR T4 — Generate New destructive confirm modal labels.
  'dcmConfig.generateNew.confirm.title': 'Regenerate Dcm Config?',
  'dcmConfig.generateNew.confirm.message':
    'Re-fire dcm:config with the new BSWMD: {path}. This overwrites the previous output file.',
  'dcmConfig.generateNew.confirm.confirm': 'Regenerate',
  'dcmConfig.generateNew.confirm.cancel': 'Cancel',
  // v1.34.0 MINOR T2 — Xlsx import history surface.
  'xlsxImportHistory.title': 'Xlsx import history',
  'xlsxImportHistory.empty': 'No prior imports this session',
  'xlsxImportHistory.rowsCount': '{count} rows',
  'xlsxImportHistory.reuseButton': 'Reuse',
};
