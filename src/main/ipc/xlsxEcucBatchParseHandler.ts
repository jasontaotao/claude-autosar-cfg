// v1.25.0 T2 — IPC handler `xlsx:parseBatch`.
//
// Reads a user-authored `.xlsx`, returns the parsed `EcucInstanceRow[]`
// plus a per-row collision map (rows whose shortName already exists in
// the project's 3 Com-stack files). Does NOT write to disk. The wizard
// calls this in Step 2 to render the preview table.
//
// Dynamic-imports SheetJS so main-process startup bundle stays 0-cost
// (per spec §Risks).

import { promises as fs } from 'node:fs';

import type * as XLSXType from 'xlsx';

import { parseArxml } from '../../core/arxml/parser.js';
import type {
  EcucInstanceRow,
  XlsxParseBatchRequest,
  XlsxParseBatchResponse,
} from '../../shared/types.js';

import { getOpenProjectManifestPath } from './project-manifest-state.js';

const MAX_XLSX_BYTES = 5 * 1024 * 1024; // 5 MiB

const COM_STACK_PATHS = ['Com', 'CanIf', 'PduR'] as const;

/** Sheet name → parent path; mirrors `xlsxToEcucBatch` for consistency. */
const PARENT_PATH_BY_KIND = {
  ComIPdu: 'Com/ComConfig/ComIpdu',
  ComSignal: 'Com/ComConfig/ComSignal',
  CanIfTxPdu: 'CanIf/CanIfConfig/CanIfTxPdu',
  CanIfRxPdu: 'CanIf/CanIfConfig/CanIfRxPdu',
  PduRRoutingPath: 'PduR/PduRRoutingPaths/PduRRoutingPath',
} as const;

type SheetName = keyof typeof PARENT_PATH_BY_KIND;

