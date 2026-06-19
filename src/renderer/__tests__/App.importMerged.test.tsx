// @vitest-environment jsdom
//
// Sprint 14 / T13 — App.tsx viewMode three-state guard + import-merged
// mount contract.
//
// Test pins:
//   1. When viewMode === 'single' (default), the import-merged column
//      is NOT mounted and the regular LeftPanel is mounted.
//   2. When viewMode === 'import-merged' (after startImport), the
//      import-merged column IS mounted with the ModuleSelectionPanel
//      inside it.
//   3. setViewMode('combined') is rejected (no flip) when
//      viewMode === 'import-merged' — the store sets the localised
//      view-mode-locked error and the viewMode stays 'import-merged'.
//   4. cancelImport drops viewMode back to 'single' and the import-
//      merged column unmounts (LeftPanel returns).

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlModule } from '@core/arxml/types';

import { App } from '../App.js';
import { useArxmlStore } from '../store/useArxmlStore.js';

// Minimal autosarApi stub (mirrors App.test.tsx).
function installAutosarApiStub(): void {
  const stub = {
    getAppVersion: vi.fn().mockResolvedValue('0.12.0'),
    openArxml: vi.fn().mockResolvedValue({ canceled: true }),
    openArxmlMulti: vi.fn().mockResolvedValue({ kind: 'canceled' }),
    parseArxml: vi.fn(),
    saveArxml: vi.fn(),
    projectNew: vi.fn().mockResolvedValue({ kind: 'canceled' }),
    projectOpen: vi.fn().mockResolvedValue({ kind: 'canceled' }),
    projectSave: vi.fn().mockResolvedValue({ kind: 'write-failed', message: '' }),
    openBswmdDialog: vi.fn().mockResolvedValue({ kind: 'canceled' }),
    readBswmd: vi.fn().mockResolvedValue({ kind: 'read-failed', message: '' }),
    pickDir: vi.fn().mockResolvedValue({ kind: 'canceled' }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.autosarApi = stub;
}

function makeContainer(shortName: string): ArxmlContainer {
  return {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName,
    params: {},
    children: [],
  };
}

function makeModule(shortName: string): ArxmlModule {
  return {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName,
    params: {},
    children: [makeContainer(`${shortName}Config`)],
    references: [],
  };
}

function makeDoc(filePath: string, modules: readonly ArxmlModule[]): ArxmlDocument {
  return {
    path: filePath,
    version: '4.6',
    packages: [
      {
        shortName: 'EAS',
        path: '/EAS',
        elements: modules.map((m) => m as ArxmlModule),
      },
    ],
  };
}

beforeEach(() => {
  useArxmlStore.getState().clear();
  installAutosarApiStub();
});

afterEach(() => {
  cleanup();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window.autosarApi;
});

describe('App.tsx — Sprint 14 / T13 viewMode three-state', () => {
  it('does NOT mount the import-merged column when viewMode is "single"', () => {
    const { queryByTestId } = render(<App />);
    expect(queryByTestId('app-import-merged-column')).toBeNull();
    expect(useArxmlStore.getState().viewMode).toBe('single');
  });

  it('mounts the import-merged column when startImport flips viewMode', async () => {
    const { queryByTestId, getByTestId } = render(<App />);
    // import-merged column not present initially.
    expect(queryByTestId('app-import-merged-column')).toBeNull();
    const incoming = makeDoc('/in/Can.arxml', [makeModule('Can')]);
    useArxmlStore.getState().startImport([incoming], ['/in/Can.arxml']);
    await waitFor(() => {
      expect(getByTestId('app-import-merged-column')).toBeInTheDocument();
    });
    expect(useArxmlStore.getState().viewMode).toBe('import-merged');
  });

  it('rejects setViewMode("combined") while viewMode is "import-merged"', () => {
    const incoming = makeDoc('/in/Can.arxml', [makeModule('Can')]);
    useArxmlStore.getState().startImport([incoming], ['/in/Can.arxml']);
    expect(useArxmlStore.getState().viewMode).toBe('import-merged');
    useArxmlStore.getState().setViewMode('combined');
    expect(useArxmlStore.getState().viewMode).toBe('import-merged');
    // The localised view-mode-locked error is set.
    expect(useArxmlStore.getState().error).not.toBeNull();
  });

  it('cancelImport drops back to "single" and unmounts the import-merged column', async () => {
    const incoming = makeDoc('/in/Can.arxml', [makeModule('Can')]);
    useArxmlStore.getState().startImport([incoming], ['/in/Can.arxml']);
    const { queryByTestId } = render(<App />);
    await waitFor(() => {
      expect(queryByTestId('app-import-merged-column')).not.toBeNull();
    });
    useArxmlStore.getState().cancelImport();
    await waitFor(() => {
      expect(queryByTestId('app-import-merged-column')).toBeNull();
    });
    expect(useArxmlStore.getState().viewMode).toBe('single');
  });
});
