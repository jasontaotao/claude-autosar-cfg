// Sprint 14 ECUC ARXML Import — core data contracts.
//
// Pure types + type guards. Zero runtime dependencies. Lives under core/
// so renderer and main can both consume it without crossing the IPC
// boundary. Every shape here is immutable (readonly fields + readonly
// arrays) per project CLAUDE.md immutability rules.
//
// Design source: docs/superpowers/specs/2026-06-18-ecuc-arxml-import-design.md
//   - §6.2 → ImportResolution / ModuleSelection / ModuleResolution /
//     ImportSession / ImportPatch / ImportPatchOp
//   - §7.2 → ImportError (8-kind union)
//   - §5.4 → viewMode (3-state machine, see useArxmlStore)

import type { ArxmlContainer, ArxmlDocument, ArxmlModule } from '../arxml/types.js';

// ---------------------------------------------------------------------------
// Union constants — exported so tests + callers can iterate the enum.
// ---------------------------------------------------------------------------

/**
 * Per-module decision for an incoming ECUC module colliding with the
 * target document. Spec §6.2.
 *
 *  - `keep-existing` — do not import; target module stays as-is
 *  - `overwrite`     — incoming replaces target (default for collisions)
 *  - `keep-both`     — both copies retained; incoming gets a `_imported` suffix
 *  - `skip`          — exclude this module from the import (not even a copy)
 */
export const IMPORT_RESOLUTIONS = [
  'keep-existing',
  'overwrite',
  'keep-both',
  'skip',
] as const;
export type ImportResolution = (typeof IMPORT_RESOLUTIONS)[number];

/**
 * Patch operation kinds dispatched by `applyPatchesToDocument`. Spec §6.2.
 * The 4 variants are the source of truth for what an ImportPatch can carry.
 */
export const IMPORT_PATCH_OP_KINDS = [
  'add-module',
  'merge-into-module',
  'overwrite-module',
  'rename-incoming',
] as const;

/**
 * Error union for the import flow. Spec §7.2 — exactly 8 kinds.
 * `importSession` actions return `Result<T, ImportError>` so callers
 * branch exhaustively via `isImportErrorKind(err, 'kind')`.
 */
export const IMPORT_ERROR_KINDS = [
  'read-failed',
  'parse-failed',
  'diff-failed',
  'patch-apply-failed',
  'multiplicity-exceeded',
  'no-modules-selected',
  'view-mode-locked',
  'mixed-versions',
] as const;

// ---------------------------------------------------------------------------
// Union types
// ---------------------------------------------------------------------------

export type ImportError =
  | { readonly kind: 'read-failed'; readonly path: string; readonly message: string }
  | { readonly kind: 'parse-failed'; readonly path: string; readonly message: string }
  | {
      readonly kind: 'diff-failed';
      readonly mergedModulePath: string;
      readonly message: string;
    }
  | {
      readonly kind: 'patch-apply-failed';
      readonly sourceFile: string;
      readonly moduleShortName: string;
      readonly message: string;
    }
  | {
      readonly kind: 'multiplicity-exceeded';
      readonly sourceFile: string;
      readonly containerPath: string;
      readonly limit: number;
    }
  | { readonly kind: 'no-modules-selected' }
  | { readonly kind: 'view-mode-locked'; readonly currentViewMode: 'import-merged' }
  | {
      readonly kind: 'mixed-versions';
      readonly targetVersion: string;
      readonly incomingVersions: readonly string[];
    };

/**
 * Patch op union — spec §6.2. The 4 kinds map to distinct application
 * paths inside `applyPatchesToDocument`. New kinds must NOT be added
 * without spec review; the `isImportPatchOp` guard uses an exhaustive
 * discriminator over the closed set.
 */
export type ImportPatchOp =
  | { readonly kind: 'add-module'; readonly module: ArxmlModule }
  | {
      readonly kind: 'merge-into-module';
      readonly moduleShortName: string;
      readonly additions: readonly ArxmlContainer[];
    }
  | {
      readonly kind: 'overwrite-module';
      readonly moduleShortName: string;
      readonly replacement: ArxmlModule;
    }
  | {
      readonly kind: 'rename-incoming';
      readonly originalShortName: string;
      readonly newShortName: string;
    };

