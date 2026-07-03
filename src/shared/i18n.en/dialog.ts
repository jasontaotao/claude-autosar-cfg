// i18n — en bundle: dialog cluster.

import type { DialogMessages } from '../i18n/dialog.js';

export const DialogEn: DialogMessages = {
  // common
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.errorPrefix': '{label} failed: {message}',
  'common.errorPrefixEn': '{label} failed: {message}',

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
  'confirm.unsaved.message.deleteModule':
    'Project "{name}" has unsaved changes.\nDeleting ECUC module {target} will discard them.',
  'confirm.unsaved.message.import':
    'Project "{name}" has unsaved changes.\nImporting ARXML will discard them.',
  'confirm.unsaved.discard.new': 'Discard & New',
  'confirm.unsaved.discard.open': 'Discard & Open',
  'confirm.unsaved.discard.addBswmd': 'Discard & Add',
  'confirm.unsaved.discard.removeBswmd': 'Discard & Remove',
  'confirm.unsaved.discard.deleteModule': 'Discard & Delete',
  'confirm.unsaved.discard.excludeEcuc': 'Discard & Exclude',
  'confirm.unsaved.saveAndNew.new': 'Save & New',
  'confirm.unsaved.saveAndNew.open': 'Save & Open',
  'confirm.unsaved.saveAndNew.addBswmd': 'Save & Add',
  'confirm.unsaved.saveAndNew.removeBswmd': 'Save & Remove',
  'confirm.unsaved.saveAndNew.deleteModule': 'Save & Delete',
  'confirm.unsaved.saveAndNew.excludeEcuc': 'Save & Exclude',
  'confirm.unsaved.saveAndNew.import': 'Save and import',

  // overwrite-confirm dialog (Sprint 13 #2 Stage 3.2 Task 5)
  'confirm.overwrite.title': 'File Exists',
  'confirm.overwrite.message': 'File {path} already exists.\nOverwrite the existing project?',
  'confirm.overwrite.continueLabel': 'Rename',
  'confirm.overwrite.discardLabel': 'Overwrite',

  // error envelopes (Sprint v1.5.1 PR(4))
  'error.applyMutation.plan-invalid': 'Invalid mutation plan: {violations}',
  'error.applyMutation.reference-cycle': 'Reference cycle detected: {from} → {to}',
  'error.applyMutation.multiplicity-violation':
    'Multiplicity violation at {path}: expected {required}, got {actual}',
  'error.applyMutation.concurrent-mutation':
    'Concurrent mutation detected: {planId} vs {conflictingPlanId}',
};
