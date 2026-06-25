// core/generator/templates/loader.ts
//
// Shared Handlebars template loader for ModuleGenerators. v1.13.3
// PATCH-C extracted this from per-module duplicates (D-rev2 R4, C7,
// S12, M4 backlog). EcuC and Mcu each used to carry their own
// `buildEngine` + `loadTemplate` pair; both were byte-identical except
// for the template + partial directory constants. The shared API:
//
//   buildPartialEngine(partialDir) → Handlebars instance with all
//     `*.hbs` partials under `partialDir` registered under both their
//     bare name (e.g. `license`) and the `.hbs`-stripped alias.
//
//   loadModuleTemplate(templateDir, name) → compiled Handlebars template
//     from `templateDir/name` with the partial engine.
//
// Each module still owns its own module-level template cache (3 for
// EcuC: header + source + pbcfg; 2 for Mcu: header + source). The
// cache is the lazy-init pattern that avoids recompiling on every
// `emit()` call while still picking up filesystem changes when a
// process restart happens.
//
// Watch-mode: we rebuild the engine per load (not per compile) so
// partials are picked up after edits in a dev session. Tests that
// mutate the filesystem can call `_resetModuleTemplateCache` to
// force the next `loadModuleTemplate` call to re-read.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type Handlebars from 'handlebars';

import { createEngine } from '../handlebars.js';

/**
 * Build a fresh Handlebars engine with the shared `_partials/*`
 * macros registered. Walks `partialDir` and registers every `*.hbs`
 * file under both its bare name (e.g. `license`) and the
 * `.hbs`-stripped alias (e.g. `license.h`).
 */
export function buildPartialEngine(partialDir: string): typeof Handlebars {
  const engine = createEngine();
  for (const entry of readdirSync(partialDir)) {
    if (!entry.endsWith('.hbs')) continue;
    const partialSrc = readFileSync(join(partialDir, entry), 'utf8');
    // Register under both the bare-name (e.g. `license`) and the
    // filename-without-`.hbs` (e.g. `license.h`) so callers can
    // reference either `{{> license}}` or `{{> license.h}}`. The
    // current EcuC/Mcu templates use the bare-name convention.
    const bare = entry.replace(/\.hbs$/, '');
    engine.registerPartial(bare.replace(/\.h$/, ''), partialSrc);
    engine.registerPartial(bare, partialSrc);
  }
  return engine;
}

// Module-level cache of compiled partial engines keyed by partialDir.
// Reusing a compiled engine across templates in the same module is
// safe because `engine.compile()` is read-only on the partials.
const partialEngineCache = new Map<string, typeof Handlebars>();

/**
 * Return the cached partial engine for `partialDir`, building it on
 * first call. Modules should pass the same `partialDir` they
 * originally used so cache hits dominate.
 */
export function getPartialEngine(partialDir: string): typeof Handlebars {
  let engine = partialEngineCache.get(partialDir);
  if (!engine) {
    engine = buildPartialEngine(partialDir);
    partialEngineCache.set(partialDir, engine);
  }
  return engine;
}

/**
 * Test hook: clear the partial-engine cache. Use this when a test
 * mutates `partialDir` on disk and wants the next `loadModuleTemplate`
 * to pick up the change without restarting the process.
 */
export function _resetPartialEngineCache(): void {
  partialEngineCache.clear();
}

/**
 * Read + compile a Handlebars template from `templateDir/name`. Uses
 * the cached partial engine so partials are registered exactly once
 * per `partialDir` per process. The compile result is NOT cached here
 * — callers that want per-module template caching should wrap this
 * with their own lazy-init pattern (matches the pre-PATCH-C EcuC +
 * Mcu behavior).
 */
export function loadModuleTemplate(
  templateDir: string,
  partialDir: string,
  name: string,
): Handlebars.TemplateDelegate {
  const path = join(templateDir, name);
  const src = readFileSync(path, 'utf8');
  return getPartialEngine(partialDir).compile(src);
}
