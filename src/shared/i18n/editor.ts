// i18n — Editor cluster types.
//
// Contains `tree.*`, `editor.*`, `params.*`, `ecuc.*`, `arxmlPanel.*`,
// `leftPanel.*`, `commandPalette.*`, `cheatSheet.*`, `shortcut.*`,
// `picker.*`, `fileList.*`, `projectPanel.*` and the project meta
// block keys. Largest cluster (~120 keys); keyboard-first /
// command-palette / shortcut-bound UI lives here.

export interface EditorMessages {
  // --- tree ---
  readonly 'tree.empty': string;
  readonly 'tree.emptyHint': string;
  readonly 'tree.elementAria': string; // {kind} {name}
  readonly 'tree.addOptionalContainer': string; // {name}
  readonly 'tree.optionalContainerHint': string;
  // Phase P1 T4 — multi-instance CollectionHeader chevron + add affordances.
  // Chevron: toggle aria-label between expand / collapse based on isExpanded.
  // Add button: aria-label + title swap to atMax message when upperMultiplicity is reached.
  readonly 'tree.expandCollection': string;
  readonly 'tree.collapseCollection': string;
  readonly 'tree.collectionAdd': string;
  readonly 'tree.collectionAtMax': string;

  // P1 tree UX — localized kind icons, legend, and schema tooltips.
  readonly 'tree.kind.module': string;
  readonly 'tree.kind.container': string;
  readonly 'tree.kind.reference': string;
  readonly 'tree.kind.collection': string;
  readonly 'tree.kind.bswmd': string;
  readonly 'tree.legend.label': string;
  readonly 'tree.tooltip.definition': string; // {value}
  readonly 'tree.tooltip.multiplicity': string; // {value}
  readonly 'tree.tooltip.children': string; // {count}

  // --- param editor ---
  readonly 'editor.noSelection': string;
  readonly 'editor.invalidValue': string;
  readonly 'editor.col.param': string;
  readonly 'editor.col.type': string;
  readonly 'editor.col.value': string;
  readonly 'editor.params.empty': string;
  // --- collection table view ---
  readonly 'editor.collection.instance': string;
  readonly 'editor.collection.notFound': string;

  // --- param category section headers ---
  readonly 'params.category.value': string; // {count}
  readonly 'params.category.reference': string; // {count}
  readonly 'params.category.empty': string;

  // --- arxml panel (status footer) ---
  readonly 'arxmlPanel.empty': string;
  readonly 'arxmlPanel.packages': string;
  readonly 'arxmlPanel.elements': string;
  readonly 'arxmlPanel.unsaved': string;
  readonly 'arxmlPanel.combinedDocs': string; // {count}
  readonly 'arxmlPanel.combinedView': string;

  // --- left panel tabs (Sprint 13 #2 Task 1: tab-based left panel) ---
  readonly 'leftPanel.tab.project': string;
  readonly 'leftPanel.tab.files': string;
  readonly 'leftPanel.tab.validate': string;
  readonly 'leftPanel.project.empty': string;
  // v1.55.0 — Project Tab Collapse/Expand (3 keys).
  readonly 'leftPanel.projectTab.toggleCollapse': string;
  readonly 'leftPanel.projectTab.toggleExpand': string;
  readonly 'leftPanel.projectTab.collapsedNotice': string;

  // --- project panel ---
  readonly 'projectPanel.loose.text': string;
  readonly 'projectPanel.loose.new': string;
  readonly 'projectPanel.loose.open': string;
  readonly 'projectPanel.subtitle': string; // {arxmlCount} {bswmdCount}
  readonly 'projectPanel.arxml.title': string;
  readonly 'projectPanel.arxml.empty': string;
  readonly 'projectPanel.bswmd.title': string;
  readonly 'projectPanel.bswmd.empty': string;
  readonly 'projectPanel.bswmd.add': string;
  readonly 'projectPanel.bswmd.addAria': string; // {name}
  readonly 'projectPanel.closeAria': string; // {name}
  readonly 'projectPanel.removeArxmlAria': string; // {name}
  readonly 'projectPanel.removeBswmdAria': string; // {name}

  // --- file list (combined view) ---
  readonly 'fileList.combinedView': string;
  readonly 'fileList.combinedViewAria': string;

  // --- project meta block (Sprint 13+ Q5) ---
  readonly 'project.meta.path': string; // {path}
  readonly 'project.meta.createdAt': string; // {date}
  readonly 'project.meta.stats': string; // {arxmlCount} {bswmdCount} {dirtyCount}

