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
  // Sprint 17 P3 T3.3 — context-menu item shown when the user
  // right-clicks a BSWMD row (ProjectPanel <li>) or a module-kind
  // tree node. Dispatched via ContextMenuAction.type='remove-module'
  // and routed by App.tsx to useProjectActions.removeBswmdWithFullFlow.
  readonly 'mutation.action.removeModule': string;
  readonly 'mutation.action.removeModuleAria': string; // {name}
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
  'app.error.removeBswmdFromDisk': '从磁盘移除 BSWMD 失败: {message}',
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
  'confirm.unsaved.message.import': '当前项目 {name} 有未保存的更改。\n导入 ARXML 将丢失这些更改。',
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

  // v1.6.0 Cluster G — SWS Validator
  'swsValidator.SWS_COM_PDUID_UNIQUE.short': 'Com PduId 重复: {pduName}',
  'swsValidator.SWS_COM_PDUID_UNIQUE.long': 'ComConfig {configName} 内 ComPdu {pduName} 的 ComPduId {pduId} 重复。',
  'swsValidator.SWS_PDUR_ROUTING_COMPLETE.short': 'PduR 路由路径不完整: {pathName}',
  'swsValidator.SWS_PDUR_ROUTING_COMPLETE.long': 'PduRRoutingPath {pathName} 缺少 {missing}。',
  'swsValidator.SWS_ECUC_MULTIPLICITY_MIN.short': '容器实例数不足: {containerName}',
  'swsValidator.SWS_ECUC_MULTIPLICITY_MIN.long': '容器 {containerName} 实际 {actual} 个实例，少于 lowerMultiplicity {min}。',
  'swsValidator.SWS_BSWMD_DEPS_PRESENT.short': 'BSWMD 模块依赖缺失: {moduleName}',
  'swsValidator.SWS_BSWMD_DEPS_PRESENT.long': '模块 {moduleName} 引用了未定义的模块 {missingDep}。',
  'swsValidator.runtimeError': '规则 {ruleId} 运行失败: {message}',
  'swsValidator.timedOut': '规则 {ruleId} 执行超时',
  'swsValidator.panel.title': 'SWS 校验',
  'swsValidator.panel.empty': '无校验结果。',
  'swsValidator.panel.running': '校验中...',
  'swsValidator.panel.paused': '引导中，已暂停校验',
  'swsValidator.panel.disabled': 'SWS 校验已关闭（experimental.swsValidator）',
  'swsValidator.panel.errorBadge': '{count} 项错误',
  'swsValidator.panel.warningBadge': '{count} 项警告',
  'swsValidator.panel.severity.error': '错误',
  'swsValidator.panel.severity.warning': '警告',
  'swsValidator.panel.severity.info': '提示',
  'swsValidator.panel.toggleAria': '切换 SWS 校验面板',
  'swsValidator.panel.filter.all': '全部',
  'swsValidator.panel.filter.error': '错误',
  'swsValidator.panel.filter.warning': '警告',

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
  'mutation.action.removeModule': '移除 BSWMD',
  'mutation.action.removeModuleAria': "移除 BSWMD '{name}'",
  'mutation.action.deleteReferenceNotImplemented':
    '删除引用功能尚未实现（已加入 Sprint A backlog）',
  'confirm.cascade.title': "删除 '{name}'?",
  'confirm.cascade.message': "'{name}' 被 {count} 处引用指向：",
  'confirm.cascade.cancel': '取消',
  'confirm.cascade.only': '仅删容器',
  'confirm.cascade.cascade': '一并删引用',
  'confirm.removeBswmd.title': "移除 BSWMD '{name}'?",
  'confirm.removeBswmd.message': "'{name}' 被 {count} 个 value-side 文件依赖：",
  'confirm.removeBswmd.cancel': '取消',
  'confirm.removeBswmd.only': '仅移除 BSWMD',
  'confirm.removeBswmd.cascade': '一并删除依赖文件',
  'confirm.removeBswmd.cascadeAndUnlink': '一并删除 + 从磁盘删除 BSWMD',

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
  'error.applyMutation.plan-invalid': '无效的变更计划: {violations}',
  'error.applyMutation.reference-cycle': '检测到引用循环: {from} → {to}',
  'error.applyMutation.multiplicity-violation':
    '{path} 处多重性违规: 期望 {required}，实际 {actual}',
  'error.applyMutation.concurrent-mutation': '检测到并发变更: {planId} 与 {conflictingPlanId} 冲突',
  'headless.error.projectNotFound': '项目文件不存在: {path}',
  'headless.error.parseFailed': '解析 ARXML 失败 ({path}): {message}',
  'headless.error.bswmdParseFailed': '解析 BSWMD 失败: {message}',
  'headless.error.patchNotFound': '补丁文件不存在: {path}',
  'headless.error.permissionDenied': '权限被拒绝: {path}',
  'headless.error.diskFull': '磁盘空间已满: {path}',
  'headless.error.pathTraversal': '检测到父目录遍历，已拒绝: {path}',
  'headless.error.patchMissingVersion': '补丁文件缺少 autosarcfgPatchVersion 字段',
  'headless.error.unsupportedPatchVersion': '不支持的补丁版本: {version}',
  'headless.error.patchInvalidStep': '补丁步骤无效: {reason}',
  'headless.error.patchInvalidValue': '步骤 value 类型不匹配',
  'headless.error.patchParseFailed': '补丁文件解析失败: {reason}',
  'headless.error.mutationPathNotFound': '变更路径不存在',
  'headless.error.mutationMultiplicity': '多重性违规',
  'headless.error.mutationCycle': '检测到引用循环',
  'headless.error.fileLocked': '文件被占用: {path}',
  'headless.error.strictModeWarning': '严格模式下警告升级为错误',

  // --- v1.6.0 Cluster U — Keyboard-First Power User ---
  'commandPalette.title': '命令面板',
  'commandPalette.placeholder': '输入命令…',
  'commandPalette.noResults': '没有匹配的命令',
  'cheatSheet.title': '键盘快捷键',
  'cheatSheet.searchPlaceholder': '搜索快捷键…',
  'cheatSheet.closeAria': '关闭快捷键面板',
  'cheatSheet.bindingHint': '按 ? 键随时打开',
  'shortcut.category.file': '文件',
  'shortcut.category.edit': '编辑',
  'shortcut.category.view': '视图',
  'shortcut.category.navigate': '导航',
  'shortcut.category.selection': '选择',
  'shortcut.category.tree': '树',
  'shortcut.category.script': '脚本',
  'shortcut.category.ecuc': 'ECUC',
  'shortcut.category.window': '窗口',
  'shortcut.category.help': '帮助',
  'shortcut.category.palette': '面板',
  'shortcut.category.validation': '校验',
  'shortcut.file.open': '打开项目',
  'shortcut.file.save': '保存',
  'shortcut.file.saveAs': '另存为',
  'shortcut.file.close': '关闭项目',
  'shortcut.file.recent': '最近项目',
  'shortcut.edit.undo': '撤销',
  'shortcut.edit.redo': '重做',
  'shortcut.edit.cut': '剪切',
  'shortcut.edit.copy': '复制',
  'shortcut.edit.paste': '粘贴',
  'shortcut.edit.find': '查找',
  'shortcut.edit.replace': '替换',
  'shortcut.view.toggleLeft': '切换左侧面板',
  'shortcut.view.toggleRight': '切换右侧面板',
  'shortcut.view.zoomIn': '放大',
  'shortcut.view.zoomOut': '缩小',
  'shortcut.view.zoomReset': '重置缩放',
  'shortcut.navigate.goToDefinition': '转到定义',
  'shortcut.navigate.goToReference': '转到引用',
  'shortcut.navigate.focusSearch': '聚焦搜索',
  'shortcut.selection.selectAll': '全选',
  'shortcut.selection.expand': '扩大选区',
  'shortcut.selection.shrink': '缩小选区',
  'shortcut.tree.revealActive': '在树中定位当前项',
  'shortcut.tree.collapseAll': '全部折叠',
  'shortcut.tree.expandAll': '全部展开',
  'shortcut.tree.jumpParent': '跳到父节点',
  'shortcut.tree.jumpChild': '跳到第一个子节点',
  'shortcut.script.openEditor': '打开脚本编辑器',
  'shortcut.script.run': '运行脚本',
  'shortcut.script.save': '保存脚本',
  'shortcut.script.format': '格式化脚本',
  'shortcut.ecuc.addContainer': '添加子容器',
  'shortcut.ecuc.deleteContainer': '删除容器',
  'shortcut.ecuc.duplicateContainer': '复制容器',
  'shortcut.ecuc.addParameter': '添加参数',
  'shortcut.ecuc.editParameter': '编辑参数',
  'shortcut.window.newWindow': '新建窗口',
  'shortcut.window.closeWindow': '关闭窗口',
  'shortcut.window.focusPanel': '聚焦面板',
  'shortcut.help.showCheatSheet': '显示快捷键',
  'shortcut.help.showDocs': '显示文档',
  'shortcut.help.resetOnboarding': '重置引导教程',
  'help.menu.resetOnboarding': '帮助 → 重置引导',
  'shortcut.palette.toggle': '切换命令面板',
  'shortcut.validation.nextError': '下一条校验错误',
  'shortcut.validation.prevError': '上一条校验错误',
  'shortcut.validation.togglePanel': '切换校验面板',
  'shortcut.validation.focusPanel': '聚焦校验面板',
  'shortcut.modifier.cmd': 'Cmd',
  'shortcut.modifier.ctrl': 'Ctrl',
  'shortcut.modifier.shift': 'Shift',
  'shortcut.modifier.alt': 'Alt',

  // --- v1.6.0 Cluster W — Onboarding tour ---
  'onboarding.welcome.title': '欢迎使用 AutosarCfg',
  'onboarding.welcome.body': '快速浏览或加载示例工程。',
  'onboarding.welcome.ctaTour': '开始引导',
  'onboarding.welcome.ctaDemo': '加载 Demo ECU',
  'onboarding.welcome.ctaSkip': '跳过',
  'onboarding.step1.title': '这是项目顶栏',
  'onboarding.step1.body': '在此打开、保存、切换语言。',
  'onboarding.step2.title': '左侧是项目面板',
  'onboarding.step2.body': '在此管理 BSWMD 与 ECUC 文件。',
  'onboarding.step3.title': '中间是 ECUC 编辑器',
  'onboarding.step3.body': '浏览参数树并编辑数值。',
  'onboarding.step4.title': '右侧是属性面板',
  'onboarding.step4.body': '查看与编辑选中参数。',
  'onboarding.step5.title': '保存与导出',
  'onboarding.step5.body': '保存工程；为工具链导出 ARXML。',
  'onboarding.controls.next': '下一步',
  'onboarding.controls.back': '上一步',
  'onboarding.controls.skip': '跳过引导',
  'onboarding.controls.finish': '完成',
  'onboarding.progress.label': '第 {current} / {total} 步',
  'tour.coordination.validationPaused.title': '引导期间暂停校验',
  'tour.coordination.validationPaused.message': '引导运行期间后台校验已暂停；完成或跳过引导后恢复。',
  'flags.keyboardFirst.label': '键盘优先模式',
  'flags.keyboardFirst.description': '启用 U 集群的键盘导航面板（实验性）。镜像 `experimental.keyboardFirst`。',
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
  'app.error.removeBswmdFromDisk': 'Failed to remove BSWMD from disk: {message}',
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

  // v1.6.0 Cluster G — SWS Validator
  'swsValidator.SWS_COM_PDUID_UNIQUE.short': 'Duplicate Com PduId: {pduName}',
  'swsValidator.SWS_COM_PDUID_UNIQUE.long': 'ComConfig {configName} has ComPdu {pduName} with duplicate ComPduId {pduId}.',
  'swsValidator.SWS_PDUR_ROUTING_COMPLETE.short': 'PduR routing path incomplete: {pathName}',
  'swsValidator.SWS_PDUR_ROUTING_COMPLETE.long': 'PduRRoutingPath {pathName} is missing {missing}.',
  'swsValidator.SWS_ECUC_MULTIPLICITY_MIN.short': 'Container instance count below minimum: {containerName}',
  'swsValidator.SWS_ECUC_MULTIPLICITY_MIN.long': 'Container {containerName} has {actual} instances, below lowerMultiplicity {min}.',
  'swsValidator.SWS_BSWMD_DEPS_PRESENT.short': 'BSWMD module dependency missing: {moduleName}',
  'swsValidator.SWS_BSWMD_DEPS_PRESENT.long': 'Module {moduleName} references undefined module {missingDep}.',
  'swsValidator.runtimeError': 'Rule {ruleId} failed: {message}',
  'swsValidator.timedOut': 'Rule {ruleId} timed out',
  'swsValidator.panel.title': 'SWS Validation',
  'swsValidator.panel.empty': 'No validation results.',
  'swsValidator.panel.running': 'Validating...',
  'swsValidator.panel.paused': 'Tour running, validation paused',
  'swsValidator.panel.disabled': 'SWS Validation disabled (experimental.swsValidator)',
  'swsValidator.panel.errorBadge': '{count} errors',
  'swsValidator.panel.warningBadge': '{count} warnings',
  'swsValidator.panel.severity.error': 'Error',
  'swsValidator.panel.severity.warning': 'Warning',
  'swsValidator.panel.severity.info': 'Info',
  'swsValidator.panel.toggleAria': 'Toggle SWS validation panel',
  'swsValidator.panel.filter.all': 'All',
  'swsValidator.panel.filter.error': 'Errors',
  'swsValidator.panel.filter.warning': 'Warnings',

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
  'mutation.action.removeModule': 'Remove module',
  'mutation.action.removeModuleAria': "Remove BSWMD '{name}'",
  'mutation.action.deleteReferenceNotImplemented':
    'Deleting references is not yet implemented (tracked in Sprint A backlog)',
  'confirm.cascade.title': "Delete '{name}'?",
  'confirm.cascade.message': "'{name}' is referenced by {count} places:",
  'confirm.cascade.cancel': 'Cancel',
  'confirm.cascade.only': 'Only delete',
  'confirm.cascade.cascade': 'Cascade delete',
  'confirm.removeBswmd.title': "Remove BSWMD '{name}'?",
  'confirm.removeBswmd.message': "'{name}' is depended on by {count} value-side file(s):",
  'confirm.removeBswmd.cancel': 'Cancel',
  'confirm.removeBswmd.only': 'Only remove BSWMD',
  'confirm.removeBswmd.cascade': 'Also delete dependents',
  'confirm.removeBswmd.cascadeAndUnlink': 'Also delete + remove BSWMD from disk',

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
  'error.applyMutation.plan-invalid': 'Invalid mutation plan: {violations}',
  'error.applyMutation.reference-cycle': 'Reference cycle detected: {from} → {to}',
  'error.applyMutation.multiplicity-violation':
    'Multiplicity violation at {path}: expected {required}, got {actual}',
  'error.applyMutation.concurrent-mutation':
    'Concurrent mutation detected: {planId} vs {conflictingPlanId}',
  'headless.error.projectNotFound': 'Project file not found: {path}',
  'headless.error.parseFailed': 'Failed to parse ARXML ({path}): {message}',
  'headless.error.bswmdParseFailed': 'Failed to parse BSWMD: {message}',
  'headless.error.patchNotFound': 'Patch file not found: {path}',
  'headless.error.permissionDenied': 'Permission denied: {path}',
  'headless.error.diskFull': 'Disk full: {path}',
  'headless.error.pathTraversal': 'Parent traversal detected, rejected: {path}',
  'headless.error.patchMissingVersion': 'Patch file missing autosarcfgPatchVersion field',
  'headless.error.unsupportedPatchVersion': 'Unsupported patch version: {version}',
  'headless.error.patchInvalidStep': 'Patch step invalid: {reason}',
  'headless.error.patchInvalidValue': 'Step value type mismatch',
  'headless.error.patchParseFailed': 'Patch file parse failed: {reason}',
  'headless.error.mutationPathNotFound': 'Mutation path not found',
  'headless.error.mutationMultiplicity': 'Multiplicity violation',
  'headless.error.mutationCycle': 'Reference cycle detected',
  'headless.error.fileLocked': 'File is locked: {path}',
  'headless.error.strictModeWarning': 'Strict mode elevated warning to error',

  // --- v1.6.0 Cluster U — Keyboard-First Power User ---
  'commandPalette.title': 'Command Palette',
  'commandPalette.placeholder': 'Type a command…',
  'commandPalette.noResults': 'No matching commands',
  'cheatSheet.title': 'Keyboard Shortcuts',
  'cheatSheet.searchPlaceholder': 'Search shortcuts…',
  'cheatSheet.closeAria': 'Close shortcut sheet',
  'cheatSheet.bindingHint': 'Press ? at any time to open',
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
  'shortcut.modifier.cmd': 'Cmd',
  'shortcut.modifier.ctrl': 'Ctrl',
  'shortcut.modifier.shift': 'Shift',
  'shortcut.modifier.alt': 'Alt',

  // --- v1.6.0 Cluster W — Onboarding tour (en) ---
  'onboarding.welcome.title': 'Welcome to AutosarCfg',
  'onboarding.welcome.body': 'Take a quick tour or load a sample project.',
  'onboarding.welcome.ctaTour': 'Take tour',
  'onboarding.welcome.ctaDemo': 'Load Demo ECU',
  'onboarding.welcome.ctaSkip': 'Skip',
  'onboarding.step1.title': 'This is your project header',
  'onboarding.step1.body': 'Open, save, and switch language from here.',
  'onboarding.step2.title': 'Project panel on the left',
  'onboarding.step2.body': 'Manage BSWMDs and ECUC files here.',
  'onboarding.step3.title': 'ECUC editor in the middle',
  'onboarding.step3.body': 'Browse the parameter tree and edit values.',
  'onboarding.step4.title': 'Properties on the right',
  'onboarding.step4.body': 'Inspect and edit the selected parameter.',
  'onboarding.step5.title': 'Save and export',
  'onboarding.step5.body': 'Save your project; export ARXML for your toolchain.',
  'onboarding.controls.next': 'Next',
  'onboarding.controls.back': 'Back',
  'onboarding.controls.skip': 'Skip tour',
  'onboarding.controls.finish': 'Finish',
  'onboarding.progress.label': 'Step {current} of {total}',
  'tour.coordination.validationPaused.title': 'Validation paused during tour',
  'tour.coordination.validationPaused.message': 'Background validation is paused while the tour is running. It resumes after you finish or skip the tour.',
  'flags.keyboardFirst.label': 'Keyboard-first mode',
  'flags.keyboardFirst.description': 'Enable U cluster keyboard navigation palette (experimental). Mirrors `experimental.keyboardFirst`.',
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
