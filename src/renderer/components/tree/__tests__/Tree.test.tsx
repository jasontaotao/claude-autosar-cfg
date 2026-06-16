// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseArxml } from '@core/arxml/parser.js';
import type { ArxmlDocument } from '@core/arxml/types.js';
import type { Locale } from '@shared/i18n.js';

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
  dirtyPaths: ReadonlySet<string>;
  activeDocumentPath: string | null;
  setDoc: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  updateParam: ReturnType<typeof vi.fn>;
  markSaved: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  // Sprint 11 Phase 1 (Option A) — required by ArxmlStoreSlice.
  locale: Locale;
}

function makeStoreApi(initial: Partial<MockState> = {}): {
  api: ArxmlStoreApi;
  state: MockState;
} {
  const state: MockState = {
    doc: null,
    filePath: null,
    selectedPath: null,
    dirtyPaths: new Set<string>(),
    activeDocumentPath: null,
    setDoc: vi.fn(),
    select: vi.fn(),
    updateParam: vi.fn(),
    markSaved: vi.fn(),
    clear: vi.fn(),
    // Sprint 11 Phase 1 (Option A) — Tree reads locale from the store
    // so it can re-render the empty hint when the user toggles
    // language. The mock store must satisfy the new ArxmlStoreSlice
    // shape; defaulting to 'en' matches the test assertions below
    // (e.g. "no file loaded" is the en-bundle empty hint).
    locale: 'en',
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

  it('wraps expanded children in a role="group" block (Sprint 9 #5 regression)', () => {
    // Pre-fix: TreeNode rendered `{isExpanded && children}` as direct
    // flex items of the row, making siblings line up horizontally next
    // to the label (visible as a single-row stretched bar in the EB
    // tresos 84-module case). The fix wraps children in
    // <div role="group" class="tree-children"> so they stack vertically.
    const { api } = makeStoreApi({ doc });
    render(<Tree store={api} />);

    const tree = screen.getByRole('tree');
    const ePkg = within(tree).getByRole('treeitem', { name: /EAS/ });
    fireEvent.click(within(ePkg).getByRole('button', { name: /toggle eas/i }));

    // The expanded EAS node now contains a role=group wrapper around its
    // child treeitem(s). Without the wrapper, queryByRole('group') would
    // be null and the children would be direct flex children of the row.
    const group = within(ePkg).getByRole('group');
    expect(group).toBeInTheDocument();
    // The EcuC module sits inside the group, not as a sibling of EAS.
    expect(within(group).getByRole('treeitem', { name: /EcuC/ })).toBeInTheDocument();
  });

  it('separates the row (.tree-item-row) from the children group (column layout, Sprint 9 #5)', () => {
    // Pre-fix the chevron+label+children were all direct flex children of
    // role=treeitem, so the chevron/label/children sat in one horizontal
    // flex line. Post-fix the row is its own .tree-item-row wrapper and
    // the children sit in a sibling role=group — column flex layout.
    const { api } = makeStoreApi({ doc });
    render(<Tree store={api} />);

    const tree = screen.getByRole('tree');
    const ePkg = within(tree).getByRole('treeitem', { name: /EAS/ });
    fireEvent.click(within(ePkg).getByRole('button', { name: /toggle eas/i }));

    // role=treeitem has exactly two direct block children: the row + the group.
    const blockChildren = Array.from(ePkg.children).filter((el) => el.tagName === 'DIV');
    expect(blockChildren).toHaveLength(2);
    expect(blockChildren[0]?.className).toContain('tree-item-row');
    expect(blockChildren[1]?.className).toContain('tree-children');
    expect(blockChildren[1]?.getAttribute('role')).toBe('group');

    // The label button lives inside the row, not the group.
    expect(within(blockChildren[0] as HTMLElement).getByText(/EAS/)).toBeInTheDocument();
    expect(within(blockChildren[1] as HTMLElement).getByText(/EcuC/)).toBeInTheDocument();
  });

  it('renders nested-package siblings as a vertical stack (EB tresos regression)', () => {
    // With the nested-package shape (AUTOSAR > EcucDefs + LifeCycleInfoSets),
    // the two sub-packages of AUTOSAR must appear as two distinct rows in
    // the DOM, not merged into a single horizontal flex line. Verifies the
    // 84-module EB tresos case will render correctly.
    const NESTED_XML = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES>
  <AR-PACKAGE><SHORT-NAME>AUTOSAR</SHORT-NAME><AR-PACKAGES>
    <AR-PACKAGE><SHORT-NAME>EcucDefs</SHORT-NAME><ELEMENTS></ELEMENTS></AR-PACKAGE>
    <AR-PACKAGE><SHORT-NAME>LifeCycleInfoSets</SHORT-NAME><ELEMENTS></ELEMENTS></AR-PACKAGE>
  </AR-PACKAGES></AR-PACKAGE>
</AR-PACKAGES></AUTOSAR>`;
    const r = parseArxml(NESTED_XML);
    if (!r.ok) throw new Error(`nested parse failed: ${r.error}`);
    const nestedDoc = r.value;
    const { api } = makeStoreApi({ doc: nestedDoc });
    render(<Tree store={api} />);

    const tree = screen.getByRole('tree');
    const outer = within(tree).getByRole('treeitem', { name: /AUTOSAR/ });
    fireEvent.click(within(outer).getByRole('button', { name: /toggle autosar/i }));

    // Both EcucDefs and LifeCycleInfoSets must be visible and reachable as
    // separate treeitems, both descended from the AUTOSAR group's
    // children — confirming they are vertical siblings.
    const group = within(outer).getByRole('group');
    const groupTreeitems = within(group).getAllByRole('treeitem');
    expect(groupTreeitems.length).toBeGreaterThanOrEqual(2);
    expect(within(group).getByRole('treeitem', { name: /EcucDefs/ })).toBeInTheDocument();
    expect(within(group).getByRole('treeitem', { name: /LifeCycleInfoSets/ })).toBeInTheDocument();
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

  it('renders the kind as a colored dot indicator instead of a text subtitle', () => {
    // Pre-fix (Sprint 9 follow-up): the element kind ("module" / "container" /
    // "reference") was rendered as a small text badge next to the label,
    // and users scanning the EB tresos BSWMD file misread "module" as part
    // of the label itself. The fix replaces that text badge with a colored
    // dot indicator (aria-label + title carry the kind for screen readers
    // and tooltips). Package rows still use the literal "package" subtitle
    // because "package" is a different category, not an element kind.
    const { api } = makeStoreApi({ doc });
    render(<Tree store={api} />);

    const tree = screen.getByRole('tree');
    const ePkg = within(tree).getByRole('treeitem', { name: /EAS/ });
    fireEvent.click(within(ePkg).getByRole('button', { name: /toggle eas/i }));

    const moduleRow = within(tree).getByRole('treeitem', { name: /EcuC/ });

    // 1. The kind must NOT appear as visible text inside the label button.
    //    Today the subtitle span renders the literal "module" as text — that
    //    is exactly the misread we are eliminating.
    const moduleLabelBtn = within(moduleRow).getByTestId('label-/EAS/EcuC');
    expect(within(moduleLabelBtn).queryByText(/^module$/)).toBeNull();

    // 2. The kind must be conveyed by a dedicated dot indicator span with
    //    the kind-{kind} modifier class for color styling.
    const dot = within(moduleRow).getByTestId('kind-dot-/EAS/EcuC');
    expect(dot.tagName).toBe('SPAN');
    expect(dot.className).toContain('kind-dot');
    expect(dot.className).toContain('kind-module');

    // 3. The dot exposes the kind to assistive tech (aria-label) and
    //    to sighted users on hover (title).
    expect(dot).toHaveAttribute('aria-label', 'module');
    expect(dot).toHaveAttribute('title', 'module');
  });

  it('renders a green dot for container kind elements', () => {
    // Regression guard for the container branch of the kind-dot contract:
    // EcuCGeneral is a CONTAINER (kind="container") and must get the
    // green kind-container dot, distinct from the blue module dot.
    const { api } = makeStoreApi({ doc });
    render(<Tree store={api} />);

    const tree = screen.getByRole('tree');
    const ePkg = within(tree).getByRole('treeitem', { name: /EAS/ });
    fireEvent.click(within(ePkg).getByRole('button', { name: /toggle eas/i }));
    const moduleRow = within(tree).getByRole('treeitem', { name: /EcuC/ });
    fireEvent.click(within(moduleRow).getByRole('button', { name: /toggle ecuc/i }));

    const containerRow = within(tree).getByRole('treeitem', { name: /EcuCGeneral/ });
    const containerLabelBtn = within(containerRow).getByTestId('label-/EAS/EcuC/EcuCGeneral');
    expect(within(containerLabelBtn).queryByText(/^container$/)).toBeNull();

    const dot = within(containerRow).getByTestId('kind-dot-/EAS/EcuC/EcuCGeneral');
    expect(dot.className).toContain('kind-dot');
    expect(dot.className).toContain('kind-container');
    expect(dot).toHaveAttribute('aria-label', 'container');
    expect(dot).toHaveAttribute('title', 'container');
  });

  it('clicking a deep leaf does not collapse its ancestor treeitems (event-bubble guard)', () => {
    // Pre-fix: the outer <div role="treeitem"> onClick was the same
    // handleClick as the label button, with no e.stopPropagation(). A
    // click on a nested child treeitem bubbled up to every ancestor
    // treeitem, calling handleClick on each — which both selected the
    // ancestor AND toggled its expand state. Result: the top-most
    // node collapsed after the user clicked around inside a deep
    // subtree, and the selectedPath kept getting overwritten by the
    // outermost ancestor (last onSelect wins).
    const { api, state } = makeStoreApi({ doc });
    render(<Tree store={api} />);

    const tree = screen.getByRole('tree');

    // Drill into EAS > EcuC so both ancestors are expanded.
    const ePkg = within(tree).getByRole('treeitem', { name: /EAS/ });
    fireEvent.click(within(ePkg).getByRole('button', { name: /toggle eas/i }));
    const ecu = within(tree).getByRole('treeitem', { name: /EcuC/ });
    fireEvent.click(within(ecu).getByRole('button', { name: /toggle ecuc/i }));

    expect(ePkg).toHaveAttribute('aria-expanded', 'true');
    expect(ecu).toHaveAttribute('aria-expanded', 'true');

    // Click the deep leaf EcuCGeneral. Pre-fix this bubbles to EcuC
    // and EAS, calling handleClick on each, which both selects the
    // ancestor and collapses it. Post-fix, only EcuCGeneral is acted
    // on — the leaf has no children so handleClick only selects it.
    const leaf = within(tree).getByRole('treeitem', { name: /EcuCGeneral/ });
    fireEvent.click(leaf);

    // 1) Both ancestors remain expanded (the regression).
    expect(ePkg).toHaveAttribute('aria-expanded', 'true');
    expect(ecu).toHaveAttribute('aria-expanded', 'true');

    // 2) The store was called with the leaf's path, and no ancestor
    //    path was selected after the leaf click. The mock store's
    //    `select` is a vi.fn() that does not propagate to the Tree's
    //    local `selectedPath` mirror, so we assert against the mock
    //    call log rather than aria-selected (consistent with the
    //    existing 'selects a node on click' test on line ~234).
    expect(state.select).toHaveBeenLastCalledWith('/EAS/EcuC/EcuCGeneral');
    const allSelectCalls = state.select.mock.calls.map((c) => c[0]);
    const lastLeafIdx = allSelectCalls.lastIndexOf('/EAS/EcuC/EcuCGeneral');
    expect(lastLeafIdx).toBeGreaterThanOrEqual(0);
    expect(allSelectCalls.slice(lastLeafIdx + 1)).not.toContain('/EAS');
    expect(allSelectCalls.slice(lastLeafIdx + 1)).not.toContain('/EAS/EcuC');
  });

  it('clicking a non-leaf node label selects it without toggling expand state', () => {
    // Pre-fix: the label button's onClick routed through handleClick
    // which did onSelect + (if !isLeaf) onToggle. Result: clicking
    // a non-leaf node's label to inspect it in the right pane also
    // expanded / collapsed it. The chevron is the right place for
    // toggle — match the standard file-tree pattern (VSCode, Finder,
    // Windows Explorer) where label click = select, chevron click =
    // toggle. Keyboard Enter/Space still toggles (also standard tree
    // pattern); only the mouse label-click path is changed.
    const { api, state } = makeStoreApi({ doc });
    render(<Tree store={api} />);

    const tree = screen.getByRole('tree');
    const ePkg = within(tree).getByRole('treeitem', { name: /EAS/ });

    // Expand EAS via chevron.
    fireEvent.click(within(ePkg).getByRole('button', { name: /toggle eas/i }));

    // EcuC is currently collapsed. Click its LABEL (not the chevron).
    // Use the label-/EAS/EcuC testid to target the label button
    // specifically — the kind-dot aria-label bleeds into the label
    // button's accessible name so a name-based query is ambiguous.
    const ecu = within(tree).getByRole('treeitem', { name: /EcuC/ });
    expect(ecu).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(within(ecu).getByTestId('label-/EAS/EcuC'));

    // EcuC must remain collapsed (label click selects only).
    expect(ecu).toHaveAttribute('aria-expanded', 'false');
    // But select was called with the node's path.
    expect(state.select).toHaveBeenLastCalledWith('/EAS/EcuC');
  });
});

// ---------------------------------------------------------------------------
// Test 2b: nested AR-PACKAGES (EB tresos BSWMD shape: AUTOSAR > EcucDefs > <modules>).
// Sprint 9 #12 added parser recursion; this test guards the matching UI
// renderer change so a flat-tree regression does not silently hide nested
// content again.
// ---------------------------------------------------------------------------
describe('Tree (nested AR-PACKAGES)', () => {
  const NESTED_XML = `<?xml version="1.0"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"><AR-PACKAGES>
  <AR-PACKAGE><SHORT-NAME>AUTOSAR</SHORT-NAME><AR-PACKAGES>
    <AR-PACKAGE><SHORT-NAME>EcucDefs</SHORT-NAME><ELEMENTS>
      <ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>Adc</SHORT-NAME>
        <CONTAINERS></CONTAINERS>
      </ECUC-MODULE-CONFIGURATION-VALUES>
      <ECUC-MODULE-CONFIGURATION-VALUES><SHORT-NAME>Can</SHORT-NAME>
        <CONTAINERS></CONTAINERS>
      </ECUC-MODULE-CONFIGURATION-VALUES>
    </ELEMENTS></AR-PACKAGE>
  </AR-PACKAGES></AR-PACKAGE>
</AR-PACKAGES></AUTOSAR>`;

  function makeNestedDoc(): ArxmlDocument {
    const r = parseArxml(NESTED_XML);
    if (!r.ok) throw new Error(`nested parse failed: ${r.error}`);
    return r.value;
  }

  it('renders the outer wrapper package as non-leaf so it can be expanded', () => {
    const doc = makeNestedDoc();
    const { api } = makeStoreApi({ doc });
    render(<Tree store={api} />);
    const tree = screen.getByRole('tree');
    const outer = within(tree).getByRole('treeitem', { name: /AUTOSAR/ });
    // The outer package has no elements of its own but DOES have a sub-package.
    // Pre-fix this was treated as a leaf (aria-expanded=undefined) and the user
    // could not drill in.
    expect(outer).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands the wrapper then the inner sub-package to reveal modules', () => {
    const doc = makeNestedDoc();
    const { api } = makeStoreApi({ doc });
    render(<Tree store={api} />);

    // Step 1: expand the outer AUTOSAR package.
    fireEvent.click(screen.getByTestId('chevron-/AUTOSAR'));
    expect(screen.getByRole('treeitem', { name: /EcucDefs/ })).toBeInTheDocument();

    // Step 2: expand the inner EcucDefs sub-package.
    fireEvent.click(screen.getByTestId('chevron-/AUTOSAR/EcucDefs'));

    // Both modules from <ELEMENTS> are now visible.
    expect(screen.getByRole('treeitem', { name: /Adc/ })).toBeInTheDocument();
    expect(screen.getByRole('treeitem', { name: /Can/ })).toBeInTheDocument();
  });

  it('does not regress the flat-package shape (5-fixture parity)', () => {
    // Sanity: a flat doc (EAS, Com directly as top-level packages) still
    // renders both top-level packages as before the nested-package fix.
    const doc = makeDoc();
    const { api } = makeStoreApi({ doc });
    render(<Tree store={api} />);
    const tree = screen.getByRole('tree');
    expect(within(tree).getByRole('treeitem', { name: /EAS/ })).toBeInTheDocument();
    expect(within(tree).getByRole('treeitem', { name: /Com/ })).toBeInTheDocument();
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
