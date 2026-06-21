// @vitest-environment jsdom
//
// S4 (v1.7.2) — optional container visibility.
//
// Pin: Tree renders a muted placeholder row per missing
// `lowerMultiplicity === 0` BSWMD sub-container. The placeholder has
// a `+` button that invokes the existing `addContainer` mutation
// (shipped v1.5.1 PR(4)). Placeholders are deduped by shortName (a
// present lower-0 child is NOT re-surfaced), lower-1 children are
// NEVER surfaced, and a missing BSWMD degrades gracefully (no rows
// render, no error).
//
// Test strategy:
//   1. Build a tiny ECUC doc with EAS > EcuC > EcuCGeneral (parent).
//      EcuCGeneral has one real child `PresentOptional` (covers the
//      dedup test) and no `MissingOptional` (covers the absent test).
//   2. Build a matching BSWMD schema with EcuC > EcuCGeneral
//      declaring:
//        - `PresentOptional` (lowerMultiplicity: 0) — dedup test
//        - `MissingOptional` (lowerMultiplicity: 0) — absent test
//        - `NeverOptional` (lowerMultiplicity: 1) — never-surfaced test
//   3. Mount the Tree, expand through to EcuCGeneral, assert on the
//      placeholder rows by role + accessible name.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ArxmlDocument } from '@core/arxml/types.js';
import type { BswModuleDef, BswmdDocument, ContainerDef } from '@core/project/bswmd.js';
import type { Locale } from '@shared/i18n.js';

import { Tree } from '../Tree.js';
import type { ArxmlStoreApi } from '../Tree.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Parent container `EcuCGeneral` has one real child `PresentOptional`.
 * The `MissingOptional` row is intentionally NOT present in the value
 * tree so the helper should surface a placeholder for it. The
 * `NeverOptional` child is also absent but is lowerMultiplicity=1 so
 * it must NOT be surfaced.
 */

const ecucDoc: ArxmlDocument = {
  path: '/fake/EcuC.ecuc.arxml',
  version: '4.6',
  sourceBswmdPath: '/fake/EcuC.arxml',
  packages: [
    {
      shortName: 'EAS',
      path: '/EAS',
      elements: [
        {
          kind: 'module',
          tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
          shortName: 'EcuC',
          params: {},
          children: [
            {
              kind: 'container',
              tagName: 'ECUC-CONTAINER-VALUE',
              shortName: 'EcuCGeneral',
              params: {},
              children: [
                {
                  kind: 'container',
                  tagName: 'ECUC-CONTAINER-VALUE',
                  shortName: 'PresentOptional',
                  params: {},
                  children: [],
                },
              ],
            },
          ],
          references: [],
        },
      ],
    },
  ],
};

const makeContainer = (
  shortName: string,
  lowerMultiplicity: number,
  upperMultiplicity: number | 'infinite' = 1,
): ContainerDef => ({
  shortName,
  path: `/EAS/EcuC/EcuCGeneral/${shortName}`,
  lowerMultiplicity,
  upperMultiplicity,
  subContainers: [],
  parameters: [],
  references: [],
  choices: [],
});

const ecuGeneralDef: ContainerDef = {
  shortName: 'EcuCGeneral',
  path: '/EAS/EcuC/EcuCGeneral',
  lowerMultiplicity: 1,
  upperMultiplicity: 1,
  subContainers: [
    makeContainer('PresentOptional', 0, 'infinite'),
    makeContainer('MissingOptional', 0, 'infinite'),
    makeContainer('NeverOptional', 1, 1),
  ],
  parameters: [],
  references: [],
  choices: [],
};

const ecuModuleDef: BswModuleDef = {
  shortName: 'EcuC',
  path: '/EAS/EcuC',
  dialect: 'ecuc-module-def',
  moduleId: null,
  containers: [ecuGeneralDef],
  providedEntries: [],
  lowerMultiplicity: 1,
  upperMultiplicity: 1,
};

