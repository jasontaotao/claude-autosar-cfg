import type { DimCompuMethod, DimCodedType, DimDataObject, DimUnit, DimWarning } from './dim.js';
import type { ResolvedLayer } from './layerResolver.js';
import type { OdxRawElement } from './odxDocument.js';

export interface DataObjectResult {
  readonly dataObjects: readonly DimDataObject[];
  readonly warnings: readonly DimWarning[];
}

function childFirst(element: OdxRawElement, tag: string): OdxRawElement | undefined {
  return element.children[tag]?.[0];
}

function text(element: OdxRawElement | undefined): string | undefined {
  return element?.text;
}

function descendants(element: OdxRawElement, tag: string): OdxRawElement[] {
  const direct = element.children[tag] ?? [];
  return [
    ...direct,
    ...Object.values(element.children)
      .flat()
      .flatMap((child) => descendants(child, tag)),
  ];
}

function numberText(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCodedType(
  element: OdxRawElement,
  warnings: DimWarning[],
): { codedType: DimCodedType; baseDataType: string; encoding: string } {
  const coded = childFirst(element, 'DIAG-CODED-TYPE');
  const baseDataType = coded?.attrs['BASE-DATA-TYPE'] ?? '';
  const encoding = coded?.attrs['BASE-TYPE-ENCODING'] ?? 'NONE';
  const kind = coded?.attrs['xsi:type'];
  const elementRef = element.attrs.ID ?? text(childFirst(element, 'SHORT-NAME')) ?? '';

  if (kind === 'STANDARD-LENGTH-TYPE') {
    const bitLength = numberText(text(childFirst(coded!, 'BIT-LENGTH')));
    if (bitLength !== undefined) {
      return {
        codedType: { kind: 'standard', bitLength },
        baseDataType,
        encoding,
      };
    }
  }

  if (kind === 'MIN-MAX-LENGTH-TYPE') {
    const minBytes = numberText(text(childFirst(coded!, 'MIN-LENGTH')));
    const maxBytes = numberText(text(childFirst(coded!, 'MAX-LENGTH')));
    if (minBytes !== undefined && maxBytes !== undefined) {
      const termination = coded?.attrs.TERMINATION;
      return {
        codedType: {
          kind: 'minmax',
          minBytes,
          maxBytes,
          ...(termination === undefined ? {} : { termination }),
        },
        baseDataType,
        encoding,
      };
    }
  }

  if (kind !== undefined) {
    warnings.push({
      code: 'odx-unsupported-coded-type',
      elementRef,
      message: `Unsupported DIAG-CODED-TYPE: ${kind}`,
    });
  }

  return { codedType: { kind: 'opaque' }, baseDataType, encoding };
}

function rationalValues(scale: OdxRawElement, containerTag: string): number[] {
  const rational = childFirst(scale, containerTag);
  const numerator = childFirst(rational ?? scale, 'COMPU-NUMERATOR');
  return (numerator?.children.V ?? []).map((value) => numberText(value.text) ?? 0);
}

function parseLinear(compu: OdxRawElement): { factor: number; offset: number } | undefined {
  const internal = childFirst(compu, 'COMPU-INTERNAL-TO-PHYS');
  const numerator = childFirst(internal ?? compu, 'COMPU-NUMERATOR');
  const denominator = childFirst(internal ?? compu, 'COMPU-DENOMINATOR');
  const values = (numerator?.children.V ?? []).map((value) => numberText(value.text));
  const offset = values[0];
  const numeratorFactor = values[1];
  const denominatorValue = numberText(childFirst(denominator ?? compu, 'V')?.text) ?? 1;
  if (offset === undefined || numeratorFactor === undefined) return undefined;
  return {
    factor: denominatorValue === 0 ? 0 : numeratorFactor / denominatorValue,
    offset,
  };
}

function constText(scale: OdxRawElement): string {
  const constant = childFirst(scale, 'COMPU-CONST');
  const vt = childFirst(constant ?? scale, 'VT')?.text;
  const value = childFirst(constant ?? scale, 'V')?.text;
  return vt ?? value ?? '';
}

function parseCompu(element: OdxRawElement, warnings: DimWarning[]): DimCompuMethod | undefined {
  const compu = childFirst(element, 'COMPU-METHOD');
  const category = text(childFirst(compu ?? element, 'CATEGORY')) ?? '';
  const elementRef = element.attrs.ID ?? text(childFirst(element, 'SHORT-NAME')) ?? '';
  const internal = childFirst(compu ?? element, 'COMPU-INTERNAL-TO-PHYS');
  const scalesContainer = childFirst(internal ?? compu ?? element, 'COMPU-SCALES');
  const scales = scalesContainer?.children['COMPU-SCALE'] ?? [];

  if (category === 'IDENTICAL') return { kind: 'identical' };
  if (category === 'LINEAR') {
    const linear = parseLinear(compu ?? element);
    if (linear) return { kind: 'linear', ...linear };
    warnings.push({
      code: 'odx-element-skipped',
      elementRef,
      message: 'Malformed LINEAR compu method',
    });
    return undefined;
  }

  if (category === 'TEXTTABLE') {
    const entries = scales.map((scale) => ({
      lower: numberText(text(childFirst(scale, 'LOWER-LIMIT'))) ?? 0,
      upper: numberText(text(childFirst(scale, 'UPPER-LIMIT'))) ?? 0,
      text: constText(scale),
    }));
    return { kind: 'texttable', entries };
  }

  if (category === 'SCALE-LINEAR') {
    const segments = scales.map((scale) => {
      const numerator = rationalValues(scale, 'COMPU-RATIONAL-COEFFS');
      return {
        lower: numberText(text(childFirst(scale, 'LOWER-LIMIT'))) ?? 0,
        upper: numberText(text(childFirst(scale, 'UPPER-LIMIT'))) ?? 0,
        factor: numerator[1] ?? 1,
        offset: numerator[0] ?? 0,
      };
    });
    return { kind: 'scale-linear', segments };
  }

  if (category === 'RAT-FUNC' || category === 'TAB-INTP') {
    warnings.push({
      code: 'odx-unsupported-compu',
      elementRef,
      message: `Unsupported compu method category: ${category}`,
    });
    return undefined;
  }

  warnings.push({
    code: 'odx-element-skipped',
    elementRef,
    message: `Unsupported or malformed compu method category: ${category || 'missing'}`,
  });
  return undefined;
}

function resolveUnit(layer: ResolvedLayer, element: OdxRawElement): DimUnit | undefined {
  const unitRef = childFirst(element, 'UNIT-REF')?.attrs['ID-REF'];
  if (!unitRef) return undefined;
  for (const chainLayer of layer.chain) {
    const unitSpec = childFirst(chainLayer, 'UNIT-SPEC');
    const units = unitSpec?.children.UNITS?.[0]?.children.UNIT ?? [];
    const unit = units.find((candidate) => candidate.attrs.ID === unitRef);
    if (unit) {
      const displayName = childFirst(unit, 'DISPLAY-NAME')?.text;
      return {
        name: childFirst(unit, 'SHORT-NAME')?.text ?? unitRef,
        ...(displayName === undefined ? {} : { displayName }),
      };
    }
  }
  return undefined;
}

function mapDop(
  element: OdxRawElement,
  layer: ResolvedLayer,
  warnings: DimWarning[],
): DimDataObject {
  const coded = parseCodedType(element, warnings);
  const compuMethod = parseCompu(element, warnings);
  const unit = resolveUnit(layer, element);
  const id = element.attrs.ID ?? '';
  const shortName = childFirst(element, 'SHORT-NAME')?.text ?? '';

  if (!element.attrs.ID || !coded.baseDataType) {
    warnings.push({
      code: 'odx-element-skipped',
      elementRef: id || shortName,
      message: 'Malformed DOP: missing ID or DIAG-CODED-TYPE base data type',
    });
  }

  return {
    odxId: id,
    shortName,
    codedType: coded.codedType,
    baseDataType: coded.baseDataType,
    encoding: coded.encoding,
    ...(compuMethod === undefined ? {} : { compuMethod }),
    ...(unit === undefined ? {} : { unit }),
  };
}

export function resolveDataObjects(layer: ResolvedLayer): DataObjectResult {
  const warnings: DimWarning[] = [];
  const byId = new Map<string, OdxRawElement>();

  for (const chainLayer of [...layer.chain].reverse()) {
    for (const element of [
      ...descendants(chainLayer, 'DATA-OBJECT-PROP'),
      ...descendants(chainLayer, 'DTC-DOP'),
    ]) {
      const id = element.attrs.ID;
      if (id) byId.set(id, element);
      else
        warnings.push({
          code: 'odx-element-skipped',
          elementRef: childFirst(element, 'SHORT-NAME')?.text ?? '',
          message: 'DOP has no ODX ID',
        });
    }
  }

  const dataObjects = [...byId.values()].map((element) => mapDop(element, layer, warnings));

  return { dataObjects, warnings };
}
