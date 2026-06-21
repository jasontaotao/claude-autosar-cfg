// arxml-stream/cache/invalidation.ts
// Cache key derivation. Key = (filePath, mtime, contentHash).
//
// - mtime change   → file edited → invalidate.
// - contentHash change → file content changed → invalidate.
// - filePath change → different file → invalidate.

import { createHash } from 'node:crypto';

export interface CacheKeyParts {
  readonly filePath: string;
  readonly mtime: number;
  readonly contentHash: string;
}

/** Stable, string-typed cache key derived from its parts. */
export function deriveCacheKey(parts: CacheKeyParts): string {
  return `${parts.filePath}::mtime=${parts.mtime}::sha=${parts.contentHash}::v=1`;
}

/** SHA-256 hex (first 32 chars) — used as the content-fingerprint half of the key. */
export function computeContentHash(data: string | Buffer | Uint8Array): string {
  const h = createHash('sha256').update(data).digest('hex');
  return h.slice(0, 32);
}
