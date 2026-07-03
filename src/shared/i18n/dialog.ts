// i18n — Dialog cluster types.
//
// Contains `common.*`, `confirm.*`, `prompt.*`, and `error.*` keys
// covering shared dialog chrome, per-action confirm variants, and
// applyMutation error envelopes.

export interface DialogMessages {
  // --- common ---
  readonly 'common.cancel': string;
  readonly 'common.save': string;
  readonly 'common.errorPrefix': string; // "{label}失败: {message}"
  readonly 'common.errorPrefixEn': string; // "{label} failed: {message}"

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
  readonly 'confirm.unsaved.message.new': string; // {name}
  readonly 'confirm.unsaved.message.open': string; // {name}
  readonly 'confirm.unsaved.message.addBswmd': string; // {name}
  readonly 'confirm.unsaved.message.removeBswmd': string; // {name} {target}
  readonly 'confirm.unsaved.message.deleteModule': string; // {name} {target}
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
  readonly 'confirm.unsaved.saveAndNew.import': string;

  // --- overwrite-confirm dialog (Sprint 13 #2 Stage 3.2 Task 5) ---
  readonly 'confirm.overwrite.title': string;
  readonly 'confirm.overwrite.message': string; // {path}
  readonly 'confirm.overwrite.continueLabel': string;
  readonly 'confirm.overwrite.discardLabel': string;

  // --- error envelopes (Sprint v1.5.1 PR(4) — applyMutation error kinds) ---
  readonly 'error.applyMutation.plan-invalid': string; // {violations}
  readonly 'error.applyMutation.reference-cycle': string; // {from} {to}
  readonly 'error.applyMutation.multiplicity-violation': string; // {path} {required} {actual}
  readonly 'error.applyMutation.concurrent-mutation': string; // {planId} {conflictingPlanId}
}
