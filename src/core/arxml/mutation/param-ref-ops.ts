// core/arxml/mutation/param-ref-ops.ts
// Parameter / reference add/remove + value update. Split from
// `src/core/arxml/mutation.ts` as part of v1.41.x PATCH T2 (file-size
// backlog).
//
// Public API: addParameter, addReference, removeParameter, applyParamUpdate.
// Internal helpers: makeReferenceParamValue, containerPathToSubPath,
// paramValueEquals, withDefinitionRefPreserved, omitKey, zeroValueForKind.

import { buildDefaultValue } from '../../arxml/defaultValue.js';
import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlModule,
  ParamValue,
  Result,
} from '../../arxml/types.js';
import { getContainerDefByPath } from '../../project/bswmd.js';
import type { BswModuleDef, ParamDef, ReferenceDef } from '../../project/bswmd.js';

import { locateParent, replaceElement, zeroValueForKind } from './tree-ops.js';
import type { MutationError } from './types.js';

/**
 * Add a new parameter to the container at `containerPath`. The default
 * value is taken from `paramDef.defaultValue` (already typed per
 * `ParamDef['kind']`); the function maps the BSWMD `kind` to the
 * `ParamValue['type']` tag used by the value-side serializer.
 */
export function addParameter(
  doc: ArxmlDocument,
  containerPath: string,
  paramDef: ParamDef,
  moduleDef: BswModuleDef,
): Result<ArxmlDocument, MutationError> {
  const located = locateParent(doc, containerPath);
  if (located === null) {
    return { ok: false, error: { kind: 'path-not-found', path: containerPath } };
  }
  const { parent, pkg } = located;
  if (parent.kind !== 'container' && parent.kind !== 'module') {
    return { ok: false, error: { kind: 'path-not-found', path: containerPath } };
  }
  // Cross-reference `paramDef` against the BSWMD container's declared
  // parameters. The picker guarantees this match in the happy path; the
  // check here is a defence-in-depth so a stale `paramDef` (e.g. cached
  // from before a BSWMD reload) cannot inject an undeclared key.
  //
  // v1.37.0 MINOR T3 (H2) — module-level validation. The pre-v1.37.0
  // code skipped the BSWMD check when `subPath === ''` with the
  // justification "modules rarely carry parameters". That justification
  // was wrong: AUTOSAR modules DO declare top-level parameters
  // (e.g. `EcuC` has `<ModuleId>`, `<VendorId>`). The new `else`
  // branch validates against the module's own `moduleDef.parameters`
  // array (defaults to `[]` when the BSWMD omits module-level
  // parameters, so back-compat with pre-v1.37.0 BSWMDs is preserved).
  const subPath = containerPathToSubPath(containerPath, moduleDef);
  if (subPath === null) {
    return { ok: false, error: { kind: 'path-not-found', path: containerPath } };
  }
  if (subPath !== '') {
    // Sub-container: validate against the parent container def
    const parentContainerDef = getContainerDefByPath(moduleDef, subPath);
    if (
      parentContainerDef === null ||
      !parentContainerDef.parameters.some((p) => p.shortName === paramDef.shortName)
    ) {
      return {
        ok: false,
        error: { kind: 'invalid-param-type', key: paramDef.shortName, expected: paramDef.kind },
      };
    }
  } else {
    // Module-level: validate against the module's own declared
    // parameters. "Modules rarely carry parameters" is no longer an
    // excuse to skip validation — AUTOSAR modules like EcuC do
    // declare top-level parameters (ModuleId, VendorId).
    //
    // v1.37.1 PATCH T3 — un-bound gate (parser now populates).
    // v1.37.1 PATCH T1 made `buildEcucModule` populate
    // `moduleDef.parameters` from `<PARAMETERS>` for every BSWMD.
    // The `?? []` fallback is kept for two reasons: (a) the
    // `BswModuleDef.parameters` TYPE is still optional
    // (`readonly parameters?: readonly ParamDef[]`); callers that
    // build their own `BswModuleDef` literal (e.g. the round-trip
    // test fixtures at `round-trip-mutation.test.ts`) may pass
    // `undefined`; (b) defence in depth at zero runtime cost.
    // The `length > 0` guard is retained because it encodes the
    // correct semantics: an empty declared set has no validation
    // surface, so the check is a no-op. When the BSWMD DOES
    // declare module-level params and the caller hands in a stale
    // `paramDef`, the check fires.
    const moduleParams = moduleDef.parameters ?? [];
    if (moduleParams.length > 0 && !moduleParams.some((p) => p.shortName === paramDef.shortName)) {
      return {
        ok: false,
        error: { kind: 'invalid-param-type', key: paramDef.shortName, expected: paramDef.kind },
      };
    }
  }
  if (Object.prototype.hasOwnProperty.call(parent.params, paramDef.shortName)) {
    return { ok: false, error: { kind: 'name-conflict', shortName: paramDef.shortName } };
  }
  // Sprint 18 hotfix — fall back to a typed zero-value when the BSWMD
  // omits `<DEFAULT-VALUE>`. Many vendor CDDs (the user-reported
  // JWQ3399_bswmd.arxml is one) declare optional params without a
  // default; `buildDefaultValue` returns `null` for those (its
  // documented behaviour), which the previous `addParameter` mapped
  // to `invalid-param-type`. From the renderer's POV the type is
  // valid — the user just hasn't filled it in yet — so we
  // synthesise a placeholder and rely on the existing param-editor
  // UI to surface the empty state (e.g. EnumEditor falls back to a
  // free-form text input when its literals lookup misses, IntegerEditor
  // accepts the initial `0`). The placeholder is overwritten on the
  // first `applyParamUpdate` once the user picks a value.
  const value = buildDefaultValue(paramDef) ?? zeroValueForKind(paramDef.kind);
  if (value === null) {
    return {
      ok: false,
      error: { kind: 'invalid-param-type', key: paramDef.shortName, expected: paramDef.kind },
    };
  }
  // Sprint 16c #2 — stamp the BSWMD-side path as `definitionRef` so the
  // serializer (commit `b767ea6`) writes the real DEFINITION-REF instead
  // of falling back to `/__synthesized__/<shortName>`. Mirrors the
  // pattern in `skeleton.ts:141` (`{ ...v, definitionRef: p.path }`).
  // Empty `paramDef.path` falls through to the existing synthesized-path
  // fallback (degenerate BSWMD — don't emit an empty DEFINITION-REF).
  const nextValue: ParamValue =
    paramDef.path !== '' ? ({ ...value, definitionRef: paramDef.path } as ParamValue) : value;
  const nextParams: Readonly<Record<string, ParamValue>> = {
    ...parent.params,
    [paramDef.shortName]: nextValue,
  };
  const nextParent: ArxmlModule | ArxmlContainer =
    parent.kind === 'module'
      ? { ...parent, params: nextParams }
      : { ...parent, params: nextParams };
  const next = replaceElement(doc, pkg, parent, nextParent);
  return { ok: true, value: next };
}

