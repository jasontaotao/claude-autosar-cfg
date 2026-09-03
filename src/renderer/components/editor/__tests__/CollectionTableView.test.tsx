// @vitest-environment jsdom
//
// Collection table view — selecting a `collection:<parentPath>/<groupKey>`
// path renders the group's instances as rows and the union of their params
// as columns, with per-cell editors reused from the single-instance
// ParamEditor (MODE_COMPONENT_MAP). Behavior pins:
//
//   1. Rows = collection instances (first column = shortName button that
//      selects the instance path, jumping back to the single-instance view).
//   2. Columns = union of param keys across instances, first-seen order,
//      value-typed columns before reference-typed columns (mirrors the
//      ParamEditor value/reference grouping).
//   3. A param missing on an instance renders a "—" placeholder cell
//      (data-testid `collection-cell-empty-<paramKey>`).
//   4. Cell edits go through the existing editors → store.updateParam with
//      the instance's own containerPath — no new mutation surface.
//   5. An unresolvable collection key renders a not-found hint instead of
//      crashing.

import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ArxmlDocument, ArxmlElement, ParamValue } from '@core/arxml/types';

import { useArxmlStore } from '../../../store/useArxmlStore';
import { CollectionTableView } from '../CollectionTableView';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DEF_REF = '/EAS/JWQ3399/JWQ3399ConfigSet/Cell';
const PARENT_PATH = '/EAS/JWQ3399/JWQ3399ConfigSet';
const COLLECTION_KEY = `collection:${PARENT_PATH}/definition:${DEF_REF}`;

function makeInstance(shortName: string, params: Record<string, ParamValue>): ArxmlElement {
  return {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName,
    definitionRef: DEF_REF,
    params,
    children: [],
  };
}

/** Cell_2 carries the optional `Optional1` string; Cell_A lacks `CanIfRef`. */
function makeInstances(): ArxmlElement[] {
  return [
    makeInstance('Cell_1', {
      Baudrate: { type: 'integer', value: 500000 },
      Activation: { type: 'boolean', value: true },
      Mode: { type: 'enum', value: 'STD_ON' },
      CanIfRef: { type: 'reference', value: '/EAS/CanIf/CanIfCtrl_0' },
    }),
    makeInstance('Cell_2', {
      Baudrate: { type: 'integer', value: 250000 },
      Activation: { type: 'boolean', value: false },
      Mode: { type: 'enum', value: 'STD_OFF' },
      Optional1: { type: 'string', value: 'x' },
      CanIfRef: { type: 'reference', value: '/EAS/CanIf/CanIfCtrl_1' },
    }),
    makeInstance('Cell_A', {
      Baudrate: { type: 'integer', value: 125000 },
      Activation: { type: 'boolean', value: true },
      Mode: { type: 'enum', value: 'STD_ON' },
    }),
  ];
}

function makeDoc(instances: readonly ArxmlElement[]): ArxmlDocument {
  return {
    path: '/fake/JWQ3399.ecuc.arxml',
    version: '4.6',
    sourceBswmdPath: '/fake/JWQ3399.arxml',
    packages: [
      {
        shortName: 'EAS',
        path: '/EAS',
        elements: [
          {
            kind: 'module',
            tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
            shortName: 'JWQ3399',
            params: {},
            references: [],
            children: [
              {
                kind: 'container',
                tagName: 'ECUC-CONTAINER-VALUE',
                shortName: 'JWQ3399ConfigSet',
                params: {},
                children: [...instances],
              },
            ],
          },
        ],
      },
    ],
  };
}

function renderTable(instances: readonly ArxmlElement[] = makeInstances()): void {
  useArxmlStore.getState().setDoc(makeDoc(instances), '/fake/JWQ3399.ecuc.arxml');
  useArxmlStore.getState().select(COLLECTION_KEY);
  render(<CollectionTableView />);
}

beforeEach(() => {
  useArxmlStore.getState().clear();
  useArxmlStore.setState({ locale: 'en' });
});

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe('CollectionTableView', () => {
  it('renders one row per instance with the instance shortName in the first column', () => {
    renderTable();

    expect(screen.getByTestId('collection-table-view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cell_1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cell_2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cell_A' })).toBeInTheDocument();
  });

  it('renders union columns in first-seen order, value columns before reference columns', () => {
    renderTable();

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
    // First column is the instance label; Optional1 (value) must precede
    // CanIfRef (reference) even though CanIfRef appears first in Cell_1.
    expect(headers[0]).toContain('Instance');
    const keys = headers.map((h) => h.replace(/[^A-Za-z0-9].*$/, ''));
    expect(keys).toEqual(['Instance', 'Baudrate', 'Activation', 'Mode', 'Optional1', 'CanIfRef']);
  });

  it('renders "—" placeholder cells for params missing on an instance', () => {
    renderTable();

    // Cell_1 and Cell_A lack Optional1 → 2 placeholders.
    expect(screen.getAllByTestId('collection-cell-empty-Optional1')).toHaveLength(2);
    // Only Cell_A lacks CanIfRef → 1 placeholder.
    expect(screen.getAllByTestId('collection-cell-empty-CanIfRef')).toHaveLength(1);
    // Baudrate is present on all three → no placeholder.
    expect(screen.queryAllByTestId('collection-cell-empty-Baudrate')).toHaveLength(0);
  });

  it('dispatches updateParam with the instance containerPath when a cell is edited', () => {
    renderTable();

    // Row order follows tree order → first Baudrate input belongs to Cell_1.
    const baudrateInputs = screen.getAllByLabelText('Baudrate value');
    fireEvent.change(baudrateInputs[0]!, { target: { value: '125' } });

    const doc = useArxmlStore.getState().doc;
    expect(doc).not.toBeNull();
    if (doc === null) return;
    const module = doc.packages[0]?.elements[0];
    if (module === undefined || module.kind !== 'module') return;
    const configSet = module.children[0];
    if (configSet === undefined || configSet.kind !== 'container') return;
    const cell1 = configSet.children[0];
    if (cell1 === undefined || cell1.kind !== 'container') return;
    expect(cell1.shortName).toBe('Cell_1');
    expect(cell1.params['Baudrate']).toEqual({ type: 'integer', value: 125 });
  });

  it('renders the matching editor per column type (boolean / enum / reference)', () => {
    renderTable();

    // Boolean → one checkbox per instance.
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    // Enum without a loaded BSWMD schema → free-form text fallback.
    expect(screen.getAllByTestId('enum-editor-text-Mode')).toHaveLength(3);
    // Reference → path input; only Cell_1 / Cell_2 carry CanIfRef.
    expect(screen.getAllByLabelText('CanIfRef reference path')).toHaveLength(2);
  });

  it('clicking the instance name selects the instance path (jump to single-instance view)', () => {
    renderTable();

    fireEvent.click(screen.getByRole('button', { name: 'Cell_A' }));

    expect(useArxmlStore.getState().selectedPath).toBe(`${PARENT_PATH}/Cell_A`);
  });

  it('renders a not-found hint when the collection key does not resolve', () => {
    useArxmlStore.getState().setDoc(makeDoc(makeInstances()), '/fake/JWQ3399.ecuc.arxml');
    useArxmlStore.getState().select(`collection:${PARENT_PATH}/name:NoSuchGroup`);
    render(<CollectionTableView />);

    expect(screen.getByTestId('collection-table-empty')).toBeInTheDocument();
  });
});
