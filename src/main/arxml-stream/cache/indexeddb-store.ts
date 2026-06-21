// arxml-stream/cache/indexeddb-store.ts
// IndexedDB-backed cache for NormalizedDocument.
//
// Production usage (Electron renderer): uses the browser's native
// `globalThis.indexedDB`. The cache is keyed by a string derived
// from (filePath, mtime, contentHash, schemaVersion) — see
// `./invalidation.ts`. Records store the document + a schemaVersion
// stamp; on read, stale-version records are silently evicted.
//
// Test usage: vitest's `node` environment does not provide IndexedDB.
// Tests install a minimal FakeIDB shim onto `globalThis.indexedDB`
// before exercising `cacheGet` / `cacheSet`. The shim mirrors only
// the surface area this module uses.

import type { Result } from '../../../core/arxml/types.js';
import type { NormalizedDocument } from '../../../shared/normalized-document.js';

import { CACHE_DB_NAME, CACHE_SCHEMA_VERSION, CACHE_STORE_NAME } from './schema-version.js';

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

// ---------------------------------------------------------------------------
// IDB-compatible type aliases. The real IndexedDB API is global; we only
// describe the shape we use here so the call sites type-check.
// ---------------------------------------------------------------------------

interface IdbRequestLike<T> {
  result: T | undefined;
  error: DOMException | null;
  onsuccess: ((this: IdbRequestLike<T>, ev: Event) => void) | null;
  onerror: ((this: IdbRequestLike<T>, ev: Event) => void) | null;
  onupgradeneeded: ((this: IdbRequestLike<T>, ev: Event) => void) | null;
}

interface IdbObjectStoreLike {
  get(key: string): IdbRequestLike<unknown>;
  put(value: {
    key: string;
    doc: NormalizedDocument;
    storedAt: number;
    schemaVersion: number;
  }): IdbRequestLike<string>;
  delete(key: string): IdbRequestLike<void>;
  clear(): IdbRequestLike<void>;
}

interface IdbTransactionLike {
  objectStore(name: string): IdbObjectStoreLike;
  oncomplete: ((this: IdbTransactionLike, ev: Event) => void) | null;
  onerror: ((this: IdbTransactionLike, ev: Event) => void) | null;
  onabort: ((this: IdbTransactionLike, ev: Event) => void) | null;
}

interface IdbDatabaseLike {
  readonly objectStoreNames: { contains(name: string): boolean };
  transaction(names: string | string[], mode?: 'readonly' | 'readwrite'): IdbTransactionLike;
  createObjectStore(name: string, options?: { keyPath?: string }): IdbObjectStoreLike;
  close(): void;
}

interface IdbFactoryLike {
  open(name: string, version: number): IdbRequestLike<IdbDatabaseLike>;
  deleteDatabase(name: string): IdbRequestLike<void>;
}

// ---------------------------------------------------------------------------

let dbPromise: Promise<IdbDatabaseLike> | null = null;

function getIdbFactory(): IdbFactoryLike | null {
  const g = globalThis as unknown as { indexedDB?: IdbFactoryLike };
  return typeof g.indexedDB === 'object' && g.indexedDB !== null ? g.indexedDB : null;
}

function openCacheDb(): Promise<IdbDatabaseLike> {
  if (dbPromise !== null) return dbPromise;
  const factory = getIdbFactory();
  if (factory === null) {
    return Promise.reject<IdbDatabaseLike>({
      kind: 'idb-unavailable',
      message: 'globalThis.indexedDB is not present (Node / non-Electron context)',
    });
  }
  dbPromise = new Promise<IdbDatabaseLike>((resolve, reject) => {
    const req = factory.open(CACHE_DB_NAME, CACHE_SCHEMA_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db !== undefined && !db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        db.createObjectStore(CACHE_STORE_NAME);
      }
    };
    req.onsuccess = () => {
      if (req.result === undefined) {
        reject({
          kind: 'idb-open-error',
          message: 'IndexedDB.open resolved with undefined',
        });
        return;
      }
      resolve(req.result);
    };
    req.onerror = () => {
      reject({
        kind: 'idb-open-error',
        message: req.error?.message ?? 'unknown IndexedDB.open error',
      });
    };
  }).catch((err: unknown) => {
    // Reset cache so the next call retries the open.
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function promisifyRequest<T>(req: IdbRequestLike<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () =>
      reject({
        kind: 'idb-tx-error',
        message: req.error?.message ?? 'unknown IndexedDB request error',
      });
  });
}

function promisifyTransaction(tx: IdbTransactionLike): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject({
        kind: 'idb-tx-error',
        message: 'IndexedDB transaction error',
      });
    tx.onabort = () =>
      reject({
        kind: 'idb-tx-error',
        message: 'IndexedDB transaction aborted',
      });
  });
}

export async function cacheGet(key: string): Promise<Result<CacheRecord | null, CacheError>> {
  const factory = getIdbFactory();
  if (factory === null) {
    return {
      ok: false,
      error: { kind: 'idb-unavailable', message: 'globalThis.indexedDB is not present' },
    };
  }
  let db: IdbDatabaseLike;
  try {
    db = await openCacheDb();
  } catch (err) {
    return { ok: false, error: toCacheError(err) };
  }

  const tx = db.transaction(CACHE_STORE_NAME, 'readonly');
  const store = tx.objectStore(CACHE_STORE_NAME);
  try {
    const raw = await promisifyRequest(store.get(key));
    if (raw === undefined) return { ok: true, value: null };
    const record = raw as CacheRecord;
    if (record.schemaVersion !== CACHE_SCHEMA_VERSION) {
      // Stale record — evict it asynchronously.
      void evictStale(db, key);
      return { ok: true, value: null };
    }
    return { ok: true, value: record };
  } catch (err) {
    return { ok: false, error: toCacheError(err) };
  }
}

export async function cacheSet(
  key: string,
  doc: NormalizedDocument,
): Promise<Result<void, CacheError>> {
  const factory = getIdbFactory();
  if (factory === null) {
    return {
      ok: false,
      error: { kind: 'idb-unavailable', message: 'globalThis.indexedDB is not present' },
    };
  }
  let db: IdbDatabaseLike;
  try {
    db = await openCacheDb();
  } catch (err) {
    return { ok: false, error: toCacheError(err) };
  }

  const record: CacheRecord = {
    key,
    doc,
    storedAt: Date.now(),
    schemaVersion: CACHE_SCHEMA_VERSION,
  };
  const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
  const store = tx.objectStore(CACHE_STORE_NAME);
  try {
    await promisifyRequest(store.put(record));
    await promisifyTransaction(tx);
    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: toCacheError(err) };
  }
}

async function evictStale(db: IdbDatabaseLike, key: string): Promise<void> {
  try {
    const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(CACHE_STORE_NAME);
    await promisifyRequest(store.delete(key));
    await promisifyTransaction(tx);
  } catch {
    // Best-effort eviction; never fail the caller.
  }
}

function toCacheError(err: unknown): CacheError {
  if (err !== null && typeof err === 'object' && 'kind' in err) {
    return err as CacheError;
  }
  return {
    kind: 'idb-tx-error',
    message: err instanceof Error ? err.message : String(err),
  };
}

/** Test-only: drop the cached DB handle so the next call re-opens. */
export function _resetForTest(): void {
  dbPromise = null;
}
