import { describe, it, expect } from 'vitest';

import { MANIFEST_SCHEMA_VERSION } from '../../../shared/project.js';
import type { ProjectManifest } from '../../../shared/project.js';
import { loadManifest, saveManifest, validateManifest, createEmptyManifest } from '../manifest.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SAMPLE: ProjectManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  id: '0d4f3e2a-1b6c-4d8e-9f0a-1234567890ab',
  name: 'CanIf Test',
  valueArxmlPaths: ['./EcuC_EcuC.arxml', './Com_Com.arxml'],
  bswmdPaths: ['./CanIf_bswmd.arxml'],
  // Bug 3 — empty provenance map; round-trips through load/save as
  // the canonical "fresh project" shape.
  ecucSources: {},
  // Sprint 14 #1 — empty script library; round-trips through load/save
  // as the canonical "fresh project" shape.
  scripts: [],
};

// ---------------------------------------------------------------------------
// loadManifest
// ---------------------------------------------------------------------------

describe('loadManifest', () => {
  it('parses a well-formed manifest JSON', () => {
    // Arrange
    const json = JSON.stringify(SAMPLE);

    // Act
    const result = loadManifest(json);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(SAMPLE);
    }
  });

  it('rejects malformed JSON with json-parse error', () => {
    // Arrange
    const broken = '{ not valid json';

    // Act
    const result = loadManifest(broken);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      if (result.error.kind === 'json-parse') {
        expect(result.error.message).toBeTruthy();
      } else {
        expect.fail(`expected json-parse, got ${result.error.kind}`);
      }
    }
  });

  it('rejects a non-object root with invalid-shape error', () => {
    // Arrange
    const notAnObject = JSON.stringify(['array', 'not', 'object']);

    // Act
    const result = loadManifest(notAnObject);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid-shape');
    }
  });

  it('rejects missing required field (id) with invalid-shape error', () => {
    // Arrange — id missing
    const partial = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      name: 'no id',
      valueArxmlPaths: [],
      bswmdPaths: [],
    };

    // Act
    const result = loadManifest(JSON.stringify(partial));

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'invalid-shape') {
      expect(result.error.message).toContain('id');
    } else {
      expect.fail(
        `expected invalid-shape, got ${result.ok ? 'ok' : (result as { error: { kind: string } }).error.kind}`,
      );
    }
  });

  it('rejects unsupported schemaVersion with version-mismatch error', () => {
    // Arrange
    const future = { ...SAMPLE, schemaVersion: '999' };

    // Act
    const result = loadManifest(JSON.stringify(future));

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'version-mismatch') {
      expect(result.error.found).toBe('999');
      expect(result.error.expected).toBe(MANIFEST_SCHEMA_VERSION);
    } else {
      expect.fail(`expected version-mismatch`);
    }
  });

  it('accepts a manifest with extra unknown fields (forward-compat)', () => {
    // Arrange — extra fields shouldn't break load
    const extra = { ...SAMPLE, futureFeature: { nested: true } };

    // Act
    const result = loadManifest(JSON.stringify(extra));

    // Assert
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// saveManifest
// ---------------------------------------------------------------------------

describe('saveManifest', () => {
  it('round-trips through loadManifest', () => {
    // Arrange
    const json = saveManifest(SAMPLE);
    const parsed = JSON.parse(json) as unknown;

    // Act
    const result = loadManifest(json);

    // Assert
    expect(parsed).toMatchObject({
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      id: SAMPLE.id,
      name: SAMPLE.name,
      valueArxmlPaths: [...SAMPLE.valueArxmlPaths],
      bswmdPaths: [...SAMPLE.bswmdPaths],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(SAMPLE);
    }
  });

  it('emits pretty-printed JSON (human-readable)', () => {
    // Act
    const json = saveManifest(SAMPLE);

    // Assert — pretty print inserts newlines and 2-space indent
    expect(json).toContain('\n');
    expect(json).toMatch(/^\{\n {2}"schemaVersion"/);
  });
});

// ---------------------------------------------------------------------------
// validateManifest (path-shape checks)
// ---------------------------------------------------------------------------

describe('validateManifest', () => {
  it('accepts a valid manifest with relative paths', () => {
    // Arrange
    const m: ProjectManifest = {
      ...SAMPLE,
      valueArxmlPaths: ['./a.arxml', 'subfolder/b.arxml'],
      bswmdPaths: ['./canif.arxml'],
    };

    // Act
    const result = validateManifest(m);

    // Assert
    expect(result.ok).toBe(true);
  });

  it('accepts empty path arrays', () => {
    // Arrange
    const m: ProjectManifest = createEmptyManifest('empty');

    // Act
    const result = validateManifest(m);

    // Assert
    expect(result.ok).toBe(true);
  });

  it('rejects valueArxmlPaths containing a ".." segment (path traversal)', () => {
    // Arrange
    const m: ProjectManifest = {
      ...SAMPLE,
      valueArxmlPaths: ['../../etc/passwd'],
    };

    // Act
    const result = validateManifest(m);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'invalid-path') {
      expect(result.error.field).toBe('valueArxmlPaths');
      expect(result.error.path).toBe('../../etc/passwd');
      expect(result.error.reason).toBe('parent-traversal');
    } else {
      expect.fail(`expected invalid-path`);
    }
  });

  it('rejects bswmdPaths containing a ".." segment', () => {
    // Arrange
    const m: ProjectManifest = {
      ...SAMPLE,
      bswmdPaths: ['../sibling/bswmd.arxml'],
    };

    // Act
    const result = validateManifest(m);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid-path');
    }
  });

  it('rejects absolute Unix paths (leading "/")', () => {
    // Arrange
    const m: ProjectManifest = {
      ...SAMPLE,
      valueArxmlPaths: ['/etc/passwd'],
    };

    // Act
    const result = validateManifest(m);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid-path');
    }
  });

  it('rejects absolute Windows paths (drive letter)', () => {
    // Arrange
    const m: ProjectManifest = {
      ...SAMPLE,
      valueArxmlPaths: ['C:/Users/x/file.arxml'],
    };

    // Act
    const result = validateManifest(m);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid-path');
    }
  });

  it('rejects empty-string paths', () => {
    // Arrange
    const m: ProjectManifest = {
      ...SAMPLE,
      valueArxmlPaths: [''],
    };

    // Act
    const result = validateManifest(m);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid-path');
    }
  });

  it('rejects a non-string path entry (defensive: path == 123 in array)', () => {
    // The TS types enforce string[] but at runtime the validator must
    // refuse non-string entries. Cast through `unknown` to simulate
    // a malformed input from disk.
    const m = {
      ...SAMPLE,
      valueArxmlPaths: [123 as unknown as string],
    };
    const result = validateManifest(m);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid-path');
      if (result.error.kind === 'invalid-path') {
        // The validator coerces the bad value via String(p) before
        // returning. Verify the field/path fields are populated.
        expect(result.error.field).toBe('valueArxmlPaths');
        expect(result.error.reason).toBe('empty');
      }
    }
  });

  it('rejects empty name', () => {
    // Arrange
    const m: ProjectManifest = { ...SAMPLE, name: '' };

    // Act
    const result = validateManifest(m);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'invalid-field') {
      expect(result.error.field).toBe('name');
    } else {
      expect.fail(`expected invalid-field`);
    }
  });

  it('rejects empty id', () => {
    // Arrange
    const m: ProjectManifest = { ...SAMPLE, id: '' };

    // Act
    const result = validateManifest(m);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'invalid-field') {
      expect(result.error.field).toBe('id');
    } else {
      expect.fail(`expected invalid-field`);
    }
  });
});

