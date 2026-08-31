import { beforeEach, describe, expect, it } from 'vitest';

import { useArxmlStore } from '../useArxmlStore.js';

describe('useArxmlStore diagnostics', () => {
  beforeEach(() => {
    useArxmlStore.setState({ diagnostics: [] });
  });

  it('appendDiagnostic adds a timestamped entry', () => {
    const entry = useArxmlStore.getState().appendDiagnostic({
      level: 'debug',
      message: 'snapshot',
      source: 'test',
      detail: 'docs=1',
    });
    const entries = useArxmlStore.getState().diagnostics;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe(entry.id);
    expect(entries[0]?.level).toBe('debug');
    expect(entries[0]?.source).toBe('test');
    expect(entries[0]?.detail).toBe('docs=1');
    expect(entries[0]?.ts).toBeTypeOf('number');
  });

  it('caps the ring buffer at 500 entries', () => {
    const state = useArxmlStore.getState();
    for (let i = 0; i < 502; i += 1) {
      state.appendDiagnostic({ level: 'info', message: `entry-${i}` });
    }
    const entries = useArxmlStore.getState().diagnostics;
    expect(entries).toHaveLength(500);
    expect(entries[0]?.message).toBe('entry-2');
    expect(entries.at(-1)?.message).toBe('entry-501');
  });

  it('clearDiagnostics resets history', () => {
    useArxmlStore.getState().setSuccess('saved');
    expect(useArxmlStore.getState().diagnostics).not.toHaveLength(0);
    useArxmlStore.getState().clearDiagnostics();
    expect(useArxmlStore.getState().diagnostics).toHaveLength(0);
  });
});
