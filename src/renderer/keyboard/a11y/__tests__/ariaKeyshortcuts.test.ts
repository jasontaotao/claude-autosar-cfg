// src/renderer/keyboard/a11y/__tests__/ariaKeyshortcuts.test.ts
// v1.6.0 Cluster U — aria-keyshortcuts grammar test (TDD).

import { afterEach, describe, expect, it } from 'vitest';

import { _setPlatformForTest } from '../../normalizeKey.js';
import { bindingToAriaKeyshortcuts } from '../ariaKeyshortcuts.js';

describe('bindingToAriaKeyshortcuts (v1.6.0 U)', () => {
  afterEach(() => _setPlatformForTest(null));

  it('translates Mod+K to Meta+K on darwin', () => {
    _setPlatformForTest('darwin');
    expect(bindingToAriaKeyshortcuts('Mod+K')).toBe('Meta+K');
  });

  it('translates Mod+K to Control+K on win32', () => {
    _setPlatformForTest('win32');
    expect(bindingToAriaKeyshortcuts('Mod+K')).toBe('Control+K');
  });

  it('keeps Shift and Alt verbatim', () => {
    _setPlatformForTest('darwin');
    expect(bindingToAriaKeyshortcuts('Mod+Shift+E')).toBe('Meta+Shift+E');
    expect(bindingToAriaKeyshortcuts('Mod+Alt+I')).toBe('Meta+Alt+I');
  });

  it('passes F-keys through verbatim', () => {
    expect(bindingToAriaKeyshortcuts('F8')).toBe('F8');
    expect(bindingToAriaKeyshortcuts('Shift+F12')).toBe('Shift+F12');
  });

  it('uppercases letter keys', () => {
    _setPlatformForTest('win32');
    expect(bindingToAriaKeyshortcuts('Mod+k')).toBe('Control+K');
  });

  it('translates named keys (Enter, Escape, ArrowUp)', () => {
    expect(bindingToAriaKeyshortcuts('Enter')).toBe('Enter');
    expect(bindingToAriaKeyshortcuts('Escape')).toBe('Escape');
    expect(bindingToAriaKeyshortcuts('Mod+ArrowUp')).toBe('Control+ArrowUp');
  });

  it('returns empty string for empty binding', () => {
    expect(bindingToAriaKeyshortcuts('')).toBe('');
  });
});