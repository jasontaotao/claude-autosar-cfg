import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url)); // src/renderer/

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe('P1 单主题 guard（spec §3.4 / §9.1）', () => {
  it('src/renderer 全部 .css 无 .dark 选择器', () => {
    const css = walk(root).filter((f) => f.endsWith('.css') && !f.endsWith('tokens.css'));
    for (const f of css) expect(readFileSync(f, 'utf8'), f).not.toMatch(/\.dark[\s{.,:[>#]/);
  });
  it('src/renderer 全部 .tsx/.ts/.html 无 dark: 变体', () => {
    const src = walk(root).filter((f) => /\.(tsx?|html)$/.test(f));
    for (const f of src) expect(readFileSync(f, 'utf8'), f).not.toMatch(/\bdark:[a-z]/i);
  });
});
