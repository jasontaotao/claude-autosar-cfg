// core/mutation/applyPatchSteps.ts
//
// Renderer-agnostic patch step applier (v1.6.1 follow-up to A+C-3).
//
// Takes an `ArxmlDocument` + a list of `PatchStep`s (the wire
// shape from `shared/headless/ipc-contract.ts`) and returns the
// resulting document + per-step error list. No I/O, no Electron,
// no Node fs — the CLI handler is responsible for reading the
// source ARXML, writing the result, and surfacing errors via the
// `HeadlessFailure` envelope.
//
// Mutation semantics: the `add-child` and `remove-with-cascade`
// ops delegate to `coreAddContainer` / `coreRemoveWithCascade`,
// which are immutable and return new doc refs. The `set-param`
// op delegates to the legacy `setParamInDocument` helper, which
// mutates the doc in place (Sprint 14-era API; pre/post value
// snapshots detect "did anything change?" for the `applied`
// counter). The `add` / `remove` / `replace` RFC 6902 subset ops
// route through the same backends. Callers that rely on doc
// reference equality to detect mutation MUST use `applied` or
// re-walk the doc tree instead.
//
// This module is intentionally separate from `core/arxml/mutation.ts`:
//   - `core/arxml/mutation.ts` works on container paths and is the
//     single-doc engine the renderer store wraps.
//   - `core/mutation/applyPatchSteps.ts` is the wire-adapter layer
//     that maps RFC 6902 + AUTOSAR extension ops to the engine +
//     the legacy `core/project/setters.ts` set-param helper. It is
//     the single entry point the CLI (and any future GUI bridge)
//     import for the patch step pipeline.
//
// Step kinds (per A+C spec §8):
//   - `add` / `remove` / `replace` — RFC 6902 subset. The path is the
//     slash-separated AUTOSAR path; semantics: `replace` updates a
//     single param value at `<containerPath>/<paramName>`; `remove`
//     removes a sub-container at the given path; `add` is accepted
//     but delegates to the same sub-container-add engine as
//     `add-child` (the patch wire does not distinguish).
//   - `set-param` — single param value update; mirrors
//     `useArxmlStore.updateParam`'s type-coercion logic (the
//     renderer's `scriptParamValueToCore`).
//   - `add-child` — sub-container add; uses the existing
//     `coreAddContainer` (requires `moduleDef` to enforce BSWMD
//     multiplicity; falls back to a friendly `no-bswmd-for-module`
//     error when the BSWMD is not provided).
//   - `remove-with-cascade` — sub-container remove + inbound-ref
//     sweep via `coreRemoveWithCascade`.
//
// Per-step errors are aggregated (not thrown); the function returns
// `errors[]` alongside the (possibly unchanged) final `doc`. The
// caller decides whether to roll back / write / fail the dispatch.

import type { PatchStep } from '../../shared/headless/ipc-contract.js';
import {
  addContainer as coreAddContainer,
  removeWithCascade as coreRemoveWithCascade,
} from '../arxml/mutation.js';
import type { ArxmlDocument, ParamValue } from '../arxml/types.js';
import type { BswModuleDef, ContainerDef } from '../project/bswmd.js';
import { findContainerByPath, setParamInDocument } from '../project/setters.js';

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/** Optional context the engine uses to enforce BSWMD-derived rules. */
export interface ApplyContext {
  /**
   * BSWMD schema for the target module. Required for `add-child`
   * (so the multiplicity + child def lookup has schema data to
   * consult). Omit only for legacy `add` / `remove` / `replace`
   * paths that don't need schema validation.
   */
  readonly moduleDef?: BswModuleDef;
}

/** Per-step error envelope. Mirrors the wire `MutationStepError`. */
export interface StepError {
  readonly stepIndex: number;
  readonly kind: string;
  readonly message: string;
}

/** Result of applying a (possibly empty) list of steps. */
export interface ApplyResult {
  readonly doc: ArxmlDocument;
  readonly applied: number;
  readonly errors: ReadonlyArray<StepError>;
}

/**
 * Apply each step in `steps` to `doc` in order. Returns the final
 * document (same ref when no step actually mutates), the number of
 * steps that landed, and a list of per-step errors.
 *
 * Errors are aggregated — a failing step does NOT abort the loop.
 * The caller (CLI handler) maps the `errors[]` array to the
 * `HeadlessFailure` envelope + exit code.
 */
