import Handlebars from 'handlebars';

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
  engine.registerHelper('cValue', (value: unknown, def: unknown) =>
    cValue(value, def as never),
  );
  engine.registerHelper('paramConfigClass', (def: unknown, variant: unknown) =>
    paramConfigClass(
      def as HasParamConfigClasses,
      variant as GenerationVariant,
    ),
  );
  engine.registerHelper('bswmdPathOf', (inst: unknown) =>
    bswmdPathOf(inst as { readonly path: readonly string[] }),
  );
  engine.registerHelper('partitionName', (name: unknown) =>
    partitionName(String(name ?? '')),
  );
  return engine;
}