const bswmd: BswmdDocument = {
  version: '4.6',
  modules: [ecuModuleDef],
  warnings: [],
};

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
  readonly bswmdSchemas: readonly BswmdDocument[];
  readonly addContainer?: ReturnType<typeof vi.fn>;
}): { api: ArxmlStoreApi; state: MockState } {
  const state: MockState = {
    doc: ecucDoc,
    displayDoc: ecucDoc,
    filePath: '/fake/EcuC.ecuc.arxml',
    selectedPath: null,
    dirtyPaths: new Set<string>(),
    activeDocumentPath: '/fake/EcuC.ecuc.arxml',
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

/** Expand the path `/EAS > EcuC > EcuCGeneral` by clicking chevrons. */
function expandToEcuCGeneral(): void {
  fireEvent.click(screen.getByTestId('chevron-/EAS'));
  fireEvent.click(screen.getByTestId('chevron-/EAS/EcuC'));
  fireEvent.click(screen.getByTestId('chevron-/EAS/EcuC/EcuCGeneral'));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Scenario 1: lower-0 child absent from value → placeholder renders.
// ---------------------------------------------------------------------------

describe('Tree optional container visibility (S4)', () => {
  it('renders a placeholder row with a + button when a lower-0 BSWMD child is missing from the value tree', () => {
    const { api } = makeStoreApi({ bswmdSchemas: [bswmd] });
    render(<Tree store={api} />);
    expandToEcuCGeneral();

    // The real child `PresentOptional` is in the value tree.
    const realChild = screen.getByTestId('treeitem-/EAS/EcuC/EcuCGeneral/PresentOptional');
    expect(realChild).toBeInTheDocument();

    // `MissingOptional` is NOT in the value tree but the BSWMD
    // declares it with lowerMultiplicity=0, so a placeholder
    // treeitem must appear. The accessible name is the i18n-driven
    // "Add MissingOptional" string.
    const placeholder = screen.getByRole('treeitem', { name: /Add MissingOptional/ });
    expect(placeholder).toBeInTheDocument();
    expect(placeholder).toHaveAttribute('data-kind', 'optional-add');
    expect(placeholder).toHaveAttribute('aria-disabled', 'true');

    // The + button is inside the placeholder and has the same
    // accessible name (so screen readers announce the action).
    const addBtn = within(placeholder).getByRole('button', { name: /Add MissingOptional/ });
    expect(addBtn).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Scenario 2: lower-0 child already in value → NO placeholder (dedup).
  // -------------------------------------------------------------------------

  it('does NOT render a placeholder when the lower-0 child is already present in the value tree', () => {
    const { api } = makeStoreApi({ bswmdSchemas: [bswmd] });
    render(<Tree store={api} />);
    expandToEcuCGeneral();

    // `PresentOptional` is in both BSWMD (lower-0) and value tree —
    // it must show as a real treeitem, NOT a placeholder.
    const realChild = screen.getByTestId('treeitem-/EAS/EcuC/EcuCGeneral/PresentOptional');
    expect(realChild).toBeInTheDocument();
    expect(realChild).not.toHaveAttribute('data-kind', 'optional-add');
    // No `Add` button anywhere for this child.
    expect(screen.queryByRole('button', { name: /Add PresentOptional/ })).toBeNull();
    // No role=treeitem with the i18n-prefixed add name.
    expect(screen.queryByRole('treeitem', { name: /Add PresentOptional/ })).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Scenario 3: lower-1 child absent from value → NO placeholder.
  // -------------------------------------------------------------------------

  it('does NOT render a placeholder for a lower-1 child even when absent from the value tree', () => {
    const { api } = makeStoreApi({ bswmdSchemas: [bswmd] });
    render(<Tree store={api} />);
    expandToEcuCGeneral();

    // `NeverOptional` is lowerMultiplicity=1 and absent from the
    // value tree. S4 only surfaces lower-0 children.
    expect(screen.queryByTestId('treeitem-/EAS/EcuC/EcuCGeneral/NeverOptional')).toBeNull();
    expect(screen.queryByRole('treeitem', { name: /Add NeverOptional/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add NeverOptional/ })).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Scenario 4: + button click invokes addContainer(parentPath, shortName).
  // -------------------------------------------------------------------------

  it('invokes addContainer(parentPath, shortName) when the + button is clicked', () => {
    const addContainer = vi.fn();
    const { api } = makeStoreApi({ bswmdSchemas: [bswmd], addContainer });
    render(<Tree store={api} />);
    expandToEcuCGeneral();

    const addBtn = screen.getByRole('button', { name: /Add MissingOptional/ });
    fireEvent.click(addBtn);

    expect(addContainer).toHaveBeenCalledTimes(1);
    // The first arg is the value-side parent path of the expanded
    // container; the second arg is the BSWMD shortName of the
    // missing optional child.
    expect(addContainer).toHaveBeenCalledWith('/EAS/EcuC/EcuCGeneral', 'MissingOptional');
  });

  // -------------------------------------------------------------------------
  // Scenario 5: No BSWMD loaded → no placeholders, no errors.
  // -------------------------------------------------------------------------

  it('does NOT render any optional-container placeholders when no BSWMD is loaded', () => {
    const { api } = makeStoreApi({ bswmdSchemas: [] });
    render(<Tree store={api} />);
    expandToEcuCGeneral();

    // Real tree is intact.
    expect(screen.getByTestId('treeitem-/EAS/EcuC/EcuCGeneral/PresentOptional')).toBeInTheDocument();

    // No `Add *` buttons anywhere — the helper returned [] because
    // bswmdSchemas is empty.
    const allAddButtons = screen.queryAllByRole('button', { name: /Add / });
    expect(allAddButtons).toHaveLength(0);

    // No `data-kind="optional-add"` rows.
    const allPlaceholders = document.querySelectorAll('[data-kind="optional-add"]');
    expect(allPlaceholders).toHaveLength(0);
  });
});
