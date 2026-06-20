// i18n — Sprint 11 Phase 1 (Option A: full zh-CN / en support).
//
// Pure / sync / no I/O. The store owns the current `Locale`; components
// read it via `useArxmlStore` and call `t(locale, key, params)` directly.
// A future refactor could introduce a `useT()` hook that memoizes the
// bound t() per-render, but for now passing `locale` as the first arg
// keeps the helper trivially testable.
//
// Conventions:
//   - Every user-facing string is a key on `Messages`. The two bundles
//     (`MessagesZhCN` / `MessagesEn`) MUST cover the same key set; the
//     parity test in `i18n.test.ts` enforces this.
//   - Placeholders use {varName} syntax, replaced via simple regex
//     substitution. Missing params leave the placeholder literal so a
//     missing-param bug is visible rather than silently empty.
//   - Unknown keys return the key itself and emit a single console.warn.
//     This is a defensive guard against typos; the bundler can also
//     catch them statically via the parity test.

/** Supported locales. Order matches the toggle button in AppHeader. */
export type Locale = 'zh-CN' | 'en';

export const DEFAULT_LOCALE: Locale = 'zh-CN';

/** Default locale for new sessions. */
export const SUPPORTED_LOCALES: readonly Locale[] = ['zh-CN', 'en'] as const;

/**
 * UI string dictionary. Every key MUST be present in both
 * `MessagesZhCN` and `MessagesEn` (parity test enforces this).
 *
 * Naming convention: `<scope>.<element>.<detail>`. Top-level scopes:
 *   - `app.*`          — AppHeader strings
 *   - `projectPanel.*` — ProjectPanel strings
 *   - `arxmlPanel.*`   — ArxmlPanel strings
 *   - `validation.*`   — ValidationPanel strings
 *   - `editor.*`       — ParamEditor strings
 *   - `tree.*`         — Tree component strings
 *   - `common.*`       — shared strings (cancel, save, error prefix, etc.)
 */
export interface Messages {
  // --- common ---
  readonly 'common.cancel': string;
  readonly 'common.save': string;
  readonly 'common.errorPrefix': string; // "{label}失败: {message}"
  readonly 'common.errorPrefixEn': string; // "{label} failed: {message}"

  // --- app header ---
  readonly 'app.open': string;
  readonly 'app.save': string;
  readonly 'app.saveDirty': string;
  // Sprint 16b T7 — Save All toolbar button. `saveAll` is the idle label
  // (button enabled but zero dirty docs → tooltip "Save all unsaved
  // ECUCs"). `saveAllDirty` swaps in when N>0 dirty paths exist so the
  // button previews its impact ("Save 3"). `saveAllTitle` / `saveAllDirtyTitle`
  // are the tooltip variants. `saveAllDone` / `saveAllPartial` are the
  // post-action toasts the Save All handler writes to the store.
  readonly 'app.saveAll': string;
  readonly 'app.saveAllDirty': string; // {count}
  readonly 'app.saveAllTitle': string;
  readonly 'app.saveAllDirtyTitle': string; // {count}
  readonly 'app.saveAllDone': string; // {count}
  readonly 'app.saveAllPartial': string; // {saved}, {failed}, {firstError}
  // Sprint 17b T7 — typed save-error messages. The renderer's
  // `onSave` handler dispatches the toast via `setError` (and
  // surfaces a `kind: 'error' / 'warning'` red/amber banner based
  // on the i18n lookup). Each kind maps 1:1 to a SaveArxmlErrorKind
  // member; `write-failed` is the legacy v1.1.0/v1.1.1 alias and
  // falls back to a generic "Save failed: {message}" line.
  readonly 'app.save.error.permission-denied': string;
  readonly 'app.save.error.disk-full': string;
  readonly 'app.save.error.path-not-found': string;
  readonly 'app.save.error.serialize-failed': string;
  readonly 'app.save.error.write-failed': string; // {message}
  readonly 'app.save.error.unknown': string; // {message}
  // Sprint 17b (H8) — defensive path-containment. The renderer
  // surfaces this when the main process rejects a write path with
  // `..` parent-traversal (e.g. a compromised preload bridge forged
  // `../../etc/passwd`). Should never happen in the legitimate flow.
  readonly 'app.save.error.invalid-path': string;
  readonly 'app.project.new': string;
  readonly 'app.project.open': string;
  readonly 'app.project.save': string;
  readonly 'app.project.chipLabel': string;
  readonly 'app.project.closeAria': string; // {name}
  readonly 'app.project.saveBlockedDirty': string; // {count} — tooltip when Save Project is blocked because dirty docs exist
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
  readonly 'app.error.duplicateBswmd': string; // {path}
  readonly 'app.error.needProject': string;
  readonly 'app.error.dismissAria': string;
  // Sprint 17b T6 — per-kind ARIA labels. The non-error kinds (warning /
  // info / success) get an explicit `aria-label` so screen readers
  // announce the kind ("Warning notification" / "Information
  // notification" / "Success notification"). Errors rely on the
  // implicit `role="alert"` semantics and skip the label.
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
  readonly 'app.locale.toggleAria': string; // "Switch language" / "切换语言"

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
  // Sprint 13 Stage 3.5 — Combined Tree View virtual entry inside the
  // file list. Renders at the top of the ARXML group when at least one
  // document is loaded; clicking it switches the store to combined mode.
  readonly 'fileList.combinedView': string;
  readonly 'fileList.combinedViewAria': string;
  readonly 'arxmlPanel.combinedDocs': string; // {count}
  readonly 'arxmlPanel.combinedView': string;

  // --- new project dialog (Sprint 12 #3 Phase 1) ---
  readonly 'newProject.title': string;
  readonly 'newProject.nameLabel': string;
  readonly 'newProject.nameHint': string;
  readonly 'newProject.dirLabel': string;
  readonly 'newProject.dirHint': string;
  readonly 'newProject.filenamePreview': string; // {dir} {name}
  readonly 'newProject.browse': string;
  readonly 'newProject.create': string;
  readonly 'newProject.cancel': string;
  // Sprint 13+ Stage 3.3 — TemplateCard row label inside the
  // NewProjectDialog body. Sits between the dir input and the cards.
  readonly 'newProject.templateLabel': string;
  // Sprint 13+ Stage 3.4 — BSWMD chip multi-select inside
  // NewProjectDialog. Rendered when the user picks the Classic
  // template (or any template whose `bswmdPaths` is non-empty). The
  // label is the section heading; the hint explains multi-select
  // semantics; `noBswmd` is the empty-state message for templates
  // that ship without BSWMDs (the row is suppressed entirely when
  // no template is selected, but the field is here for the rare
  // case where a template's `bswmd/` dir is removed on disk).
  readonly 'newProject.bswmdLabel': string;
  readonly 'newProject.bswmdHint': string;
  readonly 'newProject.noBswmd': string;

