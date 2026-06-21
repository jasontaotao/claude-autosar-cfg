// src/renderer/store/helpers/importHelpers.ts
// Sprint 14 — ImportSession helpers. Pure — no store closure.
// Extracted from useArxmlStore.ts in PR(5).

import type { ArxmlDocument, ArxmlElement, ArxmlModule } from '@core/arxml/types';
import type { ImportPatchOp } from '@core/import/types.js';

/**
 * `collectModules` walks an ArxmlElement subtree and yields every
 * module (used by `startImport` to enumerate incoming modules for the
 * ModuleSelectionPanel list).
 */
export function collectModules(el: ArxmlElement, visit: (m: ArxmlModule) => void): void {
  if (el.kind === 'module') {
    visit(el);
    return;
  }
  if (el.kind === 'container') {
    for (const c of el.children) collectModules(c, visit);
  }
}

/**
 * `findTargetModuleForShortName` searches the loaded target documents
 * for a module with the given shortName and returns its path inside
 * the first matching document (or null when no collision exists).
 */
export function findTargetModuleForShortName(
  documents: readonly ArxmlDocument[],
  shortName: string,
): string | null {
  for (const doc of documents) {
    for (const pkg of doc.packages) {
      for (const el of pkg.elements) {
        let foundPath: string | null = null;
        collectModules(el, (m) => {
          if (m.shortName === shortName && foundPath === null) {
            foundPath = `${pkg.path}/${m.shortName}`;
          }
          return undefined;
        });
        if (foundPath !== null) return foundPath;
      }
    }
  }
  return null;
}

/**
 * Given a `targetModulePath` like `/EAS/Can` and the parallel
 * documents/documentPaths arrays, return the filePath of the
 * document that owns that module. Returns null when the path can't
 * be located. Used by `commitImport` to route merge/overwrite
 * ops to the right target file when a module collides across
 * loaded documents.
 */
export function findOwningTargetPath(
  documents: readonly ArxmlDocument[],
  documentPaths: readonly string[],
  targetModulePath: string,
): string | null {
  const segments = targetModulePath.split('/').filter(Boolean);
  for (let i = 0; i < documents.length; i += 1) {
    const doc = documents[i]!;
    for (const pkg of doc.packages) {
      if (pkg.shortName !== segments[0]) continue;
      if (segments.length === 2) {
        for (const el of pkg.elements) {
          if (el.kind === 'module' && el.shortName === segments[1]) {
            return documentPaths[i] ?? null;
          }
        }
      }
    }
  }
  return null;
}

/**
 * True when the given patch op targets a module with `shortName`.
 * Used by `commitImport` to split the compiled patch list per
 * selection. rename-incoming is matched on its `originalShortName`
 * — the rename is paired with the next add-module that carries
 * the new name, so capturing the originalShortName pulls both
 * ops together.
 */
export function opTargetsModule(op: ImportPatchOp, shortName: string): boolean {
  switch (op.kind) {
    case 'add-module':
      return op.module.shortName === shortName;
    case 'merge-into-module':
    case 'overwrite-module':
      return op.moduleShortName === shortName;
    case 'rename-incoming':
      return op.originalShortName === shortName;
  }
}
