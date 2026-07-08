// Sprint 14 #1 — WorkingCopy transaction.
//
// Spec § 7: no deep clone. Holds (project, mutations[], violations[])
// and exposes add/apply-or-discard semantics. `commit` calls the
// per-mutation core setters in `src/core/project/setters.ts`; on
// failure it throws and the caller (vm-runner) returns a
// `runtime-error` ScriptRunResult so the renderer auto-discards.
//
// v1.37.0 T1/C1 — the core setters are now immutable (they return
// a new `ArxmlDocument` instead of mutating in place). `commit`
// captures each returned new ref into the transaction's internal
// project binding so subsequent mutations in the same commit (and
// the caller's `tx.project` getter after commit) see the updated
// tree.

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

/**
 * Mutable state backing a Transaction. Held in a closure so the
 * public `Transaction` shape stays `readonly` — callers can read
 * the project / mutations / violations arrays (via getters) and
 * append to the arrays (via the helper methods), but cannot tamper
 * with the project ref directly.
 *
 * v1.37.0 T1/C1 — `project` is now a let-binding (not a const) so
 * `commitTransaction` can swap in the new doc ref returned by the
 * (now immutable) core setters.
 */
interface TransactionState {
  project: ArxmlDocument;
  mutations: ScriptMutation[];
  violations: ScriptViolation[];
}

/**
 * Module-private WeakMap used by `commitTransaction` to reach the
 * mutable state backing a `Transaction`. Keyed by the Transaction
 * object's identity, so external callers cannot reach the state.
 *
 * `createTransaction` registers the binding at construction time;
 * `commitTransaction` is the only writer of `state.project`.
 */
const TX_STATE = new WeakMap<Transaction, TransactionState>();

export function createTransaction(project: ArxmlDocument): Transaction {
  const state: TransactionState = {
    project,
    mutations: [],
    violations: [],
  };
  const tx: Transaction = {
    // v1.37.0 T1/C1 — `project` is a getter so it reflects the
    // post-commit doc binding (the immutable setters return a new
    // ref that we swap into `state.project`). The original code
    // used a plain `project: state.project` snapshot, which would
    // be frozen at construction time.
    get project(): ArxmlDocument {
      return state.project;
    },
    mutations: state.mutations,
    violations: state.violations,
    addMutation: (m) => {
      state.mutations.push(m);
    },
    addViolation: (v) => {
      state.violations.push(v);
    },
  };
  TX_STATE.set(tx, state);
  return tx;
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
 *
 * v1.37.0 T1/C1 — the core setters are immutable. Each helper call
 * returns a new `ArxmlDocument`; we capture the new ref into the
 * internal state so subsequent mutations in the same commit see
 * the previous step's effect, and so `tx.project` after commit
 * reflects the post-commit tree.
 */
export function commitTransaction(tx: Transaction): CommitResult {
  const state = TX_STATE.get(tx);
  if (state === undefined) {
    // Defensive guard — should never happen because
    // `createTransaction` registers the binding. If a caller
    // constructs a Transaction literal by hand, throw loudly
    // rather than silently dropping mutations.
    throw new Error('commitTransaction: transaction was not created via createTransaction');
  }
  for (const m of state.mutations) {
    switch (m.kind) {
      case 'set-param':
        state.project = setParamInDocument(state.project, m.containerPath, m.paramName, {
          type:
            typeof m.newValue === 'number'
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
        state.project = addChildInDocument(state.project, m.containerPath, m.newShortName);
        break;
      case 'remove-child':
        state.project = removeChildInDocument(state.project, m.containerPath, m.shortName);
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
