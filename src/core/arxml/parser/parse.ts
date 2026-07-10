// core/arxml/parser/parse.ts
// Top-level parser entry points. Split from `src/core/arxml/parser.ts`
// as part of v1.41.x PATCH T4 (file-size backlog).
//
// Public API: parseArxml, detectVersion.

import { XMLParser, XMLValidator } from 'fast-xml-parser';

import type { ArxmlDocument, ArxmlVersion, Result } from '../types.js';
import { SUPPORTED_ARXML_VERSIONS } from '../types.js';

import type { CollisionCollector } from './walk.js';
import { walkPackages, findAnyModuleInPackages, findAnyDefInPackages } from './walk.js';
//
// Recognized ECUC tag patterns:
//   <AUTOSAR><AR-PACKAGES><AR-PACKAGE><SHORT-NAME> + <ELEMENTS>...</ELEMENTS></AR-PACKAGE>...
//   <ECUC-MODULE-CONFIGURATION-VALUES>: kind='module'
//   <ECUC-CONTAINER-VALUE>: kind='container'
//   <DEFINITION-REF DEST="X">: kind='reference' with dest
//   <ECUC-NUMERICAL-PARAM-VALUE> / <ECUC-TEXTUAL-PARAM-VALUE>: param wrapper with VALUE child
//   <REFERENCE-VALUES><ECUC-REFERENCE-VALUE><VALUE-REF>: ref param (Com/PduR shape)
//   <PARAMETER-VALUES><ECUC-REFERENCE-VALUE>: vendor dialect (EcuC shape)
//
// v1.38.0 MINOR T2 (H1): the parser keys PARAMETER-VALUES / REFERENCE-VALUES
// entries by the shortName tail of the BSWMD DEFINITION-REF path. When two
// distinct DEFINITION-REF paths share the same tail segment (vendor dialects
// or choice branches can produce this), the second would silently overwrite
// the first. We now detect the collision during the walk and surface it as
// a structured `invalid-structure` ParseError.

// -----------------------------------------------------------------------------
// Public surface
// -----------------------------------------------------------------------------

export interface ParseOptions {
  readonly version?: ArxmlVersion;
  readonly strict?: boolean;
}

export type ParseError =
  | { readonly kind: 'xml-malformed'; readonly message: string }
  | { readonly kind: 'missing-root'; readonly message: string }
  | { readonly kind: 'unsupported-version'; readonly version: string }
  | { readonly kind: 'invalid-structure'; readonly path: string; readonly message: string };

const NS_PATTERN = /\/schema\/(r\d+\.\d+|\d{5,6})/;
// AUTOSAR ships schemaLocation in two forms:
//   1. Dashed:   AUTOSAR_4-2-2.xsd  (R4.2 / R4.4 / R4.6 / R4.7 / R5.0)
//   2. 5-digit:  AUTOSAR_00046.xsd  (R4.4+ standard form: 00046=R4.6,
//                                     00048=R19-11, 00049=R20-11, 00050=R21-11)
// The 5-digit literal IS the version — no transformation needed. We capture
// groups 1-3 for the dashed form and group 4 for the 5-digit form.
const XSD_PATTERN = /(?:AUTOSAR_(\d)-(\d)-(\d)\.xsd|AUTOSAR_(\d{5})\.xsd)/;

