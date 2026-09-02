import type { ArxmlContainer, ArxmlElement, ArxmlModule, ParamValue } from '../arxml/types.js';
import type { BswmdDefIndex } from './bswmdDefIndex.js';
import type { Dim, DimService, DimWarning } from './dim.js';
import { dedupeShortName, legalizeShortName } from './shortName.js';

const MODULE_PATH = '/AUTOSAR_R22/EcucDefs/Dcm';

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

function param(
  key: string,
  value: string | number | boolean,
  index: BswmdDefIndex,
  warnings: DimWarning[],
): ParamValue | undefined {
  const definitionRef = index.paramPath.get(key);
  const definition = index.paramDef.get(key);
  if (!definitionRef || !definition) {
    warnings.push({
      code: 'odx-bswmd-def-missing',
      elementRef: key,
      message: `BSWMD parameter definition is missing: ${key}`,
    });
    if (typeof value === 'number') return { type: 'integer', value };
    if (typeof value === 'boolean') return { type: 'boolean', value };
    return { type: 'string', value: String(value) };
  }
  if (definition.kind === 'integer') {
    return { type: 'integer', value: Number(value), definitionRef };
  }
  if (definition.kind === 'float') return { type: 'float', value: Number(value), definitionRef };
  if (definition.kind === 'boolean') {
    return { type: 'boolean', value: value === true || value === 'true', definitionRef };
  }
  if (definition.kind === 'enumeration')
    return { type: 'enum', value: String(value), definitionRef };
  return { type: 'string', value: String(value), definitionRef };
}

function referenceParam(
  key: string,
  value: string,
  index: BswmdDefIndex,
  warnings: DimWarning[],
): ParamValue | undefined {
  const definitionRef = index.refPath.get(key);
  if (!definitionRef) {
    warnings.push({
      code: 'odx-bswmd-def-missing',
      elementRef: key,
      message: `BSWMD reference definition is missing: ${key}`,
    });
    return undefined;
  }
  return { type: 'reference', value, definitionRef };
}

function addParam(
  target: Record<string, ParamValue>,
  key: string,
  value: string | number | boolean,
  index: BswmdDefIndex,
  warnings: DimWarning[],
): void {
  const value2 = param(key, value, index, warnings);
  if (value2) target[key.split('/').pop() ?? key] = value2;
}

function addReference(
  target: Record<string, ParamValue>,
  key: string,
  value: string,
  index: BswmdDefIndex,
  warnings: DimWarning[],
): void {
  const value2 = referenceParam(key, value, index, warnings);
  if (value2) target[key.split('/').pop() ?? key] = value2;
}

function identifierFor(service: DimService): number | undefined {
  const semantic = service.request.find(
    (entry) => entry.semantic === 'ID' || entry.semantic === 'DATA-ID',
  );
  const value = semantic?.codedValue;
  if (value === undefined) return undefined;
  const parsed = /^0[xX]/.test(value) ? Number.parseInt(value, 16) : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0xffff) return undefined;
  return parsed;
}

function serviceRefs(group: readonly DimService[]): {
  sessions: readonly number[];
  security: readonly number[];
} {
  return {
    sessions: [...new Set(group.flatMap((service) => service.sessionRefs))].sort((a, b) => a - b),
    security: [...new Set(group.flatMap((service) => service.securityRefs))].sort((a, b) => a - b),
  };
}

