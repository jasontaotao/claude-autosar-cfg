import Handlebars from 'handlebars';

import { cIdent } from './handlebars-helpers.js';

/**
 * Create a fresh Handlebars instance with generator-specific helpers
 * registered. The renderer uses its own Handlebars instance via the
 * renderer package; we keep a separate one here to avoid coupling.
 */
export function createEngine(): typeof Handlebars {
  const engine = Handlebars.create();
  engine.registerHelper('cIdent', (path: unknown) => cIdent(String(path ?? '')));
  return engine;
}
