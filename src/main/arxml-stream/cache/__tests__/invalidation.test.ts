// arxml-stream/cache/__tests__/invalidation.test.ts
// Verify the (filePath, mtime, contentHash) cache-key derivation and
// the SHA-256 content-hash helper.

import { describe, expect, it } from 'vitest';

import { computeContentHash, deriveCacheKey } from '../invalidation.js';
import { CACHE_SCHEMA_VERSION, CACHE_DB_NAME, CACHE_STORE_NAME } from '../schema-version.js';

describe('deriveCacheKey', () => {
  it('produces a stable key for identical input', () => {
    const k1 = deriveCacheKey({ filePath: '/a.arxml', mtime: 100, contentHash: 'h1' });
    const k2 = deriveCacheKey({ filePath: '/a.arxml', mtime: 100, contentHash: 'h1' });
    expect(k1).toBe(k2);
  });

  it('different filePath → different key', () => {
    const k1 = deriveCacheKey({ filePath: '/a.arxml', mtime: 100, contentHash: 'h1' });
    const k2 = deriveCacheKey({ filePath: '/b.arxml', mtime: 100, contentHash: 'h1' });
    expect(k1).not.toBe(k2);
  });

  it('different mtime → different key (file edited → invalidate)', () => {
    const k1 = deriveCacheKey({ filePath: '/a.arxml', mtime: 100, contentHash: 'h1' });
    const k2 = deriveCacheKey({ filePath: '/a.arxml', mtime: 101, contentHash: 'h1' });
    expect(k1).not.toBe(k2);
  });

  it('different contentHash → different key (content changed → invalidate)', () => {
    const k1 = deriveCacheKey({ filePath: '/a.arxml', mtime: 100, contentHash: 'h1' });
    const k2 = deriveCacheKey({ filePath: '/a.arxml', mtime: 100, contentHash: 'h2' });
    expect(k1).not.toBe(k2);
  });

  it('encodes schema version in the key (so a version bump invalidates all entries)', () => {
    const k = deriveCacheKey({ filePath: '/a.arxml', mtime: 100, contentHash: 'h1' });
    expect(k).toContain(`v=${CACHE_SCHEMA_VERSION}`);
  });
});

describe('computeContentHash', () => {
  it('produces a hex string of consistent length', () => {
    const hash = computeContentHash('hello');
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('same input → same hash', () => {
    expect(computeContentHash('hello')).toBe(computeContentHash('hello'));
  });

  it('different input → different hash', () => {
    expect(computeContentHash('hello')).not.toBe(computeContentHash('world'));
  });

  it('handles Buffer input', () => {
    const fromStr = computeContentHash('hello');
    const fromBuf = computeContentHash(Buffer.from('hello'));
    expect(fromBuf).toBe(fromStr);
  });
});

describe('schema-version constants', () => {
  it('exports stable names + version', () => {
    expect(CACHE_DB_NAME).toBe('claude-autosarcfg-arxml-stream');
    expect(CACHE_STORE_NAME).toBe('normalized-documents');
    expect(CACHE_SCHEMA_VERSION).toBe(1);
  });
});