function createServiceRows(
  dim: Dim,
  dsp: ArxmlContainer,
  dsd: ArxmlContainer,
  index: BswmdDefIndex,
  warnings: DimWarning[],
): void {
  const serviceTable = container(
    'DcmDsdServiceTable',
    'DcmDsd/DcmDsdServiceTable',
    index,
    warnings,
  );
  const taken = new Set<string>();
  const grouped = new Map<number, DimService[]>();

  for (const service of dim.services) {
    if (service.serviceClass === 'Unknown') {
      warnings.push({
        code: 'odx-unknown-service-class',
        elementRef: service.odxId,
        message: `Unknown service ${service.shortName} is not imported`,
      });
      continue;
    }
    if (service.sid >= 0x34 && service.sid <= 0x37) {
      warnings.push({
        code: 'odx-memory-service-not-mapped',
        elementRef: service.odxId,
        message: `Memory service ${service.shortName} maps only to DcmDsdService`,
      });
    }
    grouped.set(service.sid, [...(grouped.get(service.sid) ?? []), service]);
  }

  for (const [sid, group] of [...grouped.entries()].sort((a, b) => a[0] - b[0])) {
    const first = [...group].sort((a, b) => a.odxId.localeCompare(b.odxId))[0];
    const base = `${legalizeShortName(first?.shortName ?? 'Service', String(sid))}_Svc`;
    const shortName = dedupeShortName(base, taken);
    taken.add(shortName);
    const params: Record<string, ParamValue> = {};
    addParam(params, 'DcmDsdServiceTable/DcmDsdService/DcmDsdServiceUsed', true, index, warnings);
    addParam(
      params,
      'DcmDsdServiceTable/DcmDsdService/DcmDsdSidTabServiceId',
      sid,
      index,
      warnings,
    );
    addParam(
      params,
      'DcmDsdServiceTable/DcmDsdService/DcmDsdSidTabSubfuncAvail',
      group.some((service) => service.subFunction !== undefined),
      index,
      warnings,
    );
    const refs = serviceRefs(group);
    const sessionContainer = dsp.children.find(
      (child): child is ArxmlContainer =>
        child.kind === 'container' &&
        child.definitionRef !== undefined &&
        child.definitionRef.endsWith('/DcmDspSession'),
    );
    const sessionRows =
      sessionContainer?.children.flatMap((child) => (child.kind === 'container' ? [child] : [])) ??
      [];
    for (const sessionValue of refs.sessions) {
      const row = sessionRows.find(
        (candidate) => candidate.params.DcmDspSessionLevel?.value === sessionValue,
      );
      if (row) {
        addReference(
          params,
          'DcmDsdServiceTable/DcmDsdService/DcmDsdSidTabSessionLevelRef',
          `${MODULE_PATH}/DcmConfigSet/DcmDsp/DcmDspSession/${row.shortName}`,
          index,
          warnings,
        );
      }
    }
    const securityContainer = dsp.children.find(
      (child): child is ArxmlContainer =>
        child.kind === 'container' &&
        child.definitionRef !== undefined &&
        child.definitionRef.endsWith('/DcmDspSecurity'),
    );
    const securityRows =
      securityContainer?.children.flatMap((child) => (child.kind === 'container' ? [child] : [])) ??
      [];
    for (const securityValue of refs.security) {
      const row = securityRows.find(
        (candidate) => candidate.params.DcmDspSecurityLevel?.value === securityValue,
      );
      if (row) {
        addReference(
          params,
          'DcmDsdServiceTable/DcmDsdService/DcmDsdSidTabSecurityLevelRef',
          `${MODULE_PATH}/DcmConfigSet/DcmDsp/DcmDspSecurity/${row.shortName}`,
          index,
          warnings,
        );
      }
    }

    const subTaken = new Set<string>();
    const subServices = [
      ...new Set(
        group.flatMap((service) =>
          service.subFunction === undefined ? [] : [service.subFunction],
        ),
      ),
    ]
      .sort((a, b) => a - b)
      .map((subFunction) => {
        const source = group.find((service) => service.subFunction === subFunction)!;
        const childParams: Record<string, ParamValue> = {};
        addParam(
          childParams,
          'DcmDsdServiceTable/DcmDsdService/DcmDsdSubService/DcmDsdSubServiceId',
          subFunction,
          index,
          warnings,
        );
        addParam(
          childParams,
          'DcmDsdServiceTable/DcmDsdService/DcmDsdSubService/DcmDsdSubServiceUsed',
          true,
          index,
          warnings,
        );
        const child = container(
          dedupeShortName(legalizeShortName(source.shortName, String(subFunction)), subTaken),
          'DcmDsd/DcmDsdServiceTable/DcmDsdService/DcmDsdSubService',
          index,
          warnings,
        );
        return { ...child, params: childParams };
      });

    (serviceTable.children as ArxmlElement[]).push({
      ...container(shortName, 'DcmDsd/DcmDsdServiceTable/DcmDsdService', index, warnings),
      params,
      children: subServices,
    });
  }

  (dsd.children as ArxmlElement[]).push(serviceTable);
}

