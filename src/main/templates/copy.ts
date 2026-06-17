// Sprint 13 #1 — copy a built-in template's files into a target dir.
//
// Layout: for each source path `samplesRoot/<templateId>/<relPath>`,
// we copy to `destDir/<templateId>/<relPath>`. The `<templateId>`
// segment is preserved so the project dir contains a self-describing
// subdir (e.g. `MyProj/empty/...`, `MyProj/classic/...`).
//
// Idempotency: we do NOT refuse if `destDir/<templateId>/...` already
// exists; `fs.copyFileSync` overwrites. This is what we want when a
// user re-runs "create from template" into the same dir.
//
// Errors: throw `file-copy-failed` on any fs error (EACCES, ENOENT,
// EISDIR, etc). The IPC handler in Task 6 surfaces this to the
// renderer as a rejected promise.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import type { BuiltinTemplate, CopyResult } from './types.js';
import { classTemplateError } from './errors.js';

export function copyTemplateFilesToDir(
  template: BuiltinTemplate,
  samplesRoot: string,
  destDir: string,
): CopyResult {
  // Skip the existence check if there is nothing to copy: an empty
  // template should be a no-op even if destDir is missing, so the
  // IPC handler can return `{copiedValueArxml:[],copiedBswmd:[]}`
  // without forcing the renderer to mkdir first.
  if (template.valueArxmlPaths.length === 0 && template.bswmdPaths.length === 0) {
    return { copiedValueArxml: [], copiedBswmd: [] };
  }

  if (!existsSync(destDir)) {
    throw classTemplateError('dest-dir-missing', `目标目录不存在: ${destDir}`, { destDir });
  }

  const copyOne = (src: string): string => {
    const rel = relative(samplesRoot, src);
    const dst = join(destDir, rel);
    try {
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
    } catch (e) {
      throw classTemplateError('file-copy-failed', `无法复制 ${rel}: ${String(e)}`, { src, dst });
    }
    return dst;
  };

  return {
    copiedValueArxml: template.valueArxmlPaths.map(copyOne),
    copiedBswmd: template.bswmdPaths.map(copyOne),
  };
}
