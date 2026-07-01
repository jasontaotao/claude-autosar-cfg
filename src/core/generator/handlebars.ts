import Handlebars from 'handlebars';

import { emitConstDecl, emitExternDecl, emitLoaderEntry } from './emit/strategy.js';
import {
  cIdent,
  cType,
  cValue,
  paramConfigClass,
  bswmdPathOf,
  partitionName,
  type HasParamConfigClasses,
} from './handlebars-helpers.js';
import type { GenerationVariant } from './registry.js';

/**
 * Create a fresh Handlebars instance with generator-specific helpers
 * registered. The renderer uses its own Handlebars instance via the
 * renderer package; we keep a separate one here to avoid coupling.
 */
export function createEngine(): typeof Handlebars {
  const engine = Handlebars.create();
  engine.registerHelper('cIdent', (path: unknown) => cIdent(String(path ?? '')));
  engine.registerHelper('cType', (def: unknown) => cType(def as never));
  engine.registerHelper('cValue', (value: unknown, def: unknown) => cValue(value, def as never));
  engine.registerHelper('paramConfigClass', (def: unknown, variant: unknown) =>
    paramConfigClass(def as HasParamConfigClasses, variant as GenerationVariant),
  );
  engine.registerHelper('bswmdPathOf', (inst: unknown) =>
    bswmdPathOf(inst as { readonly path: readonly string[] }),
  );
  engine.registerHelper('partitionName', (name: unknown) => partitionName(String(name ?? '')));

  // v1.20.0 T1 B-3 — register the canonical emit helpers so Handlebars
  // templates can call them via `{{externDecl ...}}` / `{{constDecl ...}}`
  // / `{{loaderEntry ...}}`. Templates keep their current shape for now
  // (the v1.21.0 MINOR will reshape `cfg.h.hbs` / `cfg.c.hbs` /
  // `pbcfg.c.hbs` to call these helpers directly). Helper parameters
  // are positional strings for simplicity — the templates can be
  // reshaped later without breaking the helper signatures.
  engine.registerHelper('externDecl', (ident: unknown, cType: unknown) =>
    emitExternDecl({ ident: String(ident ?? ''), cType: String(cType ?? ''), isArray: false }),
  );
  engine.registerHelper('constDecl', (ident: unknown, cType: unknown, init: unknown) =>
    emitConstDecl({
      ident: String(ident ?? ''),
      def: { kind: 'integer' },
      value: 0,
      isArray: false,
      cType: String(cType ?? ''),
      cValue: String(init ?? '0'),
    }),
  );
  engine.registerHelper('loaderEntry', (ident: unknown, cType: unknown) =>
    emitLoaderEntry({ ident: String(ident ?? ''), cType: String(cType ?? ''), isArray: false }),
  );

  return engine;
}
