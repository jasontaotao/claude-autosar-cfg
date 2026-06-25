// v1.8.4 Bug 1 — version mapping helper.
//
// For every BSWMD version that has a direct ARXML equivalent (the
// 13-item canonical `ARXML_DIRECT_MAP_VERSIONS` list in types.ts),
// this helper returns it unchanged. For any other version string
// (vendor extension, future addition outside the canonical list),
// it defaults to '4.6' (matches r4.6 AUTOSAR_4-6-0.xsd namespace +
// schemaLocation; the value skeleton.ts hardcoded before v1.8.4).
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
// v1.12.0 PATCH D4 (M1) — corrected the pre-PATCH-A narrative ("BSWMD
// accepts '4.0' but ArxmlVersion does not") which became stale once
// '4.0' was added to the canonical direct-map list. The pre-PATCH-A
// '4.0' fallback in `mapBswmdVersionToArxml` was the root cause of
// v1.8.5 bug 8870566 (R4.0 ECUC files mapped to '4.6' silently); it is
// now caught by the direct-map early-return. The '4.6' default below
// is reserved for inputs outside the canonical list (vendor extensions,
// future additions).
//
// Future expansion: if a user reports a vendor extension that needs a
// different default (e.g. some r5.0 vendor tool emitting r5.5
// namespace), add the case here + a regression test.

import { ARXML_DIRECT_MAP_VERSIONS, type ArxmlVersion } from './types.js';

const ARXML_VERSIONS: ReadonlySet<string> = new Set<string>(ARXML_DIRECT_MAP_VERSIONS);

export function mapBswmdVersionToArxml(v: string): ArxmlVersion {
  if (ARXML_VERSIONS.has(v)) return v as ArxmlVersion;
  // Inputs outside the direct-map set default to '4.6'. The pre-PATCH-A
  // "BSWMD accepts '4.0' but ArxmlVersion does not" case is no longer
  // reachable — '4.0' is in the direct-map set and caught above.
  return '4.6';
}