// ---------------------------------------------------------------------------
// createEmptyManifest
// ---------------------------------------------------------------------------

describe('createEmptyManifest', () => {
  it('creates a manifest with empty arrays and a unique id', () => {
    // Arrange + Act
    const m1 = createEmptyManifest('Project A');
    const m2 = createEmptyManifest('Project A');

    // Assert
    expect(m1.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
    expect(m1.name).toBe('Project A');
    expect(m1.valueArxmlPaths).toEqual([]);
    expect(m1.bswmdPaths).toEqual([]);
    expect(m1.id).not.toBe('');
    // Two calls produce distinct ids
    expect(m1.id).not.toBe(m2.id);
  });

  it('round-trips through saveManifest → loadManifest', () => {
    // Arrange
    const m = createEmptyManifest('Round Trip');

    // Act
    const result = loadManifest(saveManifest(m));

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(m);
    }
  });
});

// ---------------------------------------------------------------------------
// loadManifest migration (Sprint 16c #1)
//
// T6 (Sprint 16b) changed `valueArxmlPaths` / `bswmdPaths` to relative form.
// Existing v1.1.0 users have absolute-path manifests. When `loadManifest`
// is called with a `manifestDir`, every absolute path that shares a prefix
// with that directory is converted to relative form BEFORE validation.
// Cross-drive / out-of-prefix paths remain absolute and surface as
// `invalid-path: absolute` (no silent masking).
// ---------------------------------------------------------------------------

