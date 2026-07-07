// v1.32.0 MINOR T4 — locate the Dcm BSWMD via parse-based module discovery.
//
// Replaces the v1.31.x filename-regex approach (`/Dcm\.arxml$|Dcm_.*\.arxml$/i`)
// with a real ARXML parse + shortName match. This eliminates:
//   - false positives (file named "Dcm_Settings.arxml" that isn't actually Dcm)
//   - false negatives (a real Dcm BSWMD named "Bsw_Custom_Dcm_v3.arxml")
//
// Fail-soft: malformed XML or readFile errors return { hasDcm: false }.
// The real parse/read errors surface at click time via the
// 'bswmd-unreadable' IPC error class from the handler.
//
// Performance: < 10ms per BSWMD on real fixtures. 20-file project = ~200ms.
// Per-path memoization lives in the launcher hook (not here) to keep this
// helper pure.

import { DCM_MODULE_SHORT_NAME } from '../../../core/bridge/dcmConstants.js';
import { arxmlModuleShortNames } from '../../arxml/arxmlModuleShortNames.js';

export interface BswmdHasDcmResult {
  readonly hasDcm: boolean;
  readonly dcmBswmdPath?: string;
}

export interface FileReader {
  readFile(path: string): Promise<string>;
}

export async function findDcmBswmd(
  bswmdPaths: readonly string[],
  fs: FileReader,
): Promise<BswmdHasDcmResult> {
  if (bswmdPaths.length === 0) return { hasDcm: false };

  // Parse in parallel — total wall-clock ≈ slowest single file, not sum.
  const results = await Promise.all(
    bswmdPaths.map(async (p) => {
      try {
        const xml = await fs.readFile(p);
        const modules = arxmlModuleShortNames(xml);
        return { path: p, hasDcm: modules.includes(DCM_MODULE_SHORT_NAME) };
      } catch {
        return { path: p, hasDcm: false };
      }
    }),
  );

  for (const r of results) {
    if (r.hasDcm) {
      return { hasDcm: true, dcmBswmdPath: r.path };
    }
  }
  return { hasDcm: false };
}
