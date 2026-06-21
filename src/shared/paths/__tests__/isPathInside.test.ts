import { describe, expect, it } from 'vitest';

import { isPathInside } from '../isPathInside.js';

describe('isPathInside — hardening matrix', () => {
  it('returns true for strict child', () => {
    expect(isPathInside('/a/b/c', '/a/b')).toBe(true);
  });

  it('returns false for parent itself', () => {
    expect(isPathInside('/a/b', '/a/b')).toBe(false);
  });

  it('returns false for sibling', () => {
    expect(isPathInside('/a/x', '/a/b')).toBe(false);
  });

  it('returns false for path traversal via ..', () => {
    expect(isPathInside('/a/b/../x', '/a/b')).toBe(false);
  });

  it('returns false for path that escapes parent', () => {
    expect(isPathInside('/a/b/../../escape', '/a/b')).toBe(false);
  });

  it('handles trailing slash on parent', () => {
    expect(isPathInside('/a/b/c', '/a/b/')).toBe(true);
  });

  it('handles trailing slash on child', () => {
    expect(isPathInside('/a/b/c/', '/a/b')).toBe(true);
  });

  it('is case-insensitive on Windows paths', () => {
    // CI typically runs on Linux; test the platform-specific path
    if (process.platform === 'win32') {
      expect(isPathInside('C:\\Foo\\Bar', 'c:\\foo')).toBe(true);
    } else {
      // On Linux, the function still uses path.relative which is case-sensitive
      // — this test documents the platform behavior
      expect(isPathInside('/FOO/BAR', '/foo')).toBe(false);
    }
  });

  it('handles UNC path on Windows', () => {
    if (process.platform === 'win32') {
      expect(isPathInside('\\\\server\\share\\a\\b', '\\\\server\\share\\a')).toBe(true);
    } else {
      // On POSIX, UNC paths are treated as literal strings; path.relative handles them
      expect(isPathInside('//server/share/a/b', '//server/share/a')).toBe(true);
    }
  });

  it('handles current-directory marker', () => {
    expect(isPathInside('/a/./b/c', '/a/b')).toBe(true);
  });

  it('handles double-slash normalized', () => {
    expect(isPathInside('/a//b/c', '/a/b')).toBe(true);
  });

  it('returns false for absolute path on different drive (Windows)', () => {
    if (process.platform === 'win32') {
      expect(isPathInside('D:\\foo', 'C:\\bar')).toBe(false);
    } else {
      // POSIX equivalent: different root
      expect(isPathInside('/foo', '/bar')).toBe(false);
    }
  });
});
