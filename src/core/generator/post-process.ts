import { mkdir, realpath, writeFile, rename } from 'node:fs/promises';
import { dirname, isAbsolute, join, sep } from 'node:path';

import { DiagnosticCode, DiagnosticSeverity, type Diagnostic } from './diagnostics.js';

/**
 * Write every artifact to its path under `outDir` atomically (temp file
 * + rename). When the optional `diagnostics` array is supplied, fs
 * failures push ECUC-GEN-031 (OUTPUT_WRITE, ERROR) and the loop
 * continues with the next artifact (no re-throw). When omitted, fs
 * failures re-throw the original error (backward-compatible signature
 * for callers that don't track diagnostics).
 *
 * v1.13.5 PATCH-F (SEC4) — D-rev2 Security finding: without
 * canonicalization, a malicious `relPath` like `../../../tmp/escape`
 * would write OUTSIDE `outDir`. We now canonicalize `outDir` once via
 * `realpath`, then for each artifact check that `realpath(dirname(absPath))`
 * starts with the canonicalized outDir. Escape attempts push an
 * ECUC-GEN-031 diagnostic and are skipped (no write).
 */
export async function writeOutputTree(
  artifacts: ReadonlyMap<string, string>,
  outDir: string,
  diagnostics?: Diagnostic[],
): Promise<void> {
  // Canonicalize outDir once. If outDir doesn't exist yet, realpath
  // resolves what it can; fall back to resolve+normalize.
  let outDirReal: string;
  try {
    outDirReal = await realpath(outDir);
  } catch {
    outDirReal = outDir;
  }

  for (const [relPath, content] of artifacts) {
    // Reject absolute paths outright — only paths inside outDir allowed.
    if (isAbsolute(relPath)) {
      const msg = `Refused write for ${relPath}: absolute paths not allowed`;
      if (diagnostics === undefined) throw new Error(msg);
      diagnostics.push({
        severity: DiagnosticSeverity.ERROR,
        code: DiagnosticCode.ECUC_GEN_OUTPUT_WRITE,
        message: msg,
      });
      continue;
    }
    const absPath = join(outDir, relPath);
    // Canonicalize the parent directory and confirm it stays within outDir.
    let parentReal: string;
    try {
      parentReal = await realpath(dirname(absPath));
    } catch {
      // Parent doesn't exist yet — fall back to resolving the
      // would-be absolute path against outDirReal.
      parentReal = dirname(join(outDirReal, relPath));
    }
    const staysWithin =
      parentReal === outDirReal ||
      parentReal.startsWith(outDirReal + sep) ||
      parentReal.startsWith(outDirReal + '/');
    if (!staysWithin) {
      const msg = `Refused write for ${relPath}: path escapes outDir (${parentReal} not under ${outDirReal})`;
      if (diagnostics === undefined) throw new Error(msg);
      diagnostics.push({
        severity: DiagnosticSeverity.ERROR,
        code: DiagnosticCode.ECUC_GEN_OUTPUT_WRITE,
        message: msg,
      });
      continue;
    }
    try {
      await mkdir(parentReal, { recursive: true });
      const tmpPath = `${absPath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmpPath, content, 'utf8');
      await rename(tmpPath, absPath);
    } catch (e) {
      if (diagnostics === undefined) throw e;
      diagnostics.push({
        severity: DiagnosticSeverity.ERROR,
        code: DiagnosticCode.ECUC_GEN_OUTPUT_WRITE,
        message: `Failed to write ${relPath}: ${e instanceof Error ? e.message : String(e)}`,
      });
      // Continue with remaining artifacts; the caller decides whether
      // the partial-write state is acceptable (typically: surface as
      // non-zero exit and let the user re-run).
    }
  }
}
