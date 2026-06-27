// bin/ts-loader.mjs — tiny ESM loader that rewrites `.js` import specifiers
// to `.ts` so Node's `--experimental-strip-types` can resolve the
// TypeScript sources.
//
// Workaround for a Node 22/24 + Windows quirk: the default `load` hook
// rejects Windows-style paths (e.g. `d:\...`) when they leak through.
// We normalize them to `file://` URLs at the resolve boundary.

import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve as pathResolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

function toFileURL(urlOrPath) {
  if (typeof urlOrPath !== 'string') return urlOrPath;
  if (urlOrPath.startsWith('file://')) return urlOrPath;
  if (isAbsolute(urlOrPath)) return pathToFileURL(urlOrPath).href;
  return urlOrPath;
}

export async function resolve(specifier, context, nextResolve) {
  // Rewrite relative `.js` imports → `.ts` siblings when they exist.
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && specifier.endsWith('.js')) {
    const tsSpec = specifier.slice(0, -3) + '.ts';
    let parentPath;
    if (context.parentURL && context.parentURL.startsWith('file://')) {
      parentPath = fileURLToPath(context.parentURL);
    } else if (context.parentURL) {
      parentPath = context.parentURL;
    } else {
      parentPath = process.cwd();
    }
    const candidate = pathResolve(dirname(parentPath), tsSpec);
    if (existsSync(candidate)) {
      return nextResolve(toFileURL(candidate), context);
    }
  }
  // Normalize any path-like specifier to file:// URL.
  return nextResolve(toFileURL(specifier), context);
}

export async function load(url, context, nextLoad) {
  return nextLoad(toFileURL(url), context);
}
