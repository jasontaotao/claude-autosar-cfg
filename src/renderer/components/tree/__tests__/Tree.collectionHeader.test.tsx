// @vitest-environment jsdom
//
// Phase P1 T3 — CollectionHeader integration into Tree.renderChildren.
//
// Wires the synthetic CollectionHeader row above groups of same-shortName
// siblings (≥2). Behavior pin (per the design spec at
// docs/superpowers/specs/2026-07-13-multi-instance-tree-ui-design.md):
//
//   1. ≥2 same-shortName siblings → CollectionHeader renders with ×N count.
//   2. Single child with a finite upper bound → no CollectionHeader row.
//   3. Single child with an 'infinite' upper bound → CollectionHeader
//      renders with ×1 so the `+ 1` affordance stays available at count 1
//      (fixes the dead zone where the optional-add placeholder disappears
//      at count 1 but the header only appeared at ≥2).
//   3. Default-collapsed → real sibling TreeNode rows are HIDDEN.
//   4. Chevron click → toggles expand; real sibling rows become visible.
//   5. `+` button disabled when count >= BSWMD upperMultiplicity.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ArxmlDocument, ArxmlElement } from '@core/arxml/types.js';
import type { BswModuleDef, BswmdDocument, ContainerDef } from '@core/project/bswmd.js';
import type { Locale } from '@shared/i18n/index.js';

import { Tree } from '../Tree.js';
import type { ArxmlStoreApi } from '../Tree.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Build a real container element. Mirrors the `makeContainer` shape used by
 * Tree.optionalContainers.test.tsx:85-130 so the fixtures stay uniform.
 */
const makeEl = (shortName: string, definitionRef?: string): ArxmlElement => ({
  kind: 'container',
  tagName: 'ECUC-CONTAINER-VALUE',
  shortName,
  ...(definitionRef === undefined ? {} : { definitionRef }),
  params: {},
  children: [],
});

/**
 * Build the value-side doc containing a single parent container whose
 * `children` array is `childElements`. The parent path is
 * `/EAS/JWQ3399/JWQ3399ConfigSet` so the BSWMD walker can resolve it.
 */
function makeDocWithSiblings(childElements: readonly ArxmlElement[]): ArxmlDocument {
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
            children: [
              {
                kind: 'container',
                tagName: 'ECUC-CONTAINER-VALUE',
                shortName: 'JWQ3399ConfigSet',
                params: {},
                children: [...childElements],
              },
            ],
            references: [],
          },
        ],
      },
    ],
  };
}

/**
 * Build a BSWMD ContainerDef for a sibling child.
 */
const makeSiblingDef = (
  shortName: string,
  lowerMultiplicity: number,
  upperMultiplicity: number | 'infinite',
): ContainerDef => ({
  shortName,
  path: `/EAS/JWQ3399/JWQ3399ConfigSet/${shortName}`,
  lowerMultiplicity,
  upperMultiplicity,
  subContainers: [],
  parameters: [],
  references: [],
  choices: [],
});

/**
 * Build a BSWMD BswModuleDef for JWQ3399 with the given sibling ContainerDefs.
 */
function makeBswmdModule(siblingDefs: readonly ContainerDef[]): BswModuleDef {
  return {
    shortName: 'JWQ3399',
    path: '/EAS/JWQ3399',
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [
      {
        shortName: 'JWQ3399ConfigSet',
        path: '/EAS/JWQ3399/JWQ3399ConfigSet',
        lowerMultiplicity: 1,
        upperMultiplicity: 1,
        subContainers: [...siblingDefs],
        parameters: [],
        references: [],
        choices: [],
      },
    ],
    providedEntries: [],
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
  };
}

