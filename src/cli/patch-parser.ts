// Patch parser (v1.6.0 A+C-3).
//
// Parses PatchDocument input (JSON or YAML) into the discriminated
// `PatchDocument` union from `src/shared/headless/ipc-contract.ts`.
// v1 only supports JSON for the patch format — YAML support is a v1.7.0
// follow-up. The CLI accepts both `.json` and `.yaml` extensions for
// forward-compat; YAML files are currently rejected with a clear error.
//
// Per A+C spec §8 + Q11: `autosarcfgPatchVersion: "1"` is mandatory;
// any other version → `unsupported-patch-version` exit 3 (strict).
// Per Q1: patch parser is a thin wrapper — no zod for v1 (kept lean);
// the discriminated union is the schema.

import type { PatchDocument, PatchStep } from '../shared/headless/ipc-contract.js';

export type ParsePatchResult =
  | { readonly ok: true; readonly doc: PatchDocument }
  | { readonly ok: false; readonly kind: 'unsupported-version'; readonly version: string }
  | { readonly ok: false; readonly kind: 'invalid'; readonly reason: string; readonly line?: number };

/** Parse a JSON string into a PatchDocument. Pure (no I/O). */
export function parsePatchJson(raw: string): ParsePatchResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return {
      ok: false,
      kind: 'invalid',
      reason: `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!isObject(parsed)) {
    return { ok: false, kind: 'invalid', reason: 'root must be a JSON object' };
  }

  const version = parsed['autosarcfgPatchVersion'];
  if (version === undefined) {
    return { ok: false, kind: 'invalid', reason: 'missing autosarcfgPatchVersion field' };
  }
  if (version !== '1') {
    return { ok: false, kind: 'unsupported-version', version: String(version) };
  }

  const stepsRaw = parsed['steps'];
  if (!Array.isArray(stepsRaw)) {
    return { ok: false, kind: 'invalid', reason: 'steps must be an array' };
  }

  const steps: PatchStep[] = [];
  for (let i = 0; i < stepsRaw.length; i++) {
    const stepResult: { ok: true; value: PatchStep } | ParsePatchResult = parseStep(stepsRaw[i], i);
    if (!stepResult.ok) return stepResult;
    if ('doc' in stepResult) return stepResult; // never, but narrows the union
    steps.push(stepResult.value);
  }

  const doc: PatchDocument = {
    autosarcfgPatchVersion: '1',
    ...(isObject(parsed['metadata'])
      ? { metadata: parsed['metadata'] as Readonly<Record<string, string>> }
      : {}),
    steps,
  };
  return { ok: true, doc };
}

/** Parse a YAML string into a PatchDocument. v1: not implemented. */
export function parsePatchYaml(_raw: string): ParsePatchResult {
  // v1 stubs out YAML support — reject with a clear message. PR(A+C-3)
  // keeps the YAML hook in the public API so v1.7.0 can swap in a
  // js-yaml-backed implementation without touching call sites.
  return {
    ok: false,
    kind: 'invalid',
    reason: 'YAML patch format is not supported in v1.6.0; convert to JSON',
  };
}

/** Detect format from content (cheap heuristic — starts with `{`). */
export function parsePatchDocument(raw: string): ParsePatchResult {
  const trimmed = raw.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parsePatchJson(raw);
  }
  return parsePatchYaml(raw);
}

// ---------------------------------------------------------------------------
// Step parsing
// ---------------------------------------------------------------------------

function parseStep(raw: unknown, index: number): { ok: true; value: PatchStep } | ParsePatchResult {
  if (!isObject(raw)) {
    return { ok: false, kind: 'invalid', reason: `step[${index}] must be an object`, line: index };
  }

  const op = raw['op'];
  if (typeof op !== 'string') {
    return { ok: false, kind: 'invalid', reason: `step[${index}].op must be a string` };
  }

  switch (op) {
    case 'add':
    case 'replace': {
      const path = raw['path'];
      const value = raw['value'];
      if (typeof path !== 'string') {
        return { ok: false, kind: 'invalid', reason: `step[${index}].path must be a string` };
      }
      return { ok: true, value: { op, path, value } as PatchStep };
    }
    case 'remove': {
      const path = raw['path'];
      if (typeof path !== 'string') {
        return { ok: false, kind: 'invalid', reason: `step[${index}].path must be a string` };
      }
      return { ok: true, value: { op: 'remove', path } };
    }
    case 'set-param': {
      const containerPath = raw['containerPath'];
      const paramName = raw['paramName'];
      const value = raw['value'];
      if (typeof containerPath !== 'string' || typeof paramName !== 'string') {
        return {
          ok: false,
          kind: 'invalid',
          reason: `step[${index}] set-param requires containerPath + paramName`,
        };
      }
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean' && value !== null) {
        return {
          ok: false,
          kind: 'invalid',
          reason: `step[${index}].value must be string|number|boolean|null`,
        };
      }
      return { ok: true, value: { op: 'set-param', containerPath, paramName, value } };
    }
    case 'add-child': {
      const parentPath = raw['parentPath'];
      const shortName = raw['shortName'];
      if (typeof parentPath !== 'string' || typeof shortName !== 'string') {
        return {
          ok: false,
          kind: 'invalid',
          reason: `step[${index}] add-child requires parentPath + shortName`,
        };
      }
      const definitionRef = raw['definitionRef'];
      return {
        ok: true,
        value: {
          op: 'add-child',
          parentPath,
          shortName,
          ...(typeof definitionRef === 'string' ? { definitionRef } : {}),
        },
      };
    }
    case 'remove-with-cascade': {
      const containerPath = raw['containerPath'];
      const cascade = raw['cascade'];
      if (typeof containerPath !== 'string' || typeof cascade !== 'boolean') {
        return {
          ok: false,
          kind: 'invalid',
          reason: `step[${index}] remove-with-cascade requires containerPath + boolean cascade`,
        };
      }
      return { ok: true, value: { op: 'remove-with-cascade', containerPath, cascade } };
    }
    default:
      return { ok: false, kind: 'invalid', reason: `step[${index}].op="${op}" is not a recognised op` };
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}