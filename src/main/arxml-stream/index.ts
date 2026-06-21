// arxml-stream/index.ts
// Public surface for the arxml-stream sub-path.

export { isStreamingEnabled, isIndexedDbEnabled, readFlags } from './feature-flag.js';
export { routeArxmlReader } from './router.js';
export type { RouterResult, RouterOptions, ReadPath, RouterError } from './router.js';
export { streamParse } from './streaming/index.js';
export { cacheGet, cacheSet } from './cache/indexeddb-store.js';
export type { CacheRecord, CacheError } from './cache/indexeddb-store.js';