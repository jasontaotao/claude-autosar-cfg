// Additive ODX full-import IPC DTOs. This file is intentionally separate
// from `odx.ts`: the viewer contract remains unchanged while the import
// wizard evolves independently.
import type { DimWarning } from '../../core/odx/dim.js';
import type { OdxVariantInfo } from '../../core/odx/odxDocument.js';

export type OdxImportModule = 'Dcm' | 'Dem';
export type OdxImportDecision = 'import' | 'keep-local' | 'delete';
export type OdxImportCategory =
  | 'added'
  | 'updated'
  | 'locally-modified'
  | 'conflict'
  | 'converged'
  | 'removed-in-odx';

export interface OdxImportPreviewRequest {
  readonly odxPath: string;
  readonly dirtyDocPaths: readonly string[];
  readonly variantId?: string;
}

export interface OdxImportRow {
  readonly path: string;
  readonly module: OdxImportModule;
  readonly shortName: string;
  readonly category: OdxImportCategory;
  readonly defaultDecision: OdxImportDecision;
  readonly conflictDetail?: { readonly localHash: string; readonly incomingHash: string };
}

export interface OdxImportPreviewStats {
  readonly services: number;
  readonly dids: number;
  readonly dtcs: number;
  readonly sessions: number;
  readonly securityLevels: number;
}

export interface OdxTargetModuleInfo {
  readonly exists: boolean;
  readonly docPath?: string;
  readonly dirty: boolean;
}

export interface OdxImportPreview {
  readonly variants: readonly OdxVariantInfo[];
  readonly selectedVariant?: OdxVariantInfo;
  readonly rows: readonly OdxImportRow[];
  readonly warnings: readonly DimWarning[];
  readonly previewHash: string;
  readonly stats: OdxImportPreviewStats;
  readonly targetModules: {
    readonly dcm: OdxTargetModuleInfo;
    readonly dem: OdxTargetModuleInfo;
  };
}

export type OdxImportPreviewResponse =
  | { readonly ok: true; readonly value: OdxImportPreview }
  | { readonly ok: false; readonly error: OdxImportError };

export interface OdxImportCommitRequest {
  readonly odxPath: string;
  readonly variantId: string;
  readonly dirtyDocPaths: readonly string[];
  readonly previewHash: string;
  readonly decisions: readonly {
    readonly path: string;
    readonly decision: OdxImportDecision;
  }[];
}

export interface OdxImportCommitValue {
  readonly applied: number;
  readonly kept: number;
  readonly deleted: number;
  readonly manifestPath: string;
}

export type OdxImportCommitResponse =
  | { readonly ok: true; readonly value: OdxImportCommitValue }
  | { readonly ok: false; readonly error: OdxImportError };

export type OdxImportError =
  | { readonly kind: 'read-failed' | 'odx-malformed' | 'odx-too-large'; readonly message: string }
  | {
      readonly kind: 'odx-no-variant' | 'odx-variant-not-found' | 'odx-inheritance-cycle';
      readonly message: string;
    }
  | {
      readonly kind: 'odx-bswmd-not-loaded';
      readonly module: OdxImportModule;
      readonly message: string;
    }
  | { readonly kind: 'odx-target-dirty'; readonly docPath: string; readonly message: string }
  | {
      readonly kind: 'odx-module-ambiguous';
      readonly module: OdxImportModule;
      readonly message: string;
    }
  | { readonly kind: 'odx-commit-mismatch'; readonly message: string }
  | { readonly kind: 'write-failed'; readonly message: string; readonly rolledBack: boolean };
