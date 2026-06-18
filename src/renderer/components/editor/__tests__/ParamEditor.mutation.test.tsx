// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlPackage, ArxmlReference, ParamValue } from '@core/arxml/types';
import type { BswModuleDef, BswmdDocument, ContainerDef, ParamDef } from '@core/project/bswmd';

import { useArxmlStore } from '../../../store/useArxmlStore';
import { ParamEditor } from '../ParamEditor';

afterEach(cleanup);
beforeEach(() => {
  // Sprint 11 Phase 1 (Option A) — pin locale to en so the column
  // header assertions stay stable regardless of the default zh-CN.
  useArxmlStore.getState().clear();
  useArxmlStore.setState({ locale: 'en' });
  // Spy on the store actions we expect the editor to call. Each
  // spy re-uses the live action reference, so the call still goes
  // through to the store (and triggers all its side effects); the
  // spy just records the call for the assertion. We re-spy per
  // test to keep the mock state isolated.
  vi.spyOn(useArxmlStore.getState(), 'openBswmdPicker');
  vi.spyOn(useArxmlStore.getState(), 'deleteParameter');
});

// ---------------------------------------------------------------------------
// Test fixture builders — small, focused shapes so the assertions can
// describe the "selected element" scenario without boilerplate.
// ---------------------------------------------------------------------------

/**
 * Build a value-side ArxmlDocument with a single container placed
 * directly under one root package (no module wrapper). The path
 * resolver walks segments starting at the root package, so
 * `/EAS/EcuCGeneral` resolves cleanly. Mirrors the shape used in
 * ParamEditor.test.tsx.
 */
function makeContainerDoc(
  containerShortName: string,
  containerParams: Readonly<Record<string, ParamValue>> = {},
): ArxmlDocument {
  const container: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: containerShortName,
    params: containerParams,
    children: [],
  };
  const pkg: ArxmlPackage = { shortName: 'EAS', path: '/EAS', elements: [container] };
  return { path: '/EAS', version: '4.6', packages: [pkg] };
}

/**
 * Build a value-side ArxmlDocument where the selected element is a
 * `reference` (not a module/container). ParamEditor must NOT render
 * the mutation footer in this case — the early return at the top of
 * the component fires and the empty-state placeholder renders.
 */
function makeReferenceDoc(): ArxmlDocument {
  const ref: ArxmlReference = {
    kind: 'reference',
    tagName: 'ECUC-REFERENCE-VALUE',
    shortName: 'SignalRef',
    value: '/EAS/Sig',
    dest: 'ECUC-CONTAINER-VALUE',
  };
  const pkg: ArxmlPackage = { shortName: 'EAS', path: '/EAS', elements: [ref] };
  return { path: '/EAS', version: '4.6', packages: [pkg] };
}

/**
 * Build a minimal BswModuleDef for the value path `/EAS/<module>`.
 * The selectedPath in the tests below is `/EAS/<container>` (the
 * container is a direct child of the root package, no module wrapper),
 * so ParamEditor's BSWMD-gate walks `bswmdSchemas[].modules` looking
 * for a module whose shortName matches the SECOND path segment — i.e.
 * the container shortName. We accept that name as the BswModuleDef's
 * `shortName` so the gate flips to enabled.
 */
function makeBswModule(moduleShortName: string): BswModuleDef {
  const topContainer: ContainerDef = {
    shortName: 'InnerContainer',
    path: `/EAS/${moduleShortName}/InnerContainer`,
    lowerMultiplicity: 0,
    upperMultiplicity: 1,
    subContainers: [],
    parameters: [
      {
        shortName: 'TestParam',
        path: `/EAS/${moduleShortName}/InnerContainer/TestParam`,
        kind: 'integer',
        defaultValue: 0,
        minValue: 0,
        maxValue: 100,
        minLength: null,
        maxLength: null,
        enumerationLiterals: [],
      } satisfies ParamDef,
    ],
    references: [],
    choices: [],
  };
  return {
    shortName: moduleShortName,
    path: `/EAS/${moduleShortName}`,
    dialect: 'ecuc-module-def',
    moduleId: 0,
    containers: [topContainer],
    providedEntries: [],
    lowerMultiplicity: 0,
    upperMultiplicity: 1,
  };
}

