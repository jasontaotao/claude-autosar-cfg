// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlElement, ArxmlPackage } from '@core/arxml/types';
import type { BswmdDocument } from '@core/project/bswmd';

import { useArxmlStore } from '../../../store/useArxmlStore';
import { ParamEditor } from '../ParamEditor';

// ---------- Sprint post-v1.0.0 — T6 component tests (helpers) ----------
// Component tests need an ArxmlDocument whose element tree resolves the
// store's `selectedPath` so ParamEditor renders the footer with the
// `+ Add Parameter` button (the footer is gated on findByPath returning
// a module/container element). The unit tests in
// core/ecuc/__tests__/moduleMatch.test.ts use a stub doc with `packages: []`
// because they only exercise the pure function. Define the richer helper
// inline here per the plan — the brief instructs not to share fixtures
// across the core/ → renderer/ package boundary.

/** Build an ArxmlDocument whose element tree resolves `selectedPath` to a
 *  module/container element, so ParamEditor's body renders the footer with
 *  the `+ Add Parameter` button. The structure is:
 *    doc.path = `<rootPath>` (matches selectedPath)
 *    packages = [root pkg `proj`]
 *      └─ elements[0] = module/container `ecuc`
 *           └─ children[0] = module/container `<leafName>` (params: {})
 *  `findByPath(doc, selectedPath)` walks `proj → ecuc → <leafName>` and
 *  returns the leaf element. */
function mkDocWithElementAtPath(rootPath: string, sourceBswmdPath?: string): ArxmlDocument {
  const segments = rootPath.split('/').filter((s) => s.length > 0);
  // selectedPath = rootPath; segments must have >= 2 for findByPath to walk
  // past the package root. The leaf shortName is the last segment.
  const leafName = segments[segments.length - 1] ?? '<leaf>';
  const middleName = segments[segments.length - 2] ?? '<middle>';
  const rootPkgName = segments[0] ?? '<root>';
  const leafElement: ArxmlElement = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: leafName,
    params: {},
    children: [],
  };
  const middleElement: ArxmlElement = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: middleName,
    params: {},
    children: [leafElement],
    references: [],
  };
  const pkg: ArxmlPackage = {
    shortName: rootPkgName,
    path: `/${rootPkgName}`,
    elements: [middleElement],
  };
  return {
    path: rootPath,
    version: '4.6',
    packages: [pkg],
    ...(sourceBswmdPath !== undefined ? { sourceBswmdPath } : {}),
  };
}

/** Same shape as `mkBswmd` in core/ecuc/__tests__/moduleMatch.test.ts but
 *  defined locally — the brief instructs not to import across package
 *  boundaries (core/ vs renderer/). */
function mkBswmd(shortNames: string[]): BswmdDocument {
  return {
    version: '4.6',
    modules: shortNames.map((sn) => ({
      shortName: sn,
      path: `/${sn}`,
      dialect: 'ecuc-module-def' as const,
      moduleId: 1,
      containers: [],
      providedEntries: [],
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
    })),
    warnings: [],
  };
}

afterEach(cleanup);

beforeEach(() => {
  // Sprint 11 Phase 1 (Option A) — pin locale to en so the "Open an
  // ARXML file..." assertion still matches (the empty-state string is
  // t()-rendered, default locale is zh-CN).
  useArxmlStore.setState({ locale: 'en' });
});

function makeDoc(): ArxmlDocument {
  const pkg: ArxmlPackage = {
    shortName: 'EAS',
    path: '/EAS',
    elements: [],
  };
  const container: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'EcuCGeneral',
    params: {
      Name: { type: 'string', value: 'EcuC' },
      Count: { type: 'integer', value: 3 },
      Ratio: { type: 'float', value: 1.25 },
      Enabled: { type: 'boolean', value: true },
      Mode: { type: 'enum', value: 'STD_ON' },
      SignalRef: { type: 'reference', value: '/EAS/Sig' },
      Comment: { type: 'string', value: 'multi line\nnote' },
    },
    children: [],
  };
  return {
    path: '/EAS',
    version: '4.6',
    packages: [{ ...pkg, elements: [container] }],
  };
}

