import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { DiagnosticCode, DiagnosticSeverity, type Diagnostic } from './diagnostics.js';

/**
 * Write every artifact to its path under `outDir` atomically (temp file
 * + rename). When the optional `diagnostics` array is supplied, fs
 * failures push ECUC-GEN-031 (OUTPUT_WRITE, ERROR) and the loop
 * continues with the next artifact (no re-throw). When omitted, fs
 * failures re-throw the original error (backward-compatible signature
 * for callers that don't track diagnostics).
 */
export async function writeOutputTree(
  artifacts: ReadonlyMap<string, string>,
  outDir: string,
  diagnostics?: Diagnostic[],
): Promise<void> {
  for (const [relPath, content] of artifacts) {
    const absPath = join(outDir, relPath);
    try {
      await mkdir(dirname(absPath), { recursive: true });
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