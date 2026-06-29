import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/**
 * Atomic file write helper — extracted from projectSaveHandler.ts in v1.15.5.
 *
 * Writes `content` to a unique temp file under the same directory as
 * `file`, fsyncs the temp, then `fs.rename`s it over the target. The
 * rename is atomic on POSIX and uses `MoveFileEx` with
 * `MOVEFILE_REPLACE_EXISTING` on Windows (Node delegates to the OS),
 * so readers always see either the old or the new content — never a
 * partial write.
 *
 * On any failure, the temp file is unlinked and the original `file`
 * (if any) is left untouched. The temp filename includes `pid` and a
 * monotonic timestamp to avoid collisions across concurrent writers
 * in the same directory.
 *
 * The trust-sprint invariant (v1.4.0) — "never partial-write a user's
 * project file" — is enforced here. Callers (project save handler,
 * script engine commit path) MUST route all ARXML / manifest writes
 * through this helper rather than calling `fs.writeFile` directly.
 *
 * @param file Absolute path of the target file.
 * @param content UTF-8 string content to write.
 */
export async function writeAtomic(file: string, content: string): Promise<void> {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(tmp, content, 'utf-8');
    // fsync the temp before rename so the bytes survive a crash. We
    // open the temp a second time in r+ (read+write) so the sync call
    // has a file descriptor to operate on — writeFile alone does not
    // surface the descriptor it used.
    const fh = await fs.open(tmp, 'r+');
    try {
      await fh.sync();
    } finally {
      await fh.close();
    }
    await fs.rename(tmp, file);
  } catch (err) {
    // Best-effort cleanup of the temp; ignore ENOENT (writeFile
    // failed before creating anything) and any other unlink failure.
    try {
      await fs.unlink(tmp);
    } catch {
      // intentional no-op
    }
    throw err;
  }
}
