// arxml-stream/cache/indexeddb-store.ts
// IndexedDB-backed cache for NormalizedDocument.
//
// This file is a Sub-A STUB. Sub-C replaces the body with the real
// implementation using `globalThis.indexedDB` directly (no extra deps).
// The stub returns `cacheUnavailable` errors so the router degrades
// gracefully when the cache module is imported but not yet wired.

import type { Result } from '../../../core/arxml/types.js';
import type { NormalizedDocument } from '../../../shared/normalized-document.js';

export interface CacheRecord {
  readonly key: string;
  readonly doc: NormalizedDocument;
  readonly storedAt: number;
  readonly schemaVersion: number;
}

export type CacheError =
  | { readonly kind: 'idb-unavailable'; readonly message: string }
  | { readonly kind: 'idb-open-error'; readonly message: string }
  | { readonly kind: 'idb-tx-error'; readonly message: string };

export async function cacheGet(_key: string): Promise<Result<CacheRecord | null, CacheError>> {
  return {
    ok: false,
    error: { kind: 'idb-unavailable', message: 'arxml-stream cache not implemented yet (Sub-A stub)' },
  };
}

export async function cacheSet(_key: string, _doc: NormalizedDocument): Promise<Result<void, CacheError>> {
  return {
    ok: false,
    error: { kind: 'idb-unavailable', message: 'arxml-stream cache not implemented yet (Sub-A stub)' },
  };
}

/** Test-only: drop the cached DB handle so a fresh `open` runs on next call. */
export function _resetForTest(): void {
  // no-op for Sub-A stub
}