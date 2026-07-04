// v1.25.0 T3 — IPC handler `xlsx:writeBatchTemplate`.
//
// Reads the project's 3 Com-stack BSWMD modules and emits a starter
// `.xlsx` with 5 sheets (one per Com-stack kind: ComIPdu, ComSignal,
// CanIfTxPdu, CanIfRxPdu, PduRRoutingPath). Each sheet's row 0 =
// `shortName,definitionRef,param:<NAME_1>,param:<NAME_2>,...` where
// the `param:<NAME>` columns are populated from the BSWMD module's
// per-kind container PARAM-CONF list. Row 1 is a single placeholder
// row the user can copy/paste to add real data.
//
// Returns `{ ok: true, value: { xlsxBytes } }`. The wizard in T5
// pipes the bytes through Electron's `dialog.showSaveDialog` so the
// user gets a real "Download starter template" file picker.
//
// DYNAMIC-IMPORT: SheetJS (xlsx) is ~470 KB; importing at module
// top would inflate main-process startup. Per T2's pattern (and the
// spec §Risks), we `await import('xlsx')` lazily inside the handler.
// CJS/ESM fallback per the T2 lessons: `(await import('xlsx')).default
// ?? (await import('xlsx'))`.

import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

import type * as XLSXType from 'xlsx';

import {
  type BswmdDocument,
  findModuleByPath,
  lookupContainerDef,
  parseBswmd,
} from '../../core/project/bswmd.js';
import type {
  XlsxWriteBatchTemplateRequest,
  XlsxWriteBatchTemplateResponse,
} from '../../shared/types.js';

import { getOpenProjectManifestPath } from './project-manifest-state.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Supported Com-stack ECUC container kinds, one sheet per entry. */
const SUPPORTED = ['ComIPdu', 'ComSignal', 'CanIfTxPdu', 'CanIfRxPdu', 'PduRRoutingPath'] as const;

type SupportedKind = (typeof SUPPORTED)[number];

/** BSWMD module shortName per Com-stack kind. */
type ModuleShortName = 'Com' | 'CanIf' | 'PduR';

const MODULE_SHORTNAME_BY_KIND: Record<SupportedKind, ModuleShortName> = {
  ComIPdu: 'Com',
  ComSignal: 'Com',
  CanIfTxPdu: 'CanIf',
  CanIfRxPdu: 'CanIf',
  PduRRoutingPath: 'PduR',
};

/** Path of each BSWMD file relative to the project root. */
const BSWMD_PATH_BY_MODULE: Record<ModuleShortName, string> = {
  Com: 'Com.bswmd.arxml',
  CanIf: 'CanIf.bswmd.arxml',
  PduR: 'PduR.bswmd.arxml',
};

/**
 * Canonical ECUC module-def path for each module. The demo project's
 * real BSWMDs declare `Com/ComConfig/ComIPdu` etc. as nested; the
 * stub BSWMDs used by T3 tests declare them at the top level. Both
 * shapes resolve via `lookupContainerDef`'s recursive descent
 * (see `findContainerInTree` in bswmd.ts:645).
 */
const MODULE_PATH_BY_MODULE: Record<ModuleShortName, string> = {
  Com: '/AUTOSAR/Com',
  CanIf: '/AUTOSAR/CanIf',
  PduR: '/AUTOSAR/PduR',
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function xlsxEcucBatchWriteBatchTemplateHandler(
  req: XlsxWriteBatchTemplateRequest,
): Promise<XlsxWriteBatchTemplateResponse> {
  // --- 1. Open-project gate (mirrors T2 handlers) ---
  const openProject = getOpenProjectManifestPath();
  if (openProject === null || openProject !== req.projectManifestPath) {
    return {
      ok: false,
      error: { kind: 'read-failed', message: 'No open project at the given manifest path' },
    };
  }

  const projectDir = dirname(req.projectManifestPath);

  // --- 2. Dynamic-import SheetJS (CJS/ESM fallback per T2 pattern) ---
  let XLSX: typeof XLSXType;
  try {
    const mod = await import('xlsx');
    XLSX = mod.default ?? mod;
  } catch (e) {
    return {
      ok: false,
      error: {
        kind: 'read-failed',
        message: `Failed to load xlsx package: ${(e as Error).message}`,
      },
    };
  }

  // --- 3. Read + parse 3 BSWMDs ---
  const modules: ReadonlyArray<ModuleShortName> = ['Com', 'CanIf', 'PduR'];
  const parsed: Partial<Record<ModuleShortName, BswmdDocument>> = {};
  for (const m of modules) {
    const bswmdPath = `${projectDir}/${BSWMD_PATH_BY_MODULE[m]}`;
    let text: string;
    try {
      text = await fs.readFile(bswmdPath, 'utf-8');
    } catch (e) {
      return {
        ok: false,
        error: {
          kind: 'read-failed',
          message: `Cannot read ${BSWMD_PATH_BY_MODULE[m]}: ${(e as Error).message}`,
        },
      };
    }
    const res = parseBswmd(text);
    if (!res.ok) {
      return {
        ok: false,
        error: {
          kind: 'parse-failed',
          message: `${BSWMD_PATH_BY_MODULE[m]}: ${res.error.kind} — ${'message' in res.error ? res.error.message : ''}`,
        },
      };
    }
    parsed[m] = res.value;
  }

  // --- 4. For each SUPPORTED kind, locate the container def and
  //        enumerate its parameters into a header + 1 example row.
  const workbook = XLSX.utils.book_new();
  for (const kind of SUPPORTED) {
    const moduleShortName = MODULE_SHORTNAME_BY_KIND[kind];
    const doc = parsed[moduleShortName];
    if (doc === undefined) {
      // unreachable — the loop above populates all three modules.
      return {
        ok: false,
        error: {
          kind: 'parse-failed',
          message: `${moduleShortName}: missing parsed BSWMD`,
        },
      };
    }
    const moduleDef = findModuleByPath(doc, MODULE_PATH_BY_MODULE[moduleShortName]);
    if (moduleDef === null) {
      return {
        ok: false,
        error: {
          kind: 'parse-failed',
          message: `${moduleShortName}: no module def at ${MODULE_PATH_BY_MODULE[moduleShortName]}`,
        },
      };
    }
    const container = lookupContainerDef(moduleDef, kind);
    if (container === null) {
      return {
        ok: false,
        error: {
          kind: 'parse-failed',
          message: `${moduleShortName}: no container def for ${kind}`,
        },
      };
    }
    const paramCols = container.parameters.map((p) => `param:${p.shortName}`);
    const header = ['shortName', 'definitionRef', ...paramCols];
    // Row 1: a single example row so the user can see the convention.
    // shortName is the only populated cell (kind-prefixed so the user
    // can see at a glance what kind they're looking at); definitionRef
    // and all param cols are empty.
    const example = [`${kind}_Example`, '', ...paramCols.map(() => '')];
    const ws = XLSX.utils.aoa_to_sheet([header, example]);
    XLSX.utils.book_append_sheet(workbook, ws, kind);
  }

  // --- 5. Serialize workbook → Uint8Array ---
  // SheetJS v0.18.5 returns `ArrayBuffer` for `type: 'array'`; wrap to
  // Uint8Array so the IPC contract (`xlsxBytes: Uint8Array`) is honoured.
  const raw = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const xlsxBytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer);
  return { ok: true, value: { xlsxBytes } };
}
