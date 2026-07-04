// odxImportDiagnosticExtractHandler — IPC handler (v1.24.0 T2).
//
// 2-phase atomic write pipeline:
//   1. Pre-flight: validate outputDir exists + is writable
//   2. Re-parse .odx-d via parseOdxHandler (v1.22.0) → OdxSummary
//   3. Call T1's pure odxToDiagnosticExtract → 2 ARXML strings
//   4. Snapshot existing Dem_Extract.arxml + Dcm_Extract.arxml (if any)
//   5. writeAtomic(Dem) → tmp + rename
//   6. writeAtomic(Dcm) → tmp + rename
//   7. On any failure in 5-6: restore snapshots, return write-failed with rolledBack: true
//
// Failure modes (return { ok: false; error: { kind, message } }):
//   - read-failed  — .odx-d missing / not a string / parse failure / outputDir missing
//   - write-failed — 2-phase atomic write failure; rolledBack indicates snapshot restore

import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';

import { odxToDiagnosticExtract } from '../../core/bridge/odxToDiagnosticExtract.js';
import type {
  OdxImportDiagExtractRequest,
  OdxImportDiagExtractResponse,
} from '../../shared/types.js';
import { writeAtomic } from '../io/writeAtomic.js';

import { parseOdxHandler } from './parseOdxHandler.js';

const DEM_FILENAME = 'Dem_Extract.arxml';
const DCM_FILENAME = 'Dcm_Extract.arxml';

export async function odxImportDiagnosticExtractHandler(
  request: OdxImportDiagExtractRequest,
): Promise<OdxImportDiagExtractResponse> {
  const { odxPath, outputDir } = request;
  const absOutputDir = resolve(outputDir);

  // 1. Pre-flight: outputDir must exist and be writable.
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
  let odxContent: string;
  try {
    odxContent = await fs.readFile(odxPath, 'utf8');
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: 'read-failed',
        message: `Failed to read .odx-d: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }

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
