// arxml-stream/cache/schema-version.ts
// Bump CACHE_SCHEMA_VERSION when the NormalizedDocument shape changes
// in a way that invalidates stored records. Old records are silently
// evicted on load by `indexeddb-store.ts`.

export const CACHE_SCHEMA_VERSION = 1 as const;
export const CACHE_DB_NAME = 'claude-autosarcfg-arxml-stream' as const;
export const CACHE_STORE_NAME = 'normalized-documents' as const;