/**
 * Construct a `ParamValue` of `type: 'reference'`. Single source of
 * truth for the reference-param shape — called by `addContainer`
 * (auto-seed at container-creation time, so follow-up `set-param`
 * on a reference like `didRef` can resolve the key) and by
 * `addReference`'s fresh-write branch (explicit-pick path).
 *
 * The `dest` field is ALWAYS emitted (matches `addReference`'s
 * canonical shape). The `definitionRef` is emitted only when
 * non-empty — pre-v1.27.2 PATCH `addContainer` did NOT emit `dest`
 * which broke `addReference`'s idempotent-overwrite detection
 * (the auto-seeded placeholder would lack `dest` and look
 * semantically distinct from a freshly-built reference); this
 * helper guarantees the two construction sites stay in lockstep.
 *
 * NOTE: `addReference`'s idempotent-overwrite branch
 * (mutation.ts:690-697) intentionally does NOT use this helper —
 * it preserves the existing entry's `definitionRef` when the
 * incoming `refDef.path === ''` (defensive against malformed
 * BSWMD input), which is the inverse of this helper's behavior.
 */
export function makeReferenceParamValue(opts: {
  readonly value: string;
  readonly dest: ReferenceDef['destKind'];
  readonly definitionRef: string;
}): ParamValue {
  const base: ParamValue = { type: 'reference', value: opts.value, dest: opts.dest };
  return opts.definitionRef !== '' ? { ...base, definitionRef: opts.definitionRef } : base;
}

