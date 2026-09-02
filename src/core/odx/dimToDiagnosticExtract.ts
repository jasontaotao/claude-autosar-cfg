import { serializeArxml } from '../arxml/serializer.js';
import type { ArxmlDocument, ArxmlModule } from '../arxml/types.js';
import type { BswmdDefIndex } from './bswmdDefIndex.js';
import type { Dim } from './dim.js';
import { mapDcm } from './dcmMapper.js';
import { mapDem } from './demMapper.js';

export interface DimToDiagnosticExtractResult {
  readonly demContent: string;
  readonly dcmContent: string;
  readonly stats: {
    readonly dtcCount: number;
    readonly didCount: number;
    readonly routineCount: number;
    readonly warningCount: number;
  };
}

function wrapModule(module: ArxmlModule, packageShortName: string): string {
  const document: ArxmlDocument = {
    path: packageShortName,
    version: '4.4',
    packages: [
      {
        shortName: packageShortName,
        path: `/${packageShortName}`,
        elements: [module],
      },
    ],
  };
  const serialized = serializeArxml(document, { version: '4.4' });
  if (!serialized.ok) throw new Error(serialized.error.message);
  return serialized.value;
}

export function dimToDiagnosticExtract(args: {
  readonly dim: Dim;
  readonly bswmdIndex: BswmdDefIndex;
}): DimToDiagnosticExtractResult {
  const dcm = mapDcm(args.dim, args.bswmdIndex, { allowMissingDefinitions: true });
  const dem = mapDem(args.dim, args.bswmdIndex, { allowMissingDefinitions: true });
  const warnings = [...args.dim.warnings, ...dcm.warnings, ...dem.warnings];

  return {
    demContent: wrapModule(dem.module, 'Dem_Extract'),
    dcmContent: wrapModule(dcm.module, 'Dcm_Extract'),
    stats: {
      dtcCount: args.dim.dtcs.length,
      didCount: new Set(
        args.dim.services
          .filter(
            (service) =>
              service.serviceClass === 'ReadDataByIdentifier' ||
              service.serviceClass === 'WriteDataByIdentifier' ||
              service.serviceClass === 'InputOutputControlByIdentifier',
          )
          .flatMap((service) => {
            const value = service.request.find((param) => param.semantic === 'ID')?.codedValue;
            if (value === undefined) return [];
            return [/^0[xX]/.test(value) ? Number.parseInt(value, 16) : Number.parseInt(value, 10)];
          })
          .filter(
            (identifier) => Number.isFinite(identifier) && identifier >= 0 && identifier <= 0xffff,
          ),
      ).size,
      routineCount: args.dim.services.filter((service) => service.serviceClass === 'RoutineControl')
        .length,
      warningCount: warnings.length,
    },
  };
}
