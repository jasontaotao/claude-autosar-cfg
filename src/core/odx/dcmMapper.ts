import type { ArxmlContainer, ArxmlElement, ArxmlModule, ParamValue } from '../arxml/types.js';
import type { BswmdDefIndex } from './bswmdDefIndex.js';
import type { Dim, DimDataObject, DimService, DimWarning } from './dim.js';
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

function strictPruneUnanchoredContainers(element: ArxmlContainer): ArxmlContainer {
  return {
    ...element,
    params: Object.fromEntries(
      Object.entries(element.params).filter(([, value]) => value.definitionRef !== undefined),
    ),
    children: element.children
      .filter((child) => child.kind !== 'container' || child.definitionRef !== undefined)
      .map((child) =>
        child.kind === 'container' ? strictPruneUnanchoredContainers(child) : child,
      ),
  };
}

function dataRefs(
  group: readonly DimService[],
): readonly { readonly odxId: string; readonly bytePosition: number }[] {
  const refs = new Map<string, number>();
  for (const service of group) {
    for (const requestParam of service.request) {
      if (requestParam.dataObjectRef === undefined) continue;
      const existing = refs.get(requestParam.dataObjectRef);
      if (existing === undefined || requestParam.bytePosition < existing)
        refs.set(requestParam.dataObjectRef, requestParam.bytePosition);
    }
    for (const response of service.posResponses) {
      for (const responseParam of response) {
        if (responseParam.dataObjectRef === undefined) continue;
        const existing = refs.get(responseParam.dataObjectRef);
        if (existing === undefined || responseParam.bytePosition < existing)
          refs.set(responseParam.dataObjectRef, responseParam.bytePosition);
      }
    }
  }
  return [...refs.entries()]
    .map(([odxId, bytePosition]) => ({ odxId, bytePosition }))
    .sort((a, b) => a.bytePosition - b.bytePosition || a.odxId.localeCompare(b.odxId));
}

function dcmDspDataType(dataObject: DimDataObject, warnings: DimWarning[]): string {
  const bitLength =
    dataObject.codedType.kind === 'standard' ? dataObject.codedType.bitLength : undefined;
  if (dataObject.baseDataType === 'A_UINT32') {
    if (bitLength === 1) return 'BOOLEAN';
    if (bitLength !== undefined && bitLength <= 8) return 'UINT8';
    if (bitLength !== undefined && bitLength <= 16) return 'UINT16';
    if (bitLength !== undefined && bitLength <= 32) return 'UINT32';
    warnings.push({
      code: 'odx-type-promotion',
      elementRef: dataObject.odxId,
      message: `DOP ${dataObject.shortName} promoted to UINT8_N`,
    });
    return 'UINT8_N';
  }
  if (dataObject.baseDataType === 'A_INT32' && dataObject.encoding.includes('2C')) {
    if (bitLength === undefined) return 'SINT8';
    if (bitLength <= 8) return 'SINT8';
    if (bitLength <= 16) return 'SINT16';
    if (bitLength <= 32) return 'SINT32';
  }
  if (dataObject.encoding.includes('IEEE-FLOAT32')) return 'FLOAT';
  if (['A_ASCIISTRING', 'A_UNICODE2STRING', 'A_BYTEFIELD'].includes(dataObject.baseDataType)) {
    if (dataObject.codedType.kind === 'minmax') return 'UINT8_DYN';
    return 'UINT8_N';
  }
  warnings.push({
    code: 'odx-unsupported-datatype',
    elementRef: dataObject.odxId,
    message: `Unsupported DOP base data type ${dataObject.baseDataType}; using UINT8_N`,
  });
  return 'UINT8_N';
}

function dcmDataByteSize(dataObject: DimDataObject): number | undefined {
  if (dataObject.codedType.kind === 'minmax') return dataObject.codedType.maxBytes;
  if (dataObject.codedType.kind === 'standard')
    return Math.ceil(dataObject.codedType.bitLength / 8);
  return undefined;
}

