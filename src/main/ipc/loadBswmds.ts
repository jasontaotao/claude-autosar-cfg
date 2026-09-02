import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import { parseBswmd } from '../../core/project/bswmd.js';
import type { BswModuleDef } from '../../core/project/bswmd.js';

import { formatBridgeBswmdError } from './_bridge-runtime.js';

/**
 * Load every parseable ARXML BSWMD in a directory into a
 * module-shortName map. A missing directory is intentional for
 * loose/standalone imports and resolves to an empty map so bridge
 * mappers keep their standard fallback.
 */
export async function loadBswmdsFromDirectory(
  bswmdDir: string,
): Promise<ReadonlyMap<string, BswModuleDef>> {
  let files: readonly string[] = [];
  try {
    files = await fs.readdir(bswmdDir);
  } catch {
    return new Map();
  }

  const bswmds = new Map<string, BswModuleDef>();
  for (const file of files) {
    if (!file.toLowerCase().endsWith('.arxml')) continue;
    const path = join(bswmdDir, file);
    const content = await fs.readFile(path, 'utf-8');
    const result = parseBswmd(content);
    if (!result.ok) {
      throw new Error(`BSWMD ${path} parse failed: ${formatBridgeBswmdError(result.error)}`);
    }
    for (const moduleDef of result.value.modules) {
      bswmds.set(moduleDef.shortName, moduleDef);
    }
  }
  return bswmds;
}
