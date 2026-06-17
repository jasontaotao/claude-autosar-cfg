// Sprint 13 #1 — `*.arxml` recursive walker.
//
// Returns relative paths (relative to `root`) of every file ending in
// `.arxml` under `root`, skipping hidden entries (`.foo`). If
// `opts.exclude` is set AND matches a directory name (case-sensitive),
// the directory is not descended into.
//
// Why case-sensitive: on Windows `path.sep` and file names are
// case-insensitive, but we want opt-in `template.json` behavior to be
// predictable. `samples/arxml/<id>/bswmd/` is the convention; using
// `Bswmd/` would silently NOT be excluded. (The 100+ legacy reference
// BSWMD under `samples/arxml/<Module>/Bswmd/` are filtered out by the
// opt-in gate on `template.json`, so this never matters for them.)

import { readdirSync, statSync, type Dirent } from 'node:fs';
import { join, relative } from 'node:path';

export interface WalkArxmlOptions {
  /** Directory name to skip descending into. Case-sensitive. */
  readonly exclude?: string;
}

export function walkArxml(root: string, opts: WalkArxmlOptions = {}): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    let entries: Dirent[];
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = join(cur, e.name);
      if (e.isDirectory()) {
        if (opts.exclude !== undefined && e.name === opts.exclude) continue;
        stack.push(full);
      } else if (e.isFile() && e.name.endsWith('.arxml')) {
        out.push(relative(root, full));
      } else if (e.isFile()) {
        // Probe via statSync in case Dirent.isFile() is unreliable on
        // some platforms (CIFS mounts etc). Not strictly needed but
        // cheap insurance.
        try {
          if (!statSync(full).isFile()) continue;
        } catch {
          continue;
        }
      }
    }
  }
  return out.sort();
}