export function parseArxml(
  xml: string,
  opts: ParseOptions = {},
): Result<ArxmlDocument, ParseError> {
  // Explicit XML well-formedness check — fast-xml-parser's parser is lenient and
  // would otherwise turn unclosed tags into a partially-populated object,
  // producing 'unsupported-version' instead of 'xml-malformed' for invalid input.
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    const message =
      typeof validation === 'object' && validation !== null && 'err' in validation
        ? (validation as { err: { msg: string; line?: number; col?: number } }).err.msg
        : 'XML is not well-formed';
    return {
      ok: false,
      error: {
        kind: 'xml-malformed',
        message,
      },
    };
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    removeNSPrefix: false,
    processEntities: true,
    trimValues: false,
  });

  let raw: unknown;
  try {
    raw = parser.parse(xml);
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: 'xml-malformed',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (typeof raw !== 'object' || raw === null) {
    return {
      ok: false,
      error: { kind: 'missing-root', message: 'parsed result is not an object' },
    };
  }

  const root = raw as Record<string, unknown>;
  const autosar = root['AUTOSAR'];
  if (typeof autosar !== 'object' || autosar === null) {
    return { ok: false, error: { kind: 'missing-root', message: '<AUTOSAR> root not found' } };
  }

  const version = opts.version ?? detectVersion(autosar as Record<string, unknown>);
  if (version === null) {
    return { ok: false, error: { kind: 'unsupported-version', version: 'unknown' } };
  }

  const arPackages = (autosar as Record<string, unknown>)['AR-PACKAGES'];
  if (typeof arPackages !== 'object' || arPackages === null) {
    return { ok: false, error: { kind: 'missing-root', message: '<AR-PACKAGES> not found' } };
  }

  // v1.38.0 MINOR T2 (H1) — collision collector threaded through the
  // walk so the bottom-up PARAMETER-VALUES / REFERENCE-VALUES helpers
  // can flag a shortName-key collision (two distinct BSWMD paths
  // sharing the same shortName tail) without throwing.
  const collector: CollisionCollector = { collision: undefined };
  const packages = walkPackages(arPackages as Record<string, unknown>, '', collector);
  if (!Array.isArray(packages)) {
    return {
      ok: false,
      error: { kind: 'invalid-structure', path: '/', message: 'packages not array' },
    };
  }

  // Strict reject: a file with only schema definitions (-DEF) and zero
  // value instances (ECUC-MODULE-CONFIGURATION-VALUES) is a BSWMD, not an
  // ECUC values file. Direct the user to the BSWMD loader rather than
  // silently producing an empty module tree.
  if (!findAnyModuleInPackages(packages) && findAnyDefInPackages(packages)) {
    return {
      ok: false,
      error: {
        kind: 'invalid-structure',
        path: '/',
        message:
          'Loaded file is a BSW Module Description (BSWMD, schema only). ' +
          'Open it via "Load BSWMD" instead of "Open ARXML".',
      },
    };
  }

  // v1.38.0 MINOR T2 (H1) — surface any shortName-key collision detected
  // during the walk as a structured `invalid-structure` error. The walk
  // preserves the no-collision data shape (shortName keys, single-param
  // semantics); only the bad case is flagged. Pre-T2 this would silently
  // overwrite, leading to missing params in the renderer.
  if (collector.collision !== undefined) {
    const c = collector.collision;
    return {
      ok: false,
      error: {
        kind: 'invalid-structure',
        path: c.containerPath,
        message:
          `Duplicate parameter shortName '${c.shortName}' in container '${c.containerPath}': ` +
          `BSWMD paths '${c.firstDefPath}' and '${c.secondDefPath}' share the same tail ` +
          `and cannot be merged into a single shortName-keyed entry. ` +
          `This usually indicates a BSWMD <ECUC-CHOICE-CONTAINER-DEF> branch or a ` +
          `vendor dialect where two distinct parameters collide on shortName.`,
      },
    };
  }

  return {
    ok: true,
    value: {
      path: '',
      version,
      packages,
    },
  };
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

export function detectVersion(autosar: Record<string, unknown>): ArxmlVersion | null {
  const xmlns = typeof autosar['@_xmlns'] === 'string' ? (autosar['@_xmlns'] as string) : '';
  const xsi = autosar['@_xsi:schemaLocation'];
  const loc = typeof xsi === 'string' ? xsi : xmlns;
  const m = NS_PATTERN.exec(loc);
  let candidate: ArxmlVersion | null = null;
  if (m) {
    const raw = m[1];
    if (raw !== undefined) {
      if (raw.startsWith('r')) candidate = raw.slice(1) as ArxmlVersion;
      else if (raw === '00005' || raw === '00006') candidate = raw;
    }
  }
  // 4.0/4.1 namespace only distinguishes at schemaLocation. Try the
  // schemaLocation XSD name regardless of whether the namespace matched,
  // because the 5-digit xsd form is the authoritative version hint for
  // R4.4+ AUTOSAR releases (EB tresos convention).
  if (typeof xsi === 'string') {
    const xm = XSD_PATTERN.exec(xsi);
    if (xm) {
      // Dashed form: AUTOSAR_4-2-2.xsd → '4.2'
      if (xm[1] !== undefined && xm[2] !== undefined) {
        candidate = `${xm[1]}.${xm[2]}` as ArxmlVersion;
      }
      // 5-digit form: AUTOSAR_00046.xsd → '00046'
      else if (xm[4] !== undefined) {
        candidate = xm[4] as ArxmlVersion;
      }
    }
  }
  if (candidate === null) return null;
  return SUPPORTED_ARXML_VERSIONS.includes(candidate) ? candidate : null;
}
