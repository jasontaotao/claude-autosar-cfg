// i18n — en bundle: validation cluster.

import type { ValidationMessages } from '../i18n/validation.js';

export const ValidationEn: ValidationMessages = {
  // validation
  'validation.title': 'Validation',
  'validation.allPassed': 'All checks passed',
  'validation.subtitle': 'ECUC subset schema applied. Edit a param to revalidate.',
  'validation.violation': '{count} violation',
  'validation.violations': '{count} violations',

  // SWS Validator
  'swsValidator.SWS_COM_PDUID_UNIQUE.short': 'Duplicate Com PduId: {pduName}',
  'swsValidator.SWS_COM_PDUID_UNIQUE.long':
    'ComConfig {configName} has ComPdu {pduName} with duplicate ComPduId {pduId}.',
  'swsValidator.SWS_PDUR_ROUTING_COMPLETE.short': 'PduR routing path incomplete: {pathName}',
  'swsValidator.SWS_PDUR_ROUTING_COMPLETE.long': 'PduRRoutingPath {pathName} is missing {missing}.',
  'swsValidator.SWS_ECUC_MULTIPLICITY_MIN.short':
    'Container instance count below minimum: {containerName}',
  'swsValidator.SWS_ECUC_MULTIPLICITY_MIN.long':
    'Container {containerName} has {actual} instances, below lowerMultiplicity {min}.',
  'swsValidator.SWS_BSWMD_DEPS_PRESENT.short': 'BSWMD module dependency missing: {moduleName}',
  'swsValidator.SWS_BSWMD_DEPS_PRESENT.long':
    'Module {moduleName} references undefined module {missingDep}.',
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

  // bswmd parser
  'bswmdParser.xmlMalformed': 'BSWMD XML malformed: {message}',
  'bswmdParser.missingRoot': 'BSWMD missing root element <AUTOSAR>',
  'bswmdParser.unsupportedVersion': 'BSWMD unsupported AUTOSAR version: {version}',
  'bswmdParser.invalidStructure': 'BSWMD invalid structure at {path}: {message}',

  // ARXML parse errors
  'parserError.xmlMalformed': 'XML malformed: {message}',
  'parserError.missingRoot': 'Missing root element: {message}',
  'parserError.unsupportedVersion': 'Unsupported AUTOSAR version: {version}',
  'parserError.invalidStructure': 'Invalid structure at {path}: {message}',

  // mutation errors / actions / info
  'mutation.error.path-not-found': 'Operation failed: path not found',
  'mutation.error.name-conflict': "Name conflict: '{shortName}' already exists",
  'mutation.error.multiplicity-exceeded': 'Maximum reached ({current}/{max})',
  'mutation.error.multiplicity-floor': 'Cannot go below minimum ({current}/{min})',
  'mutation.error.no-bswmd-for-module': 'Load BSWMD first',
  'mutation.error.invalid-param-type': "Parameter '{key}' is not defined in the BSWMD",
  'mutation.error.empty-short-name': 'Instance name cannot be empty',
  'mutation.error.invalid-short-name': "Invalid instance name: '{shortName}'",
  'mutation.error.module-not-found': "ECUC module not found at '{path}'",
  'mutation.error.removeDocument-not-found': "ARXML '{path}' is not loaded, cannot remove",
  'mutation.error.removeBswmd-not-found': "BSWMD '{path}' is not loaded, cannot remove",
  'mutation.action.addContainer': 'Add sub-container',
  'mutation.action.addParameter': 'Add parameter',
  'mutation.action.addReference': 'Add reference',
  'mutation.action.delete': "Delete '{name}'",
  'mutation.action.deleteParameter': 'Delete parameter',
  'mutation.action.removeModule': 'Remove module',
  'mutation.action.removeModuleAria': "Remove BSWMD '{name}'",
  'mutation.action.undo': 'Undo',
  'mutation.action.bswmdRemoved': "Removed BSWMD '{name}'",
  'mutation.action.undoFailed': 'Undo failed: BSWMD already restored or replaced',
  'mutation.action.deleteReferenceNotImplemented':
    'Deleting references is not yet implemented (tracked in Sprint A backlog)',
  'mutation.action.deleteModule': "Delete ECUC module '{name}'",
  'mutation.action.deleteModuleAria': "Delete ECUC module '{name}'",
  'mutation.info.ecucModuleDeleted': "Deleted ECUC module '{name}'",
  'mutation.info.ecucModuleUnlinked': "Deleted ECUC module '{name}', BSWMD link broken",
  'mutation.warning.cascadePartial':
    'Cascade delete completed, but {count} reference(s) could not be resolved (possibly removed by another action)',

  // CascadeConfirmDialog (3-option)
  'confirm.cascade.title': "Delete '{name}'?",
  'confirm.cascade.message': "'{name}' is referenced by {count} places:",
  'confirm.cascade.cancel': 'Cancel',
  'confirm.cascade.only': 'Only delete',
  'confirm.cascade.cascade': 'Cascade delete',

  // RemoveModuleConfirmDialog (4-option)
  'confirm.removeBswmd.title': "Remove BSWMD '{name}'?",
  'confirm.removeBswmd.message': "'{name}' is depended on by {count} value-side file(s):",
  'confirm.removeBswmd.cancel': 'Cancel',
  'confirm.removeBswmd.only': 'Only remove BSWMD',
  'confirm.removeBswmd.cascade': 'Also delete dependents',
  'confirm.removeBswmd.cascadeAndUnlink': 'Also delete + remove BSWMD from disk',

  // CloseProject confirm (3-button)
  'confirm.closeProject.title': 'Close project?',
  'confirm.closeProject.message':
    'This project has {count} unsaved change(s). Closing will discard them. Continue?',
  'confirm.closeProject.cancel': 'Cancel',
  'confirm.closeProject.discard': 'Discard all',
  'confirm.closeProject.save': 'Save and close',

  // templates (Sprint 13 #1)
  'template.empty.displayName': 'Empty Project',
  'template.empty.description': 'Start a new project from scratch',
  'template.classic.displayName': 'Classic Project',
  'template.classic.description': 'Project template with common BSWMD prefilled',
  'template.clone.displayName': 'Clone (coming soon)',
  'template.clone.description': 'Create a copy of an existing project',
  'template.comingSoon': 'Coming Soon',
};
