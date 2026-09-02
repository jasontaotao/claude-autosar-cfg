// i18n — ODX full-import wizard cluster types.

export interface OdxImportMessages {
  readonly 'odxImport.menu.label': string;
  readonly 'odxImport.title': string;
  readonly 'odxImport.close': string;
  readonly 'odxImport.pick.button': string;
  readonly 'odxImport.pick.picking': string;
  readonly 'odxImport.preview.parsing': string;
  readonly 'odxImport.dirty.saveFirst': string;
  readonly 'odxImport.dirty.target': string; // {module}
  readonly 'odxImport.variant.title': string;
  readonly 'odxImport.variant.select': string;
  readonly 'odxImport.variant.next': string;
  readonly 'odxImport.preview.title': string;
  readonly 'odxImport.preview.stats.services': string;
  readonly 'odxImport.preview.stats.dids': string;
  readonly 'odxImport.preview.stats.dtcs': string;
  readonly 'odxImport.preview.stats.sessions': string;
  readonly 'odxImport.preview.stats.securityLevels': string;
  readonly 'odxImport.preview.warnings': string; // {count}
  readonly 'odxImport.warning.unresolvedParentRef': string;
  readonly 'odxImport.warning.unsupportedCompu': string;
  readonly 'odxImport.warning.unsupportedDatatype': string;
  readonly 'odxImport.warning.typePromotion': string;
  readonly 'odxImport.warning.compuNotMapped': string;
  readonly 'odxImport.warning.unknownServiceClass': string;
  readonly 'odxImport.warning.dtcCodeInvalid': string;
  readonly 'odxImport.warning.dtcSeverityUnmapped': string;
  readonly 'odxImport.warning.didNoIdentifier': string;
  readonly 'odxImport.warning.sessionValueConflict': string;
  readonly 'odxImport.warning.securityUnpaired': string;
  readonly 'odxImport.warning.comparamExternal': string;
  readonly 'odxImport.warning.bswmdDefMissing': string;
  readonly 'odxImport.warning.manifestIgnored': string;
  readonly 'odxImport.warning.serviceSidInvalid': string;
  readonly 'odxImport.warning.defaultParamUsed': string;
  readonly 'odxImport.warning.routineParamsNotMapped': string;
  readonly 'odxImport.warning.memoryServiceNotMapped': string;
  readonly 'odxImport.warning.demCycleRefCheck': string;
  readonly 'odxImport.warning.elementSkipped': string;
  readonly 'odxImport.preview.table.path': string;
  readonly 'odxImport.preview.table.module': string;
  readonly 'odxImport.preview.table.name': string;
  readonly 'odxImport.preview.table.category': string;
  readonly 'odxImport.preview.table.decision': string;
  readonly 'odxImport.preview.noRows': string;
  readonly 'odxImport.decision.import': string;
  readonly 'odxImport.decision.keepLocal': string;
  readonly 'odxImport.decision.delete': string;
  readonly 'odxImport.category.added': string;
  readonly 'odxImport.category.updated': string;
  readonly 'odxImport.category.locallyModified': string;
  readonly 'odxImport.category.conflict': string;
  readonly 'odxImport.category.converged': string;
  readonly 'odxImport.category.removedInOdx': string;
  readonly 'odxImport.conflict.confirmImport': string;
  readonly 'odxImport.delete.confirm': string;
  readonly 'odxImport.action.commit': string;
  readonly 'odxImport.action.committing': string;
  readonly 'odxImport.action.back': string;
  readonly 'odxImport.done.title': string;
  readonly 'odxImport.done.body': string;
  readonly 'odxImport.done.manifest': string;
  readonly 'odxImport.error.readFailed': string;
  readonly 'odxImport.error.odxMalformed': string;
  readonly 'odxImport.error.odxTooLarge': string;
  readonly 'odxImport.error.odxNoVariant': string;
  readonly 'odxImport.error.odxVariantNotFound': string;
  readonly 'odxImport.error.odxInheritanceCycle': string;
  readonly 'odxImport.error.odxBswmdNotLoaded': string; // {module}
  readonly 'odxImport.error.odxTargetDirty': string; // {docPath}
  readonly 'odxImport.error.odxModuleAmbiguous': string; // {module}
  readonly 'odxImport.error.odxCommitMismatch': string;
  readonly 'odxImport.error.writeFailed': string; // {message}
  readonly 'odxImport.error.writeRolledBack': string;
  readonly 'odxImport.error.reload': string;
  readonly 'odxImport.error.unexpected': string;
}
