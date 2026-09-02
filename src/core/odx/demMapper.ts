import type { ArxmlContainer, ArxmlElement, ArxmlModule, ParamValue } from '../arxml/types.js';
import type { BswmdDefIndex } from './bswmdDefIndex.js';
import type { Dim, DimWarning } from './dim.js';
import { dedupeShortName, legalizeShortName } from './shortName.js';

const MODULE_PATH = '/AUTOSAR_R22/EcucDefs/Dem';

function container(
  shortName: string,
  key: string,
  index: BswmdDefIndex,
  warnings: DimWarning[],
  children: readonly ArxmlElement[] = [],
): ArxmlContainer {
  const definitionRef = index.containerPath.get(key);
  if (!definitionRef) {
    warnings.push({
      code: 'odx-bswmd-def-missing',
      elementRef: shortName,
      message: `BSWMD container definition is missing: ${key}`,
    });
  }
  return {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName,
    params: {},
    children,
    ...(definitionRef === undefined ? {} : { definitionRef }),
  };
}

function addParam(
  target: Record<string, ParamValue>,
  key: string,
  value: string | number | boolean,
  index: BswmdDefIndex,
  warnings: DimWarning[],
): void {
  const definitionRef = index.paramPath.get(key);
  const definition = index.paramDef.get(key);
  if (!definitionRef || !definition) {
    warnings.push({
      code: 'odx-bswmd-def-missing',
      elementRef: key,
      message: `BSWMD parameter definition is missing: ${key}`,
    });
    const finalKey = key.split('/').pop() ?? key;
    if (typeof value === 'number') target[finalKey] = { type: 'integer', value };
    else if (typeof value === 'boolean') target[finalKey] = { type: 'boolean', value };
    else target[finalKey] = { type: 'string', value: String(value) };
    return;
  }
  const finalKey = key.split('/').pop() ?? key;
  if (definition.kind === 'integer')
    target[finalKey] = { type: 'integer', value: Number(value), definitionRef };
  else if (definition.kind === 'float')
    target[finalKey] = { type: 'float', value: Number(value), definitionRef };
  else if (definition.kind === 'boolean')
    target[finalKey] = {
      type: 'boolean',
      value: value === true || value === 'true',
      definitionRef,
    };
  else if (definition.kind === 'enumeration')
    target[finalKey] = { type: 'enum', value: String(value), definitionRef };
  else target[finalKey] = { type: 'string', value: String(value), definitionRef };
}

function addReference(
  target: Record<string, ParamValue>,
  key: string,
  value: string,
  index: BswmdDefIndex,
  warnings: DimWarning[],
): void {
  const definitionRef = index.refPath.get(key);
  if (!definitionRef) {
    warnings.push({
      code: 'odx-bswmd-def-missing',
      elementRef: key,
      message: `BSWMD reference definition is missing: ${key}`,
    });
    return;
  }
  target[key.split('/').pop() ?? key] = { type: 'reference', value, definitionRef };
}

export function mapDem(
  dim: Dim,
  index: BswmdDefIndex,
): { module: ArxmlModule; warnings: DimWarning[] } {
  const warnings: DimWarning[] = [];
  const configSet = container('DemConfigSet', 'DemConfigSet', index, warnings);
  const eventShell = container(
    'DemEventParameter',
    'DemConfigSet/DemEventParameter',
    index,
    warnings,
  );
  const dtcShell = container('DemDTC', 'DemConfigSet/DemDTC', index, warnings);
  const taken = new Set<string>();

  const dtcs = [...dim.dtcs].sort((a, b) => a.troubleCode - b.troubleCode);
  for (const [index0, dtc] of dtcs.entries()) {
    const name = dedupeShortName(
      legalizeShortName(dtc.shortName, dtc.odxId || String(dtc.troubleCode)),
      taken,
    );
    taken.add(name);
    const eventParams: Record<string, ParamValue> = {};
    addParam(eventParams, 'DemConfigSet/DemEventParameter/DemEventId', index0 + 1, index, warnings);
    addParam(
      eventParams,
      'DemConfigSet/DemEventParameter/DemEventAvailable',
      true,
      index,
      warnings,
    );
    addParam(
      eventParams,
      'DemConfigSet/DemEventParameter/DemEventConfirmationThreshold',
      1,
      index,
      warnings,
    );
    addParam(
      eventParams,
      'DemConfigSet/DemEventParameter/DemEventKind',
      'DEM_EVENT_KIND_SWC',
      index,
      warnings,
    );
    addParam(
      eventParams,
      'DemConfigSet/DemEventParameter/DemEventReportingType',
      'STANDARD_REPORTING',
      index,
      warnings,
    );
    addParam(
      eventParams,
      'DemConfigSet/DemEventParameter/DemFFPrestorageSupported',
      false,
      index,
      warnings,
    );
    addReference(
      eventParams,
      'DemConfigSet/DemEventParameter/DemOperationCycleRef',
      `${MODULE_PATH}/DemGeneral/DemOperationCycle_1`,
      index,
      warnings,
    );

    const dtcParams: Record<string, ParamValue> = {};
    addParam(dtcParams, 'DemConfigSet/DemDTC/DemDtcValue', dtc.troubleCode, index, warnings);
    if (dtc.functionalUnit !== undefined) {
      addParam(
        dtcParams,
        'DemConfigSet/DemDTC/DemDTCFunctionalUnit',
        dtc.functionalUnit,
        index,
        warnings,
      );
    }

    (eventShell.children as ArxmlElement[]).push({
      ...container(name, 'DemConfigSet/DemEventParameter', index, warnings),
      params: eventParams,
    });
    (dtcShell.children as ArxmlElement[]).push({
      ...container(name, 'DemConfigSet/DemDTC', index, warnings),
      params: dtcParams,
    });
  }

  (configSet.children as ArxmlElement[]).push(eventShell, dtcShell);
  const general = container('DemGeneral', 'DemGeneral', index, warnings);
  (general.children as ArxmlElement[]).push(
    container('DemOperationCycle_1', 'DemGeneral/DemOperationCycle', index, warnings),
  );

  return {
    module: {
      kind: 'module',
      tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
      shortName: 'Dem',
      params: {},
      children: [configSet, general],
      references: [],
    },
    warnings,
  };
}
