import { describe, it, expect } from 'vitest';

import { basename, bswmdKeyFor, dirname, toManifestRelative } from '../path.js';

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

// ---------------------------------------------------------------------------
// Sprint A — bswmdKeyFor
//
// P0-A1 fix helper: render two paths that may come from different sources
// (manifest-relative POSIX vs absolute Windows) to the same canonical key,
// so callers can do a `Map.get(key)` lookup without worrying about
// separator shape, drive-letter casing, or absolute-vs-relative form.
//
// Implementation strategy: take the last 2 path segments after lowercasing
// + separator canonicalisation. This collapses `bswmd/EcuC.arxml` and
// `D:\proj\bswmd\EcuC.arxml` to the same key (`bswmd/ecuc.arxml`) while
// still distinguishing two BSWMDs that live in different subfolders.
// ---------------------------------------------------------------------------

describe('shared/path.bswmdKeyFor', () => {
  it('returns the same key for manifest-relative POSIX and absolute Windows forms of the same file', () => {
    const manifestRel = 'bswmd/EcuC.arxml';
    const winAbs = 'D:\\proj\\bswmd\\EcuC.arxml';
    expect(bswmdKeyFor(manifestRel)).toBe(bswmdKeyFor(winAbs));
  });

  it('returns the same key for absolute POSIX and absolute Windows forms', () => {
    expect(bswmdKeyFor('/proj/bswmd/EcuC.arxml')).toBe(bswmdKeyFor('D:\\proj\\bswmd\\EcuC.arxml'));
  });

  it('returns the same key for mixed-separator and pure-backslash forms', () => {
    expect(bswmdKeyFor('D:/proj/bswmd\\EcuC.arxml')).toBe(
      bswmdKeyFor('D:\\proj\\bswmd\\EcuC.arxml'),
    );
  });

  it('is case-insensitive across the whole path (Windows paths are case-insensitive on disk)', () => {
    expect(bswmdKeyFor('D:\\proj\\X.arxml')).toBe(bswmdKeyFor('d:\\proj\\X.arxml'));
    expect(bswmdKeyFor('D:\\Proj\\X.arxml')).toBe(bswmdKeyFor('d:\\proj\\X.arxml'));
  });

  it('strips trailing separators before keying', () => {
    expect(bswmdKeyFor('/proj/bswmd/EcuC.arxml/')).toBe(bswmdKeyFor('/proj/bswmd/EcuC.arxml'));
    expect(bswmdKeyFor('D:\\proj\\bswmd\\EcuC.arxml\\')).toBe(
      bswmdKeyFor('D:\\proj\\bswmd\\EcuC.arxml'),
    );
  });

  it('returns just the basename for a top-level file (no parent dir)', () => {
    expect(bswmdKeyFor('EcuC.arxml')).toBe('ecuc.arxml');
  });

  it('returns the empty string for an empty input', () => {
    expect(bswmdKeyFor('')).toBe('');
  });

  it('differentiates two BSWMDs that live in different sub-folders of the same project', () => {
    // Sprint 16b — the collision-safety contract: two entries in
    // manifest.bswmdPaths that share a basename but live in different
    // sub-dirs must still pair to distinct schemas.
    expect(bswmdKeyFor('subdir1/EcuC.arxml')).not.toBe(bswmdKeyFor('subdir2/EcuC.arxml'));
  });

  it('uses a single-segment tail when the input has only one path component', () => {
    expect(bswmdKeyFor('bswmd')).toBe('bswmd');
  });
});