/**
 * Strip the module-prefix from a value-side container path so the remainder
 * is a relative sub-path accepted by `getContainerDefByPath`. We locate the
 * module's `shortName` (last occurrence) inside the value-side path rather
 * than the BSWMD's internal `path` because the value-side carries an
 * additional package prefix (e.g. `/EAS/Can/CanConfigSet` while the BSWMD
 * path is `/Can/CanConfigSet`). Returns `null` when the module segment is
 * not present.
 */
export function containerPathToSubPath(
  containerPath: string,
  moduleDef: BswModuleDef,
): string | null {
  const segments = containerPath.split('/').filter(Boolean);
  // The module's shortName typically appears once in the path; we use
  // lastIndexOf so a degenerate case (container whose shortName shadows
  // the module's) still finds the right boundary.
  const moduleIdx = segments.lastIndexOf(moduleDef.shortName);
  if (moduleIdx === -1) return null;
  return segments.slice(moduleIdx + 1).join('/');
}

/**
 * Add a new reference-typed parameter to the container at `containerPath`.
 * Mirrors `addParameter` but looks up the `ReferenceDef` in the parent
 * container's `references[]` (not `parameters[]`) and constructs a
 * `ParamValue` with `{ type: 'reference', value: '', dest }`. The
 * reference value is left empty (placeholder) — the user fills it in
 * via `ReferenceEditor` after the pick.
 */
