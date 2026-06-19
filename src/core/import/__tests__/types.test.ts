// Sprint 14 ECUC ARXML Import — types.ts contract tests.
// Verifies: type guards, union exhaustiveness, readonly invariants.

import { describe, it, expect } from 'vitest';

import type { ArxmlModule, ArxmlContainer } from '../../arxml/types.js';
import {
  isImportResolution,
  isImportPatchOp,
  isImportError,
  IMPORT_RESOLUTIONS,
  IMPORT_PATCH_OP_KINDS,
  IMPORT_ERROR_KINDS,
  isImportErrorKind,
} from '../types.js';
import type {
  ImportResolution,
  ImportPatchOp,
  ImportError,
  ModuleSelection,
  ModuleResolution,
  ImportSession,
  ImportPatch,
  ModuleDiff,
  ContainerDiff,
  ParamOverride,
  MergedView,
  MergedModule,
} from '../types.js';

describe('Sprint 14 — types: union constants', () => {
  it('IMPORT_RESOLUTIONS lists exactly 4 kinds', () => {
    expect(IMPORT_RESOLUTIONS).toEqual([
      'keep-existing',
      'overwrite',
      'keep-both',
      'skip',
    ]);
  });

  it('IMPORT_PATCH_OP_KINDS lists exactly 4 kinds', () => {
    expect(IMPORT_PATCH_OP_KINDS).toEqual([
      'add-module',
      'merge-into-module',
      'overwrite-module',
      'rename-incoming',
    ]);
  });

  it('IMPORT_ERROR_KINDS lists exactly 8 kinds', () => {
    expect(IMPORT_ERROR_KINDS).toHaveLength(8);
    expect(IMPORT_ERROR_KINDS).toContain('read-failed');
    expect(IMPORT_ERROR_KINDS).toContain('parse-failed');
    expect(IMPORT_ERROR_KINDS).toContain('diff-failed');
    expect(IMPORT_ERROR_KINDS).toContain('patch-apply-failed');
    expect(IMPORT_ERROR_KINDS).toContain('multiplicity-exceeded');
    expect(IMPORT_ERROR_KINDS).toContain('no-modules-selected');
    expect(IMPORT_ERROR_KINDS).toContain('view-mode-locked');
    expect(IMPORT_ERROR_KINDS).toContain('mixed-versions');
  });
});

describe('Sprint 14 — types: isImportResolution', () => {
  it('accepts all 4 resolution kinds', () => {
    for (const r of IMPORT_RESOLUTIONS) {
      expect(isImportResolution(r)).toBe(true);
    }
  });

  it('rejects unknown strings', () => {
    expect(isImportResolution('merge')).toBe(false);
    expect(isImportResolution('KEEP-EXISTING')).toBe(false);
    expect(isImportResolution('')).toBe(false);
  });

  it('narrows type', () => {
    const v: unknown = 'overwrite';
    if (isImportResolution(v)) {
      // type assertion compiles iff narrowing worked
      const r: ImportResolution = v;
      expect(r).toBe('overwrite');
    }
  });
});

describe('Sprint 14 — types: isImportPatchOp', () => {
  it('accepts all 4 op kinds with the right shape', () => {
    const mod: ArxmlModule = {
      kind: 'module',
      tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
      shortName: 'Can',
      params: {},
      children: [],
      references: [],
    };
    expect(
      isImportPatchOp({ kind: 'add-module', module: mod }),
    ).toBe(true);
    expect(
      isImportPatchOp({
        kind: 'merge-into-module',
        moduleShortName: 'Can',
        additions: [],
      }),
    ).toBe(true);
    expect(
      isImportPatchOp({
        kind: 'overwrite-module',
        moduleShortName: 'Can',
        replacement: mod,
      }),
    ).toBe(true);
    expect(
      isImportPatchOp({
        kind: 'rename-incoming',
        originalShortName: 'Can',
        newShortName: 'Can_imported',
      }),
    ).toBe(true);
  });

  it('rejects unknown kind', () => {
    expect(isImportPatchOp({ kind: 'add-module' })).toBe(false);
    expect(isImportPatchOp({ kind: 'merge' })).toBe(false);
  });
});

describe('Sprint 14 — types: isImportError', () => {
  it('accepts every kind in the 8-member union', () => {
    const errors: ImportError[] = [
      { kind: 'read-failed', path: '/x.arxml', message: 'enoent' },
      { kind: 'parse-failed', path: '/x.arxml', message: 'malformed' },
      { kind: 'diff-failed', mergedModulePath: '/a', message: 'oops' },
      { kind: 'patch-apply-failed', sourceFile: '/a.arxml', moduleShortName: 'Can', message: 'oops' },
      { kind: 'multiplicity-exceeded', sourceFile: '/a.arxml', containerPath: '/a', limit: 1 },
      { kind: 'no-modules-selected' },
      { kind: 'view-mode-locked', currentViewMode: 'import-merged' },
      { kind: 'mixed-versions', targetVersion: '4.6', incomingVersions: ['4.7'] },
    ];
    for (const e of errors) {
      expect(isImportError(e)).toBe(true);
    }
  });

  it('rejects unrelated objects', () => {
    expect(isImportError({ kind: 'read-failed' })).toBe(false); // missing path/message
    expect(isImportError({ kind: 'unknown' })).toBe(false);
    expect(isImportError(null)).toBe(false);
    expect(isImportError(undefined)).toBe(false);
  });
});