export async function xlsxEcucBatchParseHandler(
  req: XlsxParseBatchRequest,
): Promise<XlsxParseBatchResponse> {
  // --- 1. Open-project gate (mirrors dbcImportComStackHandler §3) ---
  const openProject = getOpenProjectManifestPath();
  if (openProject === null || openProject !== req.projectManifestPath) {
    return {
      ok: false,
      error: { kind: 'read-failed', message: 'No open project at the given manifest path' },
    };
  }

  // --- 2. Size guard ---
  if (req.xlsxBytes.byteLength > MAX_XLSX_BYTES) {
    return {
      ok: false,
      error: {
        kind: 'read-failed',
        message: `.xlsx exceeds ${(MAX_XLSX_BYTES / (1024 * 1024)).toFixed(1)} MiB cap (got ${(req.xlsxBytes.byteLength / (1024 * 1024)).toFixed(1)} MiB)`,
      },
    };
  }

  // --- 3. Read manifest + locate Com-stack ARXML paths ---
  let manifestRaw: string;
  try {
    manifestRaw = await fs.readFile(req.projectManifestPath, 'utf-8');
  } catch (e) {
    return {
      ok: false,
      error: { kind: 'read-failed', message: `Cannot read manifest: ${(e as Error).message}` },
    };
  }
  let manifest: { valueArxmlPaths?: readonly string[] };
  try {
    manifest = JSON.parse(manifestRaw) as { valueArxmlPaths?: readonly string[] };
  } catch (e) {
    return {
      ok: false,
      error: {
        kind: 'read-failed',
        message: `Manifest is not valid JSON: ${(e as Error).message}`,
      },
    };
  }
  if (!Array.isArray(manifest.valueArxmlPaths)) {
    return {
      ok: false,
      error: { kind: 'read-failed', message: 'Manifest missing valueArxmlPaths' },
    };
  }

  // --- 4. Dynamic-import SheetJS ---
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

  // --- 5. Parse .xlsx ---
  let workbook: ReturnType<typeof XLSX.read>;
  try {
    workbook = XLSX.read(req.xlsxBytes, { type: 'array', cellFormula: false });
  } catch (e) {
    return {
      ok: false,
      error: { kind: 'parse-failed', message: `SheetJS read failed: ${(e as Error).message}` },
    };
  }

  // --- 6. Walk every sheet, build EcucInstanceRow[] ---
  const instances: EcucInstanceRow[] = [];
  for (const sheetName of workbook.SheetNames) {
    if (!(sheetName in PARENT_PATH_BY_KIND)) continue; // ignore non-target sheets
    const sheet = workbook.Sheets[sheetName];
    if (sheet === undefined) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    if (rows.length < 2) continue; // header-only or empty
    const header = rows[0];
    if (header === undefined || header === null) continue;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row === undefined || row === null) continue;
      const rowArr = row as unknown[];
      const sn = rowArr[0]; // shortName is always in column A (index 0)
      if (typeof sn !== 'string' || sn.length === 0) {
        return {
          ok: false,
          error: {
            kind: 'parse-failed',
            message: `Sheet ${sheetName} row ${i + 1}: missing shortName`,
          },
        };
      }
      const params: Record<string, string | number | boolean | null> = {};
      const headerArr = header as unknown[];
      // Column B (index 1) is the optional `definitionRef`; columns
      // 2+ are `param:<NAME>` data columns.
      const defRefCell = rowArr[1];
      const definitionRef: string | undefined =
        typeof defRefCell === 'string' && defRefCell.length > 0 ? defRefCell : undefined;
      for (let c = 2; c < headerArr.length; c++) {
        const key = headerArr[c];
        if (typeof key !== 'string' || !key.startsWith('param:')) continue;
        const v = rowArr[c];
        if (v === undefined || v === '' || v === null) continue;
        params[key.slice('param:'.length)] = v as string | number | boolean;
      }
      instances.push({
        sheet: sheetName as SheetName,
        shortName: sn,
        ...(definitionRef !== undefined && { definitionRef }),
        params,
      });
    }
  }

  // --- 7. Collision map: walk the 3 target ARXMLs for `<SHORT-NAME>`
  //          duplicates. Heuristic substring matching per spec §Risks —
  //          v1.25.x PATCH will refine to a tree-walk collision algorithm.
  const collisions: Record<string, boolean> = {};
  const projectDir = (() => {
    const norm = req.projectManifestPath.replace(/\\/g, '/');
    const i = norm.lastIndexOf('/');
    return i < 0 ? norm : norm.slice(0, i);
  })();
  const seenShortNamesByFile: Record<string, Set<string>> = {};
  for (const m of COM_STACK_PATHS) {
    const paths: readonly string[] = manifest.valueArxmlPaths ?? [];
    const sub: string | undefined = paths.find((p) => {
      const lower = p.replace(/\\/g, '/').toLowerCase();
      const fn = lower.split('/').pop() ?? '';
      return (
        fn.startsWith(`${m.toLowerCase()}_`) ||
        fn.includes(`${m.toLowerCase()}config`) ||
        (m === 'PduR' && fn.includes('pdurrouting'))
      );
    });
    if (sub === undefined) continue;
    const abspath = `${projectDir}/${sub.replace(/\\/g, '/')}`;
    let text: string;
    try {
      text = await fs.readFile(abspath, 'utf-8');
    } catch {
      continue;
    }
    const doc = parseArxml(text);
    if (!doc.ok) continue;
    seenShortNamesByFile[abspath] = new Set<string>();
    collectShortNames(doc.value, seenShortNamesByFile[abspath]!);
  }
  for (const inst of instances) {
    const parentPath = PARENT_PATH_BY_KIND[inst.sheet];
    const parentFile = parentPath.split('/')[0]!;
    const fileMatch = manifest.valueArxmlPaths.find((p) => {
      const lower = p.replace(/\\/g, '/').toLowerCase();
      const fn = lower.split('/').pop() ?? '';
      return (
        (parentFile === 'Com' && (fn.startsWith('com_') || fn.includes('comconfig'))) ||
        (parentFile === 'CanIf' && (fn.startsWith('canif_') || fn.includes('canifconfig'))) ||
        (parentFile === 'PduR' && (fn.startsWith('pdur_') || fn.includes('pdurrouting')))
      );
    });
    if (fileMatch === undefined) continue;
    const abspath = `${projectDir}/${fileMatch.replace(/\\/g, '/')}`;
    const set = seenShortNamesByFile[abspath];
    if (set !== undefined && set.has(inst.shortName)) {
      collisions[`${inst.sheet}:${inst.shortName}`] = true;
    }
  }

  return {
    ok: true,
    value: {
      instances,
      collisions,
    },
  };
}

/**
 * Recursive helper that walks an ARXML document tree and collects every
 * `shortName` into the provided Set. `parseArxml` normalizes
 * `<SHORT-NAME>` to camelCase `shortName`, so we look for that key
 * (the same field name used in `ArxmlPackage.shortName`,
 * `ArxmlElement.shortName`, etc.). Cheap breadth-first traversal; we
 * only need to know "does this shortName exist in this file at any
 * depth?" for the heuristic collision check.
 */
function collectShortNames(node: unknown, into: Set<string>): void {
  if (node === null || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (typeof obj.shortName === 'string') {
    into.add(obj.shortName);
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) {
      for (const item of v) collectShortNames(item, into);
    } else if (v !== null && typeof v === 'object') {
      collectShortNames(v, into);
    }
  }
}