export function addReference(
  doc: ArxmlDocument,
  containerPath: string,
  refDef: ReferenceDef,
  moduleDef: BswModuleDef,
  // v1.37.0 MINOR T2 (H1) — optional user-supplied target path. The
  // idempotent overwrite branch (when the param was auto-seeded empty
  // by addContainer) writes this into the stored ParamValue's `value`
  // field (previously hard-coded to '' despite the comment claiming
  // it carried the user path — see H1 review finding). Defaults to
  // '' for backward compat with callers that don't pass the option.
  options?: { value?: string },
): Result<ArxmlDocument, MutationError> {
  const located = locateParent(doc, containerPath);
  if (located === null) {
    return { ok: false, error: { kind: 'path-not-found', path: containerPath } };
  }
  const { parent, pkg } = located;
  if (parent.kind !== 'container' && parent.kind !== 'module') {
    return { ok: false, error: { kind: 'path-not-found', path: containerPath } };
  }
  // Cross-reference the `refDef` against the BSWMD container's
  // declared references (the picker is the happy-path source; this is
  // defence-in-depth against a stale refDef).
  //
  // v1.37.0 MINOR T3 (H2) — module-level validation. Mirrors the
  // `addParameter` H2 fix: the pre-v1.37.0 code skipped the BSWMD
  // check when `subPath === ''`. Real AUTOSAR modules DO declare
  // top-level references (e.g. `PduR` has `<PduRBswImplication>`),
  // so the new `else` branch validates against the module's own
  // `moduleDef.references` array (defaults to `[]` when the BSWMD
  // omits module-level references — back-compat preserved).
  const subPath = containerPathToSubPath(containerPath, moduleDef);
  if (subPath === null) {
    return { ok: false, error: { kind: 'path-not-found', path: containerPath } };
  }
  if (subPath !== '') {
    const parentContainerDef = getContainerDefByPath(moduleDef, subPath);
    if (
      parentContainerDef === null ||
      !parentContainerDef.references.some((r) => r.shortName === refDef.shortName)
    ) {
      return {
        ok: false,
        error: { kind: 'invalid-param-type', key: refDef.shortName, expected: 'string' },
      };
    }
  } else {
    // Module-level reference validation. AUTOSAR modules like PduR
    // declare top-level references; the skip was a defence-in-depth
    // breach.
    //
    // v1.37.1 PATCH T3 — un-bound gate (parser now populates;
    // mirrors the addParameter fix). v1.37.1 PATCH T2 made
    // `buildEcucModule` populate `moduleDef.references` from
    // `<REFERENCES>` for every BSWMD. The `?? []` fallback is kept
    // for the same reasons as in `addParameter`: the
    // `BswModuleDef.references` TYPE is still optional, and
    // round-trip test fixtures may pass `undefined`. The
    // `length > 0` guard encodes the correct semantics: an empty
    // declared set has no validation surface, so the check is a
    // no-op. When the BSWMD DOES declare module-level refs and the
    // caller hands in a stale `refDef`, the check fires.
    const moduleRefs = moduleDef.references ?? [];
    if (moduleRefs.length > 0 && !moduleRefs.some((r) => r.shortName === refDef.shortName)) {
      return {
        ok: false,
        error: { kind: 'invalid-param-type', key: refDef.shortName, expected: 'string' },
      };
    }
  }
  if (Object.prototype.hasOwnProperty.call(parent.params, refDef.shortName)) {
    // v1.27.2 PATCH (code-review MEDIUM fix) — `addContainer` auto-seeds
    // empty reference params for every reference declared on the
    // BSWMD-side child container (so follow-up `set-param` on a
    // reference like `didRef` resolves `target.params[ref.shortName]`).
    // A user who then opens the reference picker and explicitly calls
    // `addReference` on the same shortName would hit `name-conflict`.
    // Detect that case (existing entry is the empty-seeded placeholder
    // for the same `destKind`) and treat it as an idempotent overwrite
    // rather than a conflict.
    const existing: ParamValue | undefined = parent.params[refDef.shortName];
    if (
      existing !== undefined &&
      existing.type === 'reference' &&
      existing.value === '' &&
      existing.dest === refDef.destKind
    ) {
      // Idempotent: the existing entry is the auto-seeded placeholder
      // for this exact reference (same `destKind`). Replace its value
      // with the user-supplied target path (via `options.value`,
      // defaulting to '' for backward compat) and its definitionRef
      // with the picked path, then splice back into the doc.
      const userValue = options?.value ?? '';
      const nextValue: ParamValue =
        refDef.path !== ''
          ? ({ ...existing, value: userValue, definitionRef: refDef.path } as ParamValue)
          : existing;
      const nextParams: Readonly<Record<string, ParamValue>> = {
        ...parent.params,
        [refDef.shortName]: nextValue,
      };
      const nextParent: ArxmlModule | ArxmlContainer =
        parent.kind === 'module'
          ? { ...parent, params: nextParams }
          : { ...parent, params: nextParams };
      return { ok: true, value: replaceElement(doc, pkg, parent, nextParent) };
    }
    return { ok: false, error: { kind: 'name-conflict', shortName: refDef.shortName } };
  }
  const userValue = options?.value ?? '';
  const nextValue: ParamValue = makeReferenceParamValue({
    value: userValue,
    dest: refDef.destKind,
    definitionRef: refDef.path,
  });
  const nextParams: Readonly<Record<string, ParamValue>> = {
    ...parent.params,
    [refDef.shortName]: nextValue,
  };
  const nextParent: ArxmlModule | ArxmlContainer =
    parent.kind === 'module'
      ? { ...parent, params: nextParams }
      : { ...parent, params: nextParams };
  const next = replaceElement(doc, pkg, parent, nextParent);
  return { ok: true, value: next };
}

/**
 * Remove a single parameter by key. Returns the same `ArxmlDocument`
 * reference when the key is not present (no-op).
 */
