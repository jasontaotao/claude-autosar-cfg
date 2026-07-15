// i18n — en bundle: editor cluster.

import type { EditorMessages } from '../i18n/editor.js';

export const EditorEn: EditorMessages = {
  // tree
  'tree.empty': '(empty)',
  'tree.emptyHint': 'No file loaded. Click "Open ARXML" to start.',
  'tree.elementAria': '{kind} {name}',
  'tree.addOptionalContainer': 'Add {name}',
  'tree.optionalContainerHint': 'Optional container — click + to add an instance',
  // Phase P1 T4 — multi-instance CollectionHeader (see editor.ts interface block).
  'tree.expandCollection': 'Expand collection',
  'tree.collapseCollection': 'Collapse collection',
  'tree.collectionAdd': 'Add another instance to this collection',
  'tree.collectionAtMax': 'Reached upper bound — cannot add more',

  // editor
  'editor.noSelection': 'Open an ARXML file and select a node in the tree to edit its parameters.',
  'editor.invalidValue': 'Invalid value',
  'editor.col.param': 'Param',
  'editor.col.type': 'Type',
  'editor.col.value': 'Value',
  'editor.params.empty': 'No parameters on this node',

  // param category section headers
  'params.category.value': 'Value ({count})',
  'params.category.reference': 'Reference ({count})',
  'params.category.empty': '(none)',

  // arxml panel
  'arxmlPanel.empty': 'No document loaded.',
  'arxmlPanel.packages': 'Packages',
  'arxmlPanel.elements': 'Elements',
  'arxmlPanel.unsaved': 'unsaved changes',
  'arxmlPanel.combinedDocs': 'Combined view ({count} documents)',
  'arxmlPanel.combinedView': 'Combined view',

  // left panel tabs
  'leftPanel.tab.project': 'Project',
  'leftPanel.tab.files': 'Files',
  'leftPanel.tab.validate': 'Validate',
  'leftPanel.project.empty': 'No project open. Use the "Files" tab to create or open one.',
  // v1.55.0 — Project Tab Collapse/Expand
  'leftPanel.projectTab.toggleCollapse': 'Collapse project panel',
  'leftPanel.projectTab.toggleExpand': 'Expand project panel',
  'leftPanel.projectTab.collapsedNotice': 'Project panel is collapsed. Click to expand.',

  // project panel
  'projectPanel.loose.text': 'No project loaded.',
  'projectPanel.loose.new': 'New',
  'projectPanel.loose.open': 'Open',
  'projectPanel.subtitle': '{arxmlCount} ARXML · {bswmdCount} BSWMD',
  'projectPanel.arxml.title': 'Value-side ARXMLs',
  'projectPanel.arxml.empty': 'No ARXMLs attached. Use Open ARXML to add some.',
  'projectPanel.bswmd.title': 'BSWMDs',
  'projectPanel.bswmd.empty': 'No BSWMDs loaded yet. Click "Load BSWMD" to add a schema file.',
  'projectPanel.bswmd.add': 'Load BSWMD...',
  'projectPanel.bswmd.addAria': 'Load BSWMD file {name}',
  'projectPanel.closeAria': 'Close project {name}',
  'projectPanel.removeArxmlAria': 'Remove {name} from project',
  'projectPanel.removeBswmdAria': "Remove BSWMD '{name}'",

  // file list (combined view)
  'fileList.combinedView': 'Combined view',
  'fileList.combinedViewAria': 'Switch to combined view',

  // project meta block
  'project.meta.path': 'Path: {path}',
  'project.meta.createdAt': 'Created {date}',
  'project.meta.stats': '{arxmlCount} ARXML · {bswmdCount} BSWMD · {dirtyCount} unsaved',

  // ECUC BSWMD-to-module selection
  'ecuc.fromBswmd.menu': 'ECUC Module Selection…',
  'ecuc.fromBswmd.disabledNoBswmd': 'Load a BSWMD first',
  'ecuc.fromBswmd.disabledNoProject': 'Create or open a project first',
  'ecuc.fromBswmd.filter': 'Filter (module name / vendor path)',
  'ecuc.fromBswmd.selectedCount': 'Selected: {count} modules',
  'ecuc.fromBswmd.willCreate': 'Will create',
  'ecuc.fromBswmd.targetDir': 'Target directory',
  'ecuc.fromBswmd.createN': 'Create {count} ECUC',
  'ecuc.fromBswmd.collisionWarn':
    'Name collision detected — multiple BSWMDs declare the same module, auto-suffix applied',
  'ecuc.fromBswmd.upperBoundReached': 'Upper bound reached ({current}/{max})',
  'ecuc.fromBswmd.toast': 'Created {count} ECUC files',
  'ecuc.fromBswmd.modulesActive': 'Modules ({active}/{total} active)',
  'ecuc.fromBswmd.outputDir': 'Output to {dir}/ subfolder',
  'ecuc.fromBswmd.willRemove': 'Will exclude',
  'ecuc.fromBswmd.removeN': 'Exclude {count} ECUC',
  'ecuc.fromBswmd.dirtyHint': 'Some excluded ECUCs have unsaved changes',
  'ecuc.fromBswmd.noChange': 'No changes',
  'ecuc.fromBswmd.removed': 'Excluded {count} ECUCs',
  'ecuc.fromBswmd.removeFailed': 'Exclude failed',
  'ecuc.fromBswmd.excludeTitle': 'Exclude ECUC modules',
  'ecuc.fromBswmd.excludeMessage':
    'The following ECUC modules have unsaved changes: {names}\n"Discard" loses the changes, "Save & Exclude" silently saves to disk before deletion.',
  'ecuc.fromBswmd.saveFailedAbort':
    'Saving {name} failed: {message}. Exclude aborted — that module was NOT deleted and its unsaved edits are preserved.',

  // picker / editor chrome
  'picker.search.placeholder': 'Search…',
  'picker.tooltip.atMax': 'Maximum reached ({current}/{max})',
  'picker.tooltip.alreadyAdded':
    '"{name}" already added (parameters/references are unique within a container)',

  // OS dialog titles
  'dialog.pickDir.title': 'Choose Project Directory',

  // command palette
  'commandPalette.title': 'Command Palette',
  'commandPalette.placeholder': 'Type a command…',
  'commandPalette.noResults': 'No matching commands',

  // cheat sheet
  'cheatSheet.title': 'Keyboard Shortcuts',
  'cheatSheet.searchPlaceholder': 'Search shortcuts…',
  'cheatSheet.closeAria': 'Close shortcut sheet',
  'cheatSheet.bindingHint': 'Press ? at any time to open',

  // shortcut category labels
  'shortcut.category.file': 'File',
  'shortcut.category.edit': 'Edit',
  'shortcut.category.view': 'View',
  'shortcut.category.navigate': 'Navigate',
  'shortcut.category.selection': 'Selection',
  'shortcut.category.tree': 'Tree',
  'shortcut.category.script': 'Script',
  'shortcut.category.ecuc': 'ECUC',
  'shortcut.category.window': 'Window',
  'shortcut.category.help': 'Help',
  'shortcut.category.palette': 'Palette',
  'shortcut.category.validation': 'Validation',

  // shortcut command labels
  'shortcut.file.open': 'Open Project',
  'shortcut.file.save': 'Save',
  'shortcut.file.saveAs': 'Save As',
  'shortcut.file.close': 'Close Project',
  'shortcut.file.recent': 'Recent Projects',
  'shortcut.edit.undo': 'Undo',
  'shortcut.edit.redo': 'Redo',
  'shortcut.edit.cut': 'Cut',
  'shortcut.edit.copy': 'Copy',
  'shortcut.edit.paste': 'Paste',
  'shortcut.edit.find': 'Find',
  'shortcut.edit.replace': 'Replace',
  'shortcut.view.toggleLeft': 'Toggle Left Panel',
  'shortcut.view.toggleRight': 'Toggle Right Panel',
  'shortcut.view.zoomIn': 'Zoom In',
  'shortcut.view.zoomOut': 'Zoom Out',
  'shortcut.view.zoomReset': 'Reset Zoom',
  'shortcut.navigate.goToDefinition': 'Go to Definition',
  'shortcut.navigate.goToReference': 'Go to Reference',
  'shortcut.navigate.focusSearch': 'Focus Search',
  'shortcut.selection.selectAll': 'Select All',
  'shortcut.selection.expand': 'Expand Selection',
  'shortcut.selection.shrink': 'Shrink Selection',
  'shortcut.tree.revealActive': 'Reveal Active',
  'shortcut.tree.collapseAll': 'Collapse All',
  'shortcut.tree.expandAll': 'Expand All',
  'shortcut.tree.jumpParent': 'Jump to Parent',
  'shortcut.tree.jumpChild': 'Jump to First Child',
  'shortcut.script.openEditor': 'Open Script Editor',
  'shortcut.script.run': 'Run Script',
  'shortcut.script.save': 'Save Script',
  'shortcut.script.format': 'Format Script',
  'shortcut.ecuc.addContainer': 'Add Container',
  'shortcut.ecuc.deleteContainer': 'Delete Container',
  'shortcut.ecuc.duplicateContainer': 'Duplicate Container',
  'shortcut.ecuc.addParameter': 'Add Parameter',
  'shortcut.ecuc.editParameter': 'Edit Parameter',
  'shortcut.window.newWindow': 'New Window',
  'shortcut.window.closeWindow': 'Close Window',
  'shortcut.window.focusPanel': 'Focus Panel',
  'shortcut.help.showCheatSheet': 'Show Shortcuts',
  'shortcut.help.showDocs': 'Show Docs',
  'shortcut.help.resetOnboarding': 'Reset Onboarding',
  'help.menu.resetOnboarding': 'Help → Reset Onboarding',
  'shortcut.palette.toggle': 'Toggle Command Palette',
  'shortcut.validation.nextError': 'Next Validation Error',
  'shortcut.validation.prevError': 'Previous Validation Error',
  'shortcut.validation.togglePanel': 'Toggle Validation Panel',
  'shortcut.validation.focusPanel': 'Focus Validation Panel',

  // modifier labels
  'shortcut.modifier.cmd': 'Cmd',
  'shortcut.modifier.ctrl': 'Ctrl',
  'shortcut.modifier.shift': 'Shift',
  'shortcut.modifier.alt': 'Alt',
};
