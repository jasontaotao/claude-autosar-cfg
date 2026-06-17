import { describe, it, expect } from 'vitest';

import { basename } from '../path.js';

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
