// i18n — App cluster types.
//
// Contains all `app.*` keys covering the AppHeader chrome, project
// tab, doc tabs, save / save-all flow, ARIA labels, locale toggle,
// and the BSW generate GUI + DBC import wizard menu entries.
//
// Kept as a `readonly` interface so the locale bundles must satisfy
// each key with a `string` literal.

export interface AppMessages {
  // --- app header ---
  readonly 'app.open': string;
  readonly 'app.save': string;
  readonly 'app.saveDirty': string;
  readonly 'app.saveAll': string;
  readonly 'app.saveAllDirty': string; // {count}
  readonly 'app.saveAllTitle': string;
  readonly 'app.saveAllDirtyTitle': string; // {count}
  readonly 'app.saveAllDone': string; // {count}
  readonly 'app.saveAllPartial': string; // {saved}, {failed}, {firstError}

  // --- P2 save hierarchy (spec §4.2) ---
  readonly 'app.saveMore': string;

  // --- P2 panel error card (spec §4.1) ---
  readonly 'panel.error.title': string;
  readonly 'panel.error.retry': string;
  readonly 'panel.error.copyDetails': string;
  readonly 'panel.error.copied': string;
  readonly 'panel.error.close': string;

  // --- P2 app-level error page (spec §4.1) ---
  readonly 'app.errorPage.title': string;
  readonly 'app.errorPage.copyStack': string;
  readonly 'app.errorPage.reset': string;
  readonly 'app.errorPage.feedback': string;

  // --- P2 editor empty state (spec §4.2) ---
  readonly 'editor.empty.title': string;
  readonly 'editor.empty.hint': string;
  readonly 'editor.empty.newProject': string;
  readonly 'app.save.error.permission-denied': string;
  readonly 'app.save.error.disk-full': string;
  readonly 'app.save.error.path-not-found': string;
  readonly 'app.save.error.serialize-failed': string;
  readonly 'app.save.error.write-failed': string; // {message}
  readonly 'app.save.error.unknown': string; // {message}
  readonly 'app.save.error.invalid-path': string;
  readonly 'app.project.new': string;
  readonly 'app.project.open': string;
  readonly 'app.project.save': string;
  readonly 'app.project.chipLabel': string;
  readonly 'app.project.closeAria': string; // {name}
  readonly 'app.project.saveBlockedDirty': string; // {count}
  readonly 'app.docTab.ariaLoaded': string;
  readonly 'app.docTab.closeAria': string; // {name}
  readonly 'app.docNameDirtyMark': string;
  readonly 'app.docVersion': string; // {version}
  readonly 'app.versionLabel': string; // v{version}
  readonly 'app.prompt.projectName': string;
  readonly 'app.prompt.defaultName': string;
  readonly 'app.error.openFailed': string; // {message}
  readonly 'app.error.saveFailed': string; // {message}
  readonly 'app.error.newProjectFailed': string; // {message}
  readonly 'app.error.openProjectFailed': string; // {message}
  readonly 'app.error.saveProjectFailed': string; // {message}
  readonly 'app.error.openProjectParse': string; // {message}
  readonly 'app.error.readBswmdFailed': string; // {message}
  readonly 'app.error.parseBswmdFailed': string; // {message}
  readonly 'app.error.openProjectMissingArxml': string; // {paths} — Session 240 / Bug 5 — manifest entries the IPC bundle did not deliver
  readonly 'app.error.duplicateBswmd': string; // {path}
  readonly 'app.error.removeBswmdFromDisk': string; // {message}
  readonly 'app.error.needProject': string;
  readonly 'app.error.dismissAria': string;
  readonly 'app.error.warningAria': string;
  readonly 'app.error.infoAria': string;
  readonly 'app.error.successAria': string;
  readonly 'app.error.copyAria': string;
  readonly 'app.error.copy': string;
  readonly 'app.error.viewAria': string;
  readonly 'app.error.viewHint': string;
  readonly 'app.error.view': string;
  readonly 'app.error.viewerTitle': string;
  readonly 'app.error.viewerCloseAria': string;
  readonly 'app.error.dismissAll': string;
  readonly 'app.error.projectNameEmpty': string;
  readonly 'app.error.projectNameInvalid': string;
  readonly 'app.error.projectNameTooLong': string;
  readonly 'app.menu.project': string;
  readonly 'app.menu.projectManage': string;
  readonly 'app.menu.fileOps': string;
  readonly 'app.open.arxml': string;
  readonly 'app.open.dbc': string;
  readonly 'app.open.odx': string;
  readonly 'app.locale.toggleAria': string; // "Switch language" / "切换语言"
  // Sprint 14 — ECUC ARXML Import (spec §7.5). 18 keys covering the
  // FileListTab [Import…] entry, ModuleSelectionPanel header + collision
  // badge, DiffTable title + 4 resolution labels, commit confirm + 3
  // success/rollback/failure toasts, and an undo button label.
  readonly 'app.import.button': string;
  readonly 'app.import.title': string;
  readonly 'app.import.moduleSelection.title': string;
  readonly 'app.import.collision.badge': string;
  readonly 'app.import.diff.title': string; // {shortName}
  readonly 'app.import.diff.column.existing': string;
  readonly 'app.import.diff.column.incoming': string;
  readonly 'app.import.diff.column.decision': string;
  readonly 'app.import.diff.referenceCount': string; // {count}
  readonly 'app.import.resolution.keepExisting': string;
  readonly 'app.import.resolution.overwrite': string;
  readonly 'app.import.resolution.keepBoth': string;
  readonly 'app.import.resolution.skip': string;
  readonly 'app.import.commit.confirm': string; // {N} {M}
  readonly 'app.import.error.readFailed': string; // {path} {message}
  readonly 'app.import.error.parseFailed': string; // {path} {message}
  readonly 'app.import.error.patchFailed': string; // {path} {message}
  readonly 'app.import.error.noModulesSelected': string;
  readonly 'app.import.error.viewModeLocked': string;
  readonly 'app.import.commit.success': string; // {N} {M}
  readonly 'app.import.commit.rolledBack': string;
  readonly 'app.import.undoLastCommit': string;
  // v1.21.0 MINOR T1 — BSW generate GUI entry
  readonly 'app.generate.button': string;
  readonly 'app.generate.buttonAria': string;
  readonly 'app.generate.success': string; // {count} {outDir}
  readonly 'app.generate.failure': string; // {message}
  readonly 'app.generate.needProject': string;
}