export function applyPatchSteps(
  doc: ArxmlDocument,
  steps: ReadonlyArray<PatchStep>,
  ctx: ApplyContext = {},
): ApplyResult {
  const errors: StepError[] = [];
  let current: ArxmlDocument = doc;
  let applied = 0;

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (step === undefined) continue;
    const result = applyOneStep(current, step, i, ctx);
    current = result.doc;
    if (result.error !== null) {
      errors.push(result.error);
    } else if (result.noChange !== true) {
      applied += 1;
    }
  }

  return { doc: current, applied, errors };
}

// ---------------------------------------------------------------------------
// Per-step dispatch
// ---------------------------------------------------------------------------

interface OneStepResult {
  readonly doc: ArxmlDocument;
  readonly error: StepError | null;
  /**
   * True when the step ran without error but the doc was NOT actually
   * mutated (e.g. a no-op `set-param` with the same value as the
   * existing param). The dispatcher uses this to keep the
   * `applied` counter honest — a step that no-ops should not
   * count toward `stepsApplied`.
   */
  readonly noChange?: boolean;
}

function applyOneStep(
  doc: ArxmlDocument,
  step: PatchStep,
  index: number,
  ctx: ApplyContext,
): OneStepResult {
  switch (step.op) {
    case 'set-param':
      return applySetParam(doc, step, index);
    case 'add-child':
      return applyAddChild(doc, step, index, ctx);
    case 'remove-with-cascade':
      return applyRemoveWithCascade(doc, step, index);
    case 'add':
    case 'remove':
    case 'replace':
      return applyJsonPatchStep(doc, step, index, ctx);
  }
}

function applySetParam(
  doc: ArxmlDocument,
  step: {
    readonly op: 'set-param';
    readonly containerPath: string;
    readonly paramName: string;
    readonly value: string | number | boolean | null;
  },
  index: number,
): OneStepResult {
  // Resolve the target container first so we can return a precise
  // `path-not-found` (or `param-not-found`) without a try/catch.
  const target = findContainerByPath(doc, step.containerPath);
  if (target === null) {
    return {
      doc,
      error: {
        stepIndex: index,
        kind: 'path-not-found',
        message: `container not found: ${step.containerPath}`,
      },
    };
  }
  const existing = target.params[step.paramName];
  if (existing === undefined) {
    return {
      doc,
      error: {
        stepIndex: index,
        kind: 'param-not-found',
        message: `param not found: ${step.paramName} on ${step.containerPath}`,
      },
    };
  }
  // Coerce the wire value (string | number | boolean | null) to the
  // existing param's typed shape. Mirrors the renderer's
  // `scriptParamValueToCore` semantics:
  //   - `null` clears the value (preserve the existing type tag).
  //   - primitive `value` is coerced to the existing type.
  const newValue: ParamValue = coerceToParamValue(existing, step.value);
  // `setParamInDocument` mutates `doc` in place (Sprint 14-era
  // helper — no return value). We capture the pre-call value to
  // detect whether the param actually changed so the caller can
  // count "applied" steps correctly.
  const preValue = target.params[step.paramName]?.value;
  setParamInDocument(doc, step.containerPath, step.paramName, newValue);
  // Re-read the post-call value to compare. `setParamInDocument`
  // updates the doc in place so the re-read hits the mutated tree.
  const postTarget = findContainerByPath(doc, step.containerPath);
  const postValue = postTarget?.params[step.paramName]?.value;
  if (preValue === postValue) {
    // No change — return a doc-equality marker so the dispatcher
    // doesn't count this as applied.
    return { doc, error: null, noChange: true };
  }
  return { doc, error: null };
}

