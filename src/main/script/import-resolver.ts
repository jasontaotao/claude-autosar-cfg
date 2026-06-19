// Sprint 14 #1 — DAG-based import resolver.
//
// Parses `import { x } from './shortName'` from user JS source, walks
// dependencies recursively, detects cycles, and returns a topologically
// ordered list. The wrapper form (IIFE per module) is built separately
// by vm-runner, not here.

import type { ScriptEntry } from './types.js';
import { classScriptError } from './errors.js';

/** Strip line comments and block comments before regex matching. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Parse all `import { ... } from './specifier'` lines.
 *
 * Returns an array of `{ from, names }` in source order. The
 * implementation only supports the named-import form spec § 4.5; default
 * / namespace / dynamic / side-effect-only / bare-specifier forms all
 * throw `unsupported-import`.
 */
export function parseImports(source: string): Array<{ from: string; names: string[] }> {
  const cleaned = stripComments(source);
  const re = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  const out: Array<{ from: string; names: string[] }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const namesPart = m[1]!.trim();
    const spec = m[2]!;
    if (!spec.startsWith('./') && !spec.startsWith('../')) {
      throw classScriptError(
        'unsupported-import',
        `import: bare module specifier "${spec}" not supported (only './<shortName>' is allowed)`,
        { spec },
      );
    }
    const from = spec.replace(/^\.\//, '').replace(/\.\.\//g, '');
    const names = namesPart
      .split(',')
      .map((s) =>
        s
          .trim()
          .split(/\s+as\s+/)[0]!
          .trim(),
      )
      .filter((s) => s.length > 0);
    if (names.length === 0) {
      throw classScriptError('unsupported-import', 'import: empty named-import list');
    }
    out.push({ from, names });
  }
  // Catch unsupported forms early.
  if (/import\s+\w+\s+from\s+['"]/.test(cleaned)) {
    throw classScriptError(
      'unsupported-import',
      'import: default imports (import x from) are not supported; use `import { x } from`',
    );
  }
  if (/import\s*\*/.test(cleaned)) {
    throw classScriptError('unsupported-import', 'import: namespace imports not supported');
  }
  if (/import\s*\(\s*['"]/.test(cleaned)) {
    throw classScriptError('unsupported-import', 'import: dynamic import() not supported');
  }
  return out;
}

const DEPTH_LIMIT = 8;

/**
 * Return a topologically ordered list of script entries that must run
 * before `entry`. Throws on missing modules, missing exports, cycles,
 * or excessive depth.
 *
 * The returned array is ordered dependency-first: callers (vm-runner)
 * can iterate it in order, executing each script after its dependencies.
 */
export function resolveImports(entry: ScriptEntry, all: ReadonlyArray<ScriptEntry>): ScriptEntry[] {
  const byShortName = new Map<string, ScriptEntry>();
  for (const e of all) byShortName.set(e.shortName, e);

  const visited = new Set<string>();
  const out: ScriptEntry[] = [];
  const stack: string[] = [];

  function visit(e: ScriptEntry, depth: number): void {
    if (stack.includes(e.shortName)) {
      const cycle = [...stack.slice(stack.indexOf(e.shortName)), e.shortName].join(' -> ');
      throw classScriptError('circular-import', `import: circular dependency: ${cycle}`);
    }
    if (depth > DEPTH_LIMIT) {
      throw classScriptError('depth-limit', `import: depth limit (${DEPTH_LIMIT}) exceeded`);
    }
    if (visited.has(e.shortName)) return;
    stack.push(e.shortName);
    const declared = e.imports;
    const found = parseImports(e.source);
    // Verify declared matches found; use found as the dependency set.
    for (const dep of found) {
      const target = byShortName.get(dep.from);
      if (!target) {
        throw classScriptError(
          'unknown-module',
          `import: module './${dep.from}' not found in manifest`,
          { from: dep.from },
        );
      }
      // Check exports by scanning target.source for matching const/let/function/var.
      for (const name of dep.names) {
        if (!hasExport(target.source, name)) {
          throw classScriptError(
            'unknown-export',
            `import: name '${name}' not exported by './${dep.from}'`,
            { from: dep.from, name },
          );
        }
      }
      visit(target, depth + 1);
    }
    // Sanity: declared imports should match found imports (or throw).
    if (declared.length !== found.length) {
      throw classScriptError(
        'invalid-source',
        `import: declared imports (${declared.length}) do not match source (${found.length})`,
        { shortName: e.shortName },
      );
    }
    visited.add(e.shortName);
    stack.pop();
    out.push(e);
  }

  visit(entry, 0);
  return out;
}

/**
 * Heuristic: true if `name` is exported by `source` (top-level
 * const/let/var/function declaration, optionally prefixed with
 * `export`, or listed in a top-level `{ name, ... }` block).
 *
 * Not a real ESM analyser — that's deliberately out of V0.1 scope
 * (spec § 4.5 says no TS compiler). This catches the common shape
 * mistakes that would otherwise silently produce "undefined" at
 * run time.
 *
 * Note: `import` lines are stripped first so that `import { x } from './a'`
 * does NOT match a query for `x` (otherwise the heuristic would
 * falsely claim `x` is exported by any module that merely re-imports it).
 */
export function hasExport(source: string, name: string): boolean {
  const cleaned = stripComments(source).replace(
    /import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"]\s*;?/g,
    '',
  );
  const re = new RegExp(
    `^(?:export\\s+)?(?:const|let|var|function)\\s+${name}\\b|^(?:export\\s+)?\\{[^}]*\\b${name}\\b`,
    'm',
  );
  return re.test(cleaned);
}

/** Exposed for testing. Returns all detected cycles (each as array of shortNames). */
export function detectCycles(graph: Map<string, Set<string>>): string[][] {
  const cycles: string[][] = [];
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  for (const k of graph.keys()) color.set(k, WHITE);
  const path: string[] = [];

  function dfs(node: string): void {
    color.set(node, GRAY);
    path.push(node);
    for (const next of graph.get(node) ?? []) {
      const c = color.get(next);
      if (c === GRAY) {
        const startIdx = path.indexOf(next);
        cycles.push([...path.slice(startIdx), next]);
      } else if (c === WHITE) {
        dfs(next);
      }
    }
    color.set(node, BLACK);
    path.pop();
  }

  for (const node of graph.keys()) {
    if (color.get(node) === WHITE) dfs(node);
  }
  return cycles;
}
