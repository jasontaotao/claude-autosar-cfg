import { describe, it, expect } from 'vitest';

import { basename, dirname, toManifestRelative } from '../path.js';

describe('shared/path.basename', () => {
  it('returns last segment for Unix-style paths', () => {
    expect(basename('/foo/bar/baz.arxml')).toBe('baz.arxml');
  });

  it('returns last segment for Windows-style paths', () => {
    expect(basename('C:\\Users\\me\\file.txt')).toBe('file.txt');
  });

  it('returns last segment for mixed separators', () => {
    expect(basename('C:/Users/me\\file.txt')).toBe('file.txt');
  });

  it('returns the input itself when there is no separator', () => {
    expect(basename('plain-name.arxml')).toBe('plain-name.arxml');
  });

  it('handles empty string as the input', () => {
    // An empty string splits to [''] and pop returns ''.
    expect(basename('')).toBe('');
  });

  it('handles trailing separator by returning empty segment', () => {
    expect(basename('/foo/bar/')).toBe('');
  });

  it('handles input that is just a separator', () => {
    expect(basename('/')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Sprint 16b T6 — dirname (portable, renderer-safe, no node:path)
// ---------------------------------------------------------------------------

describe('shared/path.dirname', () => {
  it('strips the basename from a POSIX path', () => {
    expect(dirname('/proj/ecuc/Can_EcucValues.arxml')).toBe('/proj/ecuc');
  });

  it('strips the basename from a Windows path', () => {
    expect(dirname('D:\\proj\\ecuc\\Can_EcucValues.arxml')).toBe('D:\\proj\\ecuc');
  });

  it('strips the basename from a mixed-separator path', () => {
    expect(dirname('D:/proj/ecuc\\Can_EcucValues.arxml')).toBe('D:/proj/ecuc');
  });

  it('returns empty string for a bare filename', () => {
    expect(dirname('Can_EcucValues.arxml')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(dirname('')).toBe('');
  });

  it('strips trailing separators before computing dirname', () => {
    expect(dirname('/proj/ecuc/')).toBe('/proj');
    expect(dirname('D:\\proj\\ecuc\\')).toBe('D:\\proj');
  });
});

// ---------------------------------------------------------------------------
// Sprint 16b T6 — toManifestRelative
// ---------------------------------------------------------------------------

describe('shared/path.toManifestRelative', () => {
  it('POSIX: /proj + /proj/ecuc/X.arxml → ecuc/X.arxml', () => {
    expect(toManifestRelative('/proj', '/proj/ecuc/X.arxml')).toBe('ecuc/X.arxml');
  });

  it('Windows: D:\\proj + D:\\proj\\ecuc\\X.arxml → ecuc/X.arxml', () => {
    expect(toManifestRelative('D:\\proj', 'D:\\proj\\ecuc\\X.arxml')).toBe('ecuc/X.arxml');
  });

  it('returns "." when the filePath equals the manifestDir', () => {
    expect(toManifestRelative('/proj', '/proj')).toBe('.');
    expect(toManifestRelative('D:\\proj', 'D:\\proj')).toBe('.');
  });

  it('already-relative: passes through unchanged', () => {
    expect(toManifestRelative('/proj', 'ecuc/X.arxml')).toBe('ecuc/X.arxml');
  });

  it('POSIX: /a + /b (no shared prefix) → null', () => {
    expect(toManifestRelative('/a', '/b/X.arxml')).toBeNull();
  });

  it('POSIX: /a/b + /a/c/X.arxml → null (sibling, not descendant)', () => {
    expect(toManifestRelative('/a/b', '/a/c/X.arxml')).toBeNull();
  });

  it('cross-drive Windows: D:\\proj + E:\\proj\\X.arxml → null', () => {
    expect(toManifestRelative('D:\\proj', 'E:\\proj\\X.arxml')).toBeNull();
  });

  it('mixed drive prefix: dir is relative, file is absolute → null', () => {
    // Asymmetric: dir has no drive letter but file does.
    expect(toManifestRelative('/proj', 'D:\\proj\\X.arxml')).toBeNull();
  });

  it('mixed drive prefix: dir is absolute with drive, file is relative → null', () => {
    // Asymmetric: file has no drive letter but dir does.
    expect(toManifestRelative('D:\\proj', '/proj/X.arxml')).toBeNull();
  });

  it('handles trailing separators in manifestDir', () => {
    expect(toManifestRelative('/proj/', '/proj/ecuc/X.arxml')).toBe('ecuc/X.arxml');
  });

  it('handles deeply nested paths', () => {
    expect(toManifestRelative('/proj', '/proj/a/b/c/d/X.arxml')).toBe('a/b/c/d/X.arxml');
  });

  it('returns null for empty filePath', () => {
    expect(toManifestRelative('/proj', '')).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Sprint 17a T1 — toManifestRelative rejects `..` segments in relative input
  // ---------------------------------------------------------------------------

  it('rejects relative input containing ".." segment', () => {
    expect(toManifestRelative('/proj', '../foo.arxml')).toBeNull();
  });

  it('rejects relative input with embedded ".." segment', () => {
    expect(toManifestRelative('/proj', 'foo/../bar.arxml')).toBeNull();
  });

  it('still passes through "foo/bar" relative input unchanged', () => {
    expect(toManifestRelative('/proj', 'foo/bar.arxml')).toBe('foo/bar.arxml');
  });
});
