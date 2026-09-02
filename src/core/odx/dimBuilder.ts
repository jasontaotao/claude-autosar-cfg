import type {
  Dim,
  DimDtc,
  DimParam,
  DimSecurityLevel,
  DimService,
  DimServiceClass,
  DimSession,
  DimWarning,
} from './dim.js';
import { resolveLayer } from './layerResolver.js';
import { resolveDataObjects } from './dopResolver.js';
import type { OdxDocument, OdxRawElement } from './odxDocument.js';

const SID_CLASS: Record<number, DimServiceClass> = {
  0x10: 'DiagnosticSessionControl',
  0x11: 'ECUReset',
  0x14: 'ClearDiagnosticInformation',
  0x19: 'ReadDTCInformation',
  0x22: 'ReadDataByIdentifier',
  0x27: 'SecurityAccess',
  0x28: 'CommunicationControl',
  0x2e: 'WriteDataByIdentifier',
  0x2f: 'InputOutputControlByIdentifier',
  0x31: 'RoutineControl',
  0x34: 'RequestDownload',
  0x35: 'RequestUpload',
  0x36: 'TransferData',
  0x37: 'RequestTransferExit',
  0x3e: 'TesterPresent',
  0x85: 'ControlDTCSetting',
};

const SEMANTIC_CLASS: Record<string, DimServiceClass> = {
  SESSION: 'DiagnosticSessionControl',
  SECURITY: 'SecurityAccess',
  STOREDDATA: 'ReadDataByIdentifier',
  CONTROL: 'RoutineControl',
  FAULTMEMORY: 'ReadDTCInformation',
};

function childFirst(element: OdxRawElement | undefined, tag: string): OdxRawElement | undefined {
  return element?.children[tag]?.[0];
}

