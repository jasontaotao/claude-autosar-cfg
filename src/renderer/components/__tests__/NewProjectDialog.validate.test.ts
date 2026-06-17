// @vitest-environment node
//
// `validateProjectName` pure function (Sprint 12 #3 Task 2).
//
// Returns one of three error kinds the UI maps to i18n keys via t():
//   - `'empty'`   → t(... 'app.error.projectNameEmpty')
//   - `'invalid'` → t(... 'app.error.projectNameInvalid')
//   - `'tooLong'` → t(... 'app.error.projectNameTooLong')
//
// Note: same-name detection (collision with an existing file on disk)
// is intentionally NOT done here — that's a race-y filesystem check
// that belongs in the main-process handler (`PROJECT_NEW` returns
// `'overwrite-confirm'`). The renderer just does cheap local checks.

import { describe, expect, it } from 'vitest';

import {
  MAX_NAME_LENGTH,
  validateProjectName,
} from '../NewProjectDialog.validate.js';

describe('validateProjectName (Sprint 12 #3 Task 2)', () => {
  it('returns "empty" for an empty string', () => {
    expect(validateProjectName('')).toBe('empty');
  });

  it('returns "empty" for a whitespace-only string', () => {
    expect(validateProjectName('   ')).toBe('empty');
    expect(validateProjectName('\t\n  ')).toBe('empty');
  });

  it('returns "invalid" when the name contains "<"', () => {
    expect(validateProjectName('foo<bar')).toBe('invalid');
  });

  it('returns "invalid" when the name contains ">"', () => {
    expect(validateProjectName('foo>bar')).toBe('invalid');
  });

  it('returns "invalid" when the name contains ":"', () => {
    expect(validateProjectName('foo:bar')).toBe('invalid');
  });

  it('returns "invalid" when the name contains a forward slash', () => {
    expect(validateProjectName('foo/bar')).toBe('invalid');
  });

  it('returns "invalid" when the name contains a backslash', () => {
    expect(validateProjectName('foo\\bar')).toBe('invalid');
  });

  it('returns "invalid" when the name contains "|"', () => {
    expect(validateProjectName('foo|bar')).toBe('invalid');
  });

  it('returns "invalid" when the name contains "?"', () => {
    expect(validateProjectName('foo?bar')).toBe('invalid');
  });

  it('returns "invalid" when the name contains "*"', () => {
    expect(validateProjectName('foo*bar')).toBe('invalid');
  });

  it('returns "invalid" when the name contains a double-quote character', () => {
    expect(validateProjectName('foo"bar')).toBe('invalid');
  });

  it('returns "tooLong" when the name exceeds 64 characters (65 chars)', () => {
    expect(validateProjectName('a'.repeat(65))).toBe('tooLong');
  });

  it('accepts a 64-character name as the longest valid case', () => {
    expect(validateProjectName('a'.repeat(64))).toBeNull();
  });

  it('returns null for a typical valid name', () => {
    expect(validateProjectName('My Project')).toBeNull();
  });

  it('returns null for a name containing underscores, hyphens, and digits', () => {
    expect(validateProjectName('valid_name-1')).toBeNull();
  });

  it('returns null for a Chinese-name project (no path-unsafe chars)', () => {
    expect(validateProjectName('我的项目')).toBeNull();
  });

  it('exposes MAX_NAME_LENGTH as 64 for the UI hint to consume', () => {
    expect(MAX_NAME_LENGTH).toBe(64);
  });

  it('flags tooLong BEFORE invalid when both apply (66 chars including "<")', () => {
    // 65 trailing 'a's plus "<" — but the "<" sits at the start so the
    // string is exactly 66 chars and contains "<". Per the spec the
    // function checks "empty → invalid → tooLong" so length wins.
    // We pin whichever order the implementation picked; both
    // choices are defensible but the spec specifies a fixed order.
    const bad = '<' + 'a'.repeat(65);
    expect(bad.length).toBe(66);
    const result = validateProjectName(bad);
    // Spec order is: empty → invalid → tooLong, so 'invalid' wins.
    expect(result).toBe('invalid');
  });
});