function makeBswmd(siblingDefs: readonly ContainerDef[]): BswmdDocument {
  return {
    version: '4.6',
    modules: [makeBswmdModule(siblingDefs)],
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Mock store factory
// ---------------------------------------------------------------------------

interface MockState {
  doc: ArxmlDocument;
  displayDoc: ArxmlDocument;
  filePath: string;
  selectedPath: string | null;
  dirtyPaths: ReadonlySet<string>;
  activeDocumentPath: string;
  setDoc: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  updateParam: ReturnType<typeof vi.fn>;
  markSaved: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  locale: Locale;
  bswmdSchemas: readonly BswmdDocument[];
  addContainer: ReturnType<typeof vi.fn>;
}

function makeStoreApi(opts: {
  readonly doc: ArxmlDocument;
  readonly bswmdSchemas: readonly BswmdDocument[];
  readonly addContainer?: ReturnType<typeof vi.fn>;
}): { api: ArxmlStoreApi; state: MockState } {
  const state: MockState = {
    doc: opts.doc,
    displayDoc: opts.doc,
    filePath: '/fake/JWQ3399.ecuc.arxml',
    selectedPath: null,
    dirtyPaths: new Set(),
    activeDocumentPath: '/fake/JWQ3399.ecuc.arxml',
    setDoc: vi.fn(),
    select: vi.fn(),
    updateParam: vi.fn(),
    markSaved: vi.fn(),
    clear: vi.fn(),
    locale: 'en',
    bswmdSchemas: opts.bswmdSchemas,
    addContainer: opts.addContainer ?? vi.fn(),
  };
  const api: ArxmlStoreApi = {
    getState: () => state,
    subscribe: () => () => undefined,
  };
  return { api, state };
}

/**
 * Expand `/EAS > JWQ3399 > JWQ3399ConfigSet` so the sibling children render.
 */
function expandToConfigSet(): void {
  fireEvent.click(screen.getByTestId('chevron-/EAS'));
  fireEvent.click(screen.getByTestId('chevron-/EAS/JWQ3399'));
  fireEvent.click(screen.getByTestId('chevron-/EAS/JWQ3399/JWQ3399ConfigSet'));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe('Tree -- definition-based collection grouping', () => {
  it('groups numeric and custom instance names by definition-ref', () => {
    const definitionRef = '/EAS/JWQ3399/JWQ3399ConfigSet/Cell';
    const doc = makeDocWithSiblings([
      makeEl('Cell_1', definitionRef),
      makeEl('Cell_2', definitionRef),
      makeEl('Cell_A', definitionRef),
    ]);
    const bswmd = makeBswmd([makeSiblingDef('Cell', 0, 'infinite')]);
    const { api } = makeStoreApi({ doc, bswmdSchemas: [bswmd] });

    render(<Tree store={api} />);
    expandToConfigSet();

    const header = screen.getByTestId('treeitem-collection-Cell');
    expect(within(header).getByText(/×3/)).toBeInTheDocument();
    expect(screen.queryByTestId('treeitem-collection-Cell_A')).toBeNull();
    expect(screen.getByTestId('treeitem-/EAS/JWQ3399/JWQ3399ConfigSet/Cell_A')).toBeInTheDocument();
    expect(screen.queryByTestId('add-optional-/EAS_JWQ3399_JWQ3399ConfigSet_Cell')).toBeNull();
  });
});

describe('Tree -- collection header integration (P1 T3)', () => {
  it('renders collection header with ×N badge when ≥2 siblings share shortName', () => {
    const doc = makeDocWithSiblings([
      makeEl('AFECellValidSet'),
      makeEl('AFECellValidSet_1'),
      makeEl('AFECellValidSet_2'),
    ]);
    const bswmd = makeBswmd([makeSiblingDef('AFECellValidSet', 0, 'infinite')]);
    const { api } = makeStoreApi({ doc, bswmdSchemas: [bswmd] });
    render(<Tree store={api} />);
    expandToConfigSet();

    // Collection header row appears with the base shortName.
    const header = screen.getByTestId('treeitem-collection-AFECellValidSet');
    expect(header).toBeInTheDocument();
    expect(header).toHaveAttribute('data-kind', 'collection');
    // The ×N count is the size of the largest same-baseName group.
    expect(within(header).getByText(/×3/)).toBeInTheDocument();
  });

  it('renders a collection header with an enabled +1 for a single unbounded (0..*) sibling', () => {
    const doc = makeDocWithSiblings([makeEl('AFECellValidSet')]);
    const bswmd = makeBswmd([makeSiblingDef('AFECellValidSet', 0, 'infinite')]);
    const addContainerSpy = vi.fn();
    const { api } = makeStoreApi({ doc, bswmdSchemas: [bswmd], addContainer: addContainerSpy });
    render(<Tree store={api} />);
    expandToConfigSet();

    // Single-instance unbounded collections get the header so the
    // `+ 1` affordance is available at count 1 — the placeholder row
    // (count 0) hands off to the header row (count ≥1) without a gap.
    const header = screen.getByTestId('treeitem-collection-AFECellValidSet');
    expect(header).toBeInTheDocument();
    expect(within(header).getByText(/×1/)).toBeInTheDocument();

    // The single real sibling renders inside the collection branch.
    expect(
      screen.getByTestId('treeitem-/EAS/JWQ3399/JWQ3399ConfigSet/AFECellValidSet'),
    ).toBeInTheDocument();

    // The + button is enabled and invokes addContainer with the
    // collection's parent path + base name (auto-suffix is produced by
    // coreAddContainer; the renderer passes the base name).
    const addBtn = screen.getByTestId('add-collection-AFECellValidSet');
    expect(addBtn).toBeEnabled();
    fireEvent.click(addBtn);
    expect(addContainerSpy).toHaveBeenCalledTimes(1);
    expect(addContainerSpy).toHaveBeenCalledWith(
      '/EAS/JWQ3399/JWQ3399ConfigSet',
      'AFECellValidSet',
    );
  });

  it('does NOT render a collection header for a single finite 0..1 sibling (already at max)', () => {
    const doc = makeDocWithSiblings([makeEl('AFETempValidSet')]);
    const bswmd = makeBswmd([makeSiblingDef('AFETempValidSet', 0, 1)]);
    const { api } = makeStoreApi({ doc, bswmdSchemas: [bswmd] });
    render(<Tree store={api} />);
    expandToConfigSet();

    // Finite upper bounds keep the ≥2 threshold: a single 0..1
    // container is already at max, so a header row would only add
    // visual noise without enabling anything.
    expect(screen.queryByTestId('treeitem-collection-AFETempValidSet')).toBeNull();
    // The single real sibling renders as a normal TreeNode.
    expect(
      screen.getByTestId('treeitem-/EAS/JWQ3399/JWQ3399ConfigSet/AFETempValidSet'),
    ).toBeInTheDocument();
  });

  it('shows real siblings under collection header by default (expanded)', () => {
    const doc = makeDocWithSiblings([
      makeEl('AFECellValidSet'),
      makeEl('AFECellValidSet_1'),
      makeEl('AFECellValidSet_2'),
    ]);
    const bswmd = makeBswmd([makeSiblingDef('AFECellValidSet', 0, 'infinite')]);
    const { api } = makeStoreApi({ doc, bswmdSchemas: [bswmd] });
    render(<Tree store={api} />);
    expandToConfigSet();

    // Default-EXPANDED: the collection header renders alongside the
    // 3 real sibling rows. The header carries the synthetic `×N`
    // count and the chevron shows ▾ (expanded) — clicking it will
    // collapse the whole group. This is the behavior the user
    // asked for in session 225 (default-expanded, opposite of the
    // earlier default-collapsed design).
    expect(screen.getByTestId('treeitem-collection-AFECellValidSet')).toBeInTheDocument();
    expect(
      screen.getByTestId('treeitem-/EAS/JWQ3399/JWQ3399ConfigSet/AFECellValidSet'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('treeitem-/EAS/JWQ3399/JWQ3399ConfigSet/AFECellValidSet_1'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('treeitem-/EAS/JWQ3399/JWQ3399ConfigSet/AFECellValidSet_2'),
    ).toBeInTheDocument();
  });

  it('collapses real siblings when the collection header chevron is clicked', () => {
    const doc = makeDocWithSiblings([
      makeEl('AFECellValidSet'),
      makeEl('AFECellValidSet_1'),
      makeEl('AFECellValidSet_2'),
    ]);
    const bswmd = makeBswmd([makeSiblingDef('AFECellValidSet', 0, 'infinite')]);
    const addContainerSpy = vi.fn();
    const { api } = makeStoreApi({ doc, bswmdSchemas: [bswmd], addContainer: addContainerSpy });
    render(<Tree store={api} />);
    expandToConfigSet();

    // Default-expanded → all 3 real siblings visible.
    expect(
      screen.getByTestId('treeitem-/EAS/JWQ3399/JWQ3399ConfigSet/AFECellValidSet_1'),
    ).toBeInTheDocument();

    // Click the chevron to collapse the collection.
    fireEvent.click(screen.getByTestId('chevron-collection-AFECellValidSet'));

    // After collapse all 3 real siblings are hidden from the DOM.
    expect(
      screen.queryByTestId('treeitem-/EAS/JWQ3399/JWQ3399ConfigSet/AFECellValidSet'),
    ).toBeNull();
    expect(
      screen.queryByTestId('treeitem-/EAS/JWQ3399/JWQ3399ConfigSet/AFECellValidSet_1'),
    ).toBeNull();
    expect(
      screen.queryByTestId('treeitem-/EAS/JWQ3399/JWQ3399ConfigSet/AFECellValidSet_2'),
    ).toBeNull();

    // Clicking the enabled `+` button must invoke `addContainer` with the
    // collection's parent path + base name (auto-suffix is produced by
    // `coreAddContainer` at src/core/arxml/mutation/container-ops.ts:98-103;
    // the renderer just passes base name). A wrong parent path or base
    // name would pass all earlier scenarios, so we pin both args here.
    fireEvent.click(screen.getByTestId('add-collection-AFECellValidSet'));
    expect(addContainerSpy).toHaveBeenCalledTimes(1);
    expect(addContainerSpy).toHaveBeenCalledWith(
      '/EAS/JWQ3399/JWQ3399ConfigSet',
      'AFECellValidSet',
    );
  });

  it('disables + button in collection header when count >= upperMultiplicity', () => {
    // Two siblings of AFETempValidSet → header renders (group.length >= 2),
    // AND count=2 >= upperMultiplicity=1 → + button disabled with
    // '已达上限' aria-label.
    const doc = makeDocWithSiblings([makeEl('AFETempValidSet'), makeEl('AFETempValidSet_1')]);
    const bswmd = makeBswmd([makeSiblingDef('AFETempValidSet', 0, 1)]);
    const { api } = makeStoreApi({ doc, bswmdSchemas: [bswmd] });
    render(<Tree store={api} />);
    expandToConfigSet();

    const header = screen.getByTestId('treeitem-collection-AFETempValidSet');
    expect(header).toBeInTheDocument();
    const addBtn = screen.getByTestId('add-collection-AFETempValidSet');
    expect(addBtn).toBeDisabled();
    expect(addBtn).toHaveAttribute('aria-label', expect.stringContaining('已达上限'));
  });
});

describe('Tree -- collection header selection', () => {
  const definitionRef = '/EAS/JWQ3399/JWQ3399ConfigSet/Cell';
  const expectedKey =
    'collection:/EAS/JWQ3399/JWQ3399ConfigSet/definition:/EAS/JWQ3399/JWQ3399ConfigSet/Cell';

  function renderSelectableCollection(): { state: MockState } {
    const doc = makeDocWithSiblings([
      makeEl('Cell_1', definitionRef),
      makeEl('Cell_2', definitionRef),
    ]);
    const bswmd = makeBswmd([makeSiblingDef('Cell', 0, 'infinite')]);
    const { api, state } = makeStoreApi({ doc, bswmdSchemas: [bswmd] });
    render(<Tree store={api} />);
    expandToConfigSet();
    return { state };
  }

  it('clicking the collection label selects the collection key', () => {
    const { state } = renderSelectableCollection();

    fireEvent.click(screen.getByTestId('collection-label-Cell'));

    expect(state.select).toHaveBeenCalledTimes(1);
    expect(state.select).toHaveBeenCalledWith(expectedKey);
  });

  it('clicking the chevron or the +1 button does not select the collection', () => {
    const { state } = renderSelectableCollection();

    fireEvent.click(screen.getByTestId('chevron-collection-Cell'));
    fireEvent.click(screen.getByTestId('add-collection-Cell'));

    expect(state.select).not.toHaveBeenCalled();
  });

  it('marks the header aria-selected when selectedPath is the collection key', () => {
    const doc = makeDocWithSiblings([
      makeEl('Cell_1', definitionRef),
      makeEl('Cell_2', definitionRef),
    ]);
    const bswmd = makeBswmd([makeSiblingDef('Cell', 0, 'infinite')]);
    const { api, state } = makeStoreApi({ doc, bswmdSchemas: [bswmd] });
    state.selectedPath = expectedKey;
    render(<Tree store={api} />);
    expandToConfigSet();

    expect(screen.getByTestId('treeitem-collection-Cell')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
