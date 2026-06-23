// Shared test helper for vendor-prefix nested package trees.
//
// v1.9.0 Sprint X — `generateEcucSkeleton` nests `ArxmlPackage.packages`
// for vendor-prefix BSWMD paths (e.g. `/AUTOSAR_R22/EcucDefs/Adc` →
// 3-layer chain). Single-segment paths still emit a single-layer
// package. Walk the chain to the deepest package and return the
// module element so existing assertions keep working under both
// shapes.
//
// Two Sprint X / v1.4.1 bugfix test files (`bug2-skeleton-roundtrip.test.ts`
// and `bug-bswmd-multicity-and-addchild.test.ts`) used the same inline
// helper; the duplicate was flagged by the code review (LOW) and
// consolidated here.

import type { ArxmlDocument, ArxmlModule, ArxmlPackage } from '../../types.js';

export function findDeepestModule(ar: ArxmlDocument): ArxmlModule {
  let pkg: ArxmlPackage | undefined = ar.packages[0];
  while (pkg?.packages && pkg.packages.length > 0) {
    pkg = pkg.packages[0];
  }
  if (pkg === undefined) throw new Error('no packages in skeleton');
  return pkg.elements[0]! as ArxmlModule;
}
