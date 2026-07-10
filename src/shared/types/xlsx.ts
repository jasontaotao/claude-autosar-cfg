// ---------------------------------------------------------------------------
// v1.25.0 — Excel → Com-Stack ECUC batch import types
// ---------------------------------------------------------------------------

/**
 * One row of one sheet in the user's `.xlsx`. Rows are typed against the
 * SPEC's sheet name → ECUC parent path table (see design §Architecture).
 * `params` carries every `param:<NAME>=value` column as a flat record.
 */
export interface EcucInstanceRow {
  readonly sheet: 'ComIPdu' | 'ComSignal' | 'CanIfTxPdu' | 'CanIfRxPdu' | 'PduRRoutingPath';
  readonly shortName: string;
  readonly definitionRef?: string;
  readonly params: Readonly<Record<string, string | number | boolean | null>>;
}

// IPC #1: xlsx:parseBatch — parse `.xlsx` and report per-row collisions.
export interface XlsxParseBatchRequest {
  readonly projectManifestPath: string;
  readonly xlsxBytes: Uint8Array;
}
export type XlsxParseBatchResponse =
  | {
      readonly ok: true;
      readonly value: {
        readonly instances: readonly EcucInstanceRow[];
        /** Key format: `<sheet>:<shortName>` — matches `resolutions` map below. */
        readonly collisions: Readonly<Record<string, boolean>>;
      };
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly kind: 'read-failed' | 'parse-failed' | 'no-module-def';
        readonly message: string;
      };
    };

// IPC #2: xlsx:writeBatchTemplate — emit a per-project starter .xlsx.
export interface XlsxWriteBatchTemplateRequest {
  readonly projectManifestPath: string;
}
export type XlsxWriteBatchTemplateResponse =
  | { readonly ok: true; readonly value: { readonly xlsxBytes: Uint8Array } }
  | {
      readonly ok: false;
      readonly error: { readonly kind: 'read-failed' | 'parse-failed'; readonly message: string };
    };

// IPC #3: xlsx:commitBatch — apply patches + atomic 3-file write.
export interface XlsxCommitBatchRequest {
  readonly projectManifestPath: string;
  readonly instances: readonly EcucInstanceRow[];
  /** Per-collision-row decision. Key: `<sheet>:<shortName>` (same as ParseResponse.collisions). */
  readonly resolutions: Readonly<Record<string, 'overwrite' | 'skip'>>;
}
export type XlsxCommitBatchResponse =
  | {
      readonly ok: true;
      readonly value: {
        readonly added: number;
        readonly overwritten: number;
        readonly skipped: number;
        readonly perFile: Readonly<Record<'Com' | 'CanIf' | 'PduR', number>>;
      };
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly kind: 'read-failed' | 'parse-failed' | 'bridge-failed' | 'write-failed';
        readonly message: string;
      };
    };
