// @vitest-environment jsdom
//
// ScriptOutput status badge — v1.21.0 Bug #2 (CRITICAL: 脚本界面丑 +
// 不知道干啥).
//
// Pre-v1.21.0 the status banner was a single coloured bar with a
// short prefix ("Syntax error: …" / "Runtime error: …" / "OK · 12ms").
// User feedback: "不知道干啥" — at a glance the user could not tell
// `ok` from `runtime-error` because the colours were similar in the
// cramped 11-12px typography.
//
// The new design renders an explicit ICON in a coloured circle +
// the localised label, so even a colour-blind user or a small panel
// width gives the user a clear "this is OK" vs "this is a syntax
// error" signal.
//
// Behaviour pinned by tests:
//   1. `ok` status shows a check icon + "OK" / "成功" label
//   2. `runtime-error` shows an × icon + localised label
//   3. `syntax-error` shows an × icon + localised label
//   4. `timeout` shows an × icon + localised label
//   5. The icon element has its own `data-testid` for RTL queries

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { ScriptRunResult } from '@shared/script/types';

import { ScriptOutput } from '../ScriptOutput';

const noop = (): void => undefined;

function makeResult(status: ScriptRunResult['status']): ScriptRunResult {
  return {
    runId: 'r1',
    status,
    logs: [],
    violations: [],
    mutations: [],
    durationMs: 12,
    errorMessage: status === 'ok' ? undefined : 'something broke',
  };
}

describe('ScriptOutput status badge (Bug #2)', () => {
  afterEach(() => cleanup());

  it('renders a check icon and OK label for status=ok (en)', () => {
    render(
      <ScriptOutput
        result={makeResult('ok')}
        logs={[]}
        locale="en"
        onCommit={noop}
        onDiscard={noop}
        onClear={noop}
      />,
    );
    const badge = screen.getByTestId('script-output-status-ok');
    expect(badge.textContent).toMatch(/ok/i);
    // Icon container exists with the correct testid
    expect(screen.getByTestId('script-output-status-icon')).not.toBeNull();
    expect(screen.getByTestId('script-output-status-icon').textContent).toBe('✓');
  });

  it('localizes the OK label for zh-CN', () => {
    render(
      <ScriptOutput
        result={makeResult('ok')}
        logs={[]}
        locale="zh-CN"
        onCommit={noop}
        onDiscard={noop}
        onClear={noop}
      />,
    );
    expect(screen.getByTestId('script-output-status-ok').textContent).toMatch(/成功/);
  });

  it('renders an × icon and localised label for runtime-error (en)', () => {
    render(
      <ScriptOutput
        result={makeResult('runtime-error')}
        logs={[]}
        locale="en"
        onCommit={noop}
        onDiscard={noop}
        onClear={noop}
      />,
    );
    const badge = screen.getByTestId('script-output-status-runtime-error');
    expect(badge.textContent).toMatch(/runtime error/i);
    expect(screen.getByTestId('script-output-status-icon').textContent).toBe('✗');
  });

  it('renders an × icon and localised label for syntax-error (zh-CN)', () => {
    render(
      <ScriptOutput
        result={makeResult('syntax-error')}
        logs={[]}
        locale="zh-CN"
        onCommit={noop}
        onDiscard={noop}
        onClear={noop}
      />,
    );
    const badge = screen.getByTestId('script-output-status-syntax-error');
    expect(badge.textContent).toMatch(/语法/);
    expect(screen.getByTestId('script-output-status-icon').textContent).toBe('✗');
  });

  it('renders an × icon and localised label for timeout', () => {
    render(
      <ScriptOutput
        result={makeResult('timeout')}
        logs={[]}
        locale="en"
        onCommit={noop}
        onDiscard={noop}
        onClear={noop}
      />,
    );
    const badge = screen.getByTestId('script-output-status-timeout');
    expect(badge.textContent).toMatch(/timeout/i);
    expect(screen.getByTestId('script-output-status-icon').textContent).toBe('✗');
  });
});