function createDid(
  identifier: number,
  index: BswmdDefIndex,
  warnings: DimWarning[],
): ArxmlContainer {
  const didName = `DID_${identifier.toString(16).toUpperCase().padStart(4, '0')}`;
  const params: Record<string, ParamValue> = {};
  addParam(params, 'DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidUsed', true, index, warnings);
  addParam(
    params,
    'DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidIdentifier',
    identifier,
    index,
    warnings,
  );
  addParam(
    params,
    'DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidUsePort',
    'USE_DATA_ELEMENT_SPECIFIC_INTERFACES',
    index,
    warnings,
  );

  const info = container(`${didName}_Info`, 'DcmConfigSet/DcmDsp/DcmDspDidInfo', index, warnings);
  const infoParams: Record<string, ParamValue> = {};
  addParam(
    infoParams,
    'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidDynamicallyDefined',
    false,
    index,
    warnings,
  );

  const read = container(
    `${didName}_Read`,
    'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidRead',
    index,
    warnings,
  );
  const write = container(
    `${didName}_Write`,
    'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidWrite',
    index,
    warnings,
  );
  const control = container(
    `${didName}_Control`,
    'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidControl',
    index,
    warnings,
  );
  const controlParams: Record<string, ParamValue> = {};
  addParam(
    controlParams,
    'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidControl/DcmDspDidFreezeCurrentState',
    true,
    index,
    warnings,
  );
  addParam(
    controlParams,
    'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidControl/DcmDspDidResetToDefault',
    true,
    index,
    warnings,
  );
  addParam(
    controlParams,
    'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidControl/DcmDspDidShortTermAdjustment',
    true,
    index,
    warnings,
  );
  addParam(
    controlParams,
    'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidControl/DcmDspDidControlMask',
    'DCM_CONTROLMASK_NO',
    index,
    warnings,
  );
  (info.children as ArxmlElement[]).push(
    { ...read, params: {} },
    { ...write, params: {} },
    { ...control, params: controlParams },
  );

  return {
    ...container(didName, 'DcmConfigSet/DcmDsp/DcmDspDid', index, warnings),
    params,
    children: [{ ...info, params: infoParams }],
  };
}

