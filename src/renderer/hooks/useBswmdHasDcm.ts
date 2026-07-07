// v1.32.0 MINOR T8 — selector hook wrapping the launcher's bswmdHasDcm.
//
// ContextMenu and AppHeader both need to gate on "does this project
// have a Dcm BSWMD?". Before T8 the answer came from `isDcmBswmdPath`
// (a regex on each BSWMD filename). v1.32.0 T4 replaced the regex
// with a real BSWMD parse via `findDcmBswmd` (memoized in
// `useDcmConfigLauncher`). T8 funnels both consumers through one hook
// so the parse happens once per render — they share the
// `useDcmConfigLauncher().bswmdHasDcm` slice.
//
// Trade-off (D4 from spec): the rename replaced a filename regex with a
// real ARXML parse. False positives (non-Dcm BSWMDs named like
// `BCM_Dcm_Compat.arxml`) no longer gate; false negatives (real Dcm
// BSWMDs named `Bsw_Custom_Dcm_v3.arxml`) now correctly gate. UX cost
// is ~200ms for a 20-BSWMD project, paid once per render and cached
// per-path.
//
// Lesson `presentational-dialog-parity-port-pattern`: this hook is a
// thin wrapper, NOT a new store slice. The launcher owns the memo so
// the parse cache survives renders and is the single source of truth
// for "Dcm BSWMD present in project".

import type { BswmdHasDcmResult } from '../components/dcmConfig/bswmdHasDcm.js';

import { useDcmConfigLauncher } from './useDcmConfigLauncher.js';

/** Selector: returns the project's parse-based Dcm BSWMD gate.
 *
 *  Consumers:
 *   - AppHeader.tsx — gates the "Open Dcm Config" dropdown entry
 *   - ContextMenu.tsx — gates the "Generate Dcm Config" item on a
 *                       BSWMD row right-click
 *
 *  Returns the same `BswmdHasDcmResult` shape the launcher exposes
 *  (`hasDcm`, optional `dcmBswmdPath`). When `hasDcm === false`,
 *  `dcmBswmdPath` is undefined and the consumers treat the gate as
 *  closed.
 */
export function useBswmdHasDcm(): BswmdHasDcmResult {
  return useDcmConfigLauncher().bswmdHasDcm;
}
