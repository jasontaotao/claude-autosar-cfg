// Sprint 14 #1 — error factory, mirrors `templatesHandler.ts` pattern.

import type { ScriptKind, ScriptEntry } from './types.js';

export type ScriptErrorKind =
  | 'unknown-script'
  | 'invalid-source'
  | 'duplicate-shortname'
  | 'reserved-shortname'
  | 'shortname-format'
  | 'shortname-length'
  | 'unknown-module'
  | 'unknown-export'
  | 'circular-import'
  | 'depth-limit'
  | 'unsupported-import'
  | 'sandbox-runtime'
  | 'sandbox-timeout'
  | 'manifest-read'
  | 'no-project'
  // Sprint 17b (H8) — defensive parity with the PROJECT_SAVE and
  // saveArxmlHandler containment checks. The script engine reads
  // / writes the manifest path it was given at startup; we refuse
  // any path with a `..` parent-traversal segment.
  | 'invalid-path';

export interface ScriptErrorPayload {
  readonly kind: ScriptErrorKind;
  readonly message: string;
  readonly meta?: Readonly<Record<string, unknown>> | undefined;
}

export class ScriptError extends Error {
  readonly payload: ScriptErrorPayload;
  constructor(payload: ScriptErrorPayload) {
    super(payload.message);
    this.payload = payload;
    this.name = 'ScriptError';
  }
}

export function classScriptError(
  kind: ScriptErrorKind,
  message: string,
  meta?: Readonly<Record<string, unknown>>,
): ScriptError {
  return new ScriptError({ kind, message, meta });
}

/** shortName blacklist (spec § 5.4). Protects ctx API and prototype chain. */
export const RESERVED_SHORTNAMES: ReadonlySet<string> = new Set([
  'ctx',
  'project',
  'document',
  'documents',
  'container',
  'param',
  'validator',
  'schema',
  'log',
  'utils',
  'core',
  'script',
  'scripts',
  'manifest',
  'arxml',
  '__proto__',
  'constructor',
  'prototype',
  'hasOwnProperty',
]);

export const SHORTNAME_RE = /^[a-z][a-z0-9-]*$/;
export const SHORTNAME_MIN = 3;
export const SHORTNAME_MAX = 40;

export function validateShortName(shortName: string): ScriptError | null {
  if (shortName.length < SHORTNAME_MIN || shortName.length > SHORTNAME_MAX) {
    return classScriptError(
      'shortname-length',
      `shortName length must be ${SHORTNAME_MIN}-${SHORTNAME_MAX}, got ${shortName.length}`,
      { shortName },
    );
  }
  if (!SHORTNAME_RE.test(shortName)) {
    return classScriptError(
      'shortname-format',
      `shortName must match ${SHORTNAME_RE.source}, got "${shortName}"`,
      { shortName },
    );
  }
  if (RESERVED_SHORTNAMES.has(shortName)) {
    return classScriptError(
      'reserved-shortname',
      `shortName "${shortName}" is reserved (collides with ctx API or JS prototype)`,
      { shortName },
    );
  }
  return null;
}

// Re-export common types so consumers can import from errors.ts
export type { ScriptKind, ScriptEntry };