function makeBswmd(mod: BswModuleDef): BswmdDocument {
  return { version: '4.6', modules: [mod], warnings: [] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ParamEditor — mutation footer + per-row × (Sprint 15 Phase 3.5)', () => {
  // Use case 1: selectedPath === null → footer is hidden (no selection).
  it('hides the mutation footer when no element is selected', () => {
    // No select() call — selectedPath stays at its cleared default (null).
    useArxmlStore.getState().setDoc(makeContainerDoc('EcuCGeneral'), '/EAS');
    render(<ParamEditor />);

    // The early-return branch renders the empty-state placeholder
    // and never the footer.
    expect(screen.queryByTestId('param-editor-footer')).toBeNull();
    expect(screen.queryByTestId('param-editor-add-parameter')).toBeNull();
    expect(screen.queryByTestId('param-editor-add-reference')).toBeNull();
  });

  // Use case 3: selectedPath resolves to a reference element → footer
  // is hidden because the early-return at "element.kind !== 'module'
  // && element.kind !== 'container'" fires.
  it('hides the mutation footer when the selected element is a reference', () => {
    useArxmlStore.getState().setDoc(makeReferenceDoc(), '/EAS');
    useArxmlStore.getState().select('/EAS/SignalRef');
    render(<ParamEditor />);

    // No footer; the empty-state placeholder renders instead.
    expect(screen.queryByTestId('param-editor-footer')).toBeNull();
    expect(screen.queryByTestId('param-editor-add-parameter')).toBeNull();
  });

  // Use case 2 + 4: selectedPath resolves to a container → footer
  // is visible with both add buttons present. The BSWMD gate is the
  // subject of the next test; here we focus on visibility.
  it('renders the mutation footer with both add buttons when a container is selected', () => {
    useArxmlStore.getState().setDoc(makeContainerDoc('EcuCGeneral'), '/EAS');
    useArxmlStore.getState().select('/EAS/EcuCGeneral');
    render(<ParamEditor />);

    const footer = screen.getByTestId('param-editor-footer');
    expect(footer).toBeInTheDocument();

    const addParam = screen.getByTestId('param-editor-add-parameter');
    const addRef = screen.getByTestId('param-editor-add-reference');
    expect(addParam).toBeInTheDocument();
    expect(addRef).toBeInTheDocument();
    expect(addParam).toHaveTextContent(/add parameter/i);
    expect(addRef).toHaveTextContent(/add reference/i);
  });

  // Use case 4: no BSWMD for the selected module → both add buttons
  // are disabled with a tooltip explaining the gate.
  it('disables both add buttons when no BSWMD is loaded for the module', () => {
    useArxmlStore.getState().setDoc(makeContainerDoc('EcuCGeneral'), '/EAS');
    // Clear bswmdSchemas (clear() above already does this, but we
    // make the intent explicit so future readers don't have to
    // chase through the beforeEach).
    useArxmlStore.setState({ bswmdSchemas: [], bswmdPaths: [] });
    useArxmlStore.getState().select('/EAS/EcuCGeneral');
    render(<ParamEditor />);

    const addParam = screen.getByTestId('param-editor-add-parameter');
    const addRef = screen.getByTestId('param-editor-add-reference');
    expect(addParam).toBeDisabled();
    expect(addRef).toBeDisabled();
    // Tooltip mirrors the i18n key the spec called out. The editor
    // hard-codes the Chinese label here because i18n polish is a
    // Phase 4 concern; the spec § 5.3 just requires the gate to be
    // visible.
    expect(addParam).toHaveAttribute('title', '需要先加载 BSWMD');
    expect(addRef).toHaveAttribute('title', '需要先加载 BSWMD');
  });

  // Sanity: when the BSWMD IS loaded for the module, the buttons
  // flip back to enabled. Without this test the gate could regress
  // to "always disabled" without a guard.
  it('enables both add buttons when a BSWMD is loaded for the module', () => {
    useArxmlStore.getState().setDoc(makeContainerDoc('EcuCGeneral'), '/EAS');
    useArxmlStore.setState({
      bswmdSchemas: [makeBswmd(makeBswModule('EcuCGeneral'))],
      bswmdPaths: ['/schemas/EcuCGeneral.bswmd.arxml'],
    });
    useArxmlStore.getState().select('/EAS/EcuCGeneral');
    render(<ParamEditor />);

    const addParam = screen.getByTestId('param-editor-add-parameter');
    const addRef = screen.getByTestId('param-editor-add-reference');
    expect(addParam).toBeEnabled();
    expect(addRef).toBeEnabled();
  });

  // Use case 5: clicking `+ Add parameter` calls
  // `openBswmdPicker({ parentPath, kind: 'parameter' })`. The picker
  // dialog itself is a Phase 3.2 deliverable; we only pin the
  // dispatch contract here.
  it('clicking + Add parameter calls openBswmdPicker with kind=parameter', () => {
    useArxmlStore.getState().setDoc(makeContainerDoc('EcuCGeneral'), '/EAS');
    useArxmlStore.setState({
      bswmdSchemas: [makeBswmd(makeBswModule('EcuCGeneral'))],
      bswmdPaths: ['/schemas/EcuCGeneral.bswmd.arxml'],
    });
    useArxmlStore.getState().select('/EAS/EcuCGeneral');
    render(<ParamEditor />);

    fireEvent.click(screen.getByTestId('param-editor-add-parameter'));
    expect(useArxmlStore.getState().openBswmdPicker).toHaveBeenCalledTimes(1);
    expect(useArxmlStore.getState().openBswmdPicker).toHaveBeenCalledWith({
      parentPath: '/EAS/EcuCGeneral',
      kind: 'parameter',
    });
  });

  // Sibling to the previous test — clicking `+ Add reference` calls
  // the picker with kind='reference'. Kept in the same file so the
  // dispatch contract for both buttons is pinned in one place.
  it('clicking + Add reference calls openBswmdPicker with kind=reference', () => {
    useArxmlStore.getState().setDoc(makeContainerDoc('EcuCGeneral'), '/EAS');
    useArxmlStore.setState({
      bswmdSchemas: [makeBswmd(makeBswModule('EcuCGeneral'))],
      bswmdPaths: ['/schemas/EcuCGeneral.bswmd.arxml'],
    });
    useArxmlStore.getState().select('/EAS/EcuCGeneral');
    render(<ParamEditor />);

    fireEvent.click(screen.getByTestId('param-editor-add-reference'));
    expect(useArxmlStore.getState().openBswmdPicker).toHaveBeenCalledTimes(1);
    expect(useArxmlStore.getState().openBswmdPicker).toHaveBeenCalledWith({
      parentPath: '/EAS/EcuCGeneral',
      kind: 'reference',
    });
  });

  // Use case 6: clicking the row × button calls
  // `deleteParameter(containerPath, paramKey)`. We seed the container
  // with two params so the test can target a specific row's testid.
  it('clicking the per-row × button calls deleteParameter with the right args', () => {
    useArxmlStore.getState().setDoc(
      makeContainerDoc('EcuCGeneral', {
        Name: { type: 'string', value: 'EcuC' },
        Count: { type: 'integer', value: 3 },
      }),
      '/EAS',
    );
    useArxmlStore.getState().select('/EAS/EcuCGeneral');
    render(<ParamEditor />);

    // Target the × button on the `Count` row specifically. The
    // testid is keyed by param name so tests can hit a single row
    // even when the table has multiple params.
    fireEvent.click(screen.getByTestId('param-row-delete-Count'));
    expect(useArxmlStore.getState().deleteParameter).toHaveBeenCalledTimes(1);
    expect(useArxmlStore.getState().deleteParameter).toHaveBeenCalledWith(
      '/EAS/EcuCGeneral',
      'Count',
    );
  });
});