describe('loadManifest migration (absolute → relative)', () => {
  const manifestDirWin = 'D:\\proj\\myproj';
  const manifestDirPosix = '/home/user/myproj';

  it('migrates absolute Windows paths under manifestDir to relative form', () => {
    // Arrange — legacy v1.1.0 manifest with absolute Windows paths
    const legacy: ProjectManifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      id: '11111111-2222-3333-4444-555555555555',
      name: 'Legacy',
      valueArxmlPaths: ['D:\\proj\\myproj\\ecuc\\EcuC.arxml', 'D:\\proj\\myproj\\Com.arxml'],
      bswmdPaths: ['D:\\proj\\myproj\\bswmd\\CanIf.arxml'],
    };

    // Act
    const result = loadManifest(JSON.stringify(legacy), manifestDirWin);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valueArxmlPaths).toEqual(['ecuc/EcuC.arxml', 'Com.arxml']);
      expect(result.value.bswmdPaths).toEqual(['bswmd/CanIf.arxml']);
    }
  });

  it('migrates absolute POSIX paths under manifestDir to relative form', () => {
    // Arrange
    const legacy: ProjectManifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      id: '11111111-2222-3333-4444-555555555555',
      name: 'Legacy Posix',
      valueArxmlPaths: ['/home/user/myproj/ecuc/EcuC.arxml'],
      bswmdPaths: [],
    };

    // Act
    const result = loadManifest(JSON.stringify(legacy), manifestDirPosix);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valueArxmlPaths).toEqual(['ecuc/EcuC.arxml']);
    }
  });

  it('still fails with invalid-path:absolute for cross-drive paths', () => {
    // Arrange — E:\\ is a different drive from the D:\\ manifestDir
    const legacy: ProjectManifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      id: '11111111-2222-3333-4444-555555555555',
      name: 'Cross Drive',
      valueArxmlPaths: ['E:\\other\\proj\\EcuC.arxml'],
      bswmdPaths: [],
    };

    // Act
    const result = loadManifest(JSON.stringify(legacy), manifestDirWin);

    // Assert — migration cannot relocate cross-drive paths; validator must
    // surface the underlying broken state (no silent masking).
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid-path');
      if (result.error.kind === 'invalid-path') {
        expect(result.error.reason).toBe('absolute');
        expect(result.error.field).toBe('valueArxmlPaths');
      }
    }
  });

  it('still fails for sibling-directory absolute paths outside the prefix', () => {
    // Arrange — /proj/other is a sibling of /proj/myproj; no shared prefix
    const manifestDir = '/proj/myproj';
    const legacy: ProjectManifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      id: '11111111-2222-3333-4444-555555555555',
      name: 'Sibling',
      valueArxmlPaths: ['/proj/other/EcuC.arxml'],
      bswmdPaths: [],
    };

    // Act
    const result = loadManifest(JSON.stringify(legacy), manifestDir);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid-path');
    }
  });

  it('migrates a mixed manifest: absolute entries get relativised, relative pass through', () => {
    // Arrange — some entries are already relative (new-style), others are
    // legacy absolutes. The mixed case is realistic for a partially-migrated
    // user with hand-edited manifest files.
    const mixed: ProjectManifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      id: '11111111-2222-3333-4444-555555555555',
      name: 'Mixed',
      valueArxmlPaths: [
        'D:\\proj\\myproj\\ecuc\\EcuC.arxml', // absolute → migrate
        './Com.arxml', // already relative → unchanged
        'subfolder/PduR.arxml', // already relative → unchanged
      ],
      bswmdPaths: ['D:\\proj\\myproj\\bswmd\\CanIf.arxml', './Os.arxml'],
    };

    // Act
    const result = loadManifest(JSON.stringify(mixed), manifestDirWin);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valueArxmlPaths).toEqual([
        'ecuc/EcuC.arxml',
        './Com.arxml',
        'subfolder/PduR.arxml',
      ]);
      expect(result.value.bswmdPaths).toEqual(['bswmd/CanIf.arxml', './Os.arxml']);
    }
  });

  it('does not double-relativise: load → save → load yields the same manifest', () => {
    // Arrange — legacy absolute-path manifest.
    const legacy: ProjectManifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      id: '11111111-2222-3333-4444-555555555555',
      name: 'Round Trip Migrate',
      valueArxmlPaths: ['D:\\proj\\myproj\\ecuc\\EcuC.arxml'],
      bswmdPaths: ['D:\\proj\\myproj\\bswmd\\CanIf.arxml'],
    };

    // Act — first load (with manifestDir) migrates; save emits the
    // migrated form; second load (with manifestDir) sees already-relative
    // paths and must leave them alone.
    const firstLoad = loadManifest(JSON.stringify(legacy), manifestDirWin);
    expect(firstLoad.ok).toBe(true);
    if (!firstLoad.ok) return;
    const persisted = saveManifest(firstLoad.value);
    const secondLoad = loadManifest(persisted, manifestDirWin);

    // Assert
    expect(secondLoad.ok).toBe(true);
    if (secondLoad.ok) {
      expect(secondLoad.value.valueArxmlPaths).toEqual(['ecuc/EcuC.arxml']);
      expect(secondLoad.value.bswmdPaths).toEqual(['bswmd/CanIf.arxml']);
      // Second load must produce the same value as the first (idempotence).
      expect(secondLoad.value).toEqual(firstLoad.value);
    }
  });

  it('preserves empty path arrays through migration', () => {
    // Arrange — freshly-created manifest with no paths. Migration must
    // not invent anything; just pass through.
    const fresh: ProjectManifest = createEmptyManifest('Fresh');

    // Act
    const result = loadManifest(saveManifest(fresh), manifestDirWin);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valueArxmlPaths).toEqual([]);
      expect(result.value.bswmdPaths).toEqual([]);
    }
  });

  it('loadManifest without manifestDir keeps existing strict behaviour', () => {
    // Arrange — legacy absolute paths. Without manifestDir, the migration
    // cannot run, so the validator must still reject with invalid-path.
    const legacy: ProjectManifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      id: '11111111-2222-3333-4444-555555555555',
      name: 'No ManifestDir',
      valueArxmlPaths: ['D:\\proj\\myproj\\ecuc\\EcuC.arxml'],
      bswmdPaths: [],
    };

    // Act — note: no manifestDir passed
    const result = loadManifest(JSON.stringify(legacy));

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid-path');
      if (result.error.kind === 'invalid-path') {
        expect(result.error.reason).toBe('absolute');
      }
    }
  });
});
