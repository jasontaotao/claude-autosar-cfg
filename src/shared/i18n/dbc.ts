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

  // --- v1.56.0 Task 13 — 4-step full-import wizard (source-target →
  // policy → preview → apply). All keys the wizard resolves via t(). ---
  readonly 'dbc.import.step.sourceTarget': string;
  readonly 'dbc.import.step.policy': string;
  readonly 'dbc.import.step.apply': string;
  readonly 'dbc.import.pick.picking': string;
  readonly 'dbc.import.pick.another': string;
  readonly 'dbc.import.source.path': string;
  readonly 'dbc.import.source.node.label': string; // DBC BU_ 名称
  readonly 'dbc.import.source.node.empty': string;
  readonly 'dbc.import.source.discovering': string;
  readonly 'dbc.import.policy.profile': string;
  readonly 'dbc.import.policy.pduId.title': string;
  readonly 'dbc.import.policy.pduId.txBase': string;
  readonly 'dbc.import.policy.pduId.rxBase': string;
  readonly 'dbc.import.policy.pduId.step': string;
  readonly 'dbc.import.policy.pduId.order': string;
  readonly 'dbc.import.policy.pduId.order.document': string;
  readonly 'dbc.import.policy.pduId.order.shortName': string;
  readonly 'dbc.import.policy.ul.title': string;
  readonly 'dbc.import.policy.ul.enabled': string;
  readonly 'dbc.import.policy.ul.txTemplate': string;
  readonly 'dbc.import.policy.ul.rxTemplate': string;
  readonly 'dbc.import.policy.reparsing': string;
  readonly 'dbc.import.preview.stats.messages': string; // {count}
  readonly 'dbc.import.preview.stats.signals': string; // {count}
  readonly 'dbc.import.preview.stats.skippedIrrelevant': string; // {count}
  readonly 'dbc.import.preview.stats.skippedMultiplexed': string; // {count}
  readonly 'dbc.import.preview.warnings.title': string; // {count}
  readonly 'dbc.import.preview.dirty.saveFirst': string;
  readonly 'dbc.import.preview.table.module': string;
  readonly 'dbc.import.preview.table.path': string;
  readonly 'dbc.import.preview.table.category': string;
  readonly 'dbc.import.preview.table.decision': string;
  readonly 'dbc.import.preview.row.expand': string;
  readonly 'dbc.import.preview.row.collapse': string;
  readonly 'dbc.import.preview.diff.local': string;
  readonly 'dbc.import.preview.diff.incoming': string;
  readonly 'dbc.import.preview.diff.source': string;
  readonly 'dbc.import.preview.noRows': string;
  readonly 'dbc.import.category.added': string;
  readonly 'dbc.import.category.updated': string;
  readonly 'dbc.import.category.locallyModified': string;
  readonly 'dbc.import.category.conflict': string;
  readonly 'dbc.import.category.converged': string;
  readonly 'dbc.import.category.removedInDbc': string;
  readonly 'dbc.import.decision.import': string;
  readonly 'dbc.import.decision.keepLocal': string;
  readonly 'dbc.import.decision.delete': string;
  readonly 'dbc.import.action.back': string;
  readonly 'dbc.import.action.commit': string;
  readonly 'dbc.import.action.committing': string;
  readonly 'dbc.import.apply.title': string;
  readonly 'dbc.import.apply.body': string; // {applied} {kept} {deleted}
  readonly 'dbc.import.apply.manifest': string; // {path}
  readonly 'dbc.import.apply.finish': string;
  // §12 error closed set — each kind gets its own localized label.
  readonly 'dbc.import.error.dbc-malformed': string;
  readonly 'dbc.import.error.dbc-too-large': string;
  readonly 'dbc.import.error.dbc-no-messages': string;
  readonly 'dbc.import.error.dbc-target-node-invalid': string;
  readonly 'dbc.import.error.dbc-profile-not-found': string;
  readonly 'dbc.import.error.dbc-bswmd-not-loaded': string;
  readonly 'dbc.import.error.dbc-module-ambiguous': string;
  readonly 'dbc.import.error.dbc-target-dirty': string;
  readonly 'dbc.import.error.dbc-commit-mismatch': string;
  readonly 'dbc.import.error.read-failed': string;
  readonly 'dbc.import.error.write-failed': string;
  readonly 'dbc.import.error.write-failed.rolledBack': string;
  readonly 'dbc.import.error.write-failed.partial': string;
  readonly 'dbc.import.error.unexpected': string;
  // §11 warning closed set — 18 codes, each with a localized label.
  readonly 'dbc.import.warning.dbc-duplicate-message-name': string;
  readonly 'dbc.import.warning.dbc-duplicate-signal-name': string;
  readonly 'dbc.import.warning.dbc-invalid-can-id': string;
  readonly 'dbc.import.warning.dbc-invalid-dlc': string;
  readonly 'dbc.import.warning.dbc-message-missing-transmitter': string;
  readonly 'dbc.import.warning.dbc-unsupported-byte-order': string;
  readonly 'dbc.import.warning.dbc-unsupported-value-type': string;
  readonly 'dbc.import.warning.dbc-attribute-unavailable': string;
  readonly 'dbc.import.warning.dbc-bswmd-def-missing': string;
  readonly 'dbc.import.warning.dbc-param-type-mismatch': string;
  readonly 'dbc.import.warning.dbc-enum-unmapped': string;
  readonly 'dbc.import.warning.dbc-reference-missing': string;
  readonly 'dbc.import.warning.dbc-policy-default-used': string;
  readonly 'dbc.import.warning.dbc-policy-unmapped': string;
  readonly 'dbc.import.warning.dbc-pdu-id-conflict': string;
  readonly 'dbc.import.warning.dbc-short-name-legalized': string;
  readonly 'dbc.import.warning.dbc-multiplexed-signal': string;
  readonly 'dbc.import.warning.dbc-manifest-ignored': string;

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
