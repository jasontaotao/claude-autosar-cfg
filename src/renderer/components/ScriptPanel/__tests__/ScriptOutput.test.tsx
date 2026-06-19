// @vitest-environment jsdom
//
// ScriptOutput — Sprint 14 #1 Phase C (T13) — right-column run output.
//
// Behaviour pinned by tests:
//   1. Commit / Discard buttons are disabled when result is null
//   2. Commit / Discard buttons enable when status='ok' and mutations>0
//   3. Logs section renders one row per log entry
//   4. Violations section renders per-violation row with kind+message
//   5. Mutations section renders per-mutation summary
//   6. Clear button fires onClear

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ScriptRunResult } from '@main/script/types';

import { ScriptOutput } from '../ScriptOutput';

const OK_WITH_MUTATIONS: ScriptRunResult = {
  runId: 'r1',
  status: 'ok',
  logs: [
    { level: 'info', message: 'started', ts: 1 },
    { level: 'warn', message: 'careful', ts: 2 },
  ],
  violations: [
    { kind: 'script:x', severity: 'warning', message: 'mismatch' },
  ],
  mutations: [
    {
      kind: 'set-param',
      containerPath: '/A/B',
      paramName: 'p',
      newValue: 42,
    },
  ],
  durationMs: 12,
};

describe('ScriptOutput', () => {
  afterEach(() => cleanup());

  it('commit/discard buttons are disabled when result is null', () => {
    render(
      <ScriptOutput
        result={null}
        logs={[]}
        locale="en"
        onCommit={vi.fn()}
        onDiscard={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByTestId('script-output-commit').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('script-output-discard').hasAttribute('disabled')).toBe(true);
  });

  it('commit/discard buttons enable when status=ok and mutations>0', () => {
    render(
      <ScriptOutput
        result={OK_WITH_MUTATIONS}
        logs={OK_WITH_MUTATIONS.logs}
        locale="en"
        onCommit={vi.fn()}
        onDiscard={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByTestId('script-output-commit').hasAttribute('disabled')).toBe(false);
    expect(screen.getByTestId('script-output-discard').hasAttribute('disabled')).toBe(false);
  });

  it('commit/discard stay disabled when status=ok but no mutations', () => {
    const okNoMutations: ScriptRunResult = {
      ...OK_WITH_MUTATIONS,
      mutations: [],
    };
    render(
      <ScriptOutput
        result={okNoMutations}
        logs={okNoMutations.logs}
        locale="en"
        onCommit={vi.fn()}
        onDiscard={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByTestId('script-output-commit').hasAttribute('disabled')).toBe(true);
  });

  it('renders one row per log entry', () => {
    render(
      <ScriptOutput
        result={OK_WITH_MUTATIONS}
        logs={OK_WITH_MUTATIONS.logs}
        locale="en"
        onCommit={vi.fn()}
        onDiscard={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByTestId('script-log-0')).not.toBeNull();
    expect(screen.getByTestId('script-log-1')).not.toBeNull();
  });

  it('renders violations and mutations lists', () => {
    render(
      <ScriptOutput
        result={OK_WITH_MUTATIONS}
        logs={OK_WITH_MUTATIONS.logs}
        locale="en"
        onCommit={vi.fn()}
        onDiscard={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByTestId('script-violation-0')).not.toBeNull();
    expect(screen.getByTestId('script-mutation-0')).not.toBeNull();
  });

  it('clear button fires onClear', () => {
    const onClear = vi.fn();
    render(
      <ScriptOutput
        result={OK_WITH_MUTATIONS}
        logs={OK_WITH_MUTATIONS.logs}
        locale="en"
        onCommit={vi.fn()}
        onDiscard={vi.fn()}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByTestId('script-output-clear'));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('commit button fires onCommit', () => {
    const onCommit = vi.fn();
    render(
      <ScriptOutput
        result={OK_WITH_MUTATIONS}
        logs={OK_WITH_MUTATIONS.logs}
        locale="en"
        onCommit={onCommit}
        onDiscard={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('script-output-commit'));
    expect(onCommit).toHaveBeenCalledOnce();
  });
});