  // --- ECUC BSWMD-to-module selection ---
  readonly 'ecuc.fromBswmd.menu': string;
  readonly 'ecuc.fromBswmd.disabledNoBswmd': string;
  readonly 'ecuc.fromBswmd.disabledNoProject': string;
  readonly 'ecuc.fromBswmd.filter': string;
  readonly 'ecuc.fromBswmd.selectedCount': string; // {count}
  readonly 'ecuc.fromBswmd.willCreate': string;
  readonly 'ecuc.fromBswmd.targetDir': string;
  readonly 'ecuc.fromBswmd.createN': string; // {count}
  readonly 'ecuc.fromBswmd.collisionWarn': string;
  readonly 'ecuc.fromBswmd.upperBoundReached': string; // {current} {max}
  readonly 'ecuc.fromBswmd.toast': string; // {count}
  readonly 'ecuc.fromBswmd.modulesActive': string; // {active} {total}
  readonly 'ecuc.fromBswmd.willRemove': string;
  readonly 'ecuc.fromBswmd.removeN': string; // {count}
  readonly 'ecuc.fromBswmd.dirtyHint': string;
  readonly 'ecuc.fromBswmd.noChange': string;
  readonly 'ecuc.fromBswmd.removed': string; // {count}
  readonly 'ecuc.fromBswmd.removeFailed': string;
  readonly 'ecuc.fromBswmd.excludeTitle': string;
  readonly 'ecuc.fromBswmd.excludeMessage': string; // {names}
  readonly 'ecuc.fromBswmd.outputDir': string; // {dir}
  readonly 'ecuc.fromBswmd.saveFailedAbort': string; // {name}, {message}

  // --- picker / editor chrome ---
  readonly 'picker.search.placeholder': string;
  readonly 'picker.tooltip.atMax': string; // {current} / {max}
  readonly 'picker.tooltip.alreadyAdded': string; // {name}

  // --- OS dialog titles ---
  readonly 'dialog.pickDir.title': string;

  // --- command palette (Cmd-K) ---
  readonly 'commandPalette.title': string;
  readonly 'commandPalette.placeholder': string;
  readonly 'commandPalette.noResults': string;

  // --- cheat sheet ---
  readonly 'cheatSheet.title': string;
  readonly 'cheatSheet.searchPlaceholder': string;
  readonly 'cheatSheet.closeAria': string;
  readonly 'cheatSheet.bindingHint': string;

  // --- shortcut category labels ---
  readonly 'shortcut.category.file': string;
  readonly 'shortcut.category.edit': string;
  readonly 'shortcut.category.view': string;
  readonly 'shortcut.category.navigate': string;
  readonly 'shortcut.category.selection': string;
  readonly 'shortcut.category.tree': string;
  readonly 'shortcut.category.script': string;
  readonly 'shortcut.category.ecuc': string;
  readonly 'shortcut.category.window': string;
  readonly 'shortcut.category.help': string;
  readonly 'shortcut.category.palette': string;
  readonly 'shortcut.category.validation': string;

  // --- shortcut command labels ---
  readonly 'shortcut.file.open': string;
  readonly 'shortcut.file.save': string;
  readonly 'shortcut.file.saveAs': string;
  readonly 'shortcut.file.close': string;
  readonly 'shortcut.file.recent': string;
  readonly 'shortcut.edit.undo': string;
  readonly 'shortcut.edit.redo': string;
  readonly 'shortcut.edit.cut': string;
  readonly 'shortcut.edit.copy': string;
  readonly 'shortcut.edit.paste': string;
  readonly 'shortcut.edit.find': string;
  readonly 'shortcut.edit.replace': string;
  readonly 'shortcut.view.toggleLeft': string;
  readonly 'shortcut.view.toggleRight': string;
  readonly 'shortcut.view.zoomIn': string;
  readonly 'shortcut.view.zoomOut': string;
  readonly 'shortcut.view.zoomReset': string;
  readonly 'shortcut.navigate.goToDefinition': string;
  readonly 'shortcut.navigate.goToReference': string;
  readonly 'shortcut.navigate.focusSearch': string;
  readonly 'shortcut.selection.selectAll': string;
  readonly 'shortcut.selection.expand': string;
  readonly 'shortcut.selection.shrink': string;
  readonly 'shortcut.tree.revealActive': string;
  readonly 'shortcut.tree.collapseAll': string;
  readonly 'shortcut.tree.expandAll': string;
  readonly 'shortcut.tree.jumpParent': string;
  readonly 'shortcut.tree.jumpChild': string;
  readonly 'shortcut.script.openEditor': string;
  readonly 'shortcut.script.run': string;
  readonly 'shortcut.script.save': string;
  readonly 'shortcut.script.format': string;
  readonly 'shortcut.ecuc.addContainer': string;
  readonly 'shortcut.ecuc.deleteContainer': string;
  readonly 'shortcut.ecuc.duplicateContainer': string;
  readonly 'shortcut.ecuc.addParameter': string;
  readonly 'shortcut.ecuc.editParameter': string;
  readonly 'shortcut.window.newWindow': string;
  readonly 'shortcut.window.closeWindow': string;
  readonly 'shortcut.window.focusPanel': string;
  readonly 'shortcut.help.showCheatSheet': string;
  readonly 'shortcut.help.showDocs': string;
  readonly 'shortcut.help.resetOnboarding': string;
  readonly 'help.menu.resetOnboarding': string;
  readonly 'shortcut.palette.toggle': string;
  readonly 'shortcut.validation.nextError': string;
  readonly 'shortcut.validation.prevError': string;
  readonly 'shortcut.validation.togglePanel': string;
  readonly 'shortcut.validation.focusPanel': string;

  // --- modifier labels (for cheat sheet display) ---
  readonly 'shortcut.modifier.cmd': string;
  readonly 'shortcut.modifier.ctrl': string;
  readonly 'shortcut.modifier.shift': string;
  readonly 'shortcut.modifier.alt': string;
}
