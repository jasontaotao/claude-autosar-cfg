// @vitest-environment node
//
// Process boundary regression: core/main/shared modules must not import
// renderer-only state. The main bundle runs in Node before a window
// exists, so even a static import chain that reaches renderer storage
// access can crash Electron before the UI loads.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...listSourceFiles(path));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

describe('main-process dependency boundaries', () => {
  it('does not import renderer modules from core/main/shared', () => {
    const offenders: string[] = [];
    for (const root of ['src/core', 'src/main', 'src/shared']) {
      for (const file of listSourceFiles(root)) {
        const source = readFileSync(file, 'utf8');
        if (/from\s+['"][^'"]*\/renderer\/[^'"]+['"]/.test(source)) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