describe('ParamEditor', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
  });

  it('renders empty state when no doc is loaded', () => {
    render(<ParamEditor />);
    expect(screen.getByText(/Open an ARXML file and select a node/i)).toBeInTheDocument();
  });

  it('renders the element shortName + kind badge when a container is selected', () => {
    const doc = makeDoc();
    useArxmlStore.getState().setDoc(doc, '/EAS');
    useArxmlStore.getState().select('/EAS/EcuCGeneral');

    render(<ParamEditor />);
    expect(screen.getByRole('heading', { name: 'EcuCGeneral' })).toBeInTheDocument();
    // kind badge — case-insensitive match on the word "container"
    expect(screen.getByText(/container/i)).toBeInTheDocument();
  });

  it('renders one row per param and dispatches updateParam on edit', () => {
    const doc = makeDoc();
    useArxmlStore.getState().setDoc(doc, '/EAS');
    useArxmlStore.getState().select('/EAS/EcuCGeneral');

    render(<ParamEditor />);

    // Each param key is rendered as a <code>-style cell.
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Count')).toBeInTheDocument();
    expect(screen.getByText('Ratio')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('Mode')).toBeInTheDocument();
    expect(screen.getByText('SignalRef')).toBeInTheDocument();
    expect(screen.getByText('Comment')).toBeInTheDocument();

    // Edit the integer param "Count" from 3 -> 7.
    const countInput = screen.getByLabelText('Count value');
    fireEvent.change(countInput, { target: { value: '7' } });

    const updated = useArxmlStore.getState().doc;
    expect(updated).not.toBeNull();
    if (updated === null) return;
    const cont = updated.packages[0]?.elements[0];
    if (cont === undefined || cont.kind !== 'container') return;
    expect(cont.params['Count']).toEqual({ type: 'integer', value: 7 });
    expect(useArxmlStore.getState().dirtyPaths.has('/EAS')).toBe(true);
  });

  // Sprint 13+ Stage 4 M6 — column header i18n. After Q2 the right
  // pane renders two category sections (Value + Reference), each
  // with its own header row, so we use getAllByRole and assert at
  // least one of each header is present.
  it('renders column headers in English when locale is en', () => {
    const doc = makeDoc();
    useArxmlStore.getState().setDoc(doc, '/EAS');
    useArxmlStore.getState().select('/EAS/EcuCGeneral');
    useArxmlStore.setState({ locale: 'en' });

    render(<ParamEditor />);

    expect(screen.getAllByRole('columnheader', { name: 'Param' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('columnheader', { name: 'Type' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('columnheader', { name: 'Value' }).length).toBeGreaterThan(0);
  });

  it('renders column headers in Chinese when locale is zh-CN', () => {
    const doc = makeDoc();
    useArxmlStore.getState().setDoc(doc, '/EAS');
    useArxmlStore.getState().select('/EAS/EcuCGeneral');
    useArxmlStore.setState({ locale: 'zh-CN' });

    render(<ParamEditor />);

    expect(screen.getAllByRole('columnheader', { name: '参数' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('columnheader', { name: '类型' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('columnheader', { name: '取值' }).length).toBeGreaterThan(0);
  });

  // ---------- Sprint 13 Stage 3.5 (Combined Tree View) ----------
  // In combined mode the selectedPath is prefixed with the source
  // file's basename. ParamEditor must resolve it back to the source
  // document via findByPathMultiDoc; updateParam goes through the
  // store which already routes via the basename prefix (see
  // useArxmlStore.updateParam).

  it('combined mode: resolves basename-prefixed path and renders the source element', () => {
    const doc = makeDoc();
    useArxmlStore.getState().setDoc(doc, '/tmp/EcuC.arxml');
    useArxmlStore.getState().setViewMode('combined');
    useArxmlStore.getState().select('/EcuC.arxml/EAS/EcuCGeneral');
    render(<ParamEditor />);
    // EcuCGeneral still renders — the basename prefix is stripped on read.
    expect(screen.getByRole('heading', { name: 'EcuCGeneral' })).toBeInTheDocument();
  });

  it('combined mode: editing a param routes the mutation to the source document', () => {
    const doc = makeDoc();
    useArxmlStore.getState().setDoc(doc, '/tmp/EcuC.arxml');
    useArxmlStore.getState().setViewMode('combined');
    useArxmlStore.getState().select('/EcuC.arxml/EAS/EcuCGeneral');
    render(<ParamEditor />);

    const countInput = screen.getByLabelText('Count value');
    fireEvent.change(countInput, { target: { value: '99' } });

    const updated = useArxmlStore.getState().doc;
    expect(updated).not.toBeNull();
    if (updated === null) return;
    const cont = updated.packages[0]?.elements[0];
    if (cont === undefined || cont.kind !== 'container') return;
    expect(cont.params['Count']).toEqual({ type: 'integer', value: 99 });
    expect(useArxmlStore.getState().dirtyPaths.has('/tmp/EcuC.arxml')).toBe(true);
  });

  // ---------- Sprint 13+ Q2 (EcuC-style category grouping) ----------
  // The right pane now groups params into a "value" bucket
  // (string / integer / float / boolean / enum) and a "reference"
  // bucket. Each bucket renders its own section heading with a
  // count badge so the user can tell at a glance which kind of
  // setting they're looking at, and so a node with mostly references
  // does not interleave them with scalars.

  it('Q2: renders two category sections (Value + Reference) with count badges', () => {
    const doc = makeDoc(); // makeDoc has 6 scalar + 1 reference = 6/1
    useArxmlStore.getState().setDoc(doc, '/EAS');
    useArxmlStore.getState().select('/EAS/EcuCGeneral');

    render(<ParamEditor />);

    // Section headings with counts.
    const valueSection = screen.getByTestId('editor-category-value');
    const referenceSection = screen.getByTestId('editor-category-reference');
    expect(within(valueSection).getByRole('heading', { name: /Value \(6\)/i })).toBeInTheDocument();
    expect(
      within(referenceSection).getByRole('heading', { name: /Reference \(1\)/i }),
    ).toBeInTheDocument();
  });

  it('Q2: value section contains scalar params and reference section contains reference params', () => {
    const doc = makeDoc();
    useArxmlStore.getState().setDoc(doc, '/EAS');
    useArxmlStore.getState().select('/EAS/EcuCGeneral');

    render(<ParamEditor />);

    const valueSection = screen.getByTestId('editor-category-value');
    const referenceSection = screen.getByTestId('editor-category-reference');

    // Scalar params are inside the value section.
    expect(within(valueSection).getByText('Name')).toBeInTheDocument();
    expect(within(valueSection).getByText('Count')).toBeInTheDocument();
    expect(within(valueSection).getByText('Mode')).toBeInTheDocument();
    // Reference param is inside the reference section, not the value section.
    expect(within(referenceSection).getByText('SignalRef')).toBeInTheDocument();
    expect(within(valueSection).queryByText('SignalRef')).toBeNull();
  });

  it('Q2: shows the localized Chinese category headers when locale is zh-CN', () => {
    const doc = makeDoc();
    useArxmlStore.getState().setDoc(doc, '/EAS');
    useArxmlStore.getState().select('/EAS/EcuCGeneral');
    useArxmlStore.setState({ locale: 'zh-CN' });

    render(<ParamEditor />);

    expect(screen.getByRole('heading', { name: /参数值 \(6\)/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /引用 \(1\)/ })).toBeInTheDocument();
  });

  it('Q2: shows the empty placeholder for the reference section when a node has no reference params', () => {
    // A container with only scalar params — reference section renders empty.
    const pkg: ArxmlPackage = {
      shortName: 'EAS',
      path: '/EAS',
      elements: [
        {
          kind: 'container',
          tagName: 'ECUC-CONTAINER-VALUE',
          shortName: 'Scalars',
          params: {
            Count: { type: 'integer', value: 1 },
            Name: { type: 'string', value: 'foo' },
          },
          children: [],
        },
      ],
    };
    const doc: ArxmlDocument = { path: '/EAS', version: '4.6', packages: [pkg] };
    useArxmlStore.getState().setDoc(doc, '/EAS');
    useArxmlStore.getState().select('/EAS/Scalars');

    render(<ParamEditor />);

    const valueSection = screen.getByTestId('editor-category-value');
    const referenceSection = screen.getByTestId('editor-category-reference');
    // Value section has the params and the count (2).
    expect(within(valueSection).getByRole('heading', { name: /Value \(2\)/i })).toBeInTheDocument();
    // Reference section heading still renders (0) and shows the empty placeholder.
    expect(
      within(referenceSection).getByRole('heading', { name: /Reference \(0\)/i }),
    ).toBeInTheDocument();
    expect(within(referenceSection).getByText(/\(none\)|（无）/)).toBeInTheDocument();
  });

  it('Q2: h2 has explicit text color in both light and dark mode', () => {
    const doc = makeDoc();
    useArxmlStore.getState().setDoc(doc, '/EAS');
    useArxmlStore.getState().select('/EAS/EcuCGeneral');

    render(<ParamEditor />);

    const h2 = screen.getByRole('heading', { name: 'EcuCGeneral', level: 2 });
    // Tailwind compiles to a static class list; the explicit
    // text-slate-900 dark:text-slate-50 is what makes the h2
    // unambiguous in both themes (the previous default inherited
    // the body's text color, which was low-contrast in some setups).
    expect(h2.className).toMatch(/text-slate-900/);
    expect(h2.className).toMatch(/dark:text-slate-50/);
  });

  // ---------- Sprint 13+ Q2-2 (editor sub-components color contract) ----------
  // Sprint 13+ Stage 4 Q2-2 — every input that renders a parameter
  // value MUST carry an explicit `text-slate-900` (light) and
  // `dark:text-slate-50` (dark) class. Without this, the value text
  // inherits the body color, which can match the dark-mode input
  // background (`dark:bg-slate-800`) on some browsers and make the
  // value invisible. The EnumEditor additionally requires a CSS
  // file because `<select>` does not honor Tailwind utilities in
  // dark mode across all browsers.
  it('Q2-2: integer input has explicit text-slate-900 + dark:text-slate-50', () => {
    const doc = makeDoc();
    useArxmlStore.getState().setDoc(doc, '/EAS');
    useArxmlStore.getState().select('/EAS/EcuCGeneral');
    render(<ParamEditor />);
    const input = screen.getByLabelText('Count value');
    expect(input.className).toMatch(/text-slate-900/);
    expect(input.className).toMatch(/dark:text-slate-50/);
  });

  it('Q2-2: float input has explicit text-slate-900 + dark:text-slate-50', () => {
    const doc = makeDoc();
    useArxmlStore.getState().setDoc(doc, '/EAS');
    useArxmlStore.getState().select('/EAS/EcuCGeneral');
    render(<ParamEditor />);
    const input = screen.getByLabelText('Ratio value');
    expect(input.className).toMatch(/text-slate-900/);
    expect(input.className).toMatch(/dark:text-slate-50/);
  });

  it('Q2-2: string input has explicit text-slate-900 + dark:text-slate-50', () => {
    const doc = makeDoc();
    useArxmlStore.getState().setDoc(doc, '/EAS');
    useArxmlStore.getState().select('/EAS/EcuCGeneral');
    render(<ParamEditor />);
    const input = screen.getByLabelText('Name value');
    expect(input.className).toMatch(/text-slate-900/);
    expect(input.className).toMatch(/dark:text-slate-50/);
  });

  it('Q2-2: multiline (Comment) textarea has explicit text color', () => {
    const doc = makeDoc();
    useArxmlStore.getState().setDoc(doc, '/EAS');
    useArxmlStore.getState().select('/EAS/EcuCGeneral');
    render(<ParamEditor />);
    const ta = screen.getByLabelText('Comment value');
    expect(ta.className).toMatch(/text-slate-900/);
    expect(ta.className).toMatch(/dark:text-slate-50/);
  });

  it('Q2-2: enum editor mounts with its enum-editor CSS class (select or fallback input)', () => {
    // The Mode enum in makeDoc may render as <select> (if the schema
    // maps it to literals) or as the free-form <input> fallback. Both
    // branches carry the `enum-editor` class so the value text colour
    // is pinned by EnumEditor.css in both themes.
    const doc = makeDoc();
    useArxmlStore.getState().setDoc(doc, '/EAS');
    useArxmlStore.getState().select('/EAS/EcuCGeneral');
    render(<ParamEditor />);
    // The Mode value is the enum — find whichever element rendered it.
    const selectOrInput =
      screen.queryByTestId('enum-editor-Mode') ?? screen.queryByTestId('enum-editor-text-Mode');
    expect(selectOrInput).not.toBeNull();
    expect(selectOrInput!.className).toMatch(/enum-editor/);
  });

  // Sprint 13+ Q2-2 — 11 boolean params in AdcGeneral style containers
  // were reported as "same color as the background". The fix pins an
  // explicit text-slate-900 / dark:text-slate-50 on every <td> in the
  // param row so the param name and the type badge are visible in
  // both themes. This test mirrors the user's reported scenario:
  // a container with a long list of boolean params, where the row
  // text was previously invisible.
  it('Q2-2: every row in an 11-boolean container has explicit text-slate-900 + dark:text-slate-50 on the name cell', () => {
    // Build an AdcGeneral-style container: 11 boolean params, no
    // value column content beyond the checkboxes.
    const booleanKeys = [
      'AdcDeInitApi',
      'AdcDevErrorDetect',
      'AdcEnableLimitCheck',
      'AdcEnableQueuing',
      'AdcEnableStartStopGroupApi',
      'AdcGrpNotifCapability',
      'AdcHwTriggerApi',
      'AdcLowPowerStatesSupport',
      'AdcPowerStateAsynchTransitionMode',
      'AdcReadGroupApi',
      'AdcVersionInfoApi',
    ];
    const booleanParams: Record<string, { type: 'boolean'; value: boolean }> = {};
    for (const k of booleanKeys) {
      booleanParams[k] = { type: 'boolean', value: false };
    }
    const pkg: ArxmlPackage = {
      shortName: 'Vendor',
      path: '/Vendor',
      elements: [
        {
          kind: 'container',
          tagName: 'ECUC-PARAM-CONF-CONTAINER-DEF',
          shortName: 'AdcGeneral',
          params: booleanParams,
          children: [],
        },
      ],
    };
    const doc: ArxmlDocument = { path: '/Vendor', version: '4.6', packages: [pkg] };
    useArxmlStore.getState().setDoc(doc, '/Vendor');
    useArxmlStore.getState().select('/Vendor/AdcGeneral');
    render(<ParamEditor />);

    // All 11 param names should render in the value section, and
    // each one should be inside a <td> that carries the explicit
    // text-slate-900 / dark:text-slate-50 contract.
    const valueSection = screen.getByTestId('editor-category-value');
    for (const key of booleanKeys) {
      const cell = within(valueSection).getByText(key);
      // The cell is a <td>; the contract class lives on the <td>
      // itself, so walk up to the closest td and assert.
      const td = cell.closest('td');
      expect(td, `${key} should be inside a <td>`).not.toBeNull();
      expect(td!.className).toMatch(/text-slate-900/);
      expect(td!.className).toMatch(/dark:text-slate-50/);
    }
  });

  // ---------- Sprint post-v1.0.0 — T6 (+ Add Parameter enabled state) ----------
  // ParamEditor exposes two footer buttons (`+ Add Parameter`,
  // `+ Add Reference`) that open the BSWMD-driven picker. Both buttons
  // are gated on `hasBswmdForModule(state, selectedPath)` so that
  // pickers open only when the selected ECUC can resolve a BSWMD
  // schema (priority A: sourceBswmdPath match, fallback B: path-segment
  // match). These two component tests pin the user-visible result of
  // that gate — they pin behavior, not implementation detail, so a
  // future refactor of `hasBswmdForModule` would not require
  // touching them as long as the button keeps reflecting the function.
  //
  // Setup contract:
  //   - `documents` carries one ECUC doc whose `sourceBswmdPath` points
  //     to a BSWMD path that is in `bswmdPaths` (test #1) or that is
  //     no longer in `bswmdPaths` after a cascade removal (test #2).
  //   - The doc's `path` is exactly the same string as `selectedPath`.
  //     `hasBswmdForModule` looks up the doc via
  //     `documents.find(d => d.path === selectedPath)` (T5 contract),
  //     so equality is required for the function to find the doc.
  //   - The doc's element tree resolves `selectedPath` to a module or
  //     container so ParamEditor's body renders the footer with the
  //     `+ Add Parameter` button. We use `mkDocWithElementAtPath`
  //     (defined above) for that.

  it('enables + Add Parameter when ECUC has sourceBswmdPath matching a loaded BSWMD', () => {
    // Arrange: 1 BSWMD loaded (`/BSWMD/Can.arxml`) + 1 ECUC doc whose
    // `sourceBswmdPath` points to it. selectedPath = the ECUC's own
    // path so `hasBswmdForModule`'s `find(d => d.path === selectedPath)`
    // resolves to this doc and the A-priority source match returns true.
    const ecucPath = '/proj/ecuc/Can_EcucValues.arxml';
    const bswmdPath = '/BSWMD/Can.arxml';
    const doc = mkDocWithElementAtPath(ecucPath, bswmdPath);
    useArxmlStore.setState({
      documents: [doc],
      documentPaths: [ecucPath],
      activeDocumentPath: ecucPath,
      doc,
      filePath: ecucPath,
      // selectedPath must equal the doc's path so hasBswmdForModule's
      // documents.find(...) resolves the doc, AND so the element walk
      // through findByPath lands on the leaf container that renders
      // the footer.
      selectedPath: ecucPath,
      // BSWMD schema + path registered → A-priority match returns true.
      bswmdPaths: [bswmdPath],
      bswmdSchemas: [mkBswmd(['Can'])],
      viewMode: 'single',
      displayDoc: doc,
      locale: 'en',
    });

    render(<ParamEditor />);

    // The footer is only rendered when findByPath returns a module or
    // container — sanity-check the layout, then assert the button.
    expect(screen.getByTestId('param-editor-footer')).toBeInTheDocument();
    expect(screen.getByTestId('param-editor-add-parameter')).toBeEnabled();
  });

  it('keeps + Add Parameter disabled when no BSWMD matches the ECUC', () => {
    // Arrange: BSWMD was removed (e.g. cascade after a user-initiated
    // Remove BSWMD that also dropped its dependent ECUC picker
    // children). `sourceBswmdPath` on the ECUC still points at the
    // BSWMD path, but `bswmdPaths` no longer includes it, so priority A
    // returns false → the button is disabled and the picker cannot open.
    const ecucPath = '/proj/ecuc/Can_EcucValues.arxml';
    const bswmdPath = '/BSWMD/Can.arxml';
    const doc = mkDocWithElementAtPath(ecucPath, bswmdPath);
    useArxmlStore.setState({
      documents: [doc],
      documentPaths: [ecucPath],
      activeDocumentPath: ecucPath,
      doc,
      filePath: ecucPath,
      selectedPath: ecucPath,
      // BSWMD unloaded (cascade): bswmdPaths is empty.
      bswmdPaths: [],
      bswmdSchemas: [],
      viewMode: 'single',
      displayDoc: doc,
      locale: 'en',
    });

    render(<ParamEditor />);

    expect(screen.getByTestId('param-editor-footer')).toBeInTheDocument();
    expect(screen.getByTestId('param-editor-add-parameter')).toBeDisabled();
  });
});
