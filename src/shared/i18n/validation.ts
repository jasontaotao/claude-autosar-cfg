// i18n — Validation cluster types.
//
// Contains `validation.*`, `swsValidator.*`, `bswmdParser.*`,
// `parserError.*`, `mutation.*`, `template.*` keys covering the
// validation panel, SWS rule messages, BSWMD/ARXML parse errors,
// ECUC mutation error envelopes + action labels, and project
// template cards.

export interface ValidationMessages {
  // --- validation panel ---
  readonly 'validation.title': string;
  readonly 'validation.allPassed': string;
  readonly 'validation.subtitle': string;
  readonly 'validation.violation': string; // {count}
  readonly 'validation.violations': string; // {count}

  // --- SWS Validator (v1.6.0 Cluster G — §2 G9) ---
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

  // --- bswmd parser errors (BswmdError → human message) ---
  readonly 'bswmdParser.xmlMalformed': string; // {message}
  readonly 'bswmdParser.missingRoot': string;
  readonly 'bswmdParser.unsupportedVersion': string; // {version}
  readonly 'bswmdParser.invalidStructure': string; // {path} {message}

  // --- ARXML parse errors (parser side; mirrors bswmdParser shape) ---
  readonly 'parserError.xmlMalformed': string; // {message}
  readonly 'parserError.missingRoot': string; // {message}
  readonly 'parserError.unsupportedVersion': string; // {version}
  readonly 'parserError.invalidStructure': string; // {path} {message}

  // --- ECUC mutation (Sprint 15+) ---
  readonly 'mutation.error.path-not-found': string;
  readonly 'mutation.error.name-conflict': string; // {shortName}
  readonly 'mutation.error.multiplicity-exceeded': string; // {current} {max}
  readonly 'mutation.error.multiplicity-floor': string; // {current} {min}
  readonly 'mutation.error.no-bswmd-for-module': string;
  readonly 'mutation.error.invalid-param-type': string; // {key}
  readonly 'mutation.error.module-not-found': string; // {path}
  readonly 'mutation.action.addContainer': string;
  readonly 'mutation.action.addParameter': string;
  readonly 'mutation.action.addReference': string;
  readonly 'mutation.action.delete': string; // {name}
  readonly 'mutation.action.deleteParameter': string; // aria-label
  readonly 'mutation.action.removeModule': string;
  readonly 'mutation.action.removeModuleAria': string; // {name}
  readonly 'mutation.action.undo': string;
  readonly 'mutation.action.bswmdRemoved': string; // {name}
  readonly 'mutation.action.undoFailed': string;
  readonly 'mutation.action.deleteReferenceNotImplemented': string;
  readonly 'mutation.action.deleteModule': string; // {name}
  readonly 'mutation.action.deleteModuleAria': string; // {name}
  readonly 'mutation.info.ecucModuleDeleted': string; // {name}
  readonly 'mutation.info.ecucModuleUnlinked': string; // {name}
  readonly 'mutation.warning.cascadePartial': string; // {count}

  // --- CascadeConfirmDialog (3-option) ---
  readonly 'confirm.cascade.title': string; // {name}
  readonly 'confirm.cascade.message': string; // {count}
  readonly 'confirm.cascade.cancel': string;
  readonly 'confirm.cascade.only': string;
  readonly 'confirm.cascade.cascade': string;

  // --- RemoveModuleConfirmDialog (4-option) ---
  readonly 'confirm.removeBswmd.title': string; // {name}
  readonly 'confirm.removeBswmd.message': string; // {name} {count}
  readonly 'confirm.removeBswmd.cancel': string;
  readonly 'confirm.removeBswmd.only': string;
  readonly 'confirm.removeBswmd.cascade': string;
  readonly 'confirm.removeBswmd.cascadeAndUnlink': string;

  // --- CloseProject confirm (3-button) ---
  readonly 'confirm.closeProject.title': string;
  readonly 'confirm.closeProject.message': string; // {count}
  readonly 'confirm.closeProject.cancel': string;
  readonly 'confirm.closeProject.discard': string;
  readonly 'confirm.closeProject.save': string;

  // --- templates (Sprint 13 #1) ---
  readonly 'template.empty.displayName': string;
  readonly 'template.empty.description': string;
  readonly 'template.classic.displayName': string;
  readonly 'template.classic.description': string;
  readonly 'template.clone.displayName': string;
  readonly 'template.clone.description': string;
  readonly 'template.comingSoon': string;
}
