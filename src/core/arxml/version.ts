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
// v1.11.4 PATCH-A — `ARXML_VERSIONS` (the BSWMD→ARXML 1:1 direct-map
// set) is now derived from `ARXML_DIRECT_MAP_VERSIONS` in types.ts
// (the canonical 13-item list). This is the **direct-map set**:
// every entry has a direct ARXML equivalent and is returned by
// `mapBswmdVersionToArxml` unchanged. The parser-accept set in
// types.ts (`SUPPORTED_ARXML_VERSIONS`) is a strict subset of this
// set — see the comment on `SUPPORTED_ARXML_VERSIONS` in types.ts
// for why 00005 / 00006 are excluded there.
//
// Future expansion: if a user reports a vendor extension that needs a
// different default (e.g. some r5.0 vendor tool emitting r5.5
// namespace), add the case here + a regression test.

import { ARXML_DIRECT_MAP_VERSIONS, type ArxmlVersion } from './types.js';

const ARXML_VERSIONS: ReadonlySet<string> = new Set<string>(ARXML_DIRECT_MAP_VERSIONS);

export function mapBswmdVersionToArxml(v: string): ArxmlVersion {
  if (ARXML_VERSIONS.has(v)) return v as ArxmlVersion;
  // BSWMD accepts '4.0' but ArxmlVersion does not. Default to '4.6'
  // (the value skeleton.ts hardcoded before v1.8.4).
  return '4.6';
}
