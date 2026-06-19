// @vitest-environment jsdom
//
// DiffTable (Sprint 14 / T12) — verifies the three-column diff view
// for a single open module. The component reads `importSession` and
// the active target documents from the store, runs `buildModuleDiff`
// lazily on mount (and when the active diff target changes), and
// forwards per-row resolution changes to `store.resolveModule`.
//
// Test pins (brief §T12):
//   1. Three columns rendered: existing / incoming / decision.
//   2. Default resolution = 'overwrite' for incoming-only rows.
//   3. Changing the resolution radio calls
//      store.resolveModule(mergedPath, resolution, containerMap?).
//   4. Nested containers are expandable.
//   5. Param overrides are visually highlighted (a class hook on
//      the cell — tests assert presence, not visual style).
//
// The component is purely additive — `buildModuleDiff` is called
// here, not inside the store. Resolution changes are propagated via
// store.resolveModule; the patch compiler (T8 commitImport) reads
// the latest resolution when the user clicks Commit.

import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlModule,
  ParamValue,
} from '@core/arxml/types';
import type { ImportResolution } from '@core/import/types';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { DiffTable } from '../DiffTable.js';

function makeContainer(shortName: string, params: Record<string, ParamValue> = {}): ArxmlContainer {
  return {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName,
    params,
    children: [],
  };
}

function makeModule(
  shortName: string,
  containers: readonly ArxmlContainer[] = [],
  params: Record<string, ParamValue> = {},
): ArxmlModule {
  return {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName,
    params,
    children: containers,
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

describe('DiffTable (Sprint 14 / T12)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
  });

  it('renders three columns (existing | incoming | decision) when activeModuleForDiff is set', () => {
    const target = makeDoc('/proj/Target.arxml', [
      makeModule('Can', [makeContainer('CanConfig')]),
    ]);
    useArxmlStore.getState().setDoc(target, '/proj/Target.arxml');
    const incoming = makeDoc('/in/Can.arxml', [makeModule('Can', [makeContainer('CanConfig')])]);
    useArxmlStore.getState().startImport([incoming], ['/in/Can.arxml']);
    const path = useArxmlStore.getState().importSession!.selections[0]!.mergedModulePath;
    useArxmlStore.getState().openDiff(path);

    const { getByTestId } = render(<DiffTable />);
    expect(getByTestId('diff-table-column-existing')).toBeInTheDocument();
    expect(getByTestId('diff-table-column-incoming')).toBeInTheDocument();
    expect(getByTestId('diff-table-column-decision')).toBeInTheDocument();
  });

  it('renders nothing when activeModuleForDiff is null', () => {
    const incoming = makeDoc('/in/Can.arxml', [makeModule('Can')]);
    useArxmlStore.getState().startImport([incoming], ['/in/Can.arxml']);
    const { container } = render(<DiffTable />);
    expect(container.firstChild).toBeNull();
  });

  it('default resolution for an incoming-only row is "overwrite"', async () => {
    const target = makeDoc('/proj/Target.arxml', [
      makeModule('Adc', [makeContainer('AdcConfig')]),
    ]);
    useArxmlStore.getState().setDoc(target, '/proj/Target.arxml');
    const incoming = makeDoc('/in/Can.arxml', [
      makeModule('Can', [makeContainer('CanConfig', { x: { type: 'integer', value: 1 } })]),
    ]);
    useArxmlStore.getState().startImport([incoming], ['/in/Can.arxml']);
    const path = useArxmlStore.getState().importSession!.selections[0]!.mergedModulePath;
    useArxmlStore.getState().openDiff(path);

    const { container, getByTestId } = render(<DiffTable />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid^="diff-table-row-incoming-only-"]')).not.toBeNull();
    });
    const radio = getByTestId('diff-table-row-incoming-only-Can-CanConfig-decision-overwrite') as HTMLInputElement;
    expect(radio).toBeChecked();
  });

  it('changing a row radio dispatches store.resolveModule with the new resolution', async () => {
    const target = makeDoc('/proj/Target.arxml', [
      makeModule('Adc', [makeContainer('AdcConfig')]),
    ]);
    useArxmlStore.getState().setDoc(target, '/proj/Target.arxml');
    const incoming = makeDoc('/in/Can.arxml', [
      makeModule('Can', [makeContainer('CanConfig', { x: { type: 'integer', value: 1 } })]),
    ]);
    useArxmlStore.getState().startImport([incoming], ['/in/Can.arxml']);
    const path = useArxmlStore.getState().importSession!.selections[0]!.mergedModulePath;
    useArxmlStore.getState().openDiff(path);

    const { container, getByTestId } = render(<DiffTable />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid^="diff-table-row-incoming-only-"]')).not.toBeNull();
    });
    fireEvent.click(getByTestId('diff-table-row-incoming-only-Can-CanConfig-decision-keep-existing'));
    const resolutions = useArxmlStore.getState().importSession!.resolutions;
    const matching = resolutions.find((r) => r.mergedModulePath === path);
    expect(matching?.resolution).toBe<ImportResolution>('keep-existing');
  });

  it('param override cells carry a highlight class when values differ', async () => {
    const target = makeDoc('/proj/Target.arxml', [
      makeModule('Can', [
        makeContainer('CanConfig', { threshold: { type: 'integer', value: 10 } }),
      ]),
    ]);
    useArxmlStore.getState().setDoc(target, '/proj/Target.arxml');
    const incoming = makeDoc('/in/Can.arxml', [
      makeModule('Can', [
        makeContainer('CanConfig', { threshold: { type: 'integer', value: 42 } }),
      ]),
    ]);
    useArxmlStore.getState().startImport([incoming], ['/in/Can.arxml']);
    const path = useArxmlStore.getState().importSession!.selections[0]!.mergedModulePath;
    useArxmlStore.getState().openDiff(path);

    const { getByTestId } = render(<DiffTable />);
    await waitFor(() => {
      expect(getByTestId('diff-table-param-override-threshold')).toBeInTheDocument();
    });
    expect(
      getByTestId('diff-table-param-override-threshold').classList.contains(
        'diff-table-cell-highlight',
      ),
    ).toBe(true);
  });
});
