// src/renderer/keyboard/a11y/__tests__/focusTrap.test.ts
// v1.6.0 Cluster U — focusTrap behavior tests (TDD).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// @vitest-environment jsdom

import { trapFocus } from '../focusTrap.js';

describe('focusTrap (v1.6.0 U a11y)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.innerHTML = `
      <button id="b1">A</button>
      <button id="b2">B</button>
      <button id="b3">C</button>
    `;
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('focuses the first focusable element on activation', () => {
    trapFocus(container);
    expect(document.activeElement?.id).toBe('b1');
  });

  it('Tab on the last element wraps to the first', () => {
    trapFocus(container);
    const last = container.querySelector('#b3') as HTMLElement;
    last.focus();
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    document.dispatchEvent(e);
    expect(document.activeElement?.id).toBe('b1');
  });

  it('Shift+Tab on the first element wraps to the last', () => {
    trapFocus(container);
    const first = container.querySelector('#b1') as HTMLElement;
    first.focus();
    const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true });
    document.dispatchEvent(e);
    expect(document.activeElement?.id).toBe('b3');
  });

  it('release() restores focus to the previously focused element', () => {
    const outside = document.createElement('button');
    outside.id = 'outside';
    document.body.appendChild(outside);
    outside.focus();
    expect(document.activeElement?.id).toBe('outside');
    const handle = trapFocus(container);
    expect(document.activeElement?.id).toBe('b1');
    handle.release();
    expect(document.activeElement?.id).toBe('outside');
    document.body.removeChild(outside);
  });

  it('handles empty containers without throwing', () => {
    const empty = document.createElement('div');
    document.body.appendChild(empty);
    const handle = trapFocus(empty);
    handle.release();
    document.body.removeChild(empty);
  });
});
