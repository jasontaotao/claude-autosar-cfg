import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function writeOutputTree(
  artifacts: ReadonlyMap<string, string>,
  outDir: string,
): Promise<void> {
  for (const [relPath, content] of artifacts) {
    const absPath = join(outDir, relPath);
    await mkdir(dirname(absPath), { recursive: true });
    const tmpPath = `${absPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, content, 'utf8');
    await rename(tmpPath, absPath);
  }
}
