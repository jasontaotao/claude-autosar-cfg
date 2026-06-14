// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseArxml } from '@core/arxml/parser.js';
import type { ArxmlDocument } from '@core/arxml/types.js';

import { Tree } from '../Tree.js';
import type { ArxmlStoreApi } from '../Tree.js';

// Use fireEvent over @testing-library/user-event to avoid pulling in a new
// runtime dep mid-sprint. fireEvent dispatches a single synthetic event which
// is sufficient for the keyboard + click interactions exercised here.

// ---------------------------------------------------------------------------
// Fixtures: a small ArxmlDocument with packages / modules / containers / refs.
// Mirrors the structure we expect from the parser. Two top-level packages,
// each with one module, each with one container, each with one param and a ref.
// ---------------------------------------------------------------------------

const XML = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES>
  <AR-PACKAGE><SHORT-NAME>EAS</SHORT-NAME><ELEMENTS>
    <ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>EcuC</SHORT-NAME>
      <CONTAINERS>
        <ECUC-CONTAINER-VALUE><SHORT-NAME>EcuCGeneral</SHORT-NAME>
          <PARAMETER-VALUES>
            <ECUC-NUMERICAL-PARAM-VALUE>
              <DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/EAS/EcuC/EcuCGeneral/ConfigConsistencyRequired</DEFINITION-REF>
              <VALUE>1</VALUE>
            </ECUC-NUMERICAL-PARAM-VALUE>
          </PARAMETER-VALUES>
        </ECUC-CONTAINER-VALUE>
      </CONTAINERS>
      <REFERENCES>
        <ECUC-REFERENCE-VALUE>
          <DEFINITION-REF DEST="ECUC-SYMBOLIC-NAME-REFERENCE-DEF">/EAS/EcuC/DemoRef</DEFINITION-REF>
          <VALUE-REF DEST="ECUC-MODULE-DEF">/Other/Module</VALUE-REF>
        </ECUC-REFERENCE-VALUE>
      </REFERENCES>
    </ECUC-MODULE-CONFIGURATION-VALUES>
  </ELEMENTS></AR-PACKAGE>
  <AR-PACKAGE><SHORT-NAME>Com</SHORT-NAME><ELEMENTS>
    <ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>Com</SHORT-NAME>
      <CONTAINERS>
        <ECUC-CONTAINER-VALUE><SHORT-NAME>ComConfig</SHORT-NAME>
          <PARAMETER-VALUES>
            <ECUC-NUMERICAL-PARAM-VALUE>
              <DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/Com/Com/ComConfig/ComIPduCount</DEFINITION-REF>
              <VALUE>3</VALUE>
            </ECUC-NUMERICAL-PARAM-VALUE>
          </PARAMETER-VALUES>
        </ECUC-CONTAINER-VALUE>
      </CONTAINERS>
    </ECUC-MODULE-CONFIGURATION-VALUES>
  </ELEMENTS></AR-PACKAGE>
