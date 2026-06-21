// Exit code mapping tests (v1.6.0 A+C-1).
//
// Per A+C spec §7.5: 4 exit codes — 0 success, 1 fatal, 2 partial
// success w/ warnings, 3 invalid input. These map cleanly onto
// the failure envelope so CI runners can distinguish.

import { describe, it, expect } from 'vitest';

import {
  EXIT_SUCCESS,
  EXIT_FATAL,
  EXIT_WARNING,
  EXIT_INVALID_INPUT,
  isValidExitCode,
  exitCodeToString,
} from '../exitCodes.js';

describe('exitCodes', () => {
  it('defines the 4 canonical codes', () => {
    expect(EXIT_SUCCESS).toBe(0);
    expect(EXIT_FATAL).toBe(1);
    expect(EXIT_WARNING).toBe(2);
    expect(EXIT_INVALID_INPUT).toBe(3);
  });

  it('isValidExitCode accepts only 0/1/2/3', () => {
    expect(isValidExitCode(0)).toBe(true);
    expect(isValidExitCode(1)).toBe(true);
    expect(isValidExitCode(2)).toBe(true);
    expect(isValidExitCode(3)).toBe(true);
    expect(isValidExitCode(4)).toBe(false);
    expect(isValidExitCode(-1)).toBe(false);
    expect(isValidExitCode(1.5)).toBe(false);
  });

  it('exitCodeToString returns a human description', () => {
    expect(exitCodeToString(0)).toContain('success');
    expect(exitCodeToString(1)).toContain('fatal');
    expect(exitCodeToString(2)).toContain('warning');
    expect(exitCodeToString(3)).toContain('invalid');
  });
});