  // --- confirm dialog (Sprint 12 #3 Phase 1) ---
  readonly 'confirm.unsaved.title': string;
  readonly 'confirm.unsaved.message': string; // {name}
  readonly 'confirm.unsaved.continue': string;
  readonly 'confirm.unsaved.discard': string;
  readonly 'confirm.unsaved.saveAndNew': string;

  // --- prompt dialog (Cancel / OK buttons) ---
  readonly 'prompt.cancel': string;
  readonly 'prompt.confirm': string;

  // --- per-action confirm variants (Sprint 13 #2 Stage 3.2 Task 4) ---
  // The dirty-guard ConfirmDialog was previously a single string set
  // hard-wired to "新建项目" wording, even when the trigger was
  // openProject / addBswmd / removeBswmd. Per-action keys give each
  // trigger accurate, action-matched text.
  readonly 'confirm.unsaved.message.new': string; // {name}
  readonly 'confirm.unsaved.message.open': string; // {name}
  readonly 'confirm.unsaved.message.addBswmd': string; // {name}
  readonly 'confirm.unsaved.message.removeBswmd': string; // {name} {target}
  // Sprint 14 / T10 — ECUC ARXML Import entry-point dirty-guard.
  readonly 'confirm.unsaved.message.import': string; // {name}
  readonly 'confirm.unsaved.discard.new': string;
  readonly 'confirm.unsaved.discard.open': string;
  readonly 'confirm.unsaved.discard.addBswmd': string;
  readonly 'confirm.unsaved.discard.removeBswmd': string;
  readonly 'confirm.unsaved.discard.excludeEcuc': string;
  readonly 'confirm.unsaved.saveAndNew.new': string;
  readonly 'confirm.unsaved.saveAndNew.open': string;
  readonly 'confirm.unsaved.saveAndNew.addBswmd': string;
  readonly 'confirm.unsaved.saveAndNew.removeBswmd': string;
  readonly 'confirm.unsaved.saveAndNew.excludeEcuc': string;
  // Sprint 17a — Import entry-point "save and import" label.
  readonly 'confirm.unsaved.saveAndNew.import': string;

  // --- overwrite-confirm dialog (Sprint 13 #2 Stage 3.2 Task 5) ---
  // When `project:new` IPC returns `{ kind: 'overwrite-confirm', path }`
  // the renderer pops a 2-button confirm (覆盖 / 重命名) instead of the
  // previous "硬编码 error 提示用户改名" flow.
  readonly 'confirm.overwrite.title': string;
  readonly 'confirm.overwrite.message': string; // {path}
  readonly 'confirm.overwrite.continueLabel': string;
  readonly 'confirm.overwrite.discardLabel': string;

  // --- bswmd parser errors (BswmdError → human message) ---
  readonly 'bswmdParser.xmlMalformed': string; // {message}
  readonly 'bswmdParser.missingRoot': string;
  readonly 'bswmdParser.unsupportedVersion': string; // {version}
  readonly 'bswmdParser.invalidStructure': string; // {path} {message}

  // --- arxml panel (status footer) ---
  readonly 'arxmlPanel.empty': string;
  readonly 'arxmlPanel.packages': string;
  readonly 'arxmlPanel.elements': string;
  readonly 'arxmlPanel.unsaved': string;

  // --- validation panel ---
  readonly 'validation.title': string;
  readonly 'validation.allPassed': string;
  readonly 'validation.subtitle': string;
  readonly 'validation.violation': string; // {count}
  readonly 'validation.violations': string; // {count}

  // --- param editor ---
  readonly 'editor.noSelection': string;
  readonly 'editor.invalidValue': string;
  readonly 'editor.col.param': string; // Sprint 13+ Stage 4 M6 — table column header
  readonly 'editor.col.type': string; // Sprint 13+ Stage 4 M6 — table column header
  readonly 'editor.col.value': string; // Sprint 13+ Stage 4 M6 — table column header
  // Sprint 13+ Q2 — EcuC-style category section headers. The right
  // pane groups params by category (Value vs Reference) so users can
  // tell at a glance which kind of setting they're looking at, and so
  // reference targets (often dozens) are not interleaved with scalar
  // values. The {count} placeholder shows a small numeric badge
  // (e.g. "Value (3)") and `params.category.empty` is a localised
  // message rendered when a category has no entries (so the heading
  // still appears with a "0" badge rather than being hidden — keeps
  // the layout stable as the user navigates between nodes).
  readonly 'params.category.value': string; // {count}
  readonly 'params.category.reference': string; // {count}
  readonly 'params.category.empty': string;

  // --- OS dialog titles (Sprint 13+ Stage 4 M7) ---
  readonly 'dialog.pickDir.title': string;

  // --- parse errors (Sprint 13+ Stage 4 M8) ---
  // AppHeader.formatParseError keys. These mirror the shape of
  // bswmdParser.* keys but cover value-side ARXML parse errors
  // (ParseError from core/arxml/parser.ts).
  readonly 'parserError.xmlMalformed': string; // {message}
  readonly 'parserError.missingRoot': string; // {message}
  readonly 'parserError.unsupportedVersion': string; // {version}
  readonly 'parserError.invalidStructure': string; // {path} {message}

  // --- tree ---
  readonly 'tree.empty': string;
  readonly 'tree.emptyHint': string;
  readonly 'tree.elementAria': string; // {kind} {name}

  // --- left panel tabs (Sprint 13 #2 Task 1: tab-based left panel) ---
  readonly 'leftPanel.tab.project': string;
  readonly 'leftPanel.tab.files': string;
  readonly 'leftPanel.tab.validate': string;
  // Sprint 13+ Q5 — empty state shown inside the "project" tab when no
  // project is open. The tab is now always visible (vs. hidden in loose
  // mode pre-Q5) so the user sees a localized hint + the "files" tab
  // CTA (New / Open) lives in the files tab itself.
  readonly 'leftPanel.project.empty': string;

