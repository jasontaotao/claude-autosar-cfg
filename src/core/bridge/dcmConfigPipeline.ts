// Dcm config pipeline orchestrator — DIM data source migration.
//
// The legacy OdxSummary mapper is intentionally retired: ODX is parsed into
// the full-import DIM first, then linked against xlsx rows and mapped to the
// standard Dcm ECUC module through the same deterministic pipeline used by
// the ODX full-import flow.

import { serializeArxml } from '../arxml/serializer.js';
import type { ArxmlDocument } from '../arxml/types.js';
import type { BswmdDefIndex } from '../odx/bswmdDefIndex.js';
import type { Dim } from '../odx/dim.js';
import { mapDcm } from '../odx/dcmMapper.js';

import type { BswModuleDef } from '../project/bswmd.js';
import type { EcucInstanceRow } from '../../shared/types.js';

import { DcmConfigError } from './dcmConfigError.js';
import { DCM_MODULE_SHORT_NAME } from './dcmConstants.js';

export type DcmServiceKind =
  | 'DcmClearDTC'
  | 'DcmReadDTC'
  | 'DcmReadDataById'
  | 'DcmWriteDataById'
  | 'DcmRoutineControl';

export interface DcmConfigResult {
  /** DIM-derived Dcm extract (DIDs + Routines as standalone ARXML). */
  readonly dcmConfigXml: string;
  /** Count of unique DID identifiers available for read/write services. */
  readonly odxLinkedDcmDspCount: number;
  /** Count of RoutineControl services. */
  readonly odxLinkedRoutineCount: number;
  /** Per-kind tally of xlsx rows (5 kinds). */
  readonly serviceCounts: Readonly<Record<DcmServiceKind, number>>;
}

const SERVICE_KINDS: readonly DcmServiceKind[] = [
  'DcmClearDTC',
  'DcmReadDTC',
  'DcmReadDataById',
  'DcmWriteDataById',
  'DcmRoutineControl',
];

function readOrWriteDidIdentifiers(dim: Dim): Set<string> {
  const identifiers = new Set<string>();
  for (const service of dim.services) {
    if (
      service.serviceClass !== 'ReadDataByIdentifier' &&
      service.serviceClass !== 'WriteDataByIdentifier'
    ) {
      continue;
    }
    const value = service.request.find((param) => param.semantic === 'ID')?.codedValue;
    if (value === undefined) continue;
    const identifier = /^0[xX]/.test(value)
      ? Number.parseInt(value, 16)
      : Number.parseInt(value, 10);
    if (Number.isFinite(identifier) && identifier >= 0 && identifier <= 0xffff) {
      identifiers.add(String(identifier));
    }
  }
  return identifiers;
}

function routineShortNames(dim: Dim): readonly string[] {
  return dim.services
    .filter((service) => service.serviceClass === 'RoutineControl')
    .map((service) => service.shortName);
}

function didShortNames(dim: Dim): readonly string[] {
  return dim.dataObjects.map((dataObject) => dataObject.shortName);
}

function resolveOdxReference(
  dim: Dim,
  kind: 'didRef' | 'routineRef',
  shortName: string,
): string | null {
  if (kind === 'didRef') {
    return dim.dataObjects.some((dataObject) => dataObject.shortName === shortName)
      ? shortName
      : null;
  }
  return routineShortNames(dim).includes(shortName) ? shortName : null;
}

function validateOdxLinkage(dim: Dim, rows: readonly EcucInstanceRow[]): void {
  for (const row of rows) {
    const params = row.params as Readonly<Record<string, string | number | boolean | null>>;
    const sheetKind = row.sheet as DcmServiceKind;
    if (sheetKind === 'DcmReadDataById' || sheetKind === 'DcmWriteDataById') {
      const didRef = params.didRef;
      if (typeof didRef === 'string' && didRef.length > 0) {
        if (resolveOdxReference(dim, 'didRef', didRef) === null) {
          const dids = didShortNames(dim);
          const sample = dids.slice(0, 10).join(', ');
          const more = dids.length > 10 ? ` (and ${dids.length - 10} more)` : '';
          throw new DcmConfigError({
            kind: 'odx-dcm-linkage',
            message:
              `ODX-Dcm linkage broken: Sheet '${row.sheet}', row '${row.shortName}': ` +
              `referenced DID '${didRef}' not found. Available DIDs from ODX: ${sample}${more}.`,
          });
        }
      }
    }
    if (sheetKind === 'DcmRoutineControl') {
      const routineRef = params.routineRef;
      if (typeof routineRef === 'string' && routineRef.length > 0) {
        if (resolveOdxReference(dim, 'routineRef', routineRef) === null) {
          const routines = routineShortNames(dim);
          const routineList = routines.length > 0 ? routines.join(', ') : '<none>';
          throw new DcmConfigError({
            kind: 'odx-dcm-linkage',
            message:
              `ODX-Dcm linkage broken: Sheet '${row.sheet}', row '${row.shortName}': ` +
              `referenced Routine '${routineRef}' not found. Available Routines from ODX: ${routineList}.`,
          });
        }
      }
    }
  }
}

function tallyServiceCounts(rows: readonly EcucInstanceRow[]): Record<DcmServiceKind, number> {
  const counts = SERVICE_KINDS.reduce(
    (result, kind) => ({ ...result, [kind]: 0 }),
    {} as Record<DcmServiceKind, number>,
  );
  for (const row of rows) {
    const kind = row.sheet as DcmServiceKind;
    if (SERVICE_KINDS.includes(kind)) counts[kind] += 1;
  }
  return counts;
}

function wrapDcmModule(module: ReturnType<typeof mapDcm>['module'], sourcePath: string): string {
  const document: ArxmlDocument = {
    path: sourcePath,
    version: '4.4',
    packages: [
      {
        shortName: 'Dcm_Extract',
        path: '/Dcm_Extract',
        elements: [module],
      },
    ],
  };
  const serialized = serializeArxml(document, { version: '4.4' });
  if (!serialized.ok) {
    throw new DcmConfigError({
      kind: 'unknown',
      message: `Failed to serialize Dcm extract: ${serialized.error.message}`,
    });
  }
  return serialized.value;
}

export interface DcmConfigPipelineRequest {
  readonly dim: Dim;
  readonly xlsxRows: readonly EcucInstanceRow[];
  readonly bswmds: ReadonlyMap<string, BswModuleDef>;
  readonly bswmdIndex: BswmdDefIndex;
}

export async function dcmConfigPipeline(
  request: DcmConfigPipelineRequest,
): Promise<DcmConfigResult> {
  validateOdxLinkage(request.dim, request.xlsxRows);

  const dcmBswmd = request.bswmds.get(DCM_MODULE_SHORT_NAME);
  if (dcmBswmd === undefined) {
    throw new DcmConfigError({
      kind: 'dcm-module-missing',
      message:
        `BSWMD map missing module '${DCM_MODULE_SHORT_NAME}' (needed for Dcm service configs). ` +
        `Provided modules: ${Array.from(request.bswmds.keys()).join(', ') || '<empty>'}`,
    });
  }

  const mapped = mapDcm(request.dim, request.bswmdIndex);
  const dcmConfigXml = wrapDcmModule(mapped.module, request.dim.meta.sourcePath);
  const serviceCounts = tallyServiceCounts(request.xlsxRows);

  return {
    dcmConfigXml,
    odxLinkedDcmDspCount: readOrWriteDidIdentifiers(request.dim).size,
    odxLinkedRoutineCount: routineShortNames(request.dim).length,
    serviceCounts,
  };
}
