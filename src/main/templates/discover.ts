// Sprint 13 #1 — scan `samplesRoot` and return opt-in `BuiltinTemplate[]`.
//
// Algorithm:
//   1. If `samplesRoot` does not exist, warn and return [].
//   2. Iterate direct child directories (skip hidden, skip non-dirs).
//   3. For each dir, look for `<dir>/template.json`. If absent → skip
//      (this is the opt-in gate: reference data dirs without a manifest
//      are silently ignored).
//   4. Parse + validate the manifest via `parseTemplateManifest`. If
//      the parse fails, JSON is malformed, or `id` != dirname → warn
//      and skip. One bad template never breaks discovery of the rest.
//   5. Walk `<dir>/*.arxml` (excluding the `bswmd/` subdirectory) for
//      value-side files. Walk `<dir>/bswmd/*.arxml` (if it exists) for
//      schema-side files. Both lists are absolute paths inside
//      `samplesRoot`.
//   6. Return sorted by `id` (stable alphabetical order — required for
//      IPC deterministic response in tests).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { classTemplateError } from './errors.js';
import { parseTemplateManifest } from './parse-manifest.js';
import type { BuiltinTemplate, TemplateManifest } from './types.js';
import { walkArxml } from './walk-arxml.js';

/** Module-level logger. Wired by `bootstrap.ts` to `app._logger`. */
type Logger = { warn: (msg: string, meta?: unknown) => void };
let logger: Logger = {
  warn: (m) => {
    /* eslint-disable-next-line no-console */ console.warn(m);
  },
};
export function setTemplatesLogger(l: Logger): void {
  logger = l;
}

export function discoverBuiltinTemplates(samplesRoot: string): BuiltinTemplate[] {
  if (!existsSync(samplesRoot)) {
    logger.warn('[templates] samples root missing', { samplesRoot });
    return [];
  }

  const entries = readdirSync(samplesRoot, { withFileTypes: true }).filter(
    (e) => e.isDirectory() && !e.name.startsWith('.'),
  );

  const templates: BuiltinTemplate[] = [];
  for (const entry of entries) {
    const dirPath = join(samplesRoot, entry.name);
    const manifestPath = join(dirPath, 'template.json');
    if (!existsSync(manifestPath)) continue; // opt-in: skip reference data

    let manifest: TemplateManifest | null = null;
    try {
      const raw = readFileSync(manifestPath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      manifest = parseTemplateManifest(parsed);
    } catch (e) {
      logger.warn('[templates] template.json invalid', { dir: entry.name, err: String(e) });
      continue;
    }
    if (manifest === null) {
      // parseTemplateManifest returned null → either bad shape or
      // id fails kebab-case. We already logged at the JSON layer; the
      // type-guard case is logged here for diagnostic clarity.
      logger.warn('[templates] template.json failed type guard', { dir: entry.name });
      continue;
    }
    if (manifest.id !== entry.name) {
      logger.warn('[templates] template.id != dirname', { dir: entry.name, id: manifest.id });
      continue;
    }

    const valueRel = walkArxml(dirPath, { exclude: 'bswmd' });
    const bswmdDir = join(dirPath, 'bswmd');
    const bswmdRel = existsSync(bswmdDir) ? walkArxml(bswmdDir) : [];

    templates.push({
      id: manifest.id,
      displayNameKey: `template.${manifest.id}.displayName`,
      descriptionKey: `template.${manifest.id}.description`,
      valueArxmlPaths: valueRel.map((p) => resolve(dirPath, p)),
      bswmdPaths: bswmdRel.map((p) => resolve(bswmdDir, p)),
      fileCount: valueRel.length + bswmdRel.length,
    });
  }

  return templates.sort((a, b) => a.id.localeCompare(b.id));
}

// Re-export for tests that want to assert the classTemplateError shape
// (not strictly used in this module, but the export keeps the surface
// stable for downstream callers in Task 4/6).
export { classTemplateError };
