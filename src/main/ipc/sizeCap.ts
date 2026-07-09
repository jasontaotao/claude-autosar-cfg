// v1.40.0 MINOR T1 — shared `readFileWithCap` helper.
//
// Background:
//   H1 — 6 dialog-driven read handlers (`openDbc`, `openOdx`,
//        `openOdxWithDefault`, `bswmdPick`, `OPEN_ARXML`,
//        `OPEN_ARXML_MULTI`) call `fs.readFile(path, 'utf8')` with NO
//        size cap. Every parse-path handler in this codebase applies a
//        32 MiB cap (see `BSWMD_MAX_BYTES` / `ARXML_MAX_BYTES` /
//        `ODX_MAX_BYTES` / `DBC_MAX_BYTES`). The picker paths were the
//        gap.
//   H2 — `dcmConfigHandler` reads ODX + BSWMD with `readFileSync` and
//        no cap. Long-running pipeline + sync read = OOM.
//   M4 — `OPEN_ARXML_MULTI` reads each picked file with no cap. 5 picks
//        × 1 GB each = 5 GB heap pressure.
//
// This helper unifies the cap-on-read pattern into one place. It is
// used by:
//   - `bswmdReadHandler.ts` (refactor — eliminates duplicate stat+read)
//   - `openDbcHandler.ts` / `openOdxHandler.ts` / `openOdxWithDefaultHandler.ts`
//     / `bswmdPickHandler.ts` (H1)
//   - `register.ts` OPEN_ARXML + OPEN_ARXML_MULTI handlers (H1 + M4)
//   - `dcmConfigHandler.ts` ODX + BSWMD reads (H2)
//
// Cap rationale (32 MiB):
//   - Matches `BSWMD_MAX_BYTES` (Sprint 12 #2), `ARXML_MAX_BYTES`
//     (Sprint 13 Stage 5.D), `ODX_MAX_BYTES` (v1.22.0 T1),
//     `DBC_MAX_BYTES` (v1.21.0 Bug #5). Sized to cover the AUTOSAR
//     standard master ECUC parameter definition file
//     (`AUTOSAR_MOD_ECUConfigurationParameters.arxml`, ~12 MiB at
//     R4.2.2) with ~2.6× headroom for future AUTOSAR releases.
//   - Tight enough to be a useful ceiling against a renderer pushing
//     a multi-GB binary blob (the OOM vector the picker paths were
//     missing).
//
// Result shape: a discriminated union so the caller can surface a
//   renderer-distinguishable error class without parsing the message.
//   - `{ ok: true; content }`            — read succeeded
//   - `{ ok: false; kind: 'too-large' }`   — file exceeded the cap
//   - `{ ok: false; kind: 'read-failed' }` — stat/read IO failed
//
// Callers translate the helper's union to their own IPC envelope. The
// helper does NOT know about IPC channels — it's a pure filesystem
// concern.

import * as fs from 'node:fs';

/**
 * Default per-file size cap. 32 MiB matches the existing
 * `BSWMD_MAX_BYTES` / `ARXML_MAX_BYTES` / `ODX_MAX_BYTES` /
 * `DBC_MAX_BYTES` constants; the picker paths were the gap.
 */
export const DEFAULT_FILE_CAP_BYTES = 32 * 1024 * 1024;

export type ReadFileWithCapResult =
  | { ok: true; content: string }
  | { ok: false; kind: 'too-large'; message: string }
  | { ok: false; kind: 'read-failed'; message: string };

/**
 * Read a UTF-8 file from disk with a pre-flight size check.
 *
 * Strategy: stat first, short-circuit if oversized, then read. This
 * avoids loading a multi-GB file into the heap when the user picks
 * the wrong file (a single "user picked a 4 GB binary by mistake"
 * moment was the original OOM vector).
 *
 * The cap is exclusive: a file of exactly `capBytes` is allowed; one
 * byte over is rejected with `kind: 'too-large'`. This matches the
 * existing parse-path caps (e.g. `BSWMD_MAX_BYTES`).
 *
 * @param path       Absolute path of the file to read.
 * @param capBytes   Hard cap on the file size in bytes. Defaults to
 *                   {@link DEFAULT_FILE_CAP_BYTES} (32 MiB).
 *
 * @returns
 *   - `{ ok: true; content }` on success.
 *   - `{ ok: false; kind: 'too-large'; message }` when the file
 *     exceeds the cap. Message includes the actual size + cap for
 *     renderer-side user-facing copy.
 *   - `{ ok: false; kind: 'read-failed'; message }` when `stat` or
 *     `readFile` throws (ENOENT, EACCES, EISDIR, etc.). The message
 *     includes the underlying error text so the renderer can surface
 *     the OS-level cause.
 */
export async function readFileWithCap(
  path: string,
  capBytes: number = DEFAULT_FILE_CAP_BYTES,
): Promise<ReadFileWithCapResult> {
  try {
    const stat = await fs.promises.stat(path);
    if (stat.size > capBytes) {
      return {
        ok: false,
        kind: 'too-large',
        message: `${path} is ${stat.size} bytes, exceeds ${capBytes} cap`,
      };
    }
  } catch (e) {
    return {
      ok: false,
      kind: 'read-failed',
      message: `stat failed for ${path}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  try {
    const content = await fs.promises.readFile(path, 'utf8');
    return { ok: true, content };
  } catch (e) {
    return {
      ok: false,
      kind: 'read-failed',
      message: `read failed for ${path}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
