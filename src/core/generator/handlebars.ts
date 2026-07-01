import Handlebars, { type SafeString } from 'handlebars';

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

  // v1.20.0 MINOR T2 B-3 second half — Handlebars templates call
  // these helpers directly via `{{externDecl entry}}` / `{{constDecl entry}}`
  // / `{{loaderEntry entry}}`. The helpers accept an object input
  // mirroring the canonical input shape from `emit/strategy.ts`
  // (ExternDeclInput / ConstDeclInput / LoaderEntryInput) so the
  // generator can pass structured data (not pre-stringified) and the
  // template owns the rendering contract. Helper output is marked
  // `SafeString` so templates can use the standard `{{...}}` (escaped)
  // form without HTML-escaping the C code (Handlebars 4.x escapes
  // `{{...}}` by default; `{{{...}}}` would skip the escape but is
  // easy to misread as "this is unsafe" — `SafeString` keeps the
  // contract explicit and self-documenting).
  const safe = (s: string): SafeString => new Handlebars.SafeString(s);
  engine.registerHelper('externDecl', (entry: unknown): SafeString => {
    const e = entry as {
      readonly ident: string;
      readonly cType: string;
      readonly isArray?: boolean;
      readonly arrayLen?: number;
    };
    return safe(
      emitExternDecl({
        ident: e.ident,
        cType: e.cType,
        isArray: e.isArray ?? false,
        ...(e.arrayLen !== undefined ? { arrayLen: e.arrayLen } : {}),
      }),
    );
  });
  engine.registerHelper('constDecl', (entry: unknown): SafeString => {
    const e = entry as {
      readonly ident: string;
      readonly cType: string;
      readonly cValue: string;
      readonly isArray?: boolean;
      readonly value?: unknown;
      readonly def: unknown;
    };
    return safe(
      emitConstDecl({
        ident: e.ident,
        cType: e.cType,
        cValue: e.cValue,
        isArray: e.isArray ?? false,
        value: e.value ?? 0,
        def: e.def,
      }),
    );
  });
  engine.registerHelper('loaderEntry', (entry: unknown): SafeString => {
    const e = entry as {
      readonly ident: string;
      readonly cType: string;
      readonly isArray?: boolean;
      readonly value?: unknown;
      readonly arrayLen?: number;
      readonly offset?: number;
    };
    return safe(
      emitLoaderEntry({
        ident: e.ident,
        cType: e.cType,
        isArray: e.isArray ?? false,
        ...(e.value !== undefined ? { value: e.value } : {}),
        ...(e.arrayLen !== undefined ? { arrayLen: e.arrayLen } : {}),
        ...(e.offset !== undefined ? { offset: e.offset } : {}),
      }),
    );
  });

  return engine;
}