function createDcmDspData(
  dataObject: DimDataObject,
  shortName: string,
  index: BswmdDefIndex,
  warnings: DimWarning[],
): ArxmlContainer {
  const params: Record<string, ParamValue> = {};
  if (dataObject) {
    addParam(
      params,
      'DcmConfigSet/DcmDsp/DcmDspData/DcmDspDataType',
      dcmDspDataType(dataObject, warnings),
      index,
      warnings,
    );
    const byteSize = dcmDataByteSize(dataObject);
    if (byteSize !== undefined)
      addParam(
        params,
        'DcmConfigSet/DcmDsp/DcmDspData/DcmDspDataByteSize',
        byteSize,
        index,
        warnings,
      );
  }
  addParam(
    params,
    'DcmConfigSet/DcmDsp/DcmDspData/DcmDspDataUsePort',
    'USE_DATA_SYNCH_CLIENT_SERVER',
    index,
    warnings,
  );
  return {
    ...container(shortName, 'DcmConfigSet/DcmDsp/DcmDspData', index, warnings),
    params,
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
  group: readonly DimService[],
  dataContainers: readonly ArxmlContainer[],
  index: BswmdDefIndex,
  warnings: DimWarning[],
): { did: ArxmlContainer; info: ArxmlContainer } {
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
  if (dataContainers.length > 0) {
    const byteSize = dataContainers.reduce((total, child) => {
      const value = child.params.DcmDspDataByteSize;
      return typeof value?.value === 'number' ? total + value.value : total;
    }, 0);
    if (byteSize > 0)
      addParam(params, 'DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidSize', byteSize, index, warnings);
    addReference(
      params,
      'DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidInfoRef',
      `${MODULE_PATH}/DcmConfigSet/DcmDsp/DcmDspDidInfo/${didName}_Info`,
      index,
      warnings,
    );
    const firstData = dataContainers[0];
    if (firstData)
      addReference(
        params,
        'DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidRef',
        `${MODULE_PATH}/DcmConfigSet/DcmDsp/DcmDspData/${firstData.shortName}`,
        index,
        warnings,
      );
  }

  const info = container(`${didName}_Info`, 'DcmConfigSet/DcmDsp/DcmDspDidInfo', index, warnings);
  const infoParams: Record<string, ParamValue> = {};
  addParam(
    infoParams,
    'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidDynamicallyDefined',
    false,
    index,
    warnings,
  );
  (info.children as ArxmlElement[]).length = 0;

  const readGroup = group.filter((service) => service.serviceClass === 'ReadDataByIdentifier');
  if (readGroup.length > 0) {
    const read = container(
      `${didName}_Read`,
      'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidRead',
      index,
      warnings,
    );
    const refs = serviceRefs(readGroup);
    const readParams: Record<string, ParamValue> = {};
    for (const value of refs.sessions) {
      addReference(
        readParams,
        'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidRead/DcmDspDidReadSessionRef',
        `${MODULE_PATH}/DcmConfigSet/DcmDsp/DcmDspSession/Session_${value}`,
        index,
        warnings,
      );
    }
    for (const value of refs.security) {
      addReference(
        readParams,
        'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidRead/DcmDspDidReadSecurityLevelRef',
        `${MODULE_PATH}/DcmConfigSet/DcmDsp/DcmDspSecurity/Security_${value}`,
        index,
        warnings,
      );
    }
    (info.children as ArxmlElement[]).push({ ...read, params: readParams });
  }

  const writeGroup = group.filter((service) => service.serviceClass === 'WriteDataByIdentifier');
  if (writeGroup.length > 0) {
    const write = container(
      `${didName}_Write`,
      'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidWrite',
      index,
      warnings,
    );
    const refs = serviceRefs(writeGroup);
    const writeParams: Record<string, ParamValue> = {};
    for (const value of refs.sessions) {
      addReference(
        writeParams,
        'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidWrite/DcmDspDidWriteSessionRef',
        `${MODULE_PATH}/DcmConfigSet/DcmDsp/DcmDspSession/Session_${value}`,
        index,
        warnings,
      );
    }
    for (const value of refs.security) {
      addReference(
        writeParams,
        'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidWrite/DcmDspDidWriteSecurityLevelRef',
        `${MODULE_PATH}/DcmConfigSet/DcmDsp/DcmDspSecurity/Security_${value}`,
        index,
        warnings,
      );
    }
    (info.children as ArxmlElement[]).push({ ...write, params: writeParams });
  }

  const controlGroup = group.filter(
    (service) => service.serviceClass === 'InputOutputControlByIdentifier',
  );
  if (controlGroup.length > 0) {
    const control = container(
      `${didName}_Control`,
      'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidControl',
      index,
      warnings,
    );
    const refs = serviceRefs(controlGroup);
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
    for (const value of refs.sessions) {
      addReference(
        controlParams,
        'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidControl/DcmDspDidControlSessionRef',
        `${MODULE_PATH}/DcmConfigSet/DcmDsp/DcmDspSession/Session_${value}`,
        index,
        warnings,
      );
    }
    for (const value of refs.security) {
      addReference(
        controlParams,
        'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidControl/DcmDspDidControlSecurityLevelRef',
        `${MODULE_PATH}/DcmConfigSet/DcmDsp/DcmDspSecurity/Security_${value}`,
        index,
        warnings,
      );
    }
    (info.children as ArxmlElement[]).push({ ...control, params: controlParams });
  }

  return {
    did: {
      ...container(didName, 'DcmConfigSet/DcmDsp/DcmDspDid', index, warnings),
      params,
      children: [],
    },
    info: { ...info, params: infoParams },
  };
}

export function mapDcm(
  dim: Dim,
  index: BswmdDefIndex,
  options?: { readonly allowMissingDefinitions?: boolean },
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
    addParam(
      rowParams,
      'DcmConfigSet/DcmDsp/DcmDspSession/DcmDspSessionRow/DcmDspSessionForBoot',
      'DCM_NO_BOOT',
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
  {
    const securityShellParams = securityShell.params as Record<string, ParamValue>;
    addParam(
      securityShellParams,
      'DcmConfigSet/DcmDsp/DcmDspSecurity/DcmDspSecurityMaxAttemptCounterReadoutTime',
      0.0,
      index,
      warnings,
    );
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

  const dataObjectById = new Map(dim.dataObjects.map((entry) => [entry.odxId, entry]));
  const dataRefsByDid = new Map<number, ReturnType<typeof dataRefs>>();
  const uniqueDataObjects = new Map<
    string,
    { readonly bytePosition: number; readonly dataObject: DimDataObject }
  >();
  for (const [identifier, group] of didGroups) {
    const refs = dataRefs(group);
    dataRefsByDid.set(identifier, refs);
    for (const ref of refs) {
      const dataObject = dataObjectById.get(ref.odxId);
      if (!dataObject) {
        warnings.push({
          code: 'odx-element-skipped',
          elementRef: ref.odxId,
          message: `DOP reference ${ref.odxId} was not found in the selected diagnostic layer`,
        });
        continue;
      }
      const existing = uniqueDataObjects.get(ref.odxId);
      if (!existing || ref.bytePosition < existing.bytePosition)
        uniqueDataObjects.set(ref.odxId, { bytePosition: ref.bytePosition, dataObject });
    }
  }

  const dataContainerByOdxId = new Map<string, ArxmlContainer>();
  const dataTaken = new Set<string>();
  for (const dataObject of [...uniqueDataObjects.values()]
    .map((entry) => entry.dataObject)
    .sort((a, b) => a.odxId.localeCompare(b.odxId))) {
    const shortName = dedupeShortName(
      legalizeShortName(dataObject.shortName, dataObject.odxId),
      dataTaken,
    );
    dataTaken.add(shortName);
    const dataContainer = createDcmDspData(dataObject, shortName, index, warnings);
    dataContainerByOdxId.set(dataObject.odxId, dataContainer);
    (dsp.children as ArxmlElement[]).push(dataContainer);
  }

  for (const [identifier, group] of [...didGroups.entries()].sort((a, b) => a[0] - b[0])) {
    const dataContainers = (dataRefsByDid.get(identifier) ?? [])
      .map((ref) => dataContainerByOdxId.get(ref.odxId))
      .filter((entry): entry is ArxmlContainer => entry !== undefined);
    const created = createDid(identifier, group, dataContainers, index, warnings);
    (dsp.children as ArxmlElement[]).push(created.did, created.info);
  }

  for (const service of dim.services
    .filter((service) => service.serviceClass === 'RoutineControl')
    .sort((a, b) => (identifierFor(a) ?? 0xffff) - (identifierFor(b) ?? 0xffff))) {
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

  const defaultUses = new Map<string, number>();
  const useDefault = (key: string, count: number): void => {
    if (count > 0) defaultUses.set(key, (defaultUses.get(key) ?? 0) + count);
  };
  useDefault(
    'DcmConfigSet/DcmDsp/DcmDspSession/DcmDspSessionRow/DcmDspSessionP2ServerMax',
    dim.sessions.length,
  );
  useDefault(
    'DcmConfigSet/DcmDsp/DcmDspSession/DcmDspSessionRow/DcmDspSessionP2StarServerMax',
    dim.sessions.length,
  );
  useDefault(
    'DcmConfigSet/DcmDsp/DcmDspSession/DcmDspSessionRow/DcmDspSessionForBoot',
    dim.sessions.length,
  );
  useDefault(
    'DcmConfigSet/DcmDsp/DcmDspSecurity/DcmDspSecurityMaxAttemptCounterReadoutTime',
    dim.securityLevels.length > 0 ? 1 : 0,
  );
  useDefault(
    'DcmConfigSet/DcmDsp/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecuritySeedSize',
    dim.securityLevels.filter((level) => level.seedBytes === undefined).length,
  );
  useDefault(
    'DcmConfigSet/DcmDsp/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecurityKeySize',
    dim.securityLevels.filter((level) => level.keyBytes === undefined).length,
  );
  useDefault(
    'DcmConfigSet/DcmDsp/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecurityDelayTime',
    dim.securityLevels.length,
  );
  useDefault(
    'DcmConfigSet/DcmDsp/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecurityDelayTimeOnBoot',
    dim.securityLevels.length,
  );
  useDefault(
    'DcmConfigSet/DcmDsp/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecurityAttemptCounterEnabled',
    dim.securityLevels.length,
  );
  useDefault(
    'DcmConfigSet/DcmDsp/DcmDspSecurity/DcmDspSecurityRow/DcmDspSecurityUsePort',
    dim.securityLevels.length,
  );
  useDefault('DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidUsed', didGroups.size);
  useDefault('DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidUsePort', didGroups.size);
  useDefault('DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidDynamicallyDefined', didGroups.size);
  for (const [, group] of didGroups) {
    useDefault(
      'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidControl/DcmDspDidFreezeCurrentState',
      group.some((service) => service.serviceClass === 'InputOutputControlByIdentifier') ? 1 : 0,
    );
    useDefault(
      'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidControl/DcmDspDidResetToDefault',
      group.some((service) => service.serviceClass === 'InputOutputControlByIdentifier') ? 1 : 0,
    );
    useDefault(
      'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidControl/DcmDspDidShortTermAdjustment',
      group.some((service) => service.serviceClass === 'InputOutputControlByIdentifier') ? 1 : 0,
    );
    useDefault(
      'DcmConfigSet/DcmDsp/DcmDspDidInfo/DcmDspDidControl/DcmDspDidControlMask',
      group.some((service) => service.serviceClass === 'InputOutputControlByIdentifier') ? 1 : 0,
    );
    useDefault('DcmConfigSet/DcmDsp/DcmDspData/DcmDspDataUsePort', dataRefs(group).length);
  }
  for (const key of [
    'DcmConfigSet/DcmDsp/DcmDspRoutine/DcmDspRoutineUsed',
    'DcmConfigSet/DcmDsp/DcmDspRoutine/DcmDspRoutineUsePort',
    'DcmConfigSet/DcmDsp/DcmDspRoutine/DcmDspRoutineFncSignature',
  ]) {
    useDefault(
      key,
      dim.services.filter(
        (service) =>
          service.serviceClass === 'RoutineControl' && identifierFor(service) !== undefined,
      ).length,
    );
  }
  for (const [key, count] of [...defaultUses.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    warnings.push({
      code: 'odx-default-param-used',
      elementRef: key,
      message: `Default BSWMD parameter used ${count} time(s): ${key}`,
    });
  }

  return {
    module: {
      kind: 'module',
      tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
      shortName: 'Dcm',
      params: {},
      children: [
        options?.allowMissingDefinitions ? configSet : strictPruneUnanchoredContainers(configSet),
      ],
      references: [],
    },
    warnings,
  };
}