  // Sprint 13+ Q5 — project meta block at the top of ProjectPanelInfo.
  // Shows the manifest path, created-at timestamp (ISO-ish), and a
  // count summary (ARXML / BSWMD / unsaved). The {dirtyCount} line is
  // appended in ProjectPanel.tsx only when the count is non-zero so
  // the meta block stays compact in the common no-dirty case.
  readonly 'project.meta.path': string; // {path}
  readonly 'project.meta.createdAt': string; // {date}
  readonly 'project.meta.stats': string; // {arxmlCount} {bswmdCount} {dirtyCount}

  // --- templates (Sprint 13 #1) ---
  readonly 'template.empty.displayName': string;
  readonly 'template.empty.description': string;
  readonly 'template.classic.displayName': string;
  readonly 'template.classic.description': string;
  readonly 'template.clone.displayName': string;
  readonly 'template.clone.description': string;
  // Sprint 13+ Stage 3.3 — "coming soon" badge label shown on
  // disabled TemplateCard variants (Classic / Clone).
  readonly 'template.comingSoon': string;

  // --- Sprint 15 — ECUC mutation support ---
  // Error messages surfaced via the AppHeader error banner when a
  // mutation fails. The picker / delete flow is the primary user.
  readonly 'mutation.error.path-not-found': string;
  readonly 'mutation.error.name-conflict': string; // {shortName}
  readonly 'mutation.error.multiplicity-exceeded': string; // {current} {max}
  readonly 'mutation.error.multiplicity-floor': string; // {current} {min}
  readonly 'mutation.error.no-bswmd-for-module': string;
  readonly 'mutation.error.invalid-param-type': string; // {key}
  // Context-menu and ParamEditor action labels. These are the
  // user-facing strings on the buttons themselves.
  readonly 'mutation.action.addContainer': string;
  readonly 'mutation.action.addParameter': string;
  readonly 'mutation.action.addReference': string;
  readonly 'mutation.action.delete': string; // {name}
  readonly 'mutation.action.deleteParameter': string; // aria-label
  // Sprint A X2 — P0-3: context-menu "Delete reference" is exposed
  // but the underlying mutation is not yet implemented (the
  // reference graph has no remove path). Surface a localized info
  // toast so the user gets feedback instead of a silent no-op.
  readonly 'mutation.action.deleteReferenceNotImplemented': string;
  // Sprint 15 — CascadeConfirmDialog (3-option). Distinct from the
  // existing dirty-guard confirm.cascade.* which is reserved for
  // unsaved-changes flows.
  readonly 'confirm.cascade.title': string; // {name}
  readonly 'confirm.cascade.message': string; // {count}
  readonly 'confirm.cascade.cancel': string;
  readonly 'confirm.cascade.only': string;
  readonly 'confirm.cascade.cascade': string;

  // --- Sprint 15 — picker / editor chrome ---
  // BswmdPickerDialog + ParamEditor placeholders. Splitting them off
  // from the action labels keeps the user's mental model clean: actions
  // describe *what you can do*, chrome strings describe *what the
  // affordance looks like*.
  readonly 'picker.search.placeholder': string;
  readonly 'picker.tooltip.atMax': string; // {current} / {max}
  readonly 'editor.params.empty': string;

  // Sprint 14 — BSWMD-to-ECUC module selection
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
  // Sprint 16c — surface a partial-save failure inside the dirty-guard's
  // "saveAndProceed" path. When the first save fails the hook aborts the
  // save loop and shows this toast; the failed target is held back from
  // the delete loop so its dirty edits are preserved (not silently lost).
  readonly 'ecuc.fromBswmd.saveFailedAbort': string; // {name}, {message}

  // Sprint 14 — ECUC ARXML Import (spec §7.5). 18 keys covering the
  // FileListTab [Import…] entry, ModuleSelectionPanel header + collision
  // badge, DiffTable title + 4 resolution labels, commit confirm + 3
  // success/rollback/failure toasts, and an undo button label.
  readonly 'app.import.button': string;
  readonly 'app.import.title': string;
  readonly 'app.import.moduleSelection.title': string;
  readonly 'app.import.collision.badge': string;
  readonly 'app.import.diff.title': string; // {shortName}
  // Sprint 17a — three-column diff header + reference count footnote.
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

  // --- Sprint 14 #1 — embedded script engine (spec §6.5) ---
  // 25 keys covering the side panel (Scripts), the 3-column inner
  // layout (lib / editor / output), the 4 kind labels, the 4 error
  // categories, and the violation group header. The renderer wires
  // these in Phase C; the parity test below catches missing keys at
  // build time.
  readonly 'script.panel.title': string;
  readonly 'script.panel.toggle': string;
  readonly 'script.lib.title': string;
  readonly 'script.lib.empty': string;
  readonly 'script.lib.new': string;
  readonly 'script.lib.delete': string;
  readonly 'script.editor.save': string;
  readonly 'script.editor.run': string;
  readonly 'script.editor.stop': string;
  readonly 'script.editor.placeholder': string;
  readonly 'script.output.title': string;
  readonly 'script.output.clear': string;
  readonly 'script.output.commit': string;
  readonly 'script.output.discard': string;
  readonly 'script.output.summary.mutations': string;
  readonly 'script.output.summary.violations': string;
  readonly 'script.kind.validator': string;
  readonly 'script.kind.transformer': string;
  readonly 'script.kind.report': string;
  readonly 'script.kind.free': string;
  readonly 'script.error.syntax': string;
  readonly 'script.error.runtime': string;
  readonly 'script.error.timeout': string;
  readonly 'script.error.import': string;
  readonly 'script.violation.group': string;
}

export type MessageKey = keyof Messages;

// ---------------------------------------------------------------------------
// zh-CN bundle
// ---------------------------------------------------------------------------

