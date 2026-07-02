// @vitest-environment jsdom
//
// ScriptKindBadge — Sprint 14 #1 Phase C (T13) — colour-coded kind chip.
//
// v1.21.0 Bug #2 (CRITICAL: 脚本界面丑 + 不知道干啥) — badge used to
// render a single-letter label (V/T/R/F). User feedback was "不知道
// 干啥" — the letters are too cryptic. The chip now renders the
// localized full kind name AND carries a `title` tooltip describing
// what that kind does. The colour stays the same (per-kind CSS class),
// but the readable label gives the user the kind's identity at a
// glance. The tooltip answers "what's a validator?" without forcing
// them to leave the panel.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ScriptKindBadge } from '../ScriptKindBadge';

describe('ScriptKindBadge', () => {
  afterEach(() => cleanup());

  it('renders the full kind name for validator (en)', () => {
    render(<ScriptKindBadge kind="validator" locale="en" />);
    const el = screen.getByTestId('script-kind-validator');
    // Post-v1.21.0 HIGH-1 fix: textContent now contains the name +
    // the visually-hidden description (the latter for aria-describedby).
    // The visible name is asserted via `getByText` (which only matches
    // the visible span, not the sr-only one — they are separate text
    // nodes in the DOM tree).
    expect(screen.getByText('Validator')).not.toBeNull();
    expect(el.textContent).toMatch(/^Validator/);
    expect(el.className).toContain('script-kind-validator');
  });

  it('renders the full kind name for transformer (en)', () => {
    render(<ScriptKindBadge kind="transformer" locale="en" />);
    const el = screen.getByTestId('script-kind-transformer');
    expect(screen.getByText('Transformer')).not.toBeNull();
    expect(el.textContent).toMatch(/^Transformer/);
    expect(el.className).toContain('script-kind-transformer');
  });

  it('renders the full kind name for report (en)', () => {
    render(<ScriptKindBadge kind="report" locale="en" />);
    const el = screen.getByTestId('script-kind-report');
    expect(screen.getByText('Report')).not.toBeNull();
    expect(el.textContent).toMatch(/^Report/);
    expect(el.className).toContain('script-kind-report');
  });

  it('renders the full kind name for free (en)', () => {
    render(<ScriptKindBadge kind="free" locale="en" />);
    const el = screen.getByTestId('script-kind-free');
    expect(screen.getByText('Free')).not.toBeNull();
    expect(el.textContent).toMatch(/^Free/);
    expect(el.className).toContain('script-kind-free');
  });

  it('localizes the kind name for zh-CN', () => {
    render(<ScriptKindBadge kind="validator" locale="zh-CN" />);
    expect(screen.getByText('校验')).not.toBeNull();
    expect(screen.getByTestId('script-kind-validator').textContent).toMatch(/^校验/);
    render(<ScriptKindBadge kind="transformer" locale="zh-CN" />);
    expect(screen.getByText('转换')).not.toBeNull();
    expect(screen.getByTestId('script-kind-transformer').textContent).toMatch(/^转换/);
  });

  it('exposes a tooltip via the title attribute (kind purpose)', () => {
    // Bug #2 — "不知道干啥". The title attribute carries a localized
    // description of what the kind does so the user can hover the
    // badge to learn what each kind means without leaving the panel.
    render(<ScriptKindBadge kind="validator" locale="en" />);
    const el = screen.getByTestId('script-kind-validator');
    expect(el.getAttribute('title')).not.toBeNull();
    expect(el.getAttribute('title')).not.toBe('');
    // The tooltip must NOT be the same as the visible label (otherwise
    // it adds no information — the original code shipped this exact
    // bug).
    expect(el.getAttribute('title')).not.toBe('Validator');
  });

  it('exposes the kind purpose via aria-describedby (a11y — HIGH-1 code-review fix)', () => {
    // Post-v1.21.0 code-review HIGH-1 — aria-label would replace the
    // visible text for screen readers; the desc is now attached via
    // aria-describedby + a visually-hidden span so the announcement
    // is "Validator, reads the loaded ARXML and flags rule violations"
    // — both pieces, in order.
    render(<ScriptKindBadge kind="validator" locale="en" />);
    const el = screen.getByTestId('script-kind-validator');
    const describedById = el.getAttribute('aria-describedby');
    expect(describedById).toBe('script-kind-desc-validator');
    // The hidden span must exist with the matching id and contain the
    // description text.
    const hidden = document.getElementById(describedById ?? '');
    expect(hidden).not.toBeNull();
    expect(hidden?.textContent).toMatch(/reads the loaded arxml/i);
    // The visible text content is the kind NAME, not the description
    // — critical assertion (the bug the review caught).
    expect(el.textContent).toMatch(/Validator/);
    expect(el.textContent).toMatch(/reads the loaded arxml/i);
  });
});
