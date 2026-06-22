// v1.8.4 Bug 1 — version mapping helper.
//
// The BSWMD parser accepts a slightly wider set of version literals
// (`bswmd.ts` SUPPORTED_VERSIONS) than the ARXML emit set
// (`ArxmlVersion` in types.ts). Notably:
//   - BSWMD accepts '4.0' but ArxmlVersion does not.
//   - ArxmlVersion includes 00048/00049/00050 (R19-11 / R20-11 / R21-11)
//     but BSWMD's accept list stops at 00051 (R22-11).
//
// For every BSWMD version that has a direct ARXML equivalent, this
// helper returns it unchanged. For the '4.0' case, it defaults to
// '4.6' (the value skeleton.ts hardcoded before v1.8.4; matches
// r4.6 AUTOSAR_4-6-0.xsd namespace + schemaLocation).
//
// Future expansion: if a user reports a vendor extension that needs a
// different default (e.g. some r5.0 vendor tool emitting r5.5
// namespace), add the case here + a regression test.

import type { ArxmlVersion } from './types.js';

const ARXML_VERSIONS: ReadonlySet<string> = new Set<ArxmlVersion>([
  '4.0',
  '4.2',
  '4.4',
  '4.6',
  '4.7',
  '5.0',
  '00005',
  '00006',
  '00046',
  '00048',
  '00049',
  '00050',
  '00051',
]);

export function mapBswmdVersionToArxml(v: string): ArxmlVersion {
  if (ARXML_VERSIONS.has(v)) return v as ArxmlVersion;
  // BSWMD accepts '4.0' but ArxmlVersion does not. Default to '4.6'
  // (the value skeleton.ts hardcoded before v1.8.4).
  return '4.6';
}
