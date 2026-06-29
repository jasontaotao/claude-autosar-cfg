import { describe, expect, it, vi } from 'vitest';

import { logFatal } from '../log.js';

describe('logFatal (v1.15.5)', () => {
  it('logs Error with stack fallback to message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');
    logFatal('test-label', err);
    expect(spy).toHaveBeenCalledOnce();
    const call = spy.mock.calls[0]!;
    expect(String(call[0])).toContain('test-label');
    expect(call[1]).toContain('boom');
    spy.mockRestore();
  });

  it('logs non-Error values as string', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logFatal('test-label', 'plain string');
    expect(spy.mock.calls[0]?.[1]).toBe('plain string');
    spy.mockRestore();
  });

  it('includes ISO timestamp in the prefix', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logFatal('ts-check', 'x');
    const prefix = String(spy.mock.calls[0]?.[0] ?? '');
    // 2026-06-29T...Z pattern
    expect(prefix).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    spy.mockRestore();
  });
});
