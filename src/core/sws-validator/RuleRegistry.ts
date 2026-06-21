// src/core/sws-validator/RuleRegistry.ts
// Cluster G (v1.6.0) — Rule registry.
//
// Pure / sync / no I/O. Stores `ValidatorRule` instances by stable id.
// `register()` rejects duplicate ids with a thrown error (consistent with
// loader's rejection policy in G spec §11 R10).
//
// Snapshot semantics: `getAll()` returns a frozen array so callers can
// iterate without worrying about concurrent mutation.

import type { ValidatorRule } from './types.js';

export class RuleRegistry {
  private readonly rules: Map<string, ValidatorRule> = new Map();

  /**
   * Register a rule. Throws on duplicate id (per G spec §11 R10: loader
   * rejects user-defined rules whose id collides with a built-in).
   */
  register(rule: ValidatorRule): void {
    if (this.rules.has(rule.id)) {
      throw new Error(
        `[sws-validator] duplicate rule id: ${rule.id} ` +
          `(already registered as ${this.rules.get(rule.id)?.id ?? 'unknown'})`,
      );
    }
    this.rules.set(rule.id, rule);
  }

  /**
   * Return all registered rules as a frozen snapshot. Iteration order
   * matches insertion order (Map preserves it).
   */
  getAll(): readonly ValidatorRule[] {
    return Object.freeze(Array.from(this.rules.values()));
  }

  /** Look up a rule by id. Returns undefined when not registered. */
  getById(id: string): ValidatorRule | undefined {
    return this.rules.get(id);
  }

  /** Number of registered rules. Useful for tests. */
  get size(): number {
    return this.rules.size;
  }

  /**
   * Build a filtered sub-registry containing only rules whose id is
   * in `ids`. Used by `runValidation({ ruleIds })`.
   */
  filter(ids: readonly string[]): readonly ValidatorRule[] {
    const out: ValidatorRule[] = [];
    for (const id of ids) {
      const r = this.rules.get(id);
      if (r !== undefined) out.push(r);
    }
    return Object.freeze(out);
  }
}