// core/arxml/defaultValue.ts
// Sprint post-v1.0.0 — extract buildDefaultValue from core/arxml/mutation.ts
// so both the mutation layer and the skeleton generator can produce
// the same `ParamValue` shape from a BSWMD `ParamDef`.
//
// Sprint X — also exposes `fillParamsFromBswmd`, promoted from
// `core/arxml/skeleton.ts` (private to that file pre-v1.9.0) so the
// mutation layer and skeleton share one default-fill path. The
// skeleton still keeps its local copy in place for now; Phase 2 will
// switch the skeleton to import this module-level export and delete
// the duplicate.
//
// Pure: no I/O, no React, no Zustand, no electron.
// Previously private to mutation.ts (commit `e552ac9`); promoted to a
// shared module so skeleton.ts can call it during skeleton construction
// (commit TBD).

import type { ContainerDef, ParamDef } from '../project/bswmd.js';

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
      if (typeof def === 'number' || typeof def === 'boolean')
        return { type: 'string', value: String(def) };
      return null;
    }
  }
}

/**
 * v1.9.0 Sprint X — translate a BSWMD container's declared parameter
 * defaults into typed `ParamValue` cells, keyed by the param shortName
 * with the BSWMD-side path carried on `definitionRef`.
 *
 * Promoted from `core/arxml/skeleton.ts` (where it was a private
 * helper since v1.7.1 S2) so the mutation layer and the skeleton share
 * a single default-fill implementation. The skeleton still keeps its
 * local copy in place for now; Phase 2 will switch the skeleton to
 * import this module-level export and delete the duplicate.
 *
 * Semantics (preserved from the skeleton helper at
 * `buildTopContainer` lines 132-145 of the pre-X version):
 *
 *   - Non-null defaults are converted via `buildDefaultValue` and
 *     tagged with the BSWMD-side `definitionRef` (Sprint 16 invariant).
 *   - Null defaults on text-shaped params (enumeration / string /
 *     function-name) get an empty-string placeholder so the user gets
 *     an editable cell in the ParamEditor. Other kinds with null
 *     defaults (integer / float / boolean / reference) stay skipped.
 *   - Reference params are NOT filled here; they're handled by a
 *     separate `addReference` flow.
 */
export function fillParamsFromBswmd(c: ContainerDef): Record<string, ParamValue> {
  const params: Record<string, ParamValue> = {};
  for (const p of c.parameters) {
    const v = buildDefaultValue(p);
    if (v !== null) {
      params[p.shortName] = { ...v, definitionRef: p.path };
      continue;
    }
    if (p.kind === 'enumeration') {
      params[p.shortName] = { type: 'enum', value: '', definitionRef: p.path };
    } else if (p.kind === 'string' || p.kind === 'function-name') {
      params[p.shortName] = { type: 'string', value: '', definitionRef: p.path };
    }
    // integer / float / boolean / reference null defaults stay skipped.
  }
  return params;
}