// ---------------------------------------------------------------------------
// Session / selection / resolution models
// ---------------------------------------------------------------------------

/**
 * One row in the ModuleSelectionPanel list. `mergedModulePath` is the
 * virtual path used by the merged view: `/[import:N]/<pkg-path>/<module>`.
 * `collidesWithTarget` flips true when a same-named module already
 * exists in any of the target documents; the UI then renders the
 * "exists" badge and the resolution radio is required before commit.
 */
export interface ModuleSelection {
  readonly mergedModulePath: string;
  readonly sourceDocIndex: number;
  readonly moduleShortName: string;
  readonly selected: boolean;
  readonly collidesWithTarget: boolean;
  /** Path inside the target doc tree (or null when no collision). */
  readonly targetModulePath: string | null;
}

/**
 * Per-module decision in the resolution map. `containerResolutions`
 * is set when the user opened the DiffTable and overrode the
 * container-level decisions (default = inherit `resolution`).
 */
export interface ModuleResolution {
  readonly mergedModulePath: string;
  readonly resolution: ImportResolution;
  readonly containerResolutions?: ReadonlyMap<string, ImportResolution>;
}

/**
 * Full state for a running import session. Owned by `useArxmlStore`;
 * core/import/* modules consume snapshots of this shape and return
 * patches / diffs. `incomingDocs` is never mutated — patches compile
 * into new ArxmlDocument values (spec §7.3 all-or-nothing).
 *
 * `undoStack` is a ≤20-step history of the `resolutions` array,
 * one snapshot per `resolveModule` call. Popped by `undoInternal`
 * (pre-commit only). Cleared on `cancelImport` / `commitImport`.
 */
export interface ImportSession {
  readonly id: string;
  readonly incomingDocs: readonly ArxmlDocument[];
  readonly originalPaths: readonly string[];
  readonly selections: readonly ModuleSelection[];
  readonly resolutions: readonly ModuleResolution[];
  readonly activeModuleForDiff: string | null;
  readonly createdAt: number;
  readonly undoStack: readonly (readonly ModuleResolution[])[];
}

// ---------------------------------------------------------------------------
// Patch / diff contracts
// ---------------------------------------------------------------------------

/** One source-file worth of patch operations. */
export interface ImportPatch {
  readonly sourceFile: string;
  readonly ops: readonly ImportPatchOp[];
}

/**
 * One row of a container-level diff between existing and incoming
 * modules. `existing` / `incoming` may be null when only one side
 * has the container at that path. `resolution` is the user's per-row
 * decision (defaults to `keep-existing` when only existing exists,
 * `overwrite` when only incoming exists, or `overwrite` on collision).
 */
export interface ContainerDiff {
  readonly path: string;
  readonly existing: ArxmlContainer | null;
  readonly incoming: ArxmlContainer | null;
  readonly resolution: ImportResolution;
}

/** One parameter value difference inside a ContainerDiff. */
export interface ParamOverride {
  readonly path: string;
  readonly param: string;
  readonly existingValue: string | number | boolean | null;
  readonly incomingValue: string | number | boolean | null;
}

/**
 * Full diff between target and incoming for a single module. `containers`
 * enumerates every container path that appears on either side; references
 * and paramOverrides carry the rest. `moduleShortName` is the
 * canonical key (`<MODULE-NAME>`) used by all downstream patch ops.
 */
export interface ModuleDiff {
  readonly moduleShortName: string;
  readonly containers: readonly ContainerDiff[];
  readonly references: readonly string[];
  readonly paramOverrides: readonly ParamOverride[];
}

/**
 * Merged-view representation. `mergedModules` mirrors the panel
 * checklist; `targetDocuments` is the original (immutable) set;
 * `originalIncomingDocs` keeps the un-edited source for round-trip
 * back-out via undoLastCommit.
 */
export interface MergedView {
  readonly targetDocuments: readonly ArxmlDocument[];
  readonly mergedModules: readonly MergedModule[];
  readonly originalIncomingDocs: readonly ArxmlDocument[];
}

