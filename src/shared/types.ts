import type { ParseError } from '../core/arxml/parser.js';
import type { SerializeError } from '../core/arxml/serializer.js';
import type {
  ArxmlDocument,
  ArxmlElement,
  ArxmlVersion,
  Result,
} from '../core/arxml/types.js';

export interface AppInfo {
  readonly name: string;
  readonly version: string;
  readonly coreVersion: string;
  readonly electronVersion: string;
  readonly nodeVersion: string;
  readonly platform: NodeJS.Platform;
}

export interface PingResponse {
  readonly ok: boolean;
  readonly ts: number;
}

// Result envelope is defined in core/arxml/types.ts and re-exported here
// to preserve the core → shared layer direction (shared consumes core, not vice versa).
export type { Result };

// --- F1 ARXML IO types -----------------------------------------------------

export type FileError =
  | { readonly kind: 'read-failed'; readonly message: string }
  | { readonly kind: 'write-failed'; readonly message: string }
  | { readonly kind: 'dialog-failed'; readonly message: string };

export interface OpenArxmlResult {
  readonly canceled: boolean;
  readonly path?: string;
  readonly content?: string;
}

export interface SaveArxmlResult {
  readonly canceled: boolean;
  readonly path?: string;
}

export interface ParseArxmlRequest {
  readonly path: string;
  readonly content: string;
}

export type ParseArxmlResponse = Result<ArxmlDocument, ParseError>;

export interface SaveArxmlRequest {
  readonly doc: ArxmlDocument;
  readonly defaultName?: string;
}

export type SaveArxmlResponse = Result<SaveArxmlResult, FileError>;

export type { ArxmlVersion, ArxmlDocument, ArxmlElement, ParseError, SerializeError };