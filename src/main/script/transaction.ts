// Sprint 14 #1 — WorkingCopy transaction.
//
// Spec § 7: no deep clone. Holds (project, mutations[], violations[])
// and exposes add/apply-or-discard semantics. `commit` calls the
// per-mutation core setters in `src/core/project/setters.ts`; on
// failure it throws and the caller (vm-runner) returns a
// `runtime-error` ScriptRunResult so the renderer auto-discards.

import type { ArxmlDocument } from '../../core/arxml/types.js';
import {
  setParamInDocument,
  addChildInDocument,
  removeChildInDocument,
} from '../../core/project/setters.js';

import type { ScriptMutation, ScriptViolation } from './types.js';

export interface Transaction {
  readonly project: ArxmlDocument;
  readonly mutations: ScriptMutation[];
  readonly violations: ScriptViolation[];
  addMutation(m: ScriptMutation): void;
  addViolation(v: ScriptViolation): void;
}

export function createTransaction(project: ArxmlDocument): Transaction {
  const mutations: ScriptMutation[] = [];
  const violations: ScriptViolation[] = [];
  return {
    project,
    mutations,
    violations,
    addMutation: (m) => {
      mutations.push(m);
    },
    addViolation: (v) => {
      violations.push(v);
    },
  };
}

export interface CommitResult {
  readonly applied: boolean;
  readonly mutations: readonly ScriptMutation[];
  readonly violations: readonly ScriptViolation[];
}

/**
 * Apply every queued mutation in order. On the first failure, throw
 * (the partial commit may have left the project in a state that
 * the renderer can recover from by reloading — but typically the
 * renderer auto-discards on runtime-error, so leaving the partial
 * state is acceptable for V0.1).
 */
export function commitTransaction(tx: Transaction): CommitResult {
  for (const m of tx.mutations) {
    switch (m.kind) {
      case 'set-param':
        setParamInDocument(tx.project, m.containerPath, m.paramName, {
          type: typeof m.newValue === 'number'
            ? 'integer'
            : typeof m.newValue === 'boolean'
              ? 'boolean'
              : typeof m.newValue === 'string'
                ? 'string'
                : 'reference',
          value: m.newValue as never,
        });
        break;
      case 'add-child':
        addChildInDocument(tx.project, m.containerPath, m.newShortName);
        break;
      case 'remove-child':
        removeChildInDocument(tx.project, m.containerPath, m.shortName);
        break;
    }
  }
  return { applied: true, mutations: tx.mutations, violations: tx.violations };
}

/**
 * Discard is a no-op: the WorkingCopy is not backed by a clone,
 * so simply not calling `commit` drops the queued mutations. Provided
 * for symmetry with the spec; the renderer can call it to make
 * intent explicit.
 */
export function discardTransaction(_tx: Transaction): void {
  // No-op — caller simply doesn't call commit. Provided for symmetry.
}
