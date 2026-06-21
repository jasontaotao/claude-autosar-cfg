// arxml-stream/cache/__tests__/indexeddb-store.test.ts
// Verify cacheGet / cacheSet using a minimal in-test FakeIDB shim.
// We can't depend on jsdom's IndexedDB (not bundled) or fake-indexeddb
// (not in deps), so we shim the surface the cache uses and exercise it.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { NormalizedDocument } from '../../../../shared/normalized-document.js';
import { cacheGet, cacheSet, _resetForTest } from '../indexeddb-store.js';
import { CACHE_DB_NAME, CACHE_SCHEMA_VERSION, CACHE_STORE_NAME } from '../schema-version.js';

// ---------------------------------------------------------------------------
// FakeIDB — minimum surface area used by indexeddb-store.ts.
// MIRRORS: IDBFactory.open / IDBDatabase.transaction / IDBObjectStore.{get,put,clear,delete}
// ---------------------------------------------------------------------------

interface FakeStoreValue {
  readonly key: string;
  readonly doc: NormalizedDocument;
  readonly storedAt: number;
  readonly schemaVersion: number;
}

class FakeRequest<T> {
  onsuccess: ((ev: { target: FakeRequest<T> }) => void) | null = null;
  onerror: ((ev: { target: FakeRequest<T> }) => void) | null = null;
  onupgradeneeded: ((ev: { target: FakeRequest<T> }) => void) | null = null;
  result: T | undefined;
  error: Error | null = null;
  private _source: Promise<void>;

  constructor(source: Promise<void>) {
    this._source = source;
  }

  start(): this {
    this._source.then(
      () => {
        if (this.onerror === null && this.error !== null) {
          // No error handler set; swallow.
        }
        if (this.onsuccess !== null) this.onsuccess({ target: this });
      },
      (err: unknown) => {
        this.error = err instanceof Error ? err : new Error(String(err));
        if (this.onerror !== null) this.onerror({ target: this });
      },
    );
    return this;
  }
}

class FakeObjectStore {
  private data = new Map<string, FakeStoreValue>();
  constructor(public readonly name: string) {}

  get(key: string): FakeRequest<FakeStoreValue | undefined> {
    const req = new FakeRequest<FakeStoreValue | undefined>(Promise.resolve());
    req.result = this.data.get(key);
    return req.start();
  }

  put(value: FakeStoreValue): FakeRequest<string> {
    const req = new FakeRequest<string>(Promise.resolve());
    this.data.set(value.key, value);
    req.result = value.key;
    return req.start();
  }

  delete(key: string): FakeRequest<void> {
    const req = new FakeRequest<void>(Promise.resolve());
    this.data.delete(key);
    return req.start();
  }

  clear(): FakeRequest<void> {
    const req = new FakeRequest<void>(Promise.resolve());
    this.data.clear();
    return req.start();
  }
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;
  onabort: ((err: unknown) => void) | null = null;
  constructor(
    private readonly db: FakeDatabase,
    public readonly mode: string = 'readonly',
  ) {}
  objectStore(name: string): FakeObjectStore {
    let store = this.db['stores'].get(name);
    if (store === undefined) {
      store = new FakeObjectStore(name);
      this.db['stores'].set(name, store);
    }
    return store;
  }
  /** Test helper: fire oncomplete on the next microtask (after all
   *  pending requests have settled). */
  completeSoon(): void {
    queueMicrotask(() => {
      if (this.oncomplete !== null) this.oncomplete();
    });
  }
}

class FakeDatabase {
  readonly objectStoreNames = {
    contains: (name: string) => name === CACHE_STORE_NAME,
  };
  private stores = new Map<string, FakeObjectStore>();
  constructor(
    public readonly name: string,
    public readonly version: number,
  ) {}

  transaction(_names: string | string[], mode?: 'readonly' | 'readwrite'): FakeTransaction {
    const tx = new FakeTransaction(this, mode ?? 'readonly');
    // Mirror real IDB: tx.complete fires after the current macrotask.
    setTimeout(() => tx.completeSoon(), 0);
    return tx;
  }

  createObjectStore(name: string): FakeObjectStore {
    const store = new FakeObjectStore(name);
    this.stores.set(name, store);
    return store;
  }
}

class FakeIDBFactory {
  private dbs = new Map<string, FakeDatabase>();

  open(name: string, version: number): FakeRequest<FakeDatabase> {
    // Defer all callbacks via a microtask so the consumer has a chance
    // to assign onsuccess / onupgradeneeded before we invoke them.
    const req = new FakeRequest<FakeDatabase>(Promise.resolve());
    const isFresh = !this.dbs.has(name);
    let db = this.dbs.get(name);
    if (db === undefined) {
      db = new FakeDatabase(name, version);
      this.dbs.set(name, db);
    }
    req.result = db;

    // Fire onupgradeneeded (only on fresh opens) BEFORE onsuccess, but
    // on the next microtask, mirroring the real IDB behavior.
    if (isFresh) {
      queueMicrotask(() => {
        if (req.onupgradeneeded !== null) {
          req.onupgradeneeded({ target: req } as unknown as { target: FakeRequest<FakeDatabase> });
        }
      });
    }
    return req.start();
  }

