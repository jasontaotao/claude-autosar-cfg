// i18n — Misc cluster types.
//
// Catch-all cluster covering `headless.*`, `newProject.*`,
// `onboarding.*`, `tour.*`, `flags.*`, `script.*`, `stencil.*`.
// Largest surface after editor; v1.6.0 / W / K cluster keys live here.

export interface MiscMessages {
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
  readonly 'newProject.templateLabel': string;
  readonly 'newProject.bswmdLabel': string;
  readonly 'newProject.bswmdHint': string;
  readonly 'newProject.noBswmd': string;
  readonly 'newProject.templatePreview.pickFirst': string;
  readonly 'newProject.templatePreview.fileCountNone': string;
  readonly 'newProject.templatePreview.fileCount': string; // {count}
  readonly 'newProject.templatePreview.preloadBswmd': string;

  // --- headless CLI error envelopes (v1.6.0 A+C — spec §9.1-9.3) ---
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

  // --- onboarding tour (W spec §3.5) ---
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

  // --- embedded script engine (Sprint 14 #1 — spec §6.5) ---
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
  readonly 'script.kind.validator.desc': string;
  readonly 'script.kind.transformer.desc': string;
  readonly 'script.kind.report.desc': string;
  readonly 'script.kind.free.desc': string;
  readonly 'script.onboarding.title': string;
  readonly 'script.onboarding.description': string;
  readonly 'script.onboarding.cta': string;
  readonly 'script.onboarding.kindValidatorHint': string;
  readonly 'script.onboarding.kindTransformerHint': string;
  readonly 'script.onboarding.kindReportHint': string;
  readonly 'script.onboarding.kindFreeHint': string;
  readonly 'script.status.ok': string;
  readonly 'script.error.syntax': string;
  readonly 'script.error.runtime': string;
  readonly 'script.error.timeout': string;
  readonly 'script.error.import': string;
  readonly 'script.violation.group': string;

  // --- stencil wizard (v1.8.0 K — Task 5 i18n) ---
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
  readonly 'stencil.badge.template': string;
  readonly 'stencil.badge.templateAria': string; // {name}
  readonly 'stencil.success.saved': string; // {name}

  // --- v1.25.0 MINOR T5 — Excel→Com-Stack ECUC batch wizard ---
  // 3-step React modal driven by 3 IPCs
  // (xlsx:writeBatchTemplate / xlsx:parseBatch / xlsx:commitBatch).
  // Every user-visible string in `XlsxBatchWizard.tsx` resolves via
  // `t(locale, key)` — no template-string English fallback (the
  // v1.23.1 T1 L1 + v1.24.0 T3.1 i18n-bypass lessons are explicit on
  // this point). The `*.menu.*` keys drive the AppHeader entry that
  // opens the modal; `*.wizard.*` drive the modal body; `*.error.*`
  // drive per-kind failure toasts; `*.success.*` drive the commit
  // summary toast.
  readonly 'xlsxBatch.menu.label': string;
  readonly 'xlsxBatch.wizard.title': string;
  readonly 'xlsxBatch.wizard.close': string;
  readonly 'xlsxBatch.wizard.step1.download': string;
  readonly 'xlsxBatch.wizard.step1.busy': string;
  readonly 'xlsxBatch.wizard.step2.upload': string;
  readonly 'xlsxBatch.wizard.step2.collision': string;
  readonly 'xlsxBatch.wizard.step2.collisionOverwrite': string;
  readonly 'xlsxBatch.wizard.step2.collisionSkip': string;
  readonly 'xlsxBatch.wizard.step3.commit': string;
  readonly 'xlsxBatch.wizard.step3.committing': string;
  readonly 'xlsxBatch.wizard.step3.summary': string; // {added} {overwritten} {skipped}
  readonly 'xlsxBatch.wizard.back': string;
  readonly 'xlsxBatch.wizard.next': string;
  readonly 'xlsxBatch.error.read': string; // {message}
  readonly 'xlsxBatch.error.parse': string; // {message}
  readonly 'xlsxBatch.error.bridge': string; // {message}
  readonly 'xlsxBatch.error.write': string; // {message}
  readonly 'xlsxBatch.error.no-module-def': string;
}
