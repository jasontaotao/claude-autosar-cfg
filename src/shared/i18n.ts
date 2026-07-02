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
  readonly 'app.error.removeBswmdFromDisk': string; // {message}
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
  // Sprint 17 PATCH — distinct aria key for the BSWMD row × button.
  // Replaces the cross-contamination where ProjectPanel.tsx:133
  // reused the ARXML key (which happens to read sensibly because
  // the ARXML aria-string is generic).
  readonly 'projectPanel.removeBswmdAria': string; // {name}
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
  // Sprint A+ — Delete ECUC module dirty-guard (spec invariant I3).
  readonly 'confirm.unsaved.message.deleteModule': string; // {name} {target}
  // Sprint 14 / T10 — ECUC ARXML Import entry-point dirty-guard.
  readonly 'confirm.unsaved.message.import': string; // {name}
  readonly 'confirm.unsaved.discard.new': string;
  readonly 'confirm.unsaved.discard.open': string;
  readonly 'confirm.unsaved.discard.addBswmd': string;
  readonly 'confirm.unsaved.discard.removeBswmd': string;
  readonly 'confirm.unsaved.discard.deleteModule': string;
  readonly 'confirm.unsaved.discard.excludeEcuc': string;
  readonly 'confirm.unsaved.saveAndNew.new': string;
  readonly 'confirm.unsaved.saveAndNew.open': string;
  readonly 'confirm.unsaved.saveAndNew.addBswmd': string;
  readonly 'confirm.unsaved.saveAndNew.removeBswmd': string;
  readonly 'confirm.unsaved.saveAndNew.deleteModule': string;
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

  // --- v1.6.0 Cluster G — SWS Validator (G spec §2 G9) ---
  // Each starter rule gets at least 2 keys: a short message for inline
  // use (panel rows) and a long message for tooltips / CLI stdout.
  // Naming: `swsValidator.<RULE_ID>.<variant>` per G spec §2 G9.
  readonly 'swsValidator.SWS_COM_PDUID_UNIQUE.short': string; // {pduName}
  readonly 'swsValidator.SWS_COM_PDUID_UNIQUE.long': string; // {pduName} {pduId} {configName}
  readonly 'swsValidator.SWS_PDUR_ROUTING_COMPLETE.short': string; // {pathName}
  readonly 'swsValidator.SWS_PDUR_ROUTING_COMPLETE.long': string; // {pathName} {missing}
  readonly 'swsValidator.SWS_ECUC_MULTIPLICITY_MIN.short': string; // {containerName}
  readonly 'swsValidator.SWS_ECUC_MULTIPLICITY_MIN.long': string; // {containerName} {actual} {min}
  readonly 'swsValidator.SWS_BSWMD_DEPS_PRESENT.short': string; // {moduleName}
  readonly 'swsValidator.SWS_BSWMD_DEPS_PRESENT.long': string; // {moduleName} {missingDep}
  readonly 'swsValidator.runtimeError': string; // {ruleId} {message}
  readonly 'swsValidator.timedOut': string; // {ruleId}
  // GUI ValidationPanel (PR(G4))
  readonly 'swsValidator.panel.title': string;
  readonly 'swsValidator.panel.empty': string;
  readonly 'swsValidator.panel.running': string;
  readonly 'swsValidator.panel.paused': string;
  readonly 'swsValidator.panel.disabled': string;
  readonly 'swsValidator.panel.errorBadge': string; // {count}
  readonly 'swsValidator.panel.warningBadge': string; // {count}
  readonly 'swsValidator.panel.severity.error': string;
  readonly 'swsValidator.panel.severity.warning': string;
  readonly 'swsValidator.panel.severity.info': string;
  readonly 'swsValidator.panel.toggleAria': string;
  readonly 'swsValidator.panel.filter.all': string;
  readonly 'swsValidator.panel.filter.error': string;
  readonly 'swsValidator.panel.filter.warning': string;

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
  // S4 (v1.7.2) — optional container visibility. `addOptionalContainer`
  // is the `+` button's accessible label (parameterised by the
  // BSWMD shortName of the missing child). `optionalContainerHint`
  // is the placeholder row's tooltip text — surfaced as a title on
  // the row and as a screen-reader hint via the row's aria-label.
  readonly 'tree.addOptionalContainer': string; // {name}
  readonly 'tree.optionalContainerHint': string;

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
  readonly 'mutation.error.module-not-found': string; // {path}
  // Context-menu and ParamEditor action labels. These are the
  // user-facing strings on the buttons themselves.
  readonly 'mutation.action.addContainer': string;
  readonly 'mutation.action.addParameter': string;
  readonly 'mutation.action.addReference': string;
  readonly 'mutation.action.delete': string; // {name}
  readonly 'mutation.action.deleteParameter': string; // aria-label
  // Sprint 17 P3 T3.3 — context-menu item shown when the user
  // right-clicks a BSWMD row (ProjectPanel <li>) or a module-kind
  // tree node. Dispatched via ContextMenuAction.type='remove-module'
  // and routed by App.tsx to useProjectActions.removeBswmdWithFullFlow.
  readonly 'mutation.action.removeModule': string;
  readonly 'mutation.action.removeModuleAria': string; // {name}
  // Sprint 17 PATCH — Undo affordance. `undo` is the button label
  // (used in both ErrorBanner's action button and the cascade-and-
  // unlink success toast). `bswmdRemoved` is the toast message after
  // a successful cascade-and-unlink. `undoFailed` is the info toast
  // shown when the Undo button is clicked but the snapshot has been
  // replaced or cleared (stale-toast defense).
  readonly 'mutation.action.undo': string;
  readonly 'mutation.action.bswmdRemoved': string; // {name}
  readonly 'mutation.action.undoFailed': string;
  // Sprint A X2 — P0-3: context-menu "Delete reference" is exposed
  // but the underlying mutation is not yet implemented (the
  // reference graph has no remove path). Surface a localized info
  // toast so the user gets feedback instead of a silent no-op.
  readonly 'mutation.action.deleteReferenceNotImplemented': string;
  // Sprint 14+ — ECUC module delete entry point. When the user
  // right-clicks a module-root tree node whose BSWMD is loaded, the
  // context menu offers a sibling "Delete ECUC module" item next to
  // "Remove BSWMD". The aria variant supplies an accessible label;
  // the info.* keys back the success/unlink toasts emitted by the
  // deleteEcucModule store action.
  readonly 'mutation.action.deleteModule': string; // {name}
  readonly 'mutation.action.deleteModuleAria': string; // {name}
  readonly 'mutation.info.ecucModuleDeleted': string; // {name}
  readonly 'mutation.info.ecucModuleUnlinked': string; // {name}
  // HIGH-4 (v1.11.2) — cascade partial-failure surface. Emitted when
  // the cascade loop in confirmDeleteContainer could not resolve one or
  // more reference hits (concurrent edit, stale snapshot, file removed).
  // The primary delete still applies; this toast tells the user how
  // many refs were dropped so they can audit the dangling state.
  readonly 'mutation.warning.cascadePartial': string; // {count}
  // Sprint 15 — CascadeConfirmDialog (3-option). Distinct from the
  // existing dirty-guard confirm.cascade.* which is reserved for
  // unsaved-changes flows.
  readonly 'confirm.cascade.title': string; // {name}
  readonly 'confirm.cascade.message': string; // {count}
  readonly 'confirm.cascade.cancel': string;
  readonly 'confirm.cascade.only': string;
  readonly 'confirm.cascade.cascade': string;
  // Sprint 17 P2 — RemoveModuleConfirmDialog (4-option for BSWMD
  // remove with dependents). Distinct from `confirm.cascade.*`
  // (3-option for ECUC container delete) because the 4th option
  // `cascade-and-unlink` adds disk unlink of the BSWMD file on top
  // of cascade — a verb the ECUC case has no equivalent for.
  readonly 'confirm.removeBswmd.title': string; // {name}
  readonly 'confirm.removeBswmd.message': string; // {name} {count}
  readonly 'confirm.removeBswmd.cancel': string;
  readonly 'confirm.removeBswmd.only': string;
  readonly 'confirm.removeBswmd.cascade': string;
  readonly 'confirm.removeBswmd.cascadeAndUnlink': string;

  // Close project with unsaved changes — the project chip × button
  // gates close + clear behind this 3-button dialog when
  // `dirtyPaths.size > 0`. The button label set maps 1:1 onto the
  // existing `ConfirmChoice` union: Cancel=continue, Discard=discard,
  // Save and close=saveAndProceed.
  readonly 'confirm.closeProject.title': string;
  readonly 'confirm.closeProject.message': string; // {count}
  readonly 'confirm.closeProject.cancel': string;
  readonly 'confirm.closeProject.discard': string;
  readonly 'confirm.closeProject.save': string;

  // --- Sprint 15 — picker / editor chrome ---
  // BswmdPickerDialog + ParamEditor placeholders. Splitting them off
  // from the action labels keeps the user's mental model clean: actions
  // describe *what you can do*, chrome strings describe *what the
  // affordance looks like*.
  readonly 'picker.search.placeholder': string;
  readonly 'picker.tooltip.atMax': string; // {current} / {max}
  readonly 'picker.tooltip.alreadyAdded': string; // {name}
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

  // --- Sprint v1.5.1 PR(4) — applyMutation error kinds (4 new) ----
  // The script engine's commit path emits these when a `MutationPlan`
  // step fails (invalid plan shape, reference cycle, multiplicity
  // violation) or the runtime detects a concurrent mutation. The
  // v1.6.0 headless CLI surfaces them in the user-facing error
  // stream; today they are emitted as `runResult.errorMessage`.
  readonly 'error.applyMutation.plan-invalid': string; // {violations}
  readonly 'error.applyMutation.reference-cycle': string; // {from} {to}
  readonly 'error.applyMutation.multiplicity-violation': string; // {path} {required} {actual}
  readonly 'error.applyMutation.concurrent-mutation': string; // {planId} {conflictingPlanId}
  // v1.6.0 A+C — Headless CLI error envelope i18n keys (17 keys × 2 locales
  // including the original `strictModeWarning`). Per A+C spec §9.1-9.3
  // message-key table; consumed by the CLI's `--format summary` human-readable
  // error output.
  readonly 'headless.error.projectNotFound': string; // {path}
  readonly 'headless.error.parseFailed': string; // {path} {message}
  readonly 'headless.error.bswmdParseFailed': string; // {message}
  readonly 'headless.error.patchNotFound': string; // {path}
  readonly 'headless.error.permissionDenied': string; // {path}
  readonly 'headless.error.diskFull': string; // {path}
  readonly 'headless.error.pathTraversal': string; // {path}
  readonly 'headless.error.patchMissingVersion': string;
  readonly 'headless.error.unsupportedPatchVersion': string; // {version}
  readonly 'headless.error.patchInvalidStep': string; // {reason}
  readonly 'headless.error.patchInvalidValue': string;
  readonly 'headless.error.patchParseFailed': string; // {reason}
  readonly 'headless.error.mutationPathNotFound': string;
  readonly 'headless.error.mutationMultiplicity': string;
  readonly 'headless.error.mutationCycle': string;
  readonly 'headless.error.fileLocked': string; // {path}
  readonly 'headless.error.strictModeWarning': string;

  // --- v1.6.0 Cluster U — Keyboard-First Power User (Cmd-K palette,
  //     50+ shortcuts, cheat sheet). U spec §12 i18n plan.
  // Palette UI: dialog title, input placeholder, empty-state message.
  readonly 'commandPalette.title': string;
  readonly 'commandPalette.placeholder': string;
  readonly 'commandPalette.noResults': string;
  // Cheat sheet UI.
  readonly 'cheatSheet.title': string;
  readonly 'cheatSheet.searchPlaceholder': string;
  readonly 'cheatSheet.closeAria': string;
  readonly 'cheatSheet.bindingHint': string;
  // Shortcut category labels.
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
  // Per-command labels.
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
  // Modifier labels (for cheat sheet display).
  readonly 'shortcut.modifier.cmd': string;
  readonly 'shortcut.modifier.ctrl': string;
  readonly 'shortcut.modifier.shift': string;
  readonly 'shortcut.modifier.alt': string;

  // --- v1.8.0 K Stencil Wizard (Task 5 i18n) ---
  // 13 keys: dialog title, 4 module family labels, 2 mode toggle labels,
  // gate toggle label, 2 button labels, and 4 typed error envelopes
  // surfaced via the `stencil:generate:v1` IPC handler. `error.gateBlocked`
  // is wired by Task 8 (gate integration) but added here for parity so
  // the i18n catalog stays a one-shot deliverable.
  readonly 'stencil.title': string;
  readonly 'stencil.family.com': string;
  readonly 'stencil.family.comm': string;
  readonly 'stencil.family.pdur': string;
  readonly 'stencil.family.ecuc': string;
  readonly 'stencil.mode.free': string;
  readonly 'stencil.mode.withBswmd': string;
  readonly 'stencil.gate.label': string;
  readonly 'stencil.generate': string;
  readonly 'stencil.cancel': string;
  readonly 'stencil.error.buildFailed': string;
  readonly 'stencil.error.serializeFailed': string;
  readonly 'stencil.error.unknownFamily': string;
  readonly 'stencil.error.gateBlocked': string; // {count}
  // v1.8.0 K Stencil Task 10 — "Template" badge shown in FileListTab
  // next to any .arxml that was loaded via File → Open (per KISS,
  // every opened .arxml is a template). The badge signals to the
  // user that the file can be re-saved as a different filename /
  // location.
  readonly 'stencil.badge.template': string;
  readonly 'stencil.badge.templateAria': string; // {name}
  // v1.8.0 K Task 12 — success toast shown after the user picks a
  // destination in the native save dialog. `{name}` interpolates
  // the basename of the chosen path.
  readonly 'stencil.success.saved': string; // {name}

  // --- v1.6.0 Cluster W — Onboarding tour (W spec §3.5) ---
  // 20 onboarding keys (welcome card + 5 step title/body + 4 controls + progress)
  // + 2 tour-coordination keys (paused-validator banner)
  // + 2 flags-keyboardFirst keys (U mirror)
  readonly 'onboarding.welcome.title': string;
  readonly 'onboarding.welcome.body': string;
  readonly 'onboarding.welcome.ctaTour': string;
  readonly 'onboarding.welcome.ctaDemo': string;
  readonly 'onboarding.welcome.ctaSkip': string;
  readonly 'onboarding.step1.title': string;
  readonly 'onboarding.step1.body': string;
  readonly 'onboarding.step2.title': string;
  readonly 'onboarding.step2.body': string;
  readonly 'onboarding.step3.title': string;
  readonly 'onboarding.step3.body': string;
  readonly 'onboarding.step4.title': string;
  readonly 'onboarding.step4.body': string;
  readonly 'onboarding.step5.title': string;
  readonly 'onboarding.step5.body': string;
  readonly 'onboarding.controls.next': string;
  readonly 'onboarding.controls.back': string;
  readonly 'onboarding.controls.skip': string;
  readonly 'onboarding.controls.finish': string;
  readonly 'onboarding.progress.label': string; // {current} {total}
  readonly 'tour.coordination.validationPaused.title': string;
  readonly 'tour.coordination.validationPaused.message': string;
  readonly 'flags.keyboardFirst.label': string;
  readonly 'flags.keyboardFirst.description': string;

  // --- v1.21.0 MINOR T1 — BSW generate GUI entry ---
  // Three keys: button label (sits on the AppHeader right section next
  // to the script-panel toggle), success toast (file count + outDir),
  // failure toast (verbatim CLI stderr). `buttonAria` mirrors the
  // visible label for screen-reader announcement; the en/zh-CN strings
  // are deliberate non-translations so a tooltips lookup stays scoped.
  readonly 'app.generate.button': string;
  readonly 'app.generate.buttonAria': string;
  readonly 'app.generate.success': string; // {count} {outDir}
  readonly 'app.generate.failure': string; // {message}
  readonly 'app.generate.needProject': string;
}

export type MessageKey = keyof Messages;

// ---------------------------------------------------------------------------
// Bundle imports — per-locale bundles live in their own files. The barrel
// re-exports them below so existing call sites keep working unchanged.
// ---------------------------------------------------------------------------

import { MessagesEn } from './i18n.en.js';
import { MessagesZhCN } from './i18n.zh-CN.js';

export { MessagesZhCN, MessagesEn };

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