export interface MergedModule {
  readonly mergedModulePath: string;
  readonly sourceDocIndex: number;
  readonly shortName: string;
  readonly selected: boolean;
  readonly collidesWithTarget: boolean;
  readonly targetModulePath: string | null;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/** Narrow an `unknown` to `ImportResolution`. */
export function isImportResolution(v: unknown): v is ImportResolution {
  return (
    typeof v === 'string' &&
    (IMPORT_RESOLUTIONS as readonly string[]).includes(v)
  );
}

/**
 * Narrow an `unknown` to `ImportPatchOp`. Validates the discriminator
 * AND the payload shape; e.g. `add-module` must carry a `module`
 * object, `rename-incoming` must carry string shortNames.
 */
export function isImportPatchOp(v: unknown): v is ImportPatchOp {
  if (v === null || typeof v !== 'object') return false;
  const o = v as { kind?: unknown };
  switch (o.kind) {
    case 'add-module':
      return typeof (v as { module?: unknown }).module === 'object';
    case 'merge-into-module':
      return (
        typeof (v as { moduleShortName?: unknown }).moduleShortName === 'string' &&
        Array.isArray((v as { additions?: unknown }).additions)
      );
    case 'overwrite-module':
      return (
        typeof (v as { moduleShortName?: unknown }).moduleShortName === 'string' &&
        typeof (v as { replacement?: unknown }).replacement === 'object'
      );
    case 'rename-incoming':
      return (
        typeof (v as { originalShortName?: unknown }).originalShortName === 'string' &&
        typeof (v as { newShortName?: unknown }).newShortName === 'string'
      );
    default:
      return false;
  }
}

/** Narrow an `unknown` to `ImportError`. Exhaustive over the 8-kind union. */
export function isImportError(v: unknown): v is ImportError {
  if (v === null || typeof v !== 'object') return false;
  const k = (v as { kind?: unknown }).kind;
  switch (k) {
    case 'read-failed': {
      const o = v as { path?: unknown; message?: unknown };
      return typeof o.path === 'string' && typeof o.message === 'string';
    }
    case 'parse-failed': {
      const o = v as { path?: unknown; message?: unknown };
      return typeof o.path === 'string' && typeof o.message === 'string';
    }
    case 'diff-failed': {
      const o = v as { mergedModulePath?: unknown; message?: unknown };
      return typeof o.mergedModulePath === 'string' && typeof o.message === 'string';
    }
    case 'patch-apply-failed': {
      const o = v as {
        sourceFile?: unknown;
        moduleShortName?: unknown;
        message?: unknown;
      };
      return (
        typeof o.sourceFile === 'string' &&
        typeof o.moduleShortName === 'string' &&
        typeof o.message === 'string'
      );
    }
    case 'multiplicity-exceeded': {
      const o = v as { sourceFile?: unknown; containerPath?: unknown; limit?: unknown };
      return (
        typeof o.sourceFile === 'string' &&
        typeof o.containerPath === 'string' &&
        typeof o.limit === 'number'
      );
    }
    case 'no-modules-selected':
      return true;
    case 'view-mode-locked': {
      const o = v as { currentViewMode?: unknown };
      return o.currentViewMode === 'import-merged';
    }
    case 'mixed-versions': {
      const o = v as { targetVersion?: unknown; incomingVersions?: unknown };
      return (
        typeof o.targetVersion === 'string' &&
        Array.isArray(o.incomingVersions) &&
        o.incomingVersions.every((x) => typeof x === 'string')
      );
    }
    default:
      return false;
  }
}

/**
 * Narrow an `ImportError` to one of its variants by kind. Useful in
 * exhaustive `switch` over an ImportError return value:
 *
 * ```ts
 * switch (err.kind) {
 *   case 'read-failed': ...
 *   ...
 *   default: assertNever(err);
 * }
 * ```
 */
export function isImportErrorKind<K extends ImportError['kind']>(
  e: ImportError,
  kind: K,
): e is Extract<ImportError, { kind: K }> {
  return e.kind === kind;
}
