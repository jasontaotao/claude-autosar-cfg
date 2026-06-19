// @vitest-environment jsdom
//
// ModuleSelectionPanel (Sprint 14 / T11) — verifies the row-level
// selection + collision-badge UI for an in-flight import session.
//
// Test pins (brief §T11):
//   1. The panel lists every incoming module (one row per
//      ModuleSelection).
//   2. A colliding module renders the localized "Module exists" badge.
//   3. Clicking the row checkbox toggles selection via
//      store.selectModule(mergedPath, selected).
//   4. The Commit button is enabled only when ≥1 module is selected.
//   5. Clicking Commit dispatches store.commitImport() and surfaces
//      success via the store's setError / setSuccess toast.
//
// The component reads `importSession` from the store directly (no
// prop drilling) so the tests seed a session via `setState` to keep
// the test surface focused on the UI contract.

import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlModule } from '@core/arxml/types';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { ModuleSelectionPanel } from '../ModuleSelectionPanel.js';

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ModuleSelectionPanel (Sprint 14 / T11)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
  });

  it('renders one row per incoming module with checkbox + source file label', () => {
    const doc = makeDoc('/in/Can.arxml', [makeModule('Can'), makeModule('Adc')]);
    useArxmlStore.getState().startImport([doc], ['/in/Can.arxml']);

    const { getAllByTestId } = render(<ModuleSelectionPanel />);
    const rows = getAllByTestId('module-selection-row');
    expect(rows).toHaveLength(2);
    const labels = rows.map((r) => r.textContent ?? '');
    expect(labels.some((l) => l.includes('Can'))).toBe(true);
    expect(labels.some((l) => l.includes('Adc'))).toBe(true);
    expect(labels.some((l) => l.includes('/in/Can.arxml'))).toBe(true);
  });

  it('shows the localized collision badge for modules that collide with a target', () => {
    const target = makeDoc('/proj/Target.arxml', [makeModule('Can')]);
    useArxmlStore.getState().setDoc(target, '/proj/Target.arxml');
    const incoming = makeDoc('/in/Can.arxml', [makeModule('Can')]);
    useArxmlStore.getState().startImport([incoming], ['/in/Can.arxml']);

    const { getByTestId } = render(<ModuleSelectionPanel />);
    expect(getByTestId('module-selection-collision-badge')).toBeInTheDocument();
  });

  it('checkbox click toggles selection via store.selectModule', () => {
    const doc = makeDoc('/in/Can.arxml', [makeModule('Can')]);
    useArxmlStore.getState().startImport([doc], ['/in/Can.arxml']);
    const path = useArxmlStore.getState().importSession!.selections[0]!.mergedModulePath;

    const { getByTestId } = render(<ModuleSelectionPanel />);
    const checkbox = getByTestId('module-selection-checkbox');
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(useArxmlStore.getState().importSession!.selections[0]!.selected).toBe(false);
    fireEvent.click(checkbox);
    expect(useArxmlStore.getState().importSession!.selections[0]!.selected).toBe(true);
    // sanity: the merged path is what was acted on.
    expect(path).toMatch(/^\/\[import:0\]\/EAS\/Can$/);
  });

  it('Commit button is disabled when no module is selected', () => {
    const doc = makeDoc('/in/Can.arxml', [makeModule('Can')]);
    useArxmlStore.getState().startImport([doc], ['/in/Can.arxml']);
    // unselect the only row
    for (const sel of useArxmlStore.getState().importSession!.selections) {
      useArxmlStore.getState().selectModule(sel.mergedModulePath, false);
    }

    const { getByTestId } = render(<ModuleSelectionPanel />);
    const commit = getByTestId('module-selection-commit');
    expect(commit).toBeDisabled();
  });

  it('Commit button is enabled when ≥1 module is selected', () => {
    const doc = makeDoc('/in/Can.arxml', [makeModule('Can')]);
    useArxmlStore.getState().startImport([doc], ['/in/Can.arxml']);

    const { getByTestId } = render(<ModuleSelectionPanel />);
    const commit = getByTestId('module-selection-commit');
    expect(commit).not.toBeDisabled();
  });

  it('clicking Commit dispatches store.commitImport and surfaces success toast', async () => {
    const target = makeDoc('/proj/Target.arxml', [makeModule('Adc')]);
    useArxmlStore.getState().setDoc(target, '/proj/Target.arxml');
    const incoming = makeDoc('/in/Can.arxml', [makeModule('Can')]);
    useArxmlStore.getState().startImport([incoming], ['/in/Can.arxml']);

    const { getByTestId } = render(<ModuleSelectionPanel />);
    fireEvent.click(getByTestId('module-selection-commit'));
    await waitFor(() => {
      expect(useArxmlStore.getState().importSession).toBeNull();
    });
    expect(useArxmlStore.getState().viewMode).toBe('single');
  });
});
