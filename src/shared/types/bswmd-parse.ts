// --- Sprint 12 #1 — BSWMD parser IPC types ---------------------------------

import type { Result } from '../../core/arxml/types.js';
import type { BswmdDocument, BswmdError } from '../../core/project/bswmd.js';

/**
 * Request payload for `BSWMD_PARSE`. The renderer passes the raw XML
 * string (already read from disk by `project:open` — the handler does
 * NOT touch the filesystem). `path` is optional debug context.
 */
export interface ParseBswmdRequest {
  readonly content: string;
  readonly path?: string;
}

export type ParseBswmdResponse = Result<BswmdDocument, BswmdError>;
