// v1.36.0 MINOR T1 — JSON file persistence for xlsxImportHistory.
//
// Stores the last 5 xlsx imports to <userData>/xlsx-import-history.json
// so the v1.34.0 timeline survives app restarts. Pure module — no
// IPC, no Electron dialog API. Wrapped by xlsxHistoryLoadHandler /
// xlsxHistorySaveHandler (T2) which expose it to the renderer.
//
// Lesson: custom-json-file-storage-avoids-new-dep — for a 5-entry
// cap with a stable shape, custom JSON in userData is simpler than
// electron-store. No schema migration needed at this size.

import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';

import { app } from 'electron';

import type { EcucInstanceRow } from '../shared/types.js';

import { writeAtomic } from './io/writeAtomic.js';

const MAX_HISTORY = 5;

export interface MainXlsxImportRecord {
  readonly rows: readonly EcucInstanceRow[];
  readonly source: 'manual' | 'wizard';
  readonly importedAt: number;
}

/**
 * Type guard for a single persisted record. Defensive against
 * hand-edited or older-version-written files. Returns false (and
 * the caller warns) for any record whose shape drifts from the
 * v1.36.0 contract.
 *
 * v1.36.1 PATCH M2 — per-record validation at the storage
 * boundary. Previously readXlsxHistory only checked
 * Array.isArray; a bad record like { source: 'wizard' } crashed
 * the renderer on record.rows.map().
 */
function isMainXlsxImportRecord(value: unknown): value is MainXlsxImportRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v['rows'])) return false;
  const source = v['source'];
  if (source !== 'manual' && source !== 'wizard') return false;
  if (typeof v['importedAt'] !== 'number') return false;
  return true;
}

function historyFilePath(): string {
  const userData = app.getPath('userData');
  return pathResolve(userData, 'xlsx-import-history.json');
}

/**
 * Read the persisted history. Returns [] on:
 *   - missing file (first-run)
 *   - corrupted JSON (defensive — log + reset)
 *   - any FS error (defensive — log + reset)
 *
 * Defensive: the cap-5 + prepend-first invariant is re-enforced
 * defensively on read in case the file was hand-edited or written
 * by an older version.
 */
export function readXlsxHistory(): MainXlsxImportRecord[] {
  const path = historyFilePath();
  if (!existsSync(path)) return [];
  let parsed: unknown;
  try {
    const raw = readFileSync(path, 'utf-8');
    parsed = JSON.parse(raw);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      `xlsxHistoryStorage: corrupt or unreadable file at ${path}: ${
        e instanceof Error ? e.message : String(e)
      }; resetting to empty`,
    );
    return [];
  }
  if (!Array.isArray(parsed)) {
    // eslint-disable-next-line no-console
    console.warn(`xlsxHistoryStorage: expected array, got ${typeof parsed}; resetting`);
    return [];
  }
  const valid: MainXlsxImportRecord[] = [];
  for (let i = 0; i < parsed.length; i++) {
    if (isMainXlsxImportRecord(parsed[i])) {
      valid.push(parsed[i]);
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `xlsxHistoryStorage: dropping record at index ${i} (shape mismatch: ${JSON.stringify(parsed[i])}); file may be hand-edited or older than v1.36.0`,
      );
    }
  }
  return valid.slice(0, MAX_HISTORY);
}

/**
 * Write a new record to the head of the history (cap-5 + prepend-first).
 * Reads existing entries first, prepends, slices to MAX_HISTORY, then
 * atomic write via writeAtomic — temp file + fsync + rename, so the
 * on-disk file is always either the old or the new content (never a
 * partial write). If the process crashes mid-write the readXlsxHistory
 * defensive parser resets to [], but a successful writeAtomic is durable
 * across crashes.
 */
export async function writeXlsxHistory(record: MainXlsxImportRecord): Promise<void> {
  const path = historyFilePath();
  const userData = app.getPath('userData');
  // Ensure the userData directory exists (Electron creates it on app
  // boot but defensive mkdir is cheap).
  mkdirSync(userData, { recursive: true });
  const existing = readXlsxHistory();
  const next = [record, ...existing].slice(0, MAX_HISTORY);
  await writeAtomic(path, JSON.stringify(next, null, 2));
}