</AR-PACKAGES></AUTOSAR>`;

function makeDoc(): ArxmlDocument {
  const r = parseArxml(XML);
  if (!r.ok) throw new Error(`fixture parse failed: ${r.error}`);
  return r.value;
}

interface MockState {
  doc: ArxmlDocument | null;
  filePath: string | null;
  selectedPath: string | null;
  dirty: boolean;
  setDoc: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  updateParam: ReturnType<typeof vi.fn>;
  markSaved: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
}

function makeStoreApi(initial: Partial<MockState> = {}): {
  api: ArxmlStoreApi;
  state: MockState;
} {
  const state: MockState = {
    doc: null,
    filePath: null,
    selectedPath: null,
    dirty: false,
    setDoc: vi.fn(),
    select: vi.fn(),
    updateParam: vi.fn(),
    markSaved: vi.fn(),
    clear: vi.fn(),
    ...initial,
  };
  const api: ArxmlStoreApi = {
    getState: () => state,
    subscribe: () => () => undefined,
  };
  return { api, state };
}

// ---------------------------------------------------------------------------
// Test 1: empty doc → empty placeholder, no role=tree in DOM.
// ---------------------------------------------------------------------------
describe('Tree (empty doc)', () => {
  it('renders an empty-state placeholder when no doc is loaded', () => {
    const { api } = makeStoreApi();
    render(<Tree store={api} />);
    expect(screen.getByText(/no file loaded/i)).toBeInTheDocument();
    expect(screen.queryByRole('tree')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 2: with doc, top-level packages render with role=tree, children collapsed
// by default (only one level of treeitems visible).
// ---------------------------------------------------------------------------
describe('Tree (with doc)', () => {
  let doc: ArxmlDocument;

  beforeEach(() => {
    doc = makeDoc();
  });

  it('renders all packages as top-level treeitems; children collapsed by default', () => {
    const { api } = makeStoreApi({ doc });
    render(<Tree store={api} />);

    const tree = screen.getByRole('tree', { name: /arxml structure/i });
    expect(tree).toBeInTheDocument();

    // Both packages visible
    const eTree = within(tree).getByRole('treeitem', { name: /EAS/ });
    const cTree = within(tree).getByRole('treeitem', { name: /Com/ });
    expect(eTree).toHaveAttribute('aria-expanded', 'false');
    expect(cTree).toHaveAttribute('aria-expanded', 'false');

    // Modules not yet visible (collapsed)
    expect(within(tree).queryByRole('treeitem', { name: /EcuC/ })).toBeNull();
  });

  it('expands a package on chevron click to reveal modules', () => {
    const { api } = makeStoreApi({ doc });
    render(<Tree store={api} />);

    const tree = screen.getByRole('tree');
    const ePkg = within(tree).getByRole('treeitem', { name: /EAS/ });
    const chevron = within(ePkg).getByRole('button', { name: /toggle eas/i });

    fireEvent.click(chevron);
    expect(ePkg).toHaveAttribute('aria-expanded', 'true');

    // Module now visible
    expect(within(tree).getByRole('treeitem', { name: /EcuC/ })).toBeInTheDocument();
  });

  it('selects a node on click and highlights it via aria-selected', () => {
    const { api, state } = makeStoreApi({ doc });
    render(<Tree store={api} />);

    const tree = screen.getByRole('tree');
    const ePkg = within(tree).getByRole('treeitem', { name: /EAS/ });
    fireEvent.click(within(ePkg).getByRole('button', { name: /toggle eas/i }));

    const module = within(tree).getByRole('treeitem', { name: /EcuC/ });
    fireEvent.click(module);

    expect(state.select).toHaveBeenCalledWith('/EAS/EcuC');
  });

  it('shows aria-selected=true on the node matching selectedPath (after expand)', () => {
    const { api } = makeStoreApi({ doc, selectedPath: '/EAS/EcuC' });
    render(<Tree store={api} />);

    const tree = screen.getByRole('tree');
    const ePkg = within(tree).getByRole('treeitem', { name: /EAS/ });
    fireEvent.click(within(ePkg).getByRole('button', { name: /toggle eas/i }));

    const module = within(tree).getByRole('treeitem', { name: /EcuC/ });
    expect(module).toHaveAttribute('aria-selected', 'true');
    // siblings: other package still unselected
    const otherPkg = within(tree).getByRole('treeitem', { name: /Com/ });
    expect(otherPkg).toHaveAttribute('aria-selected', 'false');
  });
});

// ---------------------------------------------------------------------------
// Test 3: keyboard accessibility (T9).
// ArrowRight expands, ArrowLeft collapses, ArrowDown/Up move focus, Enter selects.
// ---------------------------------------------------------------------------
describe('Tree (keyboard accessibility)', () => {
  let doc: ArxmlDocument;

  beforeEach(() => {
    doc = makeDoc();
  });

  it('ArrowRight on collapsed treeitem expands it; ArrowLeft collapses it', () => {
    const { api } = makeStoreApi({ doc });
    render(<Tree store={api} />);

    const tree = screen.getByRole('tree');
    const ePkg = within(tree).getByRole('treeitem', { name: /EAS/ });
    ePkg.focus();

    fireEvent.keyDown(ePkg, { key: 'ArrowRight' });
    expect(ePkg).toHaveAttribute('aria-expanded', 'true');
    expect(within(tree).getByRole('treeitem', { name: /EcuC/ })).toBeInTheDocument();

    fireEvent.keyDown(ePkg, { key: 'ArrowLeft' });
    expect(ePkg).toHaveAttribute('aria-expanded', 'false');
    expect(within(tree).queryByRole('treeitem', { name: /EcuC/ })).toBeNull();
  });

  it('ArrowDown / ArrowUp move focus to the next / previous visible treeitem', () => {
    const { api } = makeStoreApi({ doc });
    render(<Tree store={api} />);

    const tree = screen.getByRole('tree');
    const ePkg = within(tree).getByRole('treeitem', { name: /EAS/ });
    ePkg.focus();

    fireEvent.keyDown(ePkg, { key: 'ArrowDown' });
    expect(within(tree).getByRole('treeitem', { name: /Com/ })).toHaveFocus();

    fireEvent.keyDown(within(tree).getByRole('treeitem', { name: /Com/ }), { key: 'ArrowUp' });
    expect(ePkg).toHaveFocus();
  });

  it('Enter on a focused treeitem calls select(path) and toggles expand', () => {
    const { api, state } = makeStoreApi({ doc });
    render(<Tree store={api} />);

    const tree = screen.getByRole('tree');
    const ePkg = within(tree).getByRole('treeitem', { name: /EAS/ });
    ePkg.focus();

    fireEvent.keyDown(ePkg, { key: 'Enter' });
    expect(state.select).toHaveBeenCalledWith('/EAS');
    expect(ePkg).toHaveAttribute('aria-expanded', 'true');
  });

  it('Space on a focused treeitem calls select(path) and toggles expand', () => {
    const { api, state } = makeStoreApi({ doc });
    render(<Tree store={api} />);

    const tree = screen.getByRole('tree');
    const ePkg = within(tree).getByRole('treeitem', { name: /EAS/ });
    ePkg.focus();

    fireEvent.keyDown(ePkg, { key: ' ' });
    expect(state.select).toHaveBeenCalledWith('/EAS');
    expect(ePkg).toHaveAttribute('aria-expanded', 'true');
  });
});
