// @vitest-environment jsdom
//
// ScriptKindBadge — Sprint 14 #1 Phase C (T13) — colour-coded kind chip.
//
// Behaviour pinned by tests:
//   1. Renders a single-letter label per ScriptKind (V/T/R/F)
//   2. Sets `data-testid` matching the kind for test selectors
//   3. Adds a CSS class matching the kind for theme colours

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ScriptKindBadge } from '../ScriptKindBadge';

describe('ScriptKindBadge', () => {
  afterEach(() => cleanup());

  it('renders V for validator', () => {
    render(<ScriptKindBadge kind="validator" locale="en" />);
    const el = screen.getByTestId('script-kind-validator');
    expect(el.textContent).toBe('V');
    expect(el.className).toContain('script-kind-validator');
  });

  it('renders T for transformer', () => {
    render(<ScriptKindBadge kind="transformer" locale="en" />);
    const el = screen.getByTestId('script-kind-transformer');
    expect(el.textContent).toBe('T');
    expect(el.className).toContain('script-kind-transformer');
  });

  it('renders R for report', () => {
    render(<ScriptKindBadge kind="report" locale="en" />);
    const el = screen.getByTestId('script-kind-report');
    expect(el.textContent).toBe('R');
    expect(el.className).toContain('script-kind-report');
  });

  it('renders F for free', () => {
    render(<ScriptKindBadge kind="free" locale="en" />);
    const el = screen.getByTestId('script-kind-free');
    expect(el.textContent).toBe('F');
    expect(el.className).toContain('script-kind-free');
  });
});