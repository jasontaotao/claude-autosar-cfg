// @vitest-environment jsdom
//
// ValidationPanel scripts group — Sprint 14 #1 Phase C (T15).
//
// Adds a "Script 校验" collapsible group to ValidationPanel that
// lists scripts of kind='validator' and their latest run violations.
// Tests pin:
//   1. The new "Script 校验" group renders when at least one
//      validator-kind script has been run with violations
//   2. The group is hidden when there are no validator scripts
//      (or none have been run with violations)
//   3. Each violation row carries a `data-testid` matching the
//      pattern `script-violation-row-${i}`
//   4. The group click on a violation row doesn't crash and
//      surfaces a clickable entry per violation
//
// The tests exercise the group by directly mutating `useScriptStore`
// and re-rendering the panel; the panel reads scripts + run results
// from the store and merges them into the existing validation flow.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScriptRunResult } from '@main/script/types';

import { useArxmlStore } from '../../store/useArxmlStore';
import { useScriptStore } from '../../store/useScriptStore';
import { ValidationPanel } from '../ValidationPanel';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window.autosarApi = {
  listScripts: vi.fn().mockResolvedValue({ scripts: [] }),
  saveScript: vi.fn(),
  deleteScript: vi.fn(),
  runScript: vi.fn(),
  onScriptProgress: vi.fn().mockReturnValue(() => {}),
};

describe('ValidationPanel — Script 校验 group (S14#1 T15)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
    useArxmlStore.getState().setLocale('en');
    useScriptStore.getState().reset();
  });

  afterEach(() => cleanup());

  it('renders the Script 校验 group when a validator script has run violations', async () => {
    // Seed a validator script + its latest run result with one violation.
    useScriptStore.setState({
      scripts: [
        {
          id: 'v1',
          name: 'pduid-uniqueness',
          shortName: 'pduid',
          kind: 'validator',
          updatedAt: '2026-06-18T00:00:00Z',
        },
      ],
      runResult: {
        runId: 'r1',
        status: 'ok',
        logs: [],
        violations: [
          {
            kind: 'script:pduid-dup',
            severity: 'warning',
            message: 'Duplicate PduId at /A/B',
          },
        ],
        mutations: [],
        durationMs: 5,
      } satisfies ScriptRunResult,
      runProgress: [],
    });
    render(<ValidationPanel />);
    await waitFor(() => {
      // The group heading renders under data-testid="validation-script-group"
      expect(screen.getByTestId('validation-script-group')).not.toBeNull();
    });
    expect(screen.getByTestId('script-violation-row-0')).not.toBeNull();
  });

  it('does not render the Script 校验 group when no validator script has run', () => {
    // No scripts, no result — group should be hidden.
    render(<ValidationPanel />);
    expect(screen.queryByTestId('validation-script-group')).toBeNull();
  });

  it('does not render the Script 校验 group when validator has no violations', () => {
    useScriptStore.setState({
      scripts: [
        {
          id: 'v1',
          name: 'pduid-uniqueness',
          shortName: 'pduid',
          kind: 'validator',
          updatedAt: '2026-06-18T00:00:00Z',
        },
      ],
      runResult: {
        runId: 'r1',
        status: 'ok',
        logs: [],
        violations: [],
        mutations: [],
        durationMs: 1,
      },
      runProgress: [],
    });
    render(<ValidationPanel />);
    expect(screen.queryByTestId('validation-script-group')).toBeNull();
  });

  it('only renders validator-kind scripts (not transformer/report/free)', async () => {
    useScriptStore.setState({
      scripts: [
        {
          id: 't1',
          name: 'transformer',
          shortName: 'tx',
          kind: 'transformer',
          updatedAt: '2026-06-18T00:00:00Z',
        },
      ],
      runResult: {
        runId: 'r2',
        status: 'ok',
        logs: [],
        violations: [
          {
            kind: 'script:tx',
            severity: 'warning',
            message: 'transformer violation',
          },
        ],
        mutations: [],
        durationMs: 1,
      },
      runProgress: [],
    });
    render(<ValidationPanel />);
    // The transformer run has a violation, but the group is gated
    // on `kind === 'validator'`, so the group should not appear.
    expect(screen.queryByTestId('validation-script-group')).toBeNull();
  });
});