function applyAddChild(
  doc: ArxmlDocument,
  step: {
    readonly op: 'add-child';
    readonly parentPath: string;
    readonly shortName: string;
    readonly definitionRef?: string;
  },
  index: number,
  ctx: ApplyContext,
): OneStepResult {
  if (ctx.moduleDef === undefined) {
    return {
      doc,
      error: {
        stepIndex: index,
        kind: 'no-bswmd-for-module',
        message: `add-child ${step.parentPath}/${step.shortName} requires BSWMD context (moduleDef)`,
      },
    };
  }
  // `step.shortName` is the new instance's name; `step.definitionRef`
  // (when present) is the BSWMD-side hint for which ContainerDef
  // this instance is an instance of. The renderer flow's
  // `findChildContainerDef` matches the def by its BSWMD `shortName`
  // (= the type name like `ComIPdu`), not by the new instance's
  // shortName. We do the same: the new instance's name is passed
  // to `coreAddContainer`; the def lookup is by `definitionRef`'s
  // tail OR (when omitted) by matching the parent's first
  // subContainer — a permissive fallback for callers that omit
  // the hint.
  const childDef = findChildDefForAdd(
    ctx.moduleDef,
    step.parentPath,
    step.definitionRef,
    step.shortName,
  );
  if (childDef === null) {
    return {
      doc,
      error: {
        stepIndex: index,
        kind: 'path-not-found',
        message: `add-child: BSWMD does not declare a child container under ${step.parentPath}`,
      },
    };
  }
  const result = coreAddContainer(doc, step.parentPath, step.shortName, ctx.moduleDef, childDef);
  if (!result.ok) {
    return {
      doc,
      error: {
        stepIndex: index,
        kind: result.error.kind,
        message: result.error.kind,
      },
    };
  }
  return { doc: result.value, error: null };
}

function applyRemoveWithCascade(
  doc: ArxmlDocument,
  step: {
    readonly op: 'remove-with-cascade';
    readonly containerPath: string;
    readonly cascade: boolean;
  },
  index: number,
): OneStepResult {
  // `cascade: false` is reserved for the store's pendingDelete flow
  // — when false, refuse here so the CLI doesn't silently drop
  // inbound references. The CLI doesn't have a UI dialog; the safe
  // default is to require `cascade: true`.
  if (step.cascade === false) {
    return {
      doc,
      error: {
        stepIndex: index,
        kind: 'cascade-required',
        message: `remove-with-cascade requires cascade: true (CLI cannot present the cascade confirmation dialog)`,
      },
    };
  }
  const result = coreRemoveWithCascade(doc, step.containerPath);
  if (!result.ok) {
    return {
      doc,
      error: {
        stepIndex: index,
        kind: result.error.kind,
        message: result.error.kind,
      },
    };
  }
  return { doc: result.value, error: null };
}

