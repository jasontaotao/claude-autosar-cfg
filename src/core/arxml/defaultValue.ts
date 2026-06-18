// core/arxml/defaultValue.ts
// Sprint post-v1.0.0 — extract buildDefaultValue from core/arxml/mutation.ts
// so both the mutation layer and the skeleton generator can produce
// the same `ParamValue` shape from a BSWMD `ParamDef`.
//
// Pure: no I/O, no React, no Zustand, no electron.
// Previously private to mutation.ts (commit `e552ac9`); promoted to a
// shared module so skeleton.ts can call it during skeleton construction
// (commit TBD).

import type { ParamDef } from '../project/bswmd.js';

import type { ParamValue } from './types.js';

/**
 * Coerce a BSWMD `ParamDef.defaultValue` into the typed
 * `ParamValue` shape used by the value-side serializer.
 *
 * Returns `null` when the default cannot be coerced to the right
 * shape (e.g. an enumeration declared without a literal that the
 * default points at); the caller is expected to either skip the
 * parameter (skeleton) or surface `invalid-param-type` (mutation).
 *
 * Type coercion rules:
 *   - `integer`: number required; `Math.trunc` applied; string→Number
 *     fallback if finite.
 *   - `float`: number required; string→Number fallback if finite.
 *   - `boolean`: native boolean only (returns `null` for `0`/`1` numbers
 *     — callers should already normalize to boolean upstream).
 *   - `enumeration`: string only.
 *   - `string` / `function-name`: string required; numbers / booleans
 *     coerced via `String(def)` as a lenient fallback.
 */
export function buildDefaultValue(paramDef: ParamDef): ParamValue | null {
  const def = paramDef.defaultValue;
  switch (paramDef.kind) {
    case 'integer': {
      if (typeof def === 'number') return { type: 'integer', value: Math.trunc(def) };
      if (typeof def === 'string') {
        const n = Number(def);
        if (Number.isFinite(n)) return { type: 'integer', value: Math.trunc(n) };
      }
      return null;
    }
    case 'float': {
      if (typeof def === 'number') return { type: 'float', value: def };
      if (typeof def === 'string') {
        const n = Number(def);
        if (Number.isFinite(n)) return { type: 'float', value: n };
      }
      return null;
    }
    case 'boolean': {
      if (typeof def === 'boolean') return { type: 'boolean', value: def };
      return null;
    }
    case 'enumeration': {
      if (typeof def === 'string') return { type: 'enum', value: def };
      return null;
    }
    case 'string':
    case 'function-name': {
      if (typeof def === 'string') return { type: 'string', value: def };
      if (typeof def === 'number' || typeof def === 'boolean') return { type: 'string', value: String(def) };
      return null;
    }
  }
}