  /** Test helper. */
  deleteDatabase(name: string): FakeRequest<void> {
    const req = new FakeRequest<void>(Promise.resolve());
    this.dbs.delete(name);
    return req.start();
  }
}

// ---------------------------------------------------------------------------
// Test fixture + setup
// ---------------------------------------------------------------------------

const MOCK_DOC: NormalizedDocument = {
  version: '4.6',
  packages: [],
  modules: [],
  references: [],
  sourceOrder: [],
  origin: 'dom',
};

function installFakeIDB(): FakeIDBFactory {
  const factory = new FakeIDBFactory();
  (globalThis as unknown as { indexedDB: FakeIDBFactory }).indexedDB = factory;
  return factory;
}

function uninstallFakeIDB(): void {
  delete (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
}

describe('indexeddb-store — happy path', () => {
  beforeEach(() => {
    installFakeIDB();
    _resetForTest();
  });
  afterEach(() => {
    uninstallFakeIDB();
    _resetForTest();
  });

  it('returns null for cache miss', async () => {
    const result = await cacheGet('missing-key');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('stores and retrieves a doc', async () => {
    const key = 'test-key';
    const setResult = await cacheSet(key, MOCK_DOC);
    expect(setResult.ok).toBe(true);

    const getResult = await cacheGet(key);
    expect(getResult.ok).toBe(true);
    if (getResult.ok && getResult.value !== null) {
      expect(getResult.value.doc).toEqual(MOCK_DOC);
      expect(getResult.value.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
    } else {
      expect.fail('expected hit');
    }
  });

  it('overwrites existing entry', async () => {
    const key = 'test-key';
    await cacheSet(key, MOCK_DOC);
    const updated: NormalizedDocument = { ...MOCK_DOC, origin: 'stream' };
    await cacheSet(key, updated);
    const result = await cacheGet(key);
    if (result.ok && result.value !== null) {
      expect(result.value.doc).toEqual(updated);
    } else {
      expect.fail('expected hit');
    }
  });

  it('returns null for different key', async () => {
    await cacheSet('key-a', MOCK_DOC);
    const result = await cacheGet('key-b');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('handles concurrent sets without corruption', async () => {
    const key = 'concurrent';
    await Promise.all([cacheSet(key, MOCK_DOC), cacheSet(key, MOCK_DOC), cacheSet(key, MOCK_DOC)]);
    const result = await cacheGet(key);
    expect(result.ok).toBe(true);
    if (result.ok && result.value !== null) {
      expect(result.value.doc).toEqual(MOCK_DOC);
    } else {
      expect.fail('expected hit');
    }
  });
});

describe('indexeddb-store — graceful degradation', () => {
  beforeEach(() => {
    _resetForTest();
  });
  afterEach(() => {
    uninstallFakeIDB();
    _resetForTest();
  });

  it('returns IDB_UNAVAILABLE when globalThis.indexedDB is missing', async () => {
    uninstallFakeIDB();
    const result = await cacheGet('any-key');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('idb-unavailable');
  });

  it('cacheSet returns IDB_UNAVAILABLE when globalThis.indexedDB is missing', async () => {
    uninstallFakeIDB();
    const result = await cacheSet('any-key', MOCK_DOC);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('idb-unavailable');
  });
});

describe('indexeddb-store — schema-version invalidation', () => {
  let factory: FakeIDBFactory;
  beforeEach(() => {
    factory = installFakeIDB();
    _resetForTest();
  });
  afterEach(() => {
    uninstallFakeIDB();
    _resetForTest();
  });

  it('silently evicts entries with stale schemaVersion and returns null', async () => {
    // Seed an entry directly with a stale schema version via the public API.
    const key = 'stale-key';
    await cacheSet(key, MOCK_DOC);

    // Tamper with the stored record's schemaVersion to simulate a version bump.
    const db = (factory as unknown as { dbs: Map<string, FakeDatabase> }).dbs.get(
      CACHE_DB_NAME,
    ) as FakeDatabase;
    const store = db.transaction(CACHE_STORE_NAME).objectStore(CACHE_STORE_NAME);
    const req = store.get(key);
    const record = await new Promise<FakeStoreValue | undefined>((resolve) => {
      req.onsuccess = () => resolve(req.result);
    });
    expect(record).toBeDefined();
    if (record !== undefined) {
      // Replace with a record tagged with an OLD schema version.
      const tampered: FakeStoreValue = {
        ...record,
        schemaVersion: CACHE_SCHEMA_VERSION - 1,
      };
      const putReq = store.put(tampered);
      await new Promise<void>((resolve) => {
        putReq.onsuccess = () => resolve();
      });
    }

    // Now cacheGet should evict and return null.
    const result = await cacheGet(key);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });
});
