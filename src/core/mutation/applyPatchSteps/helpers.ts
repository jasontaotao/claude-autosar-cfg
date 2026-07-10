// core/mutation/applyPatchSteps/helpers.ts
// Internal helpers for the patch-step engine. Split from
// `src/core/mutation/applyPatchSteps.ts` as part of v1.41.x PATCH T2
// (file-size backlog).
//
// Internal helpers: coerceToParamValue, describeValueType,
// findChildDefForAdd, findParentContainerDef. No public API.

import type { ParamValue } from '../../arxml/types.js';
import type { BswModuleDef, ContainerDef } from '../../project/bswmd.js';

export function coerceToParamValue(
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
export function describeValueType(v: unknown): string {
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
export function findChildDefForAdd(
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

export function findParentContainerDef(
  moduleDef: BswModuleDef,
  parentPath: string,
): ContainerDef | null {
  const segments = parentPath.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  // v1.27.2 PATCH — support module-level add via 1-segment parentPath
  // (e.g. mapper emits `parentPath: 'Dcm'` to add ECUC-CONTAINER-VALUE
  // siblings of ODX-extracted DcmDspDid instances). Pre-patch, only
  // 2+-segment paths were accepted; this blocked the Dcm mapper from
  // sibling-add against the module. The synthetic parent below exposes
  // the module's top-level containers as `subContainers`, which
  // `findChildDefForAdd` then matches against the step's `definitionRef`
  // tail to resolve the BSWMD-side container def.
  if (segments.length === 1 && segments[0] === moduleDef.shortName) {
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
    // Module-level parent (2-segment form, e.g. `Dcm/Dcm`) — same
    // synthetic-parent fallback as the 1-segment form above.
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