export const MessagesZhCN: Messages = {
  // common
  'common.cancel': '取消',
  'common.save': '保存',
  'common.errorPrefix': '{label}失败: {message}',
  'common.errorPrefixEn': '{label} failed: {message}',

  // app
  'app.open': '打开',
  'app.save': '保存',
  'app.saveDirty': '保存 *',
  'app.saveAll': '全部保存',
  'app.saveAllDirty': '保存 {count} 个',
  'app.saveAllTitle': '保存所有未存的 ECUC',
  'app.saveAllDirtyTitle': '{count} 个 ECUC 待保存',
  'app.saveAllDone': '已保存 {count} 个文件',
  'app.saveAllPartial': '已保存 {saved} 个，{failed} 个失败：{firstError}',
  'app.save.error.permission-denied': '权限被拒绝。请检查文件/文件夹权限。',
  'app.save.error.disk-full': '磁盘空间已满。请清理后重试。',
  'app.save.error.path-not-found': '目标路径不存在。请确认目录是否正确。',
  'app.save.error.serialize-failed': '序列化 ARXML 失败。如反复出现请报告 bug。',
  'app.save.error.write-failed': '保存失败：{message}',
  'app.save.error.unknown': '保存失败：{message}',
  'app.save.error.invalid-path': '保存路径无效（含父目录遍历）。',
  'app.project.new': '新建项目',
  'app.project.open': '打开项目',
  'app.project.save': '保存项目',
  'app.project.chipLabel': '项目:',
  'app.project.closeAria': '关闭项目 {name}',
  'app.project.saveBlockedDirty': '保存项目前请先保存 {count} 个未保存的 ARXML',
  'app.docTab.ariaLoaded': '已加载文档',
  'app.docTab.closeAria': '关闭 {name}',
  'app.docNameDirtyMark': '● ',
  'app.docVersion': 'AUTOSAR {version}',
  'app.versionLabel': 'v{version}',
  'app.prompt.projectName': '项目名称:',
  'app.prompt.defaultName': '我的项目',
  'app.error.openFailed': '打开失败: {message}',
  'app.error.saveFailed': '保存失败: {message}',
  'app.error.newProjectFailed': '新建项目失败: {message}',
  'app.error.openProjectFailed': '打开项目失败: {message}',
  'app.error.saveProjectFailed': '保存项目失败: {message}',
  'app.error.openProjectParse': '打开项目: {message}',
  'app.error.readBswmdFailed': '读取 BSWMD 失败: {message}',
  'app.error.parseBswmdFailed': 'BSWMD 解析失败: {message}',
  'app.error.duplicateBswmd': 'BSWMD 已加载过: {path}',
  'app.error.needProject': '需要先打开或创建项目',
  'app.error.dismissAria': '关闭提醒',
  'app.error.warningAria': '警告通知',
  'app.error.infoAria': '信息通知',
  'app.error.successAria': '成功通知',
  'app.error.copyAria': '复制错误内容',
  'app.error.copy': '复制',
  'app.error.viewAria': '查看完整错误',
  'app.error.viewHint': '点击查看完整错误',
  'app.error.view': '查看',
  'app.error.viewerTitle': '错误详情',
  'app.error.viewerCloseAria': '关闭错误详情',
  'app.error.dismissAll': '关闭并清除',
  'app.error.projectNameEmpty': '项目名称不能为空',
  'app.error.projectNameInvalid': '项目名称含非法字符：< > : " / \\ | ? *',
  'app.error.projectNameTooLong': '项目名称不能超过 64 字符',
  'app.menu.project': '项目',
  'app.menu.projectManage': '项目管理',
  'app.menu.fileOps': '文件操作',
  'app.open.arxml': '打开 ARXML…',
  'app.locale.toggleAria': '切换语言',

  // project panel
  'projectPanel.loose.text': '未加载项目。',
  'projectPanel.loose.new': '新建',
  'projectPanel.loose.open': '打开',
  'projectPanel.subtitle': '{arxmlCount} 个 ARXML · {bswmdCount} 个 BSWMD',
  'projectPanel.arxml.title': '值侧 ARXML',
  'projectPanel.arxml.empty': '尚未附加 ARXML。可使用"打开"按钮加载。',
  'projectPanel.bswmd.title': 'BSWMD',
  'projectPanel.bswmd.empty': '尚未加载 BSWMD。点击"加载 BSWMD"按钮添加 schema 文件。',
  'projectPanel.bswmd.add': '加载 BSWMD...',
  'projectPanel.bswmd.addAria': '加载 BSWMD 文件 {name}',
  'projectPanel.closeAria': '关闭项目 {name}',
  'projectPanel.removeArxmlAria': '从项目中移除 {name}',
  'fileList.combinedView': '合并视图',
  'fileList.combinedViewAria': '切换到合并视图',
  'arxmlPanel.combinedDocs': '合并视图（{count} 个文档）',
  'arxmlPanel.combinedView': '合并视图',

  // new project dialog
  'newProject.title': '新建项目',
  'newProject.nameLabel': '项目名称 *',
  'newProject.nameHint': '用于显示和文件名，最长 64 字符',
  'newProject.dirLabel': '保存位置 *',
  'newProject.dirHint': '选择项目目录（manifest 文件将保存在此目录下）',
  'newProject.filenamePreview': '📁 {dir}/{name}.autosarcfg.json',
  'newProject.browse': '浏览…',
  'newProject.create': '创建',
  'newProject.cancel': '取消',
  'newProject.templateLabel': '选择模板',
  'newProject.bswmdLabel': '预填 BSWMD',
  'newProject.bswmdHint': '可多选；将随模板一并拷贝到项目目录',
  'newProject.noBswmd': '该模板未携带 BSWMD',

  // confirm dialog
  'confirm.unsaved.title': '未保存的更改',
  'confirm.unsaved.message': '当前项目 {name} 有未保存的更改。\n新建项目将丢失这些更改。',
  'confirm.unsaved.continue': '继续编辑',
  'confirm.unsaved.discard': '不保存，新建',
  'confirm.unsaved.saveAndNew': '保存并新建',

  // prompt dialog
  'prompt.cancel': '取消',
  'prompt.confirm': '确定',

  // confirm dialog — per-action variants (Sprint 13 #2 Stage 3.2 Task 4)
  'confirm.unsaved.message.new': '当前项目 {name} 有未保存的更改。\n新建项目将丢失这些更改。',
  'confirm.unsaved.message.open': '当前项目 {name} 有未保存的更改。\n打开其他项目将丢失这些更改。',
  'confirm.unsaved.message.addBswmd':
    '当前项目 {name} 有未保存的更改。\n添加 BSWMD 将丢失这些更改。',
  'confirm.unsaved.message.removeBswmd':
    '当前项目 {name} 有未保存的更改。\n移除 BSWMD {target} 将丢失这些更改。',
  'confirm.unsaved.message.import':
    '当前项目 {name} 有未保存的更改。\n导入 ARXML 将丢失这些更改。',
  'confirm.unsaved.discard.new': '不保存，新建',
  'confirm.unsaved.discard.open': '不保存，打开',
  'confirm.unsaved.discard.addBswmd': '不保存，添加',
  'confirm.unsaved.discard.removeBswmd': '不保存，移除',
  'confirm.unsaved.discard.excludeEcuc': '不保存，排除',
  'confirm.unsaved.saveAndNew.new': '保存并新建',
  'confirm.unsaved.saveAndNew.open': '保存并打开',
  'confirm.unsaved.saveAndNew.addBswmd': '保存并添加',
  'confirm.unsaved.saveAndNew.removeBswmd': '保存并移除',
  'confirm.unsaved.saveAndNew.excludeEcuc': '保存并排除',
  'confirm.unsaved.saveAndNew.import': '保存并导入',

  // overwrite-confirm dialog (Sprint 13 #2 Stage 3.2 Task 5)
  'confirm.overwrite.title': '文件已存在',
  'confirm.overwrite.message': '文件 {path} 已存在。\n是否覆盖现有项目？',
  'confirm.overwrite.continueLabel': '重命名',
  'confirm.overwrite.discardLabel': '覆盖',

  // bswmd parser
  'bswmdParser.xmlMalformed': 'BSWMD XML 格式错误: {message}',
  'bswmdParser.missingRoot': 'BSWMD 缺少根元素 <AUTOSAR>',
  'bswmdParser.unsupportedVersion': 'BSWMD 不支持的 AUTOSAR 版本: {version}',
  'bswmdParser.invalidStructure': 'BSWMD 结构错误 ({path}): {message}',

  // arxml panel
  'arxmlPanel.empty': '未加载文档。',
  'arxmlPanel.packages': '包',
  'arxmlPanel.elements': '元素',
  'arxmlPanel.unsaved': '有未保存修改',

  // validation
  'validation.title': '校验',
  'validation.allPassed': '全部检查通过',
  'validation.subtitle': '已应用 ECUC 子集架构。修改参数可重新校验。',
  'validation.violation': '{count} 项违规',
  'validation.violations': '{count} 项违规',

  // editor
  'editor.noSelection': '请从树中选择一个元素',
  'editor.invalidValue': '无效值',
  'editor.col.param': '参数',
  'editor.col.type': '类型',
  'editor.col.value': '取值',
  'params.category.value': '参数值 ({count})',
  'params.category.reference': '引用 ({count})',
  'params.category.empty': '（无）',

  // OS dialog titles
  'dialog.pickDir.title': '选择项目目录',

  // parse errors
  'parserError.xmlMalformed': 'XML 格式错误: {message}',
  'parserError.missingRoot': '缺少根元素: {message}',
  'parserError.unsupportedVersion': '不支持的 AUTOSAR 版本: {version}',
  'parserError.invalidStructure': '结构错误 {path}: {message}',

  // tree
  'tree.empty': '（空）',
  'tree.emptyHint': '未加载文件。点击"打开"按钮开始。',
  'tree.elementAria': '{kind} {name}',

  // left panel tabs
  'leftPanel.tab.project': '项目',
  'leftPanel.tab.files': '文件',
  'leftPanel.tab.validate': '验证',
  'leftPanel.project.empty': '未打开项目。请到"文件"标签新建或打开一个项目。',
  'project.meta.path': '路径: {path}',
  'project.meta.createdAt': '创建于 {date}',
  'project.meta.stats': '{arxmlCount} 个 ARXML · {bswmdCount} 个 BSWMD · {dirtyCount} 个未保存',

  // templates (Sprint 13 #1)
  'template.empty.displayName': '空项目',
  'template.empty.description': '从零开始创建项目',
  'template.classic.displayName': '经典（即将上线）',
  'template.classic.description': '预填常见 BSWMD 的项目模板',
  'template.clone.displayName': '克隆（即将上线）',
  'template.clone.description': '基于现有项目创建副本',
  'template.comingSoon': '即将推出',

  // --- Sprint 15 — ECUC mutation support ---
  'mutation.error.path-not-found': '操作失败：路径不存在',
  'mutation.error.name-conflict': "名称冲突：'{shortName}' 已存在",
  'mutation.error.multiplicity-exceeded': '已达最大实例数 ({current}/{max})',
  'mutation.error.multiplicity-floor': '不能低于最小实例数 ({current}/{min})',
  'mutation.error.no-bswmd-for-module': '需要先加载 BSWMD',
  'mutation.error.invalid-param-type': "参数 '{key}' 未在 BSWMD 中定义",
  'mutation.action.addContainer': '添加子容器',
  'mutation.action.addParameter': '添加参数',
  'mutation.action.addReference': '添加引用',
  'mutation.action.delete': "删除 '{name}'",
  'mutation.action.deleteParameter': '删除参数',
  'mutation.action.deleteReferenceNotImplemented': '删除引用功能尚未实现（已加入 Sprint A backlog）',
  'confirm.cascade.title': "删除 '{name}'?",
  'confirm.cascade.message': "'{name}' 被 {count} 处引用指向：",
  'confirm.cascade.cancel': '取消',
  'confirm.cascade.only': '仅删容器',
  'confirm.cascade.cascade': '一并删引用',

  'picker.search.placeholder': '搜索…',
  'picker.tooltip.atMax': '已达最大实例数 ({current}/{max})',
  'editor.params.empty': '此节点没有参数',

  // Sprint 14 — BSWMD-to-ECUC module selection
  'ecuc.fromBswmd.menu': 'ECUC模块选择…',
  'ecuc.fromBswmd.disabledNoBswmd': '请先加载 BSWMD',
  'ecuc.fromBswmd.disabledNoProject': '请先新建/打开项目',
  'ecuc.fromBswmd.filter': '过滤 (模块名 / vendor 路径)',
  'ecuc.fromBswmd.selectedCount': '已选: {count} 个模块',
  'ecuc.fromBswmd.willCreate': '将创建',
  'ecuc.fromBswmd.targetDir': '目标目录',
  'ecuc.fromBswmd.createN': '创建 {count} 个 ECUC',
  'ecuc.fromBswmd.collisionWarn': '多个 BSWMD 声明了同名 module — 已自动加后缀',
  'ecuc.fromBswmd.upperBoundReached': '已达实例上限 ({current}/{max})',
  'ecuc.fromBswmd.toast': '已新建 {count} 个 ECUC 文件',
  'ecuc.fromBswmd.modulesActive': 'Modules ({active}/{total} active)',
  'ecuc.fromBswmd.outputDir': '输出到 {dir}/ 子目录',
  'ecuc.fromBswmd.willRemove': '将排除',
  'ecuc.fromBswmd.removeN': '排除 {count} 个 ECUC',
  'ecuc.fromBswmd.dirtyHint': '被排除的 ECUC 中有未保存改动',
  'ecuc.fromBswmd.noChange': '无变化',
  'ecuc.fromBswmd.removed': '已排除 {count} 个 ECUC',
  'ecuc.fromBswmd.removeFailed': '排除失败',
  'ecuc.fromBswmd.excludeTitle': '排除 ECUC 模块',
  'ecuc.fromBswmd.excludeMessage':
    '以下 ECUC 模块存在未保存改动：{names}\n选择"不保存"将丢失这些改动，选择"保存并排除"会先静默保存到磁盘再删除。',
  'ecuc.fromBswmd.saveFailedAbort':
    '保存 {name} 失败：{message}。已中止排除流程，该模块的改动已保留（未删除）。',

  // Sprint 14 — ECUC ARXML Import
  'app.import.button': '导入…',
  'app.import.title': '导入 ECUC ARXML',
  'app.import.moduleSelection.title': '选择要导入的模块',
  'app.import.collision.badge': '⚠ 模块已存在',
  'app.import.diff.title': '模块冲突：{shortName}',
  'app.import.diff.column.existing': '已存在',
  'app.import.diff.column.incoming': '导入',
  'app.import.diff.column.decision': '决策',
  'app.import.diff.referenceCount': '{count} 个引用',
  'app.import.resolution.keepExisting': '保留现有',
  'app.import.resolution.overwrite': '覆盖',
  'app.import.resolution.keepBoth': '保留两份',
  'app.import.resolution.skip': '跳过',
  'app.import.commit.confirm': '将 {N} 个模块合并到 {M} 个目标文档，是否继续？',
  'app.import.error.readFailed': '无法读取 {path}：{message}',
  'app.import.error.parseFailed': '解析 {path} 失败：{message}',
  'app.import.error.patchFailed': '合并到 {path} 失败：{message}',
  'app.import.error.noModulesSelected': '未选中任何模块',
  'app.import.error.viewModeLocked': '请先完成或取消导入',
  'app.import.commit.success': '已合并 {N} 个模块到 {M} 个文档',
  'app.import.commit.rolledBack': '已回滚本次合并（未应用任何修改）',
  'app.import.undoLastCommit': '撤销上次合并',

  // Sprint 14 #1 — embedded script engine (spec §6.5)
  'script.panel.title': '脚本',
  'script.panel.toggle': '显示/隐藏脚本面板',
  'script.lib.title': '脚本库',
  'script.lib.empty': '还没有脚本，点 + 新建',
  'script.lib.new': '新建',
  'script.lib.delete': '删除',
  'script.editor.save': '保存',
  'script.editor.run': '运行',
  'script.editor.stop': '停止',
  'script.editor.placeholder': '在这里写 JavaScript…',
  'script.output.title': '输出',
  'script.output.clear': '清空',
  'script.output.commit': '应用到项目',
  'script.output.discard': '放弃改动',
  'script.output.summary.mutations': '修改',
  'script.output.summary.violations': '校验项',
  'script.kind.validator': '校验',
  'script.kind.transformer': '转换',
  'script.kind.report': '报告',
  'script.kind.free': '自由',
  'script.error.syntax': '语法错误',
  'script.error.runtime': '运行时错误',
  'script.error.timeout': '脚本超时',
  'script.error.import': 'import 解析失败',
  'script.violation.group': '脚本校验',
};