export function mapDcm(
  dim: Dim,
  index: BswmdDefIndex,
): { module: ArxmlModule; warnings: DimWarning[] } {
  const warnings: DimWarning[] = [];
  const configSet = container('DcmConfigSet', 'DcmConfigSet', index, warnings);
  const dsp = container('DcmDsp', 'DcmConfigSet/DcmDsp', index, warnings);
  const dsd = container('DcmDsd', 'DcmConfigSet/DcmDsd', index, warnings);
  const taken = new Set<string>();

  const sessionShell = container(
    'DcmDspSession',
    'DcmConfigSet/DcmDsp/DcmDspSession',
    index,
    warnings,
  );
  for (const session of dim.sessions) {
    const rowParams: Record<string, ParamValue> = {};
    addParam(
      rowParams,
      'DcmConfigSet/DcmDsp/DcmDspSession/DcmDspSessionRow/DcmDspSessionLevel',
      session.value,
      index,
      warnings,
    );
    addParam(
      rowParams,
      'DcmConfigSet/DcmDsp/DcmDspSession/DcmDspSessionRow/DcmDspSessionP2ServerMax',
      0.05,
      index,
      warnings,
    );
    addParam(
      rowParams,
      'DcmConfigSet/DcmDsp/DcmDspSession/DcmDspSessionRow/DcmDspSessionP2StarServerMax',
      5.0,
      index,
      warnings,
    );
    (sessionShell.children as ArxmlElement[]).push({
      ...container(
        dedupeShortName(legalizeShortName(session.name, String(session.value)), taken),
        'DcmConfigSet/DcmDsp/DcmDspSession/DcmDspSessionRow',
        index,
        warnings,
      ),
      params: rowParams,
    });
  }
  (dsp.children as ArxmlElement[]).push(sessionShell);

  const securityShell = container(
    'DcmDspSecurity',
    'DcmConfigSet/DcmDsp/DcmDspSecurity',
    index,
    warnings,
  );
  for (const security of dim.securityLevels) {
    const rowParams: Record<string, ParamValue> = {};
    addParam(
      rowParams,
      'DcmConfigSet/DcmDsp/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecurityLevel',
      security.level,
      index,
      warnings,
    );
    addParam(
      rowParams,
      'DcmConfigSet/DcmDsp/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecuritySeedSize',
      security.seedBytes ?? 4,
      index,
      warnings,
    );
    addParam(
      rowParams,
      'DcmConfigSet/DcmDsp/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecurityKeySize',
      security.keyBytes ?? 4,
      index,
      warnings,
    );
    addParam(
      rowParams,
      'DcmConfigSet/DcmDsp/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecurityDelayTime',
      10.0,
      index,
      warnings,
    );
    addParam(
      rowParams,
      'DcmConfigSet/DcmDsp/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecurityDelayTimeOnBoot',
      10.0,
      index,
      warnings,
    );
    addParam(
      rowParams,
      'DcmConfigSet/DcmDsp/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecurityAttemptCounterEnabled',
      false,
      index,
      warnings,
    );
    addParam(
      rowParams,
      'DcmConfigSet/DcmDsp/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecurityUsePort',
      'USE_ASYNCH_FNC',
      index,
      warnings,
    );
    (securityShell.children as ArxmlElement[]).push({
      ...container(
        dedupeShortName(legalizeShortName(security.name, String(security.level)), taken),
        'DcmConfigSet/DcmDsp/DcmDspSecurity/DcmDspSecurityRow',
        index,
        warnings,
      ),
      params: rowParams,
    });
  }
  (dsp.children as ArxmlElement[]).push(securityShell);

  const didGroups = new Map<number, DimService[]>();
  for (const service of dim.services) {
    if (
      !['ReadDataByIdentifier', 'WriteDataByIdentifier', 'InputOutputControlByIdentifier'].includes(
        service.serviceClass,
      )
    )
      continue;
    const identifier = identifierFor(service);
    if (identifier === undefined) {
      warnings.push({
        code: 'odx-did-no-identifier',
        elementRef: service.odxId,
        message: `Service ${service.shortName} has no valid DID identifier`,
      });
      continue;
    }
    didGroups.set(identifier, [...(didGroups.get(identifier) ?? []), service]);
  }
  for (const [identifier] of [...didGroups.entries()].sort((a, b) => a[0] - b[0])) {
    (dsp.children as ArxmlElement[]).push(createDid(identifier, index, warnings));
  }

  for (const service of dim.services) {
    if (service.serviceClass !== 'RoutineControl') continue;
    const identifier = identifierFor(service);
    if (identifier === undefined) {
      warnings.push({
        code: 'odx-did-no-identifier',
        elementRef: service.odxId,
        message: `Routine ${service.shortName} has no valid identifier`,
      });
      continue;
    }
    const routineParams: Record<string, ParamValue> = {};
    addParam(
      routineParams,
      'DcmConfigSet/DcmDsp/DcmDspRoutine/DcmDspRoutineUsed',
      true,
      index,
      warnings,
    );
    addParam(
      routineParams,
      'DcmConfigSet/DcmDsp/DcmDspRoutine/DcmDspRoutineUsePort',
      true,
      index,
      warnings,
    );
    addParam(
      routineParams,
      'DcmConfigSet/DcmDsp/DcmDspRoutine/DcmDspRoutineIdentifier',
      identifier,
      index,
      warnings,
    );
    addParam(
      routineParams,
      'DcmConfigSet/DcmDsp/DcmDspRoutine/DcmDspRoutineFncSignature',
      'ROUTINE_FNC_NORMAL',
      index,
      warnings,
    );
    (dsp.children as ArxmlElement[]).push({
      ...container(
        dedupeShortName(legalizeShortName(service.shortName, String(identifier)), taken),
        'DcmConfigSet/DcmDsp/DcmDspRoutine',
        index,
        warnings,
      ),
      params: routineParams,
    });
  }

  const shells: Array<[string, string]> = [
    ['DcmDspClearDTC', 'DcmConfigSet/DcmDsp/DcmDspClearDTC'],
    ['DcmDspComControl', 'DcmConfigSet/DcmDsp/DcmDspComControl'],
    ['DcmDspControlDTCSetting', 'DcmConfigSet/DcmDsp/DcmDspControlDTCSetting'],
  ];
  for (const [shortName, key] of shells) {
    if (
      !dim.services.some(
        (service) =>
          (service.sid === 0x14 && key.endsWith('DcmDspClearDTC')) ||
          (service.sid === 0x28 && key.endsWith('DcmDspComControl')) ||
          (service.sid === 0x85 && key.endsWith('DcmDspControlDTCSetting')),
      )
    )
      continue;
    (dsp.children as ArxmlElement[]).push(container(shortName, key, index, warnings));
  }

  const resetShell = container(
    'DcmDspEcuReset',
    'DcmConfigSet/DcmDsp/DcmDspEcuReset',
    index,
    warnings,
  );
  for (const service of dim.services.filter((candidate) => candidate.sid === 0x11)) {
    if (service.subFunction === undefined) continue;
    const rowParams: Record<string, ParamValue> = {};
    addParam(
      rowParams,
      'DcmConfigSet/DcmDsp/DcmDspEcuReset/DcmDspEcuResetRow/DcmDspEcuResetId',
      service.subFunction,
      index,
      warnings,
    );
    addParam(
      rowParams,
      'DcmConfigSet/DcmDsp/DcmDspEcuReset/DcmDspEcuResetRow/DcmResponseToEcuReset',
      'AFTER_RESET',
      index,
      warnings,
    );
    (resetShell.children as ArxmlElement[]).push({
      ...container(
        legalizeShortName(service.shortName, String(service.subFunction)),
        'DcmConfigSet/DcmDsp/DcmDspEcuReset/DcmDspEcuResetRow',
        index,
        warnings,
      ),
      params: rowParams,
    });
  }
  (dsp.children as ArxmlElement[]).push(resetShell);

  createServiceRows(dim, dsp, dsd, index, warnings);
  (configSet.children as ArxmlElement[]).push(dsp, dsd);

  return {
    module: {
      kind: 'module',
      tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
      shortName: 'Dcm',
      params: {},
      children: [configSet],
      references: [],
    },
    warnings,
  };
}
