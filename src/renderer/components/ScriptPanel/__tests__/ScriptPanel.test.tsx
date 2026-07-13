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

import type { ScriptRunResult } from '@shared/script/types';

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
  /**
   * v1.54.0 PATCH C (F-A4-01 2/3 closure) — spy on the unsubscribe
   * fn returned by `onScriptProgress` so unmount-cleanup assertions
   * can verify the panel actually invoked it. Without this spy
   * the original test passed silently even if the panel forgot
   * the cleanup.
   */
  onScriptProgressUnsubscribe: ReturnType<typeof vi.fn>;
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
  const onScriptProgressUnsubscribe = vi.fn();
  const onScriptProgress = vi.fn().mockReturnValue(onScriptProgressUnsubscribe);
  return {
    listScripts,
    saveScript: vi.fn().mockResolvedValue({ id: 's1' }),
    deleteScript: vi.fn().mockResolvedValue({ ok: true }),
    runScript: vi.fn().mockResolvedValue(SAMPLE),
    onScriptProgress,
    onScriptProgressUnsubscribe,
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

  it('handleRun catches runScript rejection and logs to console.error (v1.41.0 M4)', async () => {
    // M4: round-5 review flagged `void runScript(...)` (fire-and-forget)
    // as a potential unhandled rejection source if the IPC layer throws
    // (e.g. renderer unmounted mid-call, or the store action itself
    // rejects before its internal try/catch). The handleRun
    // implementation now attaches a `.catch()` that logs to
    // console.error. This test pins that contract: a rejected
    // `useScriptStore.runScript` must be intercepted at the call
    // site, not escape to the test runner.
    //
    // We override the store's `runScript` directly because the real
    // store action catches IPC errors internally and converts them
    // to a runtime-error result — to exercise the call-site `.catch`
    // we need the store action itself to reject.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runScriptSpy = vi
      .spyOn(useScriptStore.getState(), 'runScript')
      .mockRejectedValueOnce(new Error('IPC layer failure'));
    render(<ScriptPanel />);
    await waitFor(() => expect(screen.getByTestId('script-row-s1')).not.toBeNull());
    fireEvent.click(screen.getByTestId('script-btn-run'));
    // Wait for the rejection to be caught + logged. We assert on
    // the spy call (not on a global unhandledrejection event) because
    // the test environment treats spy.mock.calls as the contract.
    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalled();
    });
    // The store action must have been attempted (so the catch is
    // exercised).
    expect(runScriptSpy).toHaveBeenCalled();
    // Scope the assertion to ScriptPanel's catch handler — other
    // errors could in principle be logged by other code paths.
    const scriptPanelCalls = errorSpy.mock.calls.filter(
      (args) => args[0] === '[ScriptPanel] runScript failed:',
    );
    expect(scriptPanelCalls).toHaveLength(1);
    const [prefix, err] = scriptPanelCalls[0] ?? [];
    expect(prefix).toBe('[ScriptPanel] runScript failed:');
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('IPC layer failure');
  });

  // v1.54.0 PATCH C (F-A4-01 2/3 closure) — unmount cleanup path for
  // `onScriptProgress` subscription. ScriptPanel subscribes via
  // useScriptActions().subscribeProgress() in a useEffect whose
  // cleanup returns the unsubscribe fn. Without an explicit assertion
  // a regression that drops the unsubscribe would silently leak
  // `ipcRenderer.on(...)` subscriptions across React StrictMode
  // double-mount or app reload.
  it('invokes the onScriptProgress unsubscribe on unmount', () => {
    expect(api.onScriptProgress).not.toHaveBeenCalled();
    expect(api.onScriptProgressUnsubscribe).not.toHaveBeenCalled();
    const { unmount } = render(<ScriptPanel />);
    expect(api.onScriptProgress).toHaveBeenCalledTimes(1);
    expect(api.onScriptProgressUnsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(api.onScriptProgressUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