// ---------------------------------------------------------------------------
// en bundle
// ---------------------------------------------------------------------------

export const MessagesEn: Messages = {
  // common
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.errorPrefix': '{label} failed: {message}',
  'common.errorPrefixEn': '{label} failed: {message}',

  // app
  'app.open': 'Open',
  'app.save': 'Save',
  'app.saveDirty': 'Save *',
  'app.saveAll': 'Save All',
  'app.saveAllDirty': 'Save {count}',
  'app.saveAllTitle': 'Save all unsaved ECUCs',
  'app.saveAllDirtyTitle': '{count} ECUCs pending',
  'app.saveAllDone': 'Saved {count} files',
  'app.saveAllPartial': 'Saved {saved}, {failed} failed: {firstError}',
  'app.save.error.permission-denied': 'Permission denied. Check file/folder permissions.',
  'app.save.error.disk-full': 'Disk full. Free up space and try again.',
  'app.save.error.path-not-found': 'Target path not found. Verify directory exists.',
  'app.save.error.serialize-failed': 'Failed to serialize ARXML. Report a bug if this persists.',
  'app.save.error.write-failed': 'Save failed: {message}',
  'app.save.error.unknown': 'Save failed: {message}',
  'app.save.error.invalid-path': 'Invalid save path (parent traversal rejected).',
  'app.project.new': 'New Project',
  'app.project.open': 'Open Project',
  'app.project.save': 'Save Project',
  'app.project.chipLabel': 'project:',
  'app.project.closeAria': 'Close project {name}',
  'app.project.saveBlockedDirty': 'Save {count} unsaved ARXML file(s) first',
  'app.docTab.ariaLoaded': 'Loaded documents',
  'app.docTab.closeAria': 'Close {name}',
  'app.docNameDirtyMark': '● ',
  'app.docVersion': 'AUTOSAR {version}',
  'app.versionLabel': 'v{version}',
  'app.prompt.projectName': 'Project name:',
  'app.prompt.defaultName': 'My Project',
  'app.error.openFailed': 'Open failed: {message}',
  'app.error.saveFailed': 'Save failed: {message}',
  'app.error.newProjectFailed': 'New Project failed: {message}',
  'app.error.openProjectFailed': 'Open Project failed: {message}',
  'app.error.saveProjectFailed': 'Save Project failed: {message}',
  'app.error.openProjectParse': 'Open Project: {message}',
  'app.error.readBswmdFailed': 'Failed to read BSWMD: {message}',
  'app.error.parseBswmdFailed': 'BSWMD parse failed: {message}',
  'app.error.duplicateBswmd': 'BSWMD already loaded: {path}',
  'app.error.needProject': 'Please open or create a project first',
  'app.error.dismissAria': 'Dismiss notification',
  'app.error.warningAria': 'Warning notification',
  'app.error.infoAria': 'Information notification',
  'app.error.successAria': 'Success notification',
  'app.error.copyAria': 'Copy error to clipboard',
  'app.error.copy': 'Copy',
  'app.error.viewAria': 'View full error',
  'app.error.viewHint': 'Click to view full error',
  'app.error.view': 'View',
  'app.error.viewerTitle': 'Error details',
  'app.error.viewerCloseAria': 'Close error details',
  'app.error.dismissAll': 'Dismiss & clear',
  'app.error.projectNameEmpty': 'Project name cannot be empty',
  'app.error.projectNameInvalid': 'Project name contains invalid characters: < > : " / \\ | ? *',
  'app.error.projectNameTooLong': 'Project name cannot exceed 64 characters',
  'app.menu.project': 'Project',
  'app.menu.projectManage': 'Project',
  'app.menu.fileOps': 'File Operations',
  'app.open.arxml': 'Open ARXML…',
  'app.locale.toggleAria': 'Switch language',

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
  'fileList.combinedView': 'Combined view',
  'fileList.combinedViewAria': 'Switch to combined view',
  'arxmlPanel.combinedDocs': 'Combined view ({count} documents)',
  'arxmlPanel.combinedView': 'Combined view',

  // new project dialog
  'newProject.title': 'New Project',
  'newProject.nameLabel': 'Project Name *',
  'newProject.nameHint': 'For display and filename, max 64 characters',
  'newProject.dirLabel': 'Save Location *',
  'newProject.dirHint': 'Select project directory (manifest file will be saved here)',
  'newProject.filenamePreview': '📁 {dir}/{name}.autosarcfg.json',
  'newProject.browse': 'Browse...',
  'newProject.create': 'Create',
  'newProject.cancel': 'Cancel',
  'newProject.templateLabel': 'Choose a template',
  'newProject.bswmdLabel': 'Preload BSWMDs',
  'newProject.bswmdHint': 'Select multiple; they will be copied to your project',
  'newProject.noBswmd': 'This template has no BSWMD files',

  // confirm dialog
  'confirm.unsaved.title': 'Unsaved Changes',
  'confirm.unsaved.message':
    'Project "{name}" has unsaved changes.\nCreating a new project will discard them.',
  'confirm.unsaved.continue': 'Keep Editing',
  'confirm.unsaved.discard': 'Discard & New',
  'confirm.unsaved.saveAndNew': 'Save & New',

  // prompt dialog
  'prompt.cancel': 'Cancel',
  'prompt.confirm': 'OK',

  // confirm dialog — per-action variants (Sprint 13 #2 Stage 3.2 Task 4)
  'confirm.unsaved.message.new':
    'Project "{name}" has unsaved changes.\nCreating a new project will discard them.',
  'confirm.unsaved.message.open':
    'Project "{name}" has unsaved changes.\nOpening another project will discard them.',
  'confirm.unsaved.message.addBswmd':
    'Project "{name}" has unsaved changes.\nAdding a BSWMD will discard them.',
  'confirm.unsaved.message.removeBswmd':
    'Project "{name}" has unsaved changes.\nRemoving BSWMD {target} will discard them.',
  'confirm.unsaved.message.import':
    'Project "{name}" has unsaved changes.\nImporting ARXML will discard them.',
  'confirm.unsaved.discard.new': 'Discard & New',
  'confirm.unsaved.discard.open': 'Discard & Open',
  'confirm.unsaved.discard.addBswmd': 'Discard & Add',
  'confirm.unsaved.discard.removeBswmd': 'Discard & Remove',
  'confirm.unsaved.discard.excludeEcuc': 'Discard & Exclude',
  'confirm.unsaved.saveAndNew.new': 'Save & New',
  'confirm.unsaved.saveAndNew.open': 'Save & Open',
  'confirm.unsaved.saveAndNew.addBswmd': 'Save & Add',
  'confirm.unsaved.saveAndNew.removeBswmd': 'Save & Remove',
  'confirm.unsaved.saveAndNew.excludeEcuc': 'Save & Exclude',
  'confirm.unsaved.saveAndNew.import': 'Save and import',

  // overwrite-confirm dialog (Sprint 13 #2 Stage 3.2 Task 5)
  'confirm.overwrite.title': 'File Exists',
  'confirm.overwrite.message': 'File {path} already exists.\nOverwrite the existing project?',
  'confirm.overwrite.continueLabel': 'Rename',
  'confirm.overwrite.discardLabel': 'Overwrite',

  // bswmd parser
  'bswmdParser.xmlMalformed': 'BSWMD XML malformed: {message}',
  'bswmdParser.missingRoot': 'BSWMD missing root element <AUTOSAR>',
  'bswmdParser.unsupportedVersion': 'BSWMD unsupported AUTOSAR version: {version}',
  'bswmdParser.invalidStructure': 'BSWMD invalid structure at {path}: {message}',

  // arxml panel
  'arxmlPanel.empty': 'No document loaded.',
  'arxmlPanel.packages': 'Packages',
  'arxmlPanel.elements': 'Elements',
  'arxmlPanel.unsaved': 'unsaved changes',

  // validation
  'validation.title': 'Validation',
  'validation.allPassed': 'All checks passed',
  'validation.subtitle': 'ECUC subset schema applied. Edit a param to revalidate.',
  'validation.violation': '{count} violation',
  'validation.violations': '{count} violations',

  // editor
  'editor.noSelection': 'Open an ARXML file and select a node in the tree to edit its parameters.',
  'editor.invalidValue': 'Invalid value',
  'editor.col.param': 'Param',
  'editor.col.type': 'Type',
  'editor.col.value': 'Value',
  'params.category.value': 'Value ({count})',
  'params.category.reference': 'Reference ({count})',
  'params.category.empty': '(none)',

  // OS dialog titles
  'dialog.pickDir.title': 'Choose Project Directory',

  // parse errors
  'parserError.xmlMalformed': 'XML malformed: {message}',
  'parserError.missingRoot': 'Missing root element: {message}',
  'parserError.unsupportedVersion': 'Unsupported AUTOSAR version: {version}',
  'parserError.invalidStructure': 'Invalid structure at {path}: {message}',

  // tree
  'tree.empty': '(empty)',
  'tree.emptyHint': 'No file loaded. Click "Open ARXML" to start.',
  'tree.elementAria': '{kind} {name}',

  // left panel tabs
  'leftPanel.tab.project': 'Project',
  'leftPanel.tab.files': 'Files',
  'leftPanel.tab.validate': 'Validate',
  'leftPanel.project.empty': 'No project open. Use the "Files" tab to create or open one.',
  'project.meta.path': 'Path: {path}',
  'project.meta.createdAt': 'Created {date}',
  'project.meta.stats': '{arxmlCount} ARXML · {bswmdCount} BSWMD · {dirtyCount} unsaved',

  // templates (Sprint 13 #1)
  'template.empty.displayName': 'Empty Project',
  'template.empty.description': 'Start a new project from scratch',
  'template.classic.displayName': 'Classic (coming soon)',
  'template.classic.description': 'Project template with common BSWMD prefilled',
  'template.clone.displayName': 'Clone (coming soon)',
  'template.clone.description': 'Create a copy of an existing project',
  'template.comingSoon': 'Coming Soon',

  // --- Sprint 15 — ECUC mutation support ---
  'mutation.error.path-not-found': 'Operation failed: path not found',
  'mutation.error.name-conflict': "Name conflict: '{shortName}' already exists",
  'mutation.error.multiplicity-exceeded': 'Maximum reached ({current}/{max})',
  'mutation.error.multiplicity-floor': 'Cannot go below minimum ({current}/{min})',
  'mutation.error.no-bswmd-for-module': 'Load BSWMD first',
  'mutation.error.invalid-param-type': "Parameter '{key}' is not defined in the BSWMD",
  'mutation.action.addContainer': 'Add sub-container',
  'mutation.action.addParameter': 'Add parameter',
  'mutation.action.addReference': 'Add reference',
  'mutation.action.delete': "Delete '{name}'",
  'mutation.action.deleteParameter': 'Delete parameter',
  'mutation.action.deleteReferenceNotImplemented': 'Deleting references is not yet implemented (tracked in Sprint A backlog)',
  'confirm.cascade.title': "Delete '{name}'?",
  'confirm.cascade.message': "'{name}' is referenced by {count} places:",
  'confirm.cascade.cancel': 'Cancel',
  'confirm.cascade.only': 'Only delete',
  'confirm.cascade.cascade': 'Cascade delete',

  'picker.search.placeholder': 'Search…',
  'picker.tooltip.atMax': 'Maximum reached ({current}/{max})',
  'editor.params.empty': 'No parameters on this node',

  // Sprint 14 — BSWMD-to-ECUC module selection
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

  // Sprint 14 — ECUC ARXML Import
  'app.import.button': 'Import…',
  'app.import.title': 'Import ECUC ARXML',
  'app.import.moduleSelection.title': 'Select modules to import',
  'app.import.collision.badge': '⚠ Module exists',
  'app.import.diff.title': 'Module conflict: {shortName}',
  'app.import.diff.column.existing': 'Existing',
  'app.import.diff.column.incoming': 'Incoming',
  'app.import.diff.column.decision': 'Decision',
  'app.import.diff.referenceCount': '{count} reference(s)',
  'app.import.resolution.keepExisting': 'Keep existing',
  'app.import.resolution.overwrite': 'Overwrite',
  'app.import.resolution.keepBoth': 'Keep both',
  'app.import.resolution.skip': 'Skip',
  'app.import.commit.confirm': 'Merge {N} module(s) into {M} target document(s). Continue?',
  'app.import.error.readFailed': 'Cannot read {path}: {message}',
  'app.import.error.parseFailed': 'Parse {path} failed: {message}',
  'app.import.error.patchFailed': 'Merge into {path} failed: {message}',
  'app.import.error.noModulesSelected': 'No modules selected',
  'app.import.error.viewModeLocked': 'Please finish or cancel the import first',
  'app.import.commit.success': 'Merged {N} module(s) into {M} document(s)',
  'app.import.commit.rolledBack': 'Import rolled back (no changes applied)',
  'app.import.undoLastCommit': 'Undo last import',

  // Sprint 14 #1 — embedded script engine (spec §6.5)
  'script.panel.title': 'Scripts',
  'script.panel.toggle': 'Show/hide Scripts panel',
  'script.lib.title': 'Script library',
  'script.lib.empty': 'No scripts yet. Click + to create one.',
  'script.lib.new': 'New',
  'script.lib.delete': 'Delete',
  'script.editor.save': 'Save',
  'script.editor.run': 'Run',
  'script.editor.stop': 'Stop',
  'script.editor.placeholder': 'Write JavaScript here…',
  'script.output.title': 'Output',
  'script.output.clear': 'Clear',
  'script.output.commit': 'Apply to project',
  'script.output.discard': 'Discard',
  'script.output.summary.mutations': 'mutations',
  'script.output.summary.violations': 'violations',
  'script.kind.validator': 'Validator',
  'script.kind.transformer': 'Transformer',
  'script.kind.report': 'Report',
  'script.kind.free': 'Free',
  'script.error.syntax': 'Syntax error',
  'script.error.runtime': 'Runtime error',
  'script.error.timeout': 'Script timeout',
  'script.error.import': 'Import parse failed',
  'script.violation.group': 'Script validations',
};

