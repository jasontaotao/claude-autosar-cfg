// shared/types/save.ts
// SaveArxml IPC types. Split from `src/shared/types.ts` as part of
// v1.41.x PATCH T4 (file-size backlog).

import type { ArxmlDocument, Result } from '../../core/arxml/types.js';
import type { FileError, SaveArxmlResult } from './arxml.js';

export interface SaveArxmlRequest {
  readonly doc: ArxmlDocument;
  readonly defaultName?: string;
  /**
   * Sprint 16 — when present, the handler skips the OS save-as dialog
   * and writes directly to this path. Used by the renderer's "Save"
   * button after edit, where the document already has a known on-disk
   * location (loaded from project or generated via BSWMD-to-ECUC).
   * Empty string is treated as absent.
   */
  readonly currentPath?: string;
}

export type SaveArxmlResponse = Result<SaveArxmlResult, FileError>;