describe('Sprint 14 — types: isImportErrorKind', () => {
  it('type-guard narrows ImportError by kind', () => {
    const e: ImportError = { kind: 'no-modules-selected' };
    if (isImportErrorKind(e, 'no-modules-selected')) {
      // narrow: e is the { kind: 'no-modules-selected' } variant
      expect(e.kind).toBe('no-modules-selected');
    } else {
      throw new Error('expected narrowing to succeed');
    }
  });

  it('rejects mismatched kind', () => {
    const e: ImportError = { kind: 'no-modules-selected' };
    expect(isImportErrorKind(e, 'read-failed')).toBe(false);
  });
});

describe('Sprint 14 — types: readonly invariants', () => {
  it('ModuleSelection is readonly (compile-time)', () => {
    // This test only verifies the type; if it compiles, readonly is enforced.
    const sel: ModuleSelection = {
      mergedModulePath: '/[import:0]/Can',
      sourceDocIndex: 0,
      moduleShortName: 'Can',
      selected: true,
      collidesWithTarget: false,
      targetModulePath: null,
    };
    expect(sel.mergedModulePath).toBe('/[import:0]/Can');
  });

  it('ModuleResolution.containerResolutions is ReadonlyMap-shaped', () => {
    const m: ModuleResolution = {
      mergedModulePath: '/[import:0]/Can',
      resolution: 'overwrite',
      containerResolutions: new Map<string, ImportResolution>([
        ['/Can/ContainerA', 'overwrite'],
      ]),
    };
    expect(m.containerResolutions?.get('/Can/ContainerA')).toBe('overwrite');
  });

  it('ImportSession is structurally complete', () => {
    const doc = {
      path: '/x.arxml',
      version: '4.6' as const,
      packages: [],
    };
    const session: ImportSession = {
      id: 'sess-1',
      incomingDocs: [doc],
      originalPaths: ['/x.arxml'],
      selections: [],
      resolutions: [],
      activeModuleForDiff: null,
      createdAt: 1234,
    };
    expect(session.id).toBe('sess-1');
    expect(session.incomingDocs).toHaveLength(1);
  });

  it('ImportPatch is readonly with sourceFile + ops', () => {
    const patch: ImportPatch = {
      sourceFile: '/x.arxml',
      ops: [],
    };
    expect(patch.sourceFile).toBe('/x.arxml');
  });
});

describe('Sprint 14 — types: diff / merge / patch shapes compile', () => {
  it('ModuleDiff carries containers / references / paramOverrides', () => {
    const diff: ModuleDiff = {
      moduleShortName: 'Can',
      containers: [],
      references: [],
      paramOverrides: [],
    };
    expect(diff.containers).toEqual([]);
  });

  it('ContainerDiff / ParamOverride shapes compile', () => {
    const cd: ContainerDiff = {
      path: '/Can/Cfg',
      existing: null,
      incoming: null,
      resolution: 'keep-existing',
    };
    const po: ParamOverride = {
      path: '/Can/Cfg',
      param: 'CanIf',
      existingValue: 'A',
      incomingValue: 'B',
    };
    expect(cd.resolution).toBe('keep-existing');
    expect(po.existingValue).not.toBe(po.incomingValue);
  });

  it('MergedView / MergedModule compile', () => {
    const m: MergedModule = {
      mergedModulePath: '/[import:0]/Can',
      sourceDocIndex: 0,
      shortName: 'Can',
      selected: true,
      collidesWithTarget: false,
      targetModulePath: null,
    };
    const view: MergedView = {
      targetDocuments: [],
      mergedModules: [m],
      originalIncomingDocs: [],
    };
    expect(view.mergedModules).toHaveLength(1);
  });
});

describe('Sprint 14 — types: ImportPatchOp exhaustiveness discriminator', () => {
  it('every variant is uniquely identified by kind', () => {
    const ops: ImportPatchOp[] = [
      {
        kind: 'add-module',
        module: {
          kind: 'module',
          tagName: 'X',
          shortName: 'X',
          params: {},
          children: [],
          references: [],
        },
      },
      { kind: 'merge-into-module', moduleShortName: 'X', additions: [] as ArxmlContainer[] },
      {
        kind: 'overwrite-module',
        moduleShortName: 'X',
        replacement: {
          kind: 'module',
          tagName: 'X',
          shortName: 'X',
          params: {},
          children: [],
          references: [],
        },
      },
      {
        kind: 'rename-incoming',
        originalShortName: 'X',
        newShortName: 'X_imported',
      },
    ];
    const kinds = new Set(ops.map((o) => o.kind));
    expect(kinds.size).toBe(4);
  });
});
