// v1.26.0 — Demo BSWMD loader.
//
// Parses BSWMD ARXML strings into a `ReadonlyMap<string, BswModuleDef>`
// keyed by module shortName. Caller provides file IO; this helper is pure
// and side-effect free (apart from throwing on invalid input). Designed
// for the xlsx mapper's BSWMD-driven refactor: the caller (typically
// `xlsxEcucBatchImportHandler`) reads each demo-ecu BSWMD file and hands
// the resulting `{moduleShortName → ARXML text}` map here.

import {
  parseBswmd,
  getActiveModules,
  type BswModuleDef,
  type BswmdError,
} from '../project/bswmd.js';

function formatBswmdError(error: BswmdError): string {
  switch (error.kind) {
    case 'xml-malformed':
    case 'missing-root':
    case 'invalid-structure':
      return error.message;
    case 'unsupported-version':
      return `unsupported AUTOSAR version '${error.version}'`;
  }
}

export function parseDemoBswmds(
  arxmlStrings: ReadonlyMap<string, string>,
): ReadonlyMap<string, BswModuleDef> {
  const result = new Map<string, BswModuleDef>();
  for (const [moduleShortName, arxml] of arxmlStrings) {
    const parsed = parseBswmd(arxml);
    if (!parsed.ok) {
      throw new Error(
        `Failed to parse BSWMD for module '${moduleShortName}': ${formatBswmdError(parsed.error)}`,
      );
    }
    const modules = getActiveModules(parsed.value);
    if (modules.length !== 1) {
      throw new Error(
        `BSWMD for module '${moduleShortName}' expected exactly 1 ECUC-MODULE-DEF, found ${modules.length}`,
      );
    }
    result.set(moduleShortName, modules[0]!);
  }
  return result;
}
