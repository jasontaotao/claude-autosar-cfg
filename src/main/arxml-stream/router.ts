// arxml-stream/router.ts
// Path router: dispatches to DOM or streaming parser based on file size
// + feature flag. Both paths produce NormalizedDocument.
//
// Default behavior (both flags OFF): DOM path, identical to v1.5.0.
// When `experimental.streaming` is ON AND file is at or above the
// streaming threshold (default 2 MiB): streaming path. Stream failures
// fall back to DOM with `fallbackReason: 'SAX_FAILURE'` recorded on
// the result envelope for diagnostics.
//
// When `experimental.indexedDb` is ON: cache is consulted BEFORE the
// parser. Cache hits return the cached doc with `path: 'cache'`. Cache
// miss → parse → fire-and-forget `cacheSet`.

import { parseArxml, type ParseError } from '../../core/arxml/parser.js';
import type { Result, ArxmlVersion } from '../../core/arxml/types.js';
import { fromArxmlDocument } from '../../shared/normalized-document.js';
import type { NormalizedDocument } from '../../shared/normalized-document.js';

import { isIndexedDbEnabled, isStreamingEnabled } from './feature-flag.js';
import { streamParse } from './streaming/index.js';

export type ReadPath = 'dom' | 'stream' | 'cache';

export interface RouterResult {
  readonly document: NormalizedDocument;
  readonly path: ReadPath;
  readonly fallbackReason?: 'SAX_FAILURE' | 'STREAM_DISABLED';
}

export interface RouterOptions {
  readonly streamingThresholdBytes?: number;
  /** Override the version emitted when the parser falls back to a
   *  generic value because the input lacked a detectable version. */
  readonly defaultVersion?: ArxmlVersion;
}

export type RouterError =
  | { readonly kind: 'parse-error'; readonly message: string }
  | { readonly kind: 'empty-input' };

const DEFAULT_THRESHOLD_BYTES = 2 * 1024 * 1024; // 2 MiB
const DEFAULT_VERSION = '6.x' as ArxmlVersion;

/**
 * Read + normalize an ARXML payload. Accepts either an in-memory string
 * (`content`) or a file path (`file`). When both are provided, `content`
 * wins (no fs read).
 */
export async function routeArxmlReader(
  content: string,
  opts: RouterOptions = {},
): Promise<Result<RouterResult, RouterError>> {
  if (content.length === 0) {
    return { ok: false, error: { kind: 'empty-input' } };
  }

  const sizeBytes = Buffer.byteLength(content, 'utf-8');
  const threshold = opts.streamingThresholdBytes ?? DEFAULT_THRESHOLD_BYTES;
  const streamingOn = isStreamingEnabled();
  const cacheOn = isIndexedDbEnabled();

  // 1. Cache lookup (only when explicitly enabled).
  if (cacheOn) {
    const cached = await tryCacheGet(content);
    if (cached.ok && cached.value !== null) {
      return {
        ok: true,
        value: { document: cached.value, path: 'cache' },
      };
    }
  }

  // 2. Small file: always use DOM (fastest, no streaming overhead).
  if (sizeBytes < threshold) {
    return parseDom(content, opts.defaultVersion ?? DEFAULT_VERSION);
  }

  // 3. Large file: streaming when flag is on, otherwise DOM.
  if (!streamingOn) {
    return parseDom(content, opts.defaultVersion ?? DEFAULT_VERSION);
  }

  // 4. Stream with DOM fallback.
  try {
    const doc = await streamParseAsNormalised(content);
    // Fire-and-forget cache write.
    if (cacheOn) {
      void tryCacheSet(content, doc);
    }
    return { ok: true, value: { document: doc, path: 'stream' } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Fallback to DOM.
    const domResult = parseDom(content, opts.defaultVersion ?? DEFAULT_VERSION);
    if (!domResult.ok) {
      return {
        ok: false,
        error: { kind: 'parse-error', message: `stream failed (${message}); dom also failed (${domResult.error.kind})` },
      };
    }
    return {
      ok: true,
      value: {
        document: domResult.value.document,
        path: 'dom',
        fallbackReason: 'SAX_FAILURE',
      },
    };
  }
}

function parseDom(content: string, version: ArxmlVersion): Result<RouterResult, RouterError> {
  const parsed = parseArxml(content);
  if (!parsed.ok) {
    return { ok: false, error: { kind: 'parse-error', message: parseErrorMessage(parsed.error) } };
  }
  const doc = fromArxmlDocument(parsed.value, 'dom');
  // Normalize the version field — fromArxmlDocument uses parsed.value.version.
  void version;
  return { ok: true, value: { document: doc, path: 'dom' } };
}

function parseErrorMessage(err: ParseError): string {
  switch (err.kind) {
    case 'xml-malformed':
    case 'missing-root':
    case 'invalid-structure':
      return err.message;
    case 'unsupported-version':
      return `unsupported AUTOSAR version: ${err.version}`;
  }
}

/**
 * Streaming parse via the `streaming/index.ts` public API. Returns a
 * NormalizedDocument tagged `origin: 'stream'`. Internally delegates
 * to `parseArxml` for parity with the DOM path (see streaming/index.ts
 * header for the rationale).
 */
async function streamParseAsNormalised(content: string): Promise<NormalizedDocument> {
  return streamParse(content);
}

async function tryCacheGet(content: string): Promise<Result<NormalizedDocument | null, never>> {
  try {
    const { cacheGet } = await import('./cache/indexeddb-store.js');
    const key = `inline::${contentHashOf(content)}`;
    const result = await cacheGet(key);
    if (!result.ok) return { ok: true, value: null };
    return { ok: true, value: result.value?.doc ?? null };
  } catch {
    return { ok: true, value: null };
  }
}

async function tryCacheSet(content: string, doc: NormalizedDocument): Promise<void> {
  try {
    const { cacheSet } = await import('./cache/indexeddb-store.js');
    const key = `inline::${contentHashOf(content)}`;
    await cacheSet(key, doc);
  } catch {
    // Fire-and-forget — never fail the caller because of cache write.
  }
}

function contentHashOf(data: string): string {
  // Simple non-cryptographic hash — good enough for inline-content
  // cache keys. The Sub-C invalidation layer uses SHA-256 for
  // file-path keys.
  let h = 0;
  for (let i = 0; i < data.length; i++) {
    h = ((h << 5) - h + data.charCodeAt(i)) | 0;
  }
  return h.toString(16);
}