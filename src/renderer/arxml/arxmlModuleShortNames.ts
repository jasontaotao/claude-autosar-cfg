// v1.32.0 MINOR T3 — flatten BSWMD module shortNames for hasDcmBswmd gating.
//
// Returns the list of every <SHORT-NAME> found inside an <ECUC-MODULE-DEF>
// anywhere under <AR-PACKAGES>. Recursive so nested package hierarchies are
// covered (real OEM BSWMDs nest modules under multi-segment paths).
//
// Fail-soft on parse failure: returns []. The UX gate that consumes this
// helper treats empty result as "no Dcm BSWMD" — the user gets a disabled
// "Open Dcm Config" button. Real parse failures surface at click time via
// the bswmd-unreadable IPC error class.
//
// Why renderer-side + fast-xml-parser direct (not parseArxml): the gate runs
// on every AppHeader/ContextMenu render. parseArxml requires the <AUTOSAR>
// wrapper + schemaLocation and rejects pure-BSWMD files outright with a
// "use Load BSWMD instead" error (parser.ts:128-143) — correct for the ECUC
// value-file pipeline but unsuitable for a renderer-side UX gate that just
// needs to find <ECUC-MODULE-DEF><SHORT-NAME> patterns. fast-xml-parser walks
// the raw XML with no AUTOSAR-context assumptions (< 10ms per file).

import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

export function arxmlModuleShortNames(xml: string): readonly string[] {
  if (xml.length === 0) return [];
  const names: string[] = [];
  try {
    const parsed: unknown = parser.parse(xml);
    collectModuleShortNames(parsed, names);
  } catch {
    // Malformed XML — fail-soft per the contract above.
    return [];
  }
  return names;
}

function collectModuleShortNames(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectModuleShortNames(child, out);
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  const obj = node as Record<string, unknown>;

  // Module def found at this level: extract its SHORT-NAME (object or array).
  const modules = obj['ECUC-MODULE-DEF'];
  if (modules !== undefined) {
    if (Array.isArray(modules)) {
      for (const m of modules) {
        const name = extractShortName(m);
        if (name !== null) out.push(name);
      }
    } else {
      const name = extractShortName(modules);
      if (name !== null) out.push(name);
    }
  }

  // Recurse through AR-PACKAGES (container of AR-PACKAGE children, possibly nested),
  // AR-PACKAGE (carries ELEMENTS + nested AR-PACKAGES), and ELEMENTS (carries
  // ECUC-MODULE-DEF siblings). We descend into all three so both the literal-name
  // siblings and the nested-package variant are covered.
  const packageContainers = obj['AR-PACKAGES'];
  if (packageContainers !== undefined) {
    collectModuleShortNames(packageContainers, out);
  }
  const packages = obj['AR-PACKAGE'];
  if (packages !== undefined) {
    collectModuleShortNames(packages, out);
  }
  const elements = obj['ELEMENTS'];
  if (elements !== undefined) {
    collectModuleShortNames(elements, out);
  }
}

function extractShortName(node: unknown): string | null {
  if (typeof node !== 'object' || node === null) return null;
  const obj = node as Record<string, unknown>;
  const sn = obj['SHORT-NAME'];
  if (typeof sn === 'string') return sn;
  return null;
}
