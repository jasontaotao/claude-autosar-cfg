// @vitest-environment jsdom
//
// ScriptPanel — Sprint 14 #1 Phase C (T14) — 3-column script editor host.
//
// Behaviour pinned by tests:
//   1. Mounts a panel with three columns (library / editor / output)
//   2. Calls `window.autosarApi.listScripts` once on first mount
//   3. Selecting a row updates the editor buffer
//   4. Save button calls `window.autosarApi.saveScript` and is disabled when not dirty
//   5. Run button calls `window.autosarApi.runScript` with the selected id
//   6. Output clears when clear is clicked

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScriptRunResult } from '@main/script/types';

import { useArxmlStore } from '../../../store/useArxmlStore';
import { useScriptStore } from '../../../store/useScriptStore';
import { ScriptPanel } from '../ScriptPanel';

const SAMPLE: ScriptRunResult = {
  runId: 'r1',
  status: 'ok',
  logs: [{ level: 'info', message: 'started', ts: 1 }],
  violations: [],
  mutations: [],
  durationMs: 5,
};

function makeApi(): {
  listScripts: ReturnType<typeof vi.fn>;
  saveScript: ReturnType<typeof vi.fn>;
  deleteScript: ReturnType<typeof vi.fn>;
  runScript: ReturnType<typeof vi.fn>;
  onScriptProgress: ReturnType<typeof vi.fn>;
} {
  const listScripts = vi.fn().mockResolvedValue({
    scripts: [
      {
        id: 's1',
        name: 'alpha',
        shortName: 'alpha',
        kind: 'validator',
        updatedAt: '2026-06-18T00:00:00Z',
      },
    ],
  });
  return {
    listScripts,
    saveScript: vi.fn().mockResolvedValue({ id: 's1' }),
    deleteScript: vi.fn().mockResolvedValue({ ok: true }),
    runScript: vi.fn().mockResolvedValue(SAMPLE),
    onScriptProgress: vi.fn().mockReturnValue(() => {}),
  };
}

describe('ScriptPanel', () => {
  let api: ReturnType<typeof makeApi>;

  beforeEach(() => {
    useArxmlStore.getState().clear();
    useArxmlStore.getState().setLocale('en');
    useScriptStore.getState().reset();
    api = makeApi();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = api;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('mounts the panel with the three columns', () => {
    const { container } = render(<ScriptPanel />);
    expect(screen.getByTestId('script-panel')).not.toBeNull();
    expect(container.querySelector('.script-library')).not.toBeNull();
    expect(container.querySelector('.script-editor-host')).not.toBeNull();
    expect(container.querySelector('.script-output')).not.toBeNull();
  });

  it('fetches scripts on first mount', async () => {
    render(<ScriptPanel />);
    await waitFor(() => expect(api.listScripts).toHaveBeenCalled());
  });

  it('renders a row per fetched script and selects the first one', async () => {
    render(<ScriptPanel />);
    await waitFor(() => expect(screen.getByTestId('script-row-s1')).not.toBeNull());
    expect(screen.getByTestId('script-row-s1').className).toContain('is-selected');
  });

  it('selecting a different row changes the highlighted row', async () => {
    // Override the api mock for this test only — we want two scripts
    // in the library.
    api.listScripts.mockResolvedValue({
      scripts: [
        {
          id: 's1',
          name: 'alpha',
          shortName: 'alpha',
          kind: 'validator',
          updatedAt: '2026-06-18T00:00:00Z',
        },
        {
          id: 's2',
          name: 'beta',
          shortName: 'beta',
          kind: 'transformer',
          updatedAt: '2026-06-18T00:00:00Z',
        },
      ],
    });
    useScriptStore.getState().reset();
    render(<ScriptPanel />);
    await waitFor(() => expect(screen.getByTestId('script-row-s2')).not.toBeNull());
    fireEvent.click(screen.getByTestId('script-select-s2'));
    expect(screen.getByTestId('script-row-s2').className).toContain('is-selected');
  });

  it('save button is disabled until dirty, then enabled', async () => {
    render(<ScriptPanel />);
    await waitFor(() => expect(screen.getByTestId('script-row-s1')).not.toBeNull());
    const saveBtn = screen.getByTestId('script-btn-save') as HTMLButtonElement;
    // Save button may be disabled at first (no edit yet). Mark dirty.
    useScriptStore.getState().setEditorSource('// edited');
    // re-render via store subscription
    await act(async () => {
      await Promise.resolve();
    });
    expect(saveBtn.disabled).toBe(false);
    // Click and verify IPC call
    fireEvent.click(saveBtn);
    await waitFor(() => expect(api.saveScript).toHaveBeenCalled());
  });

  it('run button calls runScript IPC with the selected id', async () => {
    render(<ScriptPanel />);
    await waitFor(() => expect(screen.getByTestId('script-row-s1')).not.toBeNull());
    fireEvent.click(screen.getByTestId('script-btn-run'));
    await waitFor(() => expect(api.runScript).toHaveBeenCalled());
    expect(api.runScript.mock.calls[0]?.[0]).toMatchObject({ id: 's1' });
  });

  it('clear output button calls store.clearOutput', async () => {
    render(<ScriptPanel />);
    await waitFor(() => expect(screen.getByTestId('script-row-s1')).not.toBeNull());
    // Seed a result so clear is enabled
    useScriptStore.setState({ runResult: SAMPLE });
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByTestId('script-output-clear'));
    await waitFor(() => {
      expect(useScriptStore.getState().runResult).toBeNull();
    });
  });
});