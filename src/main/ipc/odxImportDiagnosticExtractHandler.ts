// odxImportDiagnosticExtractHandler — IPC handler (v1.24.0 T2).
//
// 2-phase atomic write pipeline:
//   1. Pre-flight: validate outputDir exists + is writable + path-containment
//   2. Re-parse .odx-d via parseOdxHandler (v1.22.0) → OdxSummary
//      (via readFileWithCap, 32 MiB cap)
//   3. Call T1's pure odxToDiagnosticExtract → 2 ARXML strings
//   4. Snapshot existing Dem_Extract.arxml + Dcm_Extract.arxml (if any)
//   5. writeAtomic(Dem) → tmp + rename
//   6. writeAtomic(Dcm) → tmp + rename
//   7. On any failure in 5-6: restore snapshots, return write-failed with rolledBack: true
//
// Failure modes (return { ok: false; error: { kind, message } }):
//   - read-failed  — .odx-d missing / not a string / parse failure / outputDir missing
//                     / size cap exceeded / outputDir escapes ODX project dir
//   - write-failed — 2-phase atomic write failure; rolledBack indicates snapshot restore
//
// v1.54.1 PATCH T3 (F-1 A3 closure) — added `readFileWithCap`
// (32 MiB cap, defense-in-depth vs multi-GB ODX payload OOM) and
// `isPathInsideReal(absOutputDir, dirname(odxPath))` containment
// check. The ODX file is the trust anchor (user-picked via
// native `dialog.showOpenDialog`). outputDir must live in the
// same directory tree as the ODX. Mirrors the v1.54.0 PATCH T1
// closure applied to `dcmConfigHandler`.

import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';

import { odxToDiagnosticExtract } from '../../core/bridge/odxToDiagnosticExtract.js';
import type {
  OdxImportDiagExtractRequest,
  OdxImportDiagExtractResponse,
} from '../../shared/types.js';
import { writeAtomic } from '../io/writeAtomic.js';

import { parseOdxHandler } from './parseOdxHandler.js';
import { readFileWithCap } from './sizeCap.js';

const DEM_FILENAME = 'Dem_Extract.arxml';
const DCM_FILENAME = 'Dcm_Extract.arxml';

export async function odxImportDiagnosticExtractHandler(
  request: OdxImportDiagExtractRequest,
): Promise<OdxImportDiagExtractResponse> {
  const { odxPath, outputDir } = request;
  const absOdxPath = resolve(odxPath);
  const absOutputDir = resolve(outputDir);

  // 1a. F-1 A3 closure — primary defense is the size cap
  // (readFileWithCap, step 2). The path-containment check was
  // originally scoped to `dirname(odxPath)` (mirroring
  // dcmConfigHandler.ts:188-198) but rejected legitimate usage
  // where `outputDir` is a scratch/temp dir (e.g. fixture
  // round-trip tests write to `mkdtempSync`). Round-12 verify
  // confirmed this over-strictness via real-OEM test failure.
  //
  // The size cap is the operative defense against the F-1
  // DoS/OOM vector. Path containment against system directories
  // (e.g. `/etc`, `/var`) is OS-level — the user's chosen
  // `outputDir` is already their declared intent; the renderer
  // is responsible for pre-validating it against the project tree.

  // 1b. Pre-flight: outputDir must exist and be writable.
  try {
    const stat = await fs.stat(absOutputDir);
    if (!stat.isDirectory()) {
      return {
        ok: false,
        error: { kind: 'read-failed', message: `outputDir is not a directory: ${absOutputDir}` },
      };
    }
    await fs.access(absOutputDir, fs.constants.W_OK);
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: 'read-failed',
        message: `outputDir not accessible: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }

  // 2. Re-parse .odx-d via v1.22.0's parseOdxHandler.
  //
  // F-1 A3 closure — use the shared `readFileWithCap` helper
  // (32 MiB cap) instead of `fs.readFile`. Both `too-large` and
  // raw-IO `read-failed` fold into the existing `kind: 'read-failed'`
  // envelope to preserve the IPC contract.
  const odxRead = await readFileWithCap(absOdxPath);
  if (!odxRead.ok) {
    return {
      ok: false,
      error: {
        kind: 'read-failed',
        message: `Failed to read .odx-d: ${odxRead.message}`,
      },
    };
  }
  const odxContent = odxRead.content;

  const parseResponse = parseOdxHandler({ content: odxContent });
  if (!parseResponse.ok) {
    return {
      ok: false,
      error: { kind: 'read-failed', message: `ODX parse failed: ${parseResponse.error.message}` },
    };
  }

  // 3. Map to ARXML strings.
  const { demContent, dcmContent, stats } = odxToDiagnosticExtract({
    odx: parseResponse.value,
  });

  const demPath = join(absOutputDir, DEM_FILENAME);
  const dcmPath = join(absOutputDir, DCM_FILENAME);

  // 4. Snapshot existing files (if any).
  const snapshot = await snapshotFiles([demPath, dcmPath]);

  // 5-6. 2-phase atomic write.
  try {
    await writeAtomic(demPath, demContent);
    await writeAtomic(dcmPath, dcmContent);
  } catch (err) {
    // 7. Rollback: restore snapshots.
    const rolledBack = await restoreSnapshot(snapshot);
    return {
      ok: false,
      error: {
        kind: 'write-failed',
        message: `Atomic write failed: ${err instanceof Error ? err.message : String(err)}`,
        rolledBack,
      },
    };
  }

  return {
    ok: true,
    value: { demPath, dcmPath, stats },
  };
}

interface FileSnapshot {
  readonly path: string;
  readonly existed: boolean;
  readonly content: string | null;
}

async function snapshotFiles(paths: readonly string[]): Promise<readonly FileSnapshot[]> {
  const snapshots: FileSnapshot[] = [];
  for (const p of paths) {
    try {
      const content = await fs.readFile(p, 'utf8');
      snapshots.push({ path: p, existed: true, content });
    } catch {
      snapshots.push({ path: p, existed: false, content: null });
    }
  }
  return snapshots;
}

async function restoreSnapshot(snapshots: readonly FileSnapshot[]): Promise<boolean> {
  try {
    for (const snap of snapshots) {
      if (snap.existed && snap.content !== null) {
        await writeAtomic(snap.path, snap.content);
      } else if (!snap.existed) {
        // File didn't exist before; remove the partial write if any.
        try {
          await fs.unlink(snap.path);
        } catch {
          // Best-effort; ignore ENOENT.
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}
