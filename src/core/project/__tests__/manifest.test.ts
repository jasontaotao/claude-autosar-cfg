import { describe, it, expect } from 'vitest';

import { MANIFEST_SCHEMA_VERSION } from '../../../shared/project.js';
import type { ProjectManifest } from '../../../shared/project.js';

import {
  loadManifest,
  saveManifest,
  validateManifest,
  createEmptyManifest,
} from '../manifest.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SAMPLE: ProjectManifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  id: '0d4f3e2a-1b6c-4d8e-9f0a-1234567890ab',
  name: 'CanIf Test',
  valueArxmlPaths: ['./EcuC_EcuC.arxml', './Com_Com.arxml'],
  bswmdPaths: ['./CanIf_bswmd.arxml'],
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
      expect.fail(`expected invalid-shape, got ${result.ok ? 'ok' : (result as { error: { kind: string } }).error.kind}`);
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