// ---------------------------------------------------------------------------
// Bundle map (used by the store's setLocale action)
// ---------------------------------------------------------------------------

export const MESSAGES_BY_LOCALE: Readonly<Record<Locale, Messages>> = {
  'zh-CN': MessagesZhCN,
  en: MessagesEn,
};

// ---------------------------------------------------------------------------
// t() helper
// ---------------------------------------------------------------------------

/**
 * Render the message for `key` in the given `locale`, interpolating
 * `{varName}` placeholders from `params` (if any).
 *
 * Behaviour on edge cases:
 *   - unknown key → returns the key verbatim + console.warn (one-shot
 *     per call, no debouncing — bugs should be visible)
 *   - missing param → leaves the `{varName}` placeholder literal so the
 *     caller can see the typo
 *   - non-string param value → coerced via String() (numbers / booleans
 *     render naturally; objects/arrays render via their toString)
 */
export function t(
  locale: Locale,
  key: MessageKey,
  params?: Readonly<Record<string, string | number | boolean>>,
): string {
  const bundle = MESSAGES_BY_LOCALE[locale];
  const template: string | undefined = bundle[key];
  if (template === undefined) {
    // Defensive guard — the parity test catches missing keys at build
    // time; this only fires for a typo at a call site.
    // eslint-disable-next-line no-console
    console.warn(`[i18n] missing key: ${String(key)} for locale ${locale}`);
    return String(key);
  }
  if (params === undefined) return template;

  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = params[name];
    if (v === undefined) return match;
    return String(v);
  });
}
