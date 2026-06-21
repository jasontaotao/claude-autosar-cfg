// src/renderer/keyboard/__tests__/normalizeKey.test.ts
// v1.6.0 Cluster U — normalizeKey unit tests (TDD).

import { afterEach, describe, expect, it } from 'vitest';

import {
  _setPlatformForTest,
  bindingsEqual,
  eventToBinding,
  formatBindingForDisplay,
  modLabel,
  modToken,
} from '../normalizeKey.js';

describe('normalizeKey (v1.6.0 U)', () => {
  afterEach(() => {
    _setPlatformForTest(null);
  });

  it('modToken is always "Mod" (canonical alias)', () => {
    expect(modToken()).toBe('Mod');
  });

  it('modLabel returns "Cmd" on darwin', () => {
    _setPlatformForTest('darwin');
    expect(modLabel()).toBe('Cmd');
  });

  it('modLabel returns "Ctrl" on win32 / linux', () => {
    _setPlatformForTest('win32');
    expect(modLabel()).toBe('Ctrl');
    _setPlatformForTest('linux');
    expect(modLabel()).toBe('Ctrl');
  });

  it('eventToBinding maps Meta+O → Mod+O', () => {
    const e = { key: 'o', metaKey: true } as unknown as KeyboardEvent;
    expect(eventToBinding(e)).toBe('Mod+O');
  });

  it('eventToBinding maps Ctrl+O → Mod+O (cross-platform)', () => {
    const e = { key: 'o', ctrlKey: true } as unknown as KeyboardEvent;
    expect(eventToBinding(e)).toBe('Mod+O');
  });

  it('eventToBinding maps Meta+Shift+E → Mod+Shift+E (canonical sort)', () => {
    const e = { key: 'e', metaKey: true, shiftKey: true } as unknown as KeyboardEvent;
    expect(eventToBinding(e)).toBe('Mod+Shift+E');
  });

  it('eventToBinding uppercases letter keys', () => {
    const e = { key: 'k', metaKey: true } as unknown as KeyboardEvent;
    expect(eventToBinding(e)).toBe('Mod+K');
  });

  it('eventToBinding returns empty string for pure modifier keys', () => {
    const e = { key: 'Control', ctrlKey: true } as unknown as KeyboardEvent;
    expect(eventToBinding(e)).toBe('');
  });

  it('eventToBinding maps F-keys verbatim (F8 / F12)', () => {
    expect(eventToBinding({ key: 'F8' } as unknown as KeyboardEvent)).toBe('F8');
    expect(eventToBinding({ key: 'F12' } as unknown as KeyboardEvent)).toBe('F12');
  });

  it('eventToBinding maps ? verbatim', () => {
    const e = { key: '?' } as unknown as KeyboardEvent;
    expect(eventToBinding(e)).toBe('?');
  });

  it('bindingsEqual canonicalizes both sides', () => {
    expect(bindingsEqual('Mod+O', 'Mod+o')).toBe(true);
    expect(bindingsEqual('Mod+Shift+E', 'Shift+Mod+E')).toBe(true);
    expect(bindingsEqual('Mod+O', 'Mod+P')).toBe(false);
  });

  it('formatBindingForDisplay replaces Mod with the platform label', () => {
    _setPlatformForTest('darwin');
    expect(formatBindingForDisplay('Mod+K')).toBe('Cmd+K');
    _setPlatformForTest('win32');
    expect(formatBindingForDisplay('Mod+K')).toBe('Ctrl+K');
  });
});
