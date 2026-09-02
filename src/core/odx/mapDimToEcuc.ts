import type { ArxmlModule } from '../arxml/types.js';
import type { BswmdDefIndex } from './bswmdDefIndex.js';
import type { Dim, DimWarning } from './dim.js';
import { mapDcm } from './dcmMapper.js';
import { mapDem } from './demMapper.js';

export interface MapDimToEcucRequest {
  readonly dim: Dim;
  readonly bswmdIndex: BswmdDefIndex;
}

export interface MapDimToEcucResult {
  readonly modules: readonly ArxmlModule[];
  readonly warnings: readonly DimWarning[];
}

export function mapDimToEcuc(req: MapDimToEcucRequest): MapDimToEcucResult {
  if (!req.bswmdIndex.containerPath.has('DcmConfigSet')) {
    throw new Error('odx-bswmd-not-loaded: Dcm BSWMD is unavailable');
  }
  if (!req.bswmdIndex.containerPath.has('DemConfigSet')) {
    throw new Error('odx-bswmd-not-loaded: Dem BSWMD is unavailable');
  }

  const dcm = mapDcm(req.dim, req.bswmdIndex);
  const dem = mapDem(req.dim, req.bswmdIndex);
  return {
    modules: [dcm.module, dem.module].sort((a, b) => a.shortName.localeCompare(b.shortName)),
    warnings: [...req.dim.warnings, ...dcm.warnings, ...dem.warnings],
  };
}
