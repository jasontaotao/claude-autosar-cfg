// @vitest-environment jsdom
//
// ScriptLibrary onboarding banner — v1.21.0 Bug #2 (CRITICAL: 脚本
// 界面丑 + 不知道干啥).
//
// When the script library is empty (scripts.length === 0), the panel
// used to render a single short line ("No scripts yet. Click + to
// create one.") — too terse for a first-run user. They walked away
// thinking "I don't know what this is for". The banner now explains
// what scripts are, lists the four kinds with one-line hints, and
// exposes a single CTA that creates a stub.
//
// Behaviour pinned by tests:
//   1. Empty state shows the onboarding panel (title + description +
//      4 kind hints + CTA button)
//   2. The CTA fires `onNew`
//   3. When at least one script exists, the onboarding panel is NOT
//      shown (replaced by the regular script rows)
//   4. Each kind hint references its corresponding kind badge so the
//      user sees colour + name together

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ScriptSummary } from '@shared/script/types';

import { ScriptLibrary } from '../ScriptLibrary';

const EMPTY: readonly ScriptSummary[] = [];

const ONE_SCRIPT: readonly ScriptSummary[] = [
  {
    id: 's1',
    name: 'alpha',
    shortName: 'alpha',
    kind: 'validator',
    updatedAt: '2026-06-18T00:00:00Z',
  },
];

describe('ScriptLibrary onboarding banner (Bug #2)', () => {
  afterEach(() => cleanup());

  it('shows the onboarding panel when scripts is empty (en)', () => {
    render(
      <ScriptLibrary
        scripts={EMPTY}
        selectedId={null}
        locale="en"
        busy={false}
        initialized={true}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const banner = screen.getByTestId('script-onboarding');
    expect(banner).not.toBeNull();
    // Title is rendered
    expect(banner.textContent).toMatch(/script/i);
    // All four kind badges surface in the hints so the user sees colour
    // and name together (one of the "不知道干啥" complaints).
    expect(screen.getByTestId('script-onboarding-kind-validator')).not.toBeNull();
    expect(screen.getByTestId('script-onboarding-kind-transformer')).not.toBeNull();
    expect(screen.getByTestId('script-onboarding-kind-report')).not.toBeNull();
    expect(screen.getByTestId('script-onboarding-kind-free')).not.toBeNull();
  });

  it('shows the onboarding panel in zh-CN', () => {
    render(
      <ScriptLibrary
        scripts={EMPTY}
        selectedId={null}
        locale="zh-CN"
        busy={false}
        initialized={true}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByTestId('script-onboarding')).not.toBeNull();
    // Localized title hint
    expect(screen.getByTestId('script-onboarding').textContent).toMatch(/脚本/);
  });

  it('onboarding CTA fires onNew', () => {
    const onNew = vi.fn();
    render(
      <ScriptLibrary
        scripts={EMPTY}
        selectedId={null}
        locale="en"
        busy={false}
        initialized={true}
        onSelect={vi.fn()}
        onNew={onNew}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('script-onboarding-cta'));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('onboarding panel is NOT shown when at least one script exists', () => {
    render(
      <ScriptLibrary
        scripts={ONE_SCRIPT}
        selectedId={null}
        locale="en"
        busy={false}
        initialized={true}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('script-onboarding')).toBeNull();
    // And the row is shown instead
    expect(screen.getByTestId('script-row-s1')).not.toBeNull();
  });

  it('shows a neutral placeholder instead of onboarding when not yet initialized (flicker fix)', () => {
    // Bug #2 code-review MEDIUM — pre-fix, an existing-script user
    // would see "Create your first script" for 1-2 frames on every
    // panel open before loadScripts() resolved. With initialized=false
    // we render "—" so the first paint is neutral.
    render(
      <ScriptLibrary
        scripts={EMPTY}
        selectedId={null}
        locale="en"
        busy={false}
        initialized={false}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('script-onboarding')).toBeNull();
    expect(screen.queryByTestId('script-row-s1')).toBeNull();
  });

  it('onboarding CTA is disabled when busy=true (LOW code-review fix)', () => {
    // Bug #2 code-review LOW — the CTA propagates the parent `busy`
    // flag but no test pinned this. Add it so a refactor that drops
    // the disabled wiring is caught.
    render(
      <ScriptLibrary
        scripts={EMPTY}
        selectedId={null}
        locale="en"
        busy={true}
        initialized={true}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const cta = screen.getByTestId('script-onboarding-cta') as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });
});