function shortName(element: OdxRawElement | undefined): string {
  return childFirst(element, 'SHORT-NAME')?.text ?? '';
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const radix = /^0[xX]/.test(value) ? 16 : 10;
  const parsed = Number.parseInt(value, radix);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function flattenValues(elements: readonly OdxRawElement[]): string[] {
  return elements.flatMap((element) => (element.text === undefined ? [] : [element.text]));
}

function sdgAnnotations(service: OdxRawElement): Record<string, string> {
  const annotations: Record<string, string> = {};
  const sdgs = childFirst(service, 'SDGS');
  for (const sdg of sdgs?.children.SDG ?? []) {
    for (const sd of sdg.children.SD ?? []) {
      const key = sd.attrs.SI;
      if (key && sd.text !== undefined) annotations[key] = sd.text;
    }
  }
  return annotations;
}

function mapParams(
  parent: OdxRawElement | undefined,
  warnings: DimWarning[],
  elementRef: string,
): DimParam[] {
  const params = childFirst(parent, 'PARAMS')?.children.PARAM ?? [];
  return params.map((param, index) => {
    const dataObjectRef = childFirst(param, 'DOP-REF')?.attrs['ID-REF'];
    const bitPositionText = childFirst(param, 'BIT-POSITION')?.text;
    const bitPosition = parseNumber(bitPositionText);
    const bytePosition = parseNumber(childFirst(param, 'BYTE-POSITION')?.text) ?? index;
    const semantic = param.attrs.SEMANTIC;
    const codedValue = childFirst(param, 'CODED-VALUE')?.text;
    const name = shortName(param);

    if (!name) {
      warnings.push({
        code: 'odx-element-skipped',
        elementRef,
        message: 'Diagnostic parameter has no SHORT-NAME',
      });
    }

    return {
      name,
      ...(semantic === undefined ? {} : { semantic }),
      ...(codedValue === undefined ? {} : { codedValue }),
      bytePosition,
      ...(bitPosition === undefined ? {} : { bitPosition }),
      ...(dataObjectRef === undefined ? {} : { dataObjectRef }),
    };
  });
}

function resolveService(
  service: OdxRawElement,
  document: OdxDocument,
  warnings: DimWarning[],
): DimService | undefined {
  const odxId = service.attrs.ID ?? '';
  const request = document.idIndex.get(childFirst(service, 'REQUEST-REF')?.attrs['ID-REF'] ?? '');
  const params = mapParams(request, warnings, odxId);
  const sidParam = params.find((param) => param.semantic === 'SERVICE-ID');
  const sid = parseNumber(sidParam?.codedValue);

  if (sid === undefined || sid < 0 || sid > 255) {
    warnings.push({
      code: 'odx-service-sid-invalid',
      elementRef: odxId,
      message: 'Diagnostic service has a missing or invalid SID',
    });
    return undefined;
  }

  const semantic = service.attrs.SEMANTIC;
  const serviceClass = SID_CLASS[sid] ?? SEMANTIC_CLASS[semantic ?? ''] ?? 'Unknown';
  if (serviceClass === 'Unknown') {
    warnings.push({
      code: 'odx-unknown-service-class',
      elementRef: odxId,
      message: `Unknown service class for SID ${sid}`,
    });
  }

  const subFunctionParam = params.find((param) => param.semantic === 'SUBFUNCTION');
  const rawSubFunction = parseNumber(subFunctionParam?.codedValue);
  const subFunction = rawSubFunction === undefined ? undefined : rawSubFunction & 0x7f;

  const posResponses = (
    childFirst(service, 'POS-RESPONSE-REFS')?.children['POS-RESPONSE-REF'] ?? []
  )
    .map((ref) => document.idIndex.get(ref.attrs['ID-REF'] ?? ''))
    .filter((response): response is OdxRawElement => response !== undefined)
    .map((response) => mapParams(response, warnings, odxId));

  const negResponses = (
    childFirst(service, 'NEG-RESPONSE-REFS')?.children['NEG-RESPONSE-REF'] ?? []
  )
    .map((ref) => document.idIndex.get(ref.attrs['ID-REF'] ?? ''))
    .filter((response): response is OdxRawElement => response !== undefined);

  const negResponseCodes = negResponses
    .flatMap((response) => response.children.PARAMS?.[0]?.children.PARAM ?? [])
    .filter((param) => param.attrs['xsi:type'] === 'NRC-CONST')
    .flatMap((param) =>
      flattenValues(childFirst(param, 'CODED-VALUES')?.children['CODED-VALUE'] ?? []),
    );

  const longName = childFirst(service, 'LONG-NAME')?.text;
  const name = shortName(service);
  if (!name) {
    warnings.push({
      code: 'odx-element-skipped',
      elementRef: odxId,
      message: 'Diagnostic service has no SHORT-NAME',
    });
  }

  return {
    odxId,
    shortName: name,
    ...(longName === undefined ? {} : { longName }),
    ...(semantic === undefined ? {} : { semantic }),
    serviceClass,
    sid,
    ...(subFunction === undefined ? {} : { subFunction }),
    request: params,
    posResponses,
    negResponseCodes,
    sdgAnnotations: sdgAnnotations(service),
    sessionRefs: [],
    securityRefs: [],
  };
}

function buildSessions(services: readonly DimService[], warnings: DimWarning[]): DimSession[] {
  const byValue = new Map<number, DimSession>();
  for (const service of services) {
    if (service.serviceClass !== 'DiagnosticSessionControl') continue;
    if (service.subFunction === undefined) {
      warnings.push({
        code: 'odx-session-value-conflict',
        elementRef: service.odxId,
        message: 'Session service has no subFunction',
      });
      continue;
    }
    const session = { name: service.shortName, value: service.subFunction };
    const existing = byValue.get(session.value);
    if (existing && existing.name !== session.name) {
      warnings.push({
        code: 'odx-session-value-conflict',
        elementRef: service.odxId,
        message: `Multiple names for session value ${session.value}`,
      });
      continue;
    }
    byValue.set(session.value, session);
  }
  return [...byValue.values()].sort((a, b) => a.value - b.value);
}

function bitLengthForDop(
  dataObjectRef: string | undefined,
  bitLengths: ReadonlyMap<string, number>,
): number | undefined {
  if (!dataObjectRef) return undefined;
  const bitLength = bitLengths.get(dataObjectRef);
  return bitLength === undefined ? undefined : Math.ceil(bitLength / 8);
}

function buildSecurityLevels(
  services: readonly DimService[],
  bitLengths: ReadonlyMap<string, number>,
  warnings: DimWarning[],
): DimSecurityLevel[] {
  const securityServices = services.filter(
    (service) => service.serviceClass === 'SecurityAccess' && service.subFunction !== undefined,
  );
  const groups = new Map<string, DimService[]>();
  for (const service of securityServices) {
    const qualifier = service.sdgAnnotations.DiagInstanceQualifier ?? '';
    groups.set(qualifier, [...(groups.get(qualifier) ?? []), service]);
  }

  const levels: DimSecurityLevel[] = [];
  for (const [qualifier, group] of groups) {
    const odd = group.find((service) => service.subFunction! % 2 === 1);
    const even = group.find((service) => service.subFunction! === (odd?.subFunction ?? 0) + 1);
    if (!odd) continue;
    const level = (odd.subFunction! + 1) / 2;
    const name = qualifier || odd.shortName;
    const seedBytes = bitLengthForDop(
      odd.posResponses[0]?.find((param) => param.semantic === 'DATA')?.dataObjectRef,
      bitLengths,
    );
    const keyParam = even?.request.find((param) => param.semantic === 'DATA');
    const keyBytes = bitLengthForDop(keyParam?.dataObjectRef, bitLengths);
    levels.push({
      name,
      level,
      ...(seedBytes === undefined ? {} : { seedBytes }),
      ...(keyBytes === undefined ? {} : { keyBytes }),
    });
    if (!even) {
      warnings.push({
        code: 'odx-security-unpaired',
        elementRef: odd.odxId,
        message: `Security RequestSeed ${odd.subFunction} has no paired SendKey`,
      });
    }
  }
  return levels.sort((a, b) => a.level - b.level);
}

function deriveRefs(
  service: OdxRawElement,
  document: OdxDocument,
  sessions: readonly DimSession[],
  securityLevels: readonly DimSecurityLevel[],
): { sessionRefs: readonly number[]; securityRefs: readonly number[] } {
  const stateNames = (
    childFirst(service, 'PRE-CONDITION-STATE-REFS')?.children['PRE-CONDITION-STATE-REF'] ?? []
  )
    .map((ref) => document.idIndex.get(ref.attrs['ID-REF'] ?? ''))
    .map((state) => shortName(state).toLowerCase());
  const annotationValues = Object.entries(sdgAnnotations(service))
    .filter(([key]) => /session|security/i.test(key))
    .map(([, value]) => value.toLowerCase());
  const refs = [...stateNames, ...annotationValues];

  return {
    sessionRefs: [
      ...new Set(
        sessions
          .filter((session) => refs.includes(session.name.toLowerCase()))
          .map((session) => session.value),
      ),
    ].sort((a, b) => a - b),
    securityRefs: [
      ...new Set(
        securityLevels
          .filter((level) => refs.includes(level.name.toLowerCase()))
          .map((level) => level.level),
      ),
    ].sort((a, b) => a - b),
  };
}

function buildDtcs(document: OdxDocument, warnings: DimWarning[]): DimDtc[] {
  const dtcs: DimDtc[] = [];
  for (const dtc of document.idIndex.values()) {
    if (dtc.tag !== 'DTC') continue;
    const odxId = dtc.attrs.ID ?? '';
    const troubleCode = parseNumber(childFirst(dtc, 'TROUBLE-CODE')?.text);
    if (troubleCode === undefined || troubleCode < 0 || troubleCode > 0xffffff) {
      warnings.push({
        code: 'odx-dtc-code-invalid',
        elementRef: odxId || shortName(dtc),
        message: 'DTC has a missing or out-of-range trouble code',
      });
      continue;
    }
    const displayCode = childFirst(dtc, 'DISPLAY-TROUBLE-CODE')?.text;
    const value = childFirst(dtc, 'TEXT')?.text;
    const severity = childFirst(dtc, 'DTC-SEVERITY')?.text;
    const functionalUnit = parseNumber(childFirst(dtc, 'FUNCTIONAL-UNIT')?.text);
    dtcs.push({
      odxId,
      shortName: shortName(dtc),
      troubleCode,
      ...(displayCode === undefined ? {} : { displayCode }),
      ...(value === undefined ? {} : { value }),
      ...(severity === undefined ? {} : { severity }),
      ...(functionalUnit === undefined ? {} : { functionalUnit }),
    });
  }
  return dtcs.sort((a, b) => a.troubleCode - b.troubleCode);
}

export function buildDim(input: {
  document: OdxDocument;
  variantId: string;
  sourcePath: string;
}): Dim {
  const warnings: DimWarning[] = [];
  const variant = input.document.importableVariants.find(
    (candidate) => candidate.odxId === input.variantId,
  );
  if (!variant) throw new Error(`odx-variant-not-found: ${input.variantId}`);

  const layer = resolveLayer(input.document, input.variantId);
  warnings.push(...layer.warnings);
  const dataObjectsResult = resolveDataObjects(layer);
  warnings.push(...dataObjectsResult.warnings);

  const services: DimService[] = [];
  for (const serviceElement of layer.services) {
    const service = resolveService(serviceElement, input.document, warnings);
    if (service) services.push(service);
  }

  const sessions = buildSessions(services, warnings);
  const bitLengths = new Map(
    dataObjectsResult.dataObjects
      .filter((dataObject) => dataObject.codedType.kind === 'standard')
      .map((dataObject) => [
        dataObject.odxId,
        dataObject.codedType.kind === 'standard' ? dataObject.codedType.bitLength : 0,
      ]),
  );
  const securityLevels = buildSecurityLevels(services, bitLengths, warnings);

  const servicesWithRefs = layer.services.map((element) => {
    const service = services.find((candidate) => candidate.odxId === element.attrs.ID);
    if (!service) return undefined;
    const refs = deriveRefs(element, input.document, sessions, securityLevels);
    return { ...service, ...refs };
  });

  return {
    meta: {
      sourcePath: input.sourcePath,
      modelVersion: '1.0',
      variant,
    },
    services: servicesWithRefs.filter((service): service is DimService => service !== undefined),
    dataObjects: dataObjectsResult.dataObjects,
    dtcs: buildDtcs(input.document, warnings),
    sessions,
    securityLevels,
    warnings,
  };
}