export function removeParameter(
  doc: ArxmlDocument,
  containerPath: string,
  paramKey: string,
): Result<ArxmlDocument, MutationError> {
  const located = locateParent(doc, containerPath);
  if (located === null) {
    return { ok: false, error: { kind: 'path-not-found', path: containerPath } };
  }
  const { parent, pkg } = located;
  if (!Object.prototype.hasOwnProperty.call(parent.params, paramKey)) {
    // No-op — the key is already gone. Preserve reference equality.
    return { ok: true, value: doc };
  }
  const nextParams: Readonly<Record<string, ParamValue>> = omitKey(parent.params, paramKey);
  const nextParent: ArxmlModule | ArxmlContainer =
    parent.kind === 'module'
      ? { ...parent, params: nextParams }
      : { ...parent, params: nextParams };
  const next = replaceElement(doc, pkg, parent, nextParent);
  return { ok: true, value: next };
}

/**
 * Sprint 18 hotfix — apply a single param edit inside the container
 * at `containerPath`. Returns the input `doc` reference verbatim
 * when the path does not resolve (reference equality preserved so
 * downstream selectors can skip work) or when the new value equals
 * the existing one (no-op).
 *
 * Mirrors `removeParameter`'s location/rewrite pattern. The renderer
 * calls it from `updateParam` whenever the user toggles a boolean,
 * types into an integer/float/string input, or picks an enum literal
 * from the dropdown. The path shape is the post-fold `containerPath`
 * the Tree emits (see `foldVendorPackages` in `combinedDoc.ts`).
 *
 * **Post-fold wrapper handling.** A post-fold package named
 * `JWQ3399` directly contains the ECUC module also named `JWQ3399`
 * (the vendor wrappers `JWQ_CDD_PACK > JWQ_Packet` collapse into it
 * — see `walkFrom` in `path.ts` for the descent rule). The previous
 * implementation walked `pkg.elements` by shortName and missed the
 * wrapper, silently no-op'ing every edit for vendor-CDD projects.
 * This rewrite delegates the location step to `locateParent` (which
 * uses `findByPath` and inherits the wrapper fallback) and writes
 * the new value via `replaceElement` (which already handles
 * non-top-level packages via `replaceAnywhere`).
 *
 * **definitionRef preservation.** When the incoming `value` does
 * not carry a `definitionRef` but the existing param has one, we
 * merge so the ARXML serializer keeps writing the real BSWMD-side
 * path instead of regressing to `/__synthesized__/<shortName>`.
 */
export function applyParamUpdate(
  doc: ArxmlDocument,
  containerPath: string,
  paramKey: string,
  value: ParamValue,
): ArxmlDocument {
  const located = locateParent(doc, containerPath);
  if (located === null) return doc;
  const { parent, pkg } = located;
  const current = parent.params[paramKey];
  if (current !== undefined && paramValueEquals(current, value)) return doc;
  const incoming = withDefinitionRefPreserved(value, current);
  const nextParent: ArxmlModule | ArxmlContainer =
    parent.kind === 'module'
      ? { ...parent, params: { ...parent.params, [paramKey]: incoming } }
      : { ...parent, params: { ...parent.params, [paramKey]: incoming } };
  return replaceElement(doc, pkg, parent, nextParent);
}

export function paramValueEquals(a: ParamValue, b: ParamValue): boolean {
  if (a.type !== b.type) return false;
  return a.value === b.value;
}

export function withDefinitionRefPreserved(
  incoming: ParamValue,
  current: ParamValue | undefined,
): ParamValue {
  if (current === undefined) return incoming;
  if (incoming.definitionRef !== undefined) return incoming;
  if (current.definitionRef === undefined) return incoming;
  if (current.type !== incoming.type) return incoming;
  return { ...incoming, definitionRef: current.definitionRef } as ParamValue;
}

/**
 * Build a new record with the given key omitted. Spread-destructure keeps
 * the type narrowed and produces a new object only when the key is
 * actually present.
 */
export function omitKey<V>(
  record: Readonly<Record<string, V>>,
  key: string,
): Readonly<Record<string, V>> {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return record;
  const out: Record<string, V> = {};
  for (const [k, v] of Object.entries(record)) {
    if (k === key) continue;
    out[k] = v;
  }
  return out;
}