function applyJsonPatchStep(
  doc: ArxmlDocument,
  step:
    | { readonly op: 'add'; readonly path: string; readonly value: unknown }
    | { readonly op: 'remove'; readonly path: string }
    | { readonly op: 'replace'; readonly path: string; readonly value: unknown },
  index: number,
  ctx: ApplyContext,
): OneStepResult {
  // RFC 6902 subset for AUTOSAR-shaped paths. The three ops we
  // support map to:
  //   - `remove`  → drop a sub-container at `path`
  //   - `replace` → set a single param value at `<path>/<tail>` (the
  //     tail is the param shortName; the leading segments form the
  //     container path)
  //   - `add`     → adds a sub-container with the given shortName at
  //     the parent path; the `value` object MAY carry `{shortName,
  //     kind, ...}` or be a bare container spec. We accept both.
  switch (step.op) {
    case 'remove': {
      const result = coreRemoveWithCascade(doc, step.path);
      if (!result.ok) {
        return {
          doc,
          error: { stepIndex: index, kind: result.error.kind, message: result.error.kind },
        };
      }
      return { doc: result.value, error: null };
    }
    case 'replace': {
      const segments = step.path.split('/').filter((s) => s.length > 0);
      if (segments.length < 2) {
        return {
          doc,
          error: {
            stepIndex: index,
            kind: 'path-not-found',
            message: `replace path too short: ${step.path}`,
          },
        };
      }
      const paramName = segments[segments.length - 1];
      const containerPath = `/${segments.slice(0, -1).join('/')}`;
      if (paramName === undefined) {
        return {
          doc,
          error: {
            stepIndex: index,
            kind: 'path-not-found',
            message: `replace path missing paramName: ${step.path}`,
          },
        };
      }
      const target = findContainerByPath(doc, containerPath);
      if (target === null || !(paramName in target.params)) {
        return {
          doc,
          error: {
            stepIndex: index,
            kind: 'path-not-found',
            message: `replace: target not found ${step.path}`,
          },
        };
      }
      const existing = target.params[paramName];
      if (existing === undefined) {
        return {
          doc,
          error: {
            stepIndex: index,
            kind: 'path-not-found',
            message: `replace: param not found ${step.path}`,
          },
        };
      }
      // SE-7 (v1.17.0) — shape rejection for reference params.
      // Pre-T6, the replace op silently coerced unknown payloads via
      // String(raw) inside coerceToParamValue's `reference` arm
      // (see line ~491 below), risking round-trip of attacker-
      // controlled value text as warning text. Now reject
      // non-{value: string, dest?: string} shapes with patch-invalid.
      // Other param types (integer/float/boolean/string/enum) retain
      // the permissive coercion path — only reference is narrowed.
      if (existing.type === 'reference') {
        const v = step.value;
        if (
          typeof v !== 'object' ||
          v === null ||
          !('value' in v) ||
          typeof (v as { readonly value: unknown }).value !== 'string'
        ) {
          return {
            doc,
            error: {
              stepIndex: index,
              kind: 'patch-invalid',
              message: `replace op on reference param requires {value: string, dest?: string}, got ${describeValueType(v)}`,
            },
          };
        }
      }
      // Coerce the wire `value` (unknown) through a permissive
      // shape: numbers stay numbers, booleans stay booleans,
      // strings stay strings. Reference values are not supported
      // through RFC 6902 (use `set-param` instead).
      const coerced = coerceToParamValue(existing, step.value);
      setParamInDocument(doc, containerPath, paramName, coerced);
      return { doc, error: null };
    }
    case 'add': {
      // `add` per RFC 6902 inserts a value at the given path. For our
      // AUTOSAR-shaped docs, this maps to "insert a sub-container at
      // the parent path" — the same engine path as `add-child`. The
      // `value` payload carries the container spec; we accept either
      // a typed object (`{shortName, kind?, params?, children?}`) or
      // an AUTOSAR-flavored one (`{SHORT-NAME, ...}`). Anything else
      // returns `patch-invalid` so CI doesn't silently swallow bad
      // patches.
      if (step.value === null || typeof step.value !== 'object') {
        return {
          doc,
          error: {
            stepIndex: index,
            kind: 'patch-invalid',
            message: 'add: value must be a container spec object',
          },
        };
      }
      const v = step.value as Record<string, unknown>;
      const rawShortName = v.shortName ?? v['SHORT-NAME'];
      const rawDefRef = v.definitionRef ?? v.DEF ?? v['DEFINITION-REF'];
      if (typeof rawShortName !== 'string' || rawShortName.length === 0) {
        return {
          doc,
          error: {
            stepIndex: index,
            kind: 'patch-invalid',
            message: 'add: value.shortName (or SHORT-NAME) required and non-empty',
          },
        };
      }
      const defRef = typeof rawDefRef === 'string' && rawDefRef.length > 0 ? rawDefRef : undefined;
      return applyAddChild(
        doc,
        {
          op: 'add-child',
          parentPath: step.path,
          shortName: rawShortName,
          ...(defRef !== undefined ? { definitionRef: defRef } : {}),
        },
        index,
        ctx,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Coerce a wire value (`string | number | boolean | null` for the
 * `set-param` op; arbitrary `unknown` for the `replace` op) into
 * the existing param's typed `ParamValue` shape. The existing type
 * tag is preserved; only `value` is overwritten.
 */
function coerceToParamValue(
  existing: ParamValue,
  raw: string | number | boolean | null | unknown,
): ParamValue {
  // `null` clears the value but keeps the type tag.
  if (raw === null) {
    return { ...existing, value: null as unknown as ParamValue['value'] } as ParamValue;
  }
  switch (existing.type) {
    case 'integer':
    case 'float': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      return { ...existing, value: n };
    }
    case 'boolean': {
      const b = typeof raw === 'boolean' ? raw : Boolean(raw);
      return { ...existing, value: b };
    }
    case 'string':
    case 'enum': {
      const s = typeof raw === 'string' ? raw : String(raw);
      return { ...existing, value: s };
    }
    case 'reference': {
      // Reference shape on the wire is `{ value, dest? }`. For a
      // bare scalar `raw` we coerce to a string (matches the
      // renderer's `scriptParamValueToCore`).
      if (typeof raw === 'object' && raw !== null && 'value' in raw) {
        const refIn = raw as { readonly value: string; readonly dest?: string };
        return refIn.dest !== undefined
          ? { ...existing, value: refIn.value, dest: refIn.dest }
          : { ...existing, value: refIn.value };
      }
      return { ...existing, value: String(raw) };
    }
  }
}

/**
 * SE-7 (v1.17.0) — human-readable type descriptor for the
 * `replace` op's patch-invalid error message. We avoid `String(v)`
 * (would leak attacker text) and avoid `JSON.stringify(v)` (would
 * double-quote object shapes); this returns a stable, content-free
 * description.
 */
function describeValueType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'object') return 'object';
  return typeof v;
}

/**
 * Walk the module def to find the child container def that the
 * renderer store's `findChildContainerDef` helper would resolve.
 * For the CLI we only need: parent path → module's sub-path →
 * parent container def → child by shortName (subContainers ∪
 * choices). We inline a minimal version here so the CLI doesn't
 * pull in the renderer's `bswmdLookup` (which would drag
 * `useArxmlStore`).
 *
 * `definitionRef` is the BSWMD-side hint (e.g. `/EAS/Com/ComConfig/ComIPdu`)
 * — the trailing segment of the path is the child def's shortName.
 * When `definitionRef` is absent, we fall back to the first
 * subContainer declared under the parent (single-child shortcut
 * for the common case).
 */
function findChildDefForAdd(
  moduleDef: BswModuleDef,
  parentPath: string,
  definitionRef: string | undefined,
  newInstanceShortName: string,
): ContainerDef | null {
  // First, resolve the parent container def so we can enumerate
  // its subContainers + choices.
  const parentDef = findParentContainerDef(moduleDef, parentPath);
  if (parentDef === null) {
    // Parent path doesn't map to a BSWMD container — surface a
    // "missing parent" error (the caller will turn this into a
    // `path-not-found` style step error).
    return null;
  }
  // Determine the BSWMD-side child def shortName. When the wire
  // step provides a `definitionRef`, the trailing segment is the
  // def's shortName (the type, NOT the new instance's name).
  let defShortName: string | null = null;
  if (definitionRef !== undefined) {
    const tail = definitionRef.split('/').filter((s) => s.length > 0);
    defShortName = tail[tail.length - 1] ?? null;
  }
  if (defShortName === null) {
    // Permissive fallback: use the first subContainer. This is
    // intentional — the wire contract says `definitionRef` is
    // optional, and most BSWMDs declare a single choice per
    // parent.
    return parentDef.subContainers[0] ?? parentDef.choices[0] ?? null;
  }
  // The new instance's shortName should not be confused with the
  // def's shortName — the renderer always passes the type via
  // `definitionRef`. We match by `defShortName`, not by
  // `newInstanceShortName`.
  const child = parentDef.subContainers.find((c) => c.shortName === defShortName);
  if (child !== undefined) return child;
  const choice = parentDef.choices.find((c) => c.shortName === defShortName);
  if (choice !== undefined) return choice;
  // Last-ditch: maybe the caller passed the new instance's name
  // (legacy hint). Accept the match as a courtesy.
  const legacy = parentDef.subContainers.find((c) => c.shortName === newInstanceShortName);
  if (legacy !== undefined) return legacy;
  return null;
}

function findParentContainerDef(moduleDef: BswModuleDef, parentPath: string): ContainerDef | null {
  const segments = parentPath.split('/').filter((s) => s.length > 0);
  if (segments.length < 2) return null;
  let subSegments: string[] = [];
  if (segments[1] === moduleDef.shortName) {
    subSegments = segments.slice(2);
  } else if (segments[0] === moduleDef.shortName) {
    subSegments = segments.slice(1);
  } else {
    return null;
  }
  if (subSegments.length === 0) {
    // Module-level parent — wrap the module's top-level
    // containers in a synthetic parent? No — the wire's
    // `parentPath` for a module-level add has the module
    // shortName, and the caller's intent is to add a sibling.
    // For simplicity (and the spec's 1-level limit) we return
    // a synthetic parent that exposes the module's top-level
    // containers as its `subContainers`.
    return {
      shortName: moduleDef.shortName,
      path: moduleDef.path,
      lowerMultiplicity: 0,
      upperMultiplicity: 'infinite',
      subContainers: moduleDef.containers,
      parameters: [],
      references: [],
      choices: [],
    };
  }
  let current: ContainerDef | null = null;
  for (const seg of subSegments) {
    const candidates: readonly ContainerDef[] =
      current === null ? moduleDef.containers : current.subContainers;
    const next = candidates.find((c) => c.shortName === seg);
    if (next === undefined) return null;
    current = next;
  }
  return current;
}
