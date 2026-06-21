// src/renderer/store/helpers/dirty.ts
// ReadonlySet helpers — pure, allocation-free when the entry is already
// present (addToDirty) or already absent (dropFromDirty). Extracted from
// useArxmlStore.ts in PR(5) — pure refactor, no behavior change.

/**
 * Add `path` to the dirty-path Set and return the new Set. Returns the
 * original Set (no allocation) when `path` is already present, so
 * downstream `useStore(selector)` consumers comparing by reference do
 * not see a spurious state change.
 */
export function addToDirty(set: ReadonlySet<string>, path: string): ReadonlySet<string> {
  if (set.has(path)) return set;
  const next = new Set(set);
  next.add(path);
  return next;
}

/**
 * Drop `path` from the dirty-path Set and return the new Set. Returns
 * the original Set (no allocation) when `path` is already absent.
 */
export function dropFromDirty(set: ReadonlySet<string>, path: string): ReadonlySet<string> {
  if (!set.has(path)) return set;
  const next = new Set(set);
  next.delete(path);
  return next;
}
