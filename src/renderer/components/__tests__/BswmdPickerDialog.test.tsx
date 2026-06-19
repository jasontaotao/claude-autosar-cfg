// @vitest-environment jsdom
//
// BswmdPickerDialog (Sprint 15 / Phase 3.2):
//   - BSWMD-driven picker for adding sub-containers / parameters / references.
//   - State lives in the zustand store (`useArxmlStore.bswmdPicker`); the
//     dialog root reads it via a selector and the `openBswmdPicker` /
//     `closeBswmdPicker` actions flip the flag.
//   - The dialog renders a search input + per-element rows grouped by
//     kind. Single-pick + Done model: clicking a row highlights it,
//     clicking Done calls the corresponding store action
//     (`addContainer` / `addParameter`) and closes the dialog.
//   - Disabled rows (at-max multiplicity) are greyed and cannot be picked.
//
// Tests pin (10):
//   1.  Renders nothing when bswmdPicker.open === false
//   2.  Renders title + parent path when open
//   3.  Lists sub-containers from listAllowedSubElements
//   4.  Single-pick: clicking a row highlights it (Done is the commit step)
//   5.  Done button calls the right store action
//   6.  Cancel closes the dialog without calling any action
//   7.  Search input filters the list (case-insensitive substring on shortName)
//   8.  Disabled (at-max) row cannot be picked
//   9.  Empty state when all options are at-max
//  10.  Title changes when locale is switched (zh-CN / en)

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlModule } from '@core/arxml/types';
import type { BswModuleDef, BswmdDocument, ContainerDef, ParamDef } from '@core/project/bswmd.js';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { BswmdPickerRoot } from '../BswmdPickerDialog.js';

// ---------------------------------------------------------------------------
// Test fixture builders
// ---------------------------------------------------------------------------

/**
 * Build a minimal ArxmlDocument with a single module under one root package.
 * Mirrors the fixture shape used in useArxmlStore.mutation.test.ts so the
 * combined-mode paths in the store action line up.
 */
function makeDoc(
  filePath: string,
  moduleShortName: string,
  containerShortName: string,
): ArxmlDocument {
  const container: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: containerShortName,
    params: {},
    children: [],
  };
  const moduleEl: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: moduleShortName,
    params: {},
    children: [container],
    references: [],
  };
  return {
    path: filePath,
    version: '4.6',
    packages: [
      {
        shortName: 'EAS',
        path: '/EAS',
        elements: [moduleEl],
      },
    ],
  };
}

function makeParam(shortName: string, kind: ParamDef['kind'] = 'integer'): ParamDef {
  return {
    shortName,
    path: `/EAS/Test/Test/${shortName}`,
    kind,
    defaultValue: kind === 'integer' ? 0 : kind === 'boolean' ? false : '',
    minValue: null,
    maxValue: null,
    minLength: null,
    maxLength: null,
    enumerationLiterals: [],
  };
}

function makeSubContainer(
  parentPath: string,
  shortName: string,
  upperMultiplicity: number | 'infinite' = 'infinite',
): ContainerDef {
  return {
    shortName,
    path: `${parentPath}/${shortName}`,
    lowerMultiplicity: 0,
    upperMultiplicity,
    subContainers: [],
    parameters: [],
    references: [],
    choices: [],
  };
}

/**
 * Build a BswModuleDef for the picker. The `subContainers` end up under
 * the parent (CanIfInitCfg) so `listAllowedSubElements` will surface them
 * when the picker opens on `/EAS/CanIf/CanIfInitCfg`.
 */
function makeBswModule(
  moduleShortName: string,
  parentContainerShortName: string,
  subContainerShortNames: readonly string[],
  paramShortNames: readonly string[],
  upperMultiplicityBySub: Readonly<Record<string, number | 'infinite'>> = {},
): BswModuleDef {
  const subContainers: ContainerDef[] = subContainerShortNames.map((sn) =>
    makeSubContainer(
      `/EAS/${moduleShortName}/${parentContainerShortName}`,
      sn,
      upperMultiplicityBySub[sn] ?? 'infinite',
    ),
  );
  const parameters: ParamDef[] = paramShortNames.map((sn) => makeParam(sn));
  const parentContainer: ContainerDef = {
    shortName: parentContainerShortName,
    path: `/EAS/${moduleShortName}/${parentContainerShortName}`,
    lowerMultiplicity: 0,
    upperMultiplicity: 1,
    subContainers,
    parameters,
    references: [],
    choices: [],
  };
  return {
    shortName: moduleShortName,
    path: `/EAS/${moduleShortName}`,
    dialect: 'ecuc-module-def',
    moduleId: 0,
    containers: [parentContainer],
    providedEntries: [],
    lowerMultiplicity: 0,
    upperMultiplicity: 1,
  };
}

function makeBswmd(mod: BswModuleDef): BswmdDocument {
  return { version: '4.6', modules: [mod], warnings: [] };
}

// ---------------------------------------------------------------------------
// Store seeding
// ---------------------------------------------------------------------------

/**
 * Seed the store with a doc + bswmd so the picker can resolve its
 * parent element. Returns the parent path that openBswmdPicker should
 * be called with.
 */
function seedStore(args: {
  readonly moduleShortName: string;
  readonly parentContainerShortName: string;
  readonly subContainerShortNames: readonly string[];
  readonly paramShortNames?: readonly string[];
  readonly upperMultiplicityBySub?: Readonly<Record<string, number | 'infinite'>>;
  readonly docPath?: string;
  readonly bswmdPath?: string;
}): string {
  const {
    moduleShortName,
    parentContainerShortName,
    subContainerShortNames,
    paramShortNames = [],
    upperMultiplicityBySub = {},
    docPath = `/tmp/${moduleShortName}.arxml`,
    bswmdPath = `/schemas/${moduleShortName}.bswmd.arxml`,
  } = args;

  const doc = makeDoc(docPath, moduleShortName, parentContainerShortName);
  useArxmlStore.getState().addDocument(doc, docPath);
  const bswmd = makeBswmd(
    makeBswModule(
      moduleShortName,
      parentContainerShortName,
      subContainerShortNames,
      paramShortNames,
      upperMultiplicityBySub,
    ),
  );
  useArxmlStore.setState({
    bswmdSchemas: [bswmd],
    bswmdPaths: [bswmdPath],
  });
  return `/EAS/${moduleShortName}/${parentContainerShortName}`;
}

// ---------------------------------------------------------------------------
// Mount helper
// ---------------------------------------------------------------------------

function mountPicker(): void {
  render(<BswmdPickerRoot />);
}

afterEach(() => {
  cleanup();
  // Reset the store between tests so module state from one test
  // doesn't leak into the next.
  useArxmlStore.getState().clear();
});

beforeEach(() => {
  useArxmlStore.getState().clear();
});

// ---------------------------------------------------------------------------
// 1. Renders nothing when bswmdPicker.open === false
// ---------------------------------------------------------------------------

describe('BswmdPickerDialog (Sprint 15 / Phase 3.2)', () => {
  it('renders nothing when bswmdPicker.open === false', () => {
    mountPicker();
    // Default state is closed.
    expect(screen.queryByTestId('bspd-overlay')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 2. Renders title + parent path when open
  // -----------------------------------------------------------------------
  it('renders title and parent path when open', () => {
    const parentPath = seedStore({
      moduleShortName: 'CanIf',
      parentContainerShortName: 'CanIfInitCfg',
      subContainerShortNames: ['CanIfBufferCfg'],
    });
    useArxmlStore.setState({ locale: 'en' });
    useArxmlStore.getState().openBswmdPicker({ parentPath, kind: 'container' });
    mountPicker();

    // Title text uses mutation.action.addContainer (Add sub-container).
    const title = screen.getByTestId('bspd-title');
    expect(title).toHaveTextContent('Add sub-container');
    // Parent path is rendered as a breadcrumb.
    const breadcrumb = screen.getByTestId('bspd-parent');
    expect(breadcrumb).toHaveTextContent(parentPath);
  });

  // -----------------------------------------------------------------------
  // 3. Lists sub-containers from listAllowedSubElements
  // -----------------------------------------------------------------------
  it('lists sub-containers from listAllowedSubElements', () => {
    const parentPath = seedStore({
      moduleShortName: 'CanIf',
      parentContainerShortName: 'CanIfInitCfg',
      subContainerShortNames: ['CanIfBufferCfg', 'CanIfRxPduCfg', 'CanIfTxPduCfg'],
    });
    useArxmlStore.getState().openBswmdPicker({ parentPath, kind: 'container' });
    mountPicker();

    // 3 rows rendered, one per sub-container.
    expect(screen.getByTestId('bspd-row-CanIfBufferCfg')).toBeInTheDocument();
    expect(screen.getByTestId('bspd-row-CanIfRxPduCfg')).toBeInTheDocument();
    expect(screen.getByTestId('bspd-row-CanIfTxPduCfg')).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 4. Single-pick: clicking a row highlights it
  // -----------------------------------------------------------------------
  it('single-pick: clicking a row highlights it (Done is the commit step)', () => {
    const parentPath = seedStore({
      moduleShortName: 'CanIf',
      parentContainerShortName: 'CanIfInitCfg',
      subContainerShortNames: ['CanIfBufferCfg', 'CanIfRxPduCfg'],
    });
    useArxmlStore.getState().openBswmdPicker({ parentPath, kind: 'container' });
    mountPicker();

    const bufRow = screen.getByTestId('bspd-row-CanIfBufferCfg');
    // Initial: not selected.
    expect(bufRow.className).not.toMatch(/selected/);
    // Click — should become selected.
    fireEvent.click(bufRow);
    expect(bufRow.className).toMatch(/selected/);
    // Other row is NOT selected.
    const rxRow = screen.getByTestId('bspd-row-CanIfRxPduCfg');
    expect(rxRow.className).not.toMatch(/selected/);
  });

  // -----------------------------------------------------------------------
  // 5. Done button calls the right store action
  // -----------------------------------------------------------------------
  it('Done button calls addContainer with the selected shortName and closes the dialog', () => {
    const parentPath = seedStore({
      moduleShortName: 'CanIf',
      parentContainerShortName: 'CanIfInitCfg',
      subContainerShortNames: ['CanIfBufferCfg', 'CanIfRxPduCfg'],
    });
    useArxmlStore.getState().openBswmdPicker({ parentPath, kind: 'container' });
    mountPicker();

    // Spy on the store action so we can assert call args.
    const addSpy = vi.spyOn(useArxmlStore.getState(), 'addContainer');
    const closeSpy = vi.spyOn(useArxmlStore.getState(), 'closeBswmdPicker');

    // Pick a row.
    fireEvent.click(screen.getByTestId('bspd-row-CanIfBufferCfg'));
    // Click Done.
    fireEvent.click(screen.getByTestId('bspd-done'));

    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy).toHaveBeenCalledWith(parentPath, 'CanIfBufferCfg');
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 6. Cancel closes the dialog without calling any action
  // -----------------------------------------------------------------------
  it('Cancel closes the dialog without calling the add action', () => {
    const parentPath = seedStore({
      moduleShortName: 'CanIf',
      parentContainerShortName: 'CanIfInitCfg',
      subContainerShortNames: ['CanIfBufferCfg'],
    });
    useArxmlStore.getState().openBswmdPicker({ parentPath, kind: 'container' });
    mountPicker();

    const addSpy = vi.spyOn(useArxmlStore.getState(), 'addContainer');

    // Click Cancel.
    fireEvent.click(screen.getByTestId('bspd-cancel'));

    expect(addSpy).not.toHaveBeenCalled();
    // bswmdPicker.open should now be false.
    expect(useArxmlStore.getState().bswmdPicker.open).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 7. Search input filters the list (case-insensitive substring)
  // -----------------------------------------------------------------------
  it('search input filters the list (case-insensitive substring on shortName)', () => {
    const parentPath = seedStore({
      moduleShortName: 'CanIf',
      parentContainerShortName: 'CanIfInitCfg',
      subContainerShortNames: ['CanIfBufferCfg', 'CanIfRxPduCfg', 'CanIfTxPduCfg'],
    });
    useArxmlStore.getState().openBswmdPicker({ parentPath, kind: 'container' });
    mountPicker();

    const search = screen.getByTestId('bspd-search');
    // Type "rx" — should leave only CanIfRxPduCfg.
    fireEvent.change(search, { target: { value: 'rx' } });
    expect(screen.getByTestId('bspd-row-CanIfRxPduCfg')).toBeInTheDocument();
    expect(screen.queryByTestId('bspd-row-CanIfBufferCfg')).toBeNull();
    expect(screen.queryByTestId('bspd-row-CanIfTxPduCfg')).toBeNull();
    // Type "Rx" (uppercase R) — same hit, case-insensitive.
    fireEvent.change(search, { target: { value: 'Rx' } });
    expect(screen.getByTestId('bspd-row-CanIfRxPduCfg')).toBeInTheDocument();
    // Type something that doesn't match — empty result, no rows.
    fireEvent.change(search, { target: { value: 'nomatch-zzz' } });
    expect(screen.queryByTestId('bspd-row-CanIfBufferCfg')).toBeNull();
    expect(screen.queryByTestId('bspd-row-CanIfRxPduCfg')).toBeNull();
    expect(screen.queryByTestId('bspd-row-CanIfTxPduCfg')).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 8. Disabled (at-max) row cannot be picked
  // -----------------------------------------------------------------------
  it('disabled (at-max) row cannot be picked', () => {
    const parentPath = seedStore({
      moduleShortName: 'CanIf',
      parentContainerShortName: 'CanIfInitCfg',
      subContainerShortNames: ['CanIfBufferCfg', 'CanIfRxPduCfg'],
      upperMultiplicityBySub: { CanIfRxPduCfg: 0 }, // 0 == at-max: no more can be added
    });
    useArxmlStore.getState().openBswmdPicker({ parentPath, kind: 'container' });
    mountPicker();

    // CanIfRxPduCfg is at-max (current=0, upper=0 → atMax=true).
    const rxRow = screen.getByTestId('bspd-row-CanIfRxPduCfg');
    expect(rxRow).toHaveAttribute('aria-disabled', 'true');
    expect(rxRow.className).toMatch(/disabled/);
    // Clicking should not select.
    fireEvent.click(rxRow);
    expect(rxRow.className).not.toMatch(/selected/);
  });

  // -----------------------------------------------------------------------
  // 9. Empty state when all options are at-max
  // -----------------------------------------------------------------------
  it('shows empty state when all options are at-max', () => {
    const parentPath = seedStore({
      moduleShortName: 'CanIf',
      parentContainerShortName: 'CanIfInitCfg',
      subContainerShortNames: ['CanIfBufferCfg', 'CanIfRxPduCfg'],
      upperMultiplicityBySub: { CanIfBufferCfg: 0, CanIfRxPduCfg: 0 },
    });
    useArxmlStore.getState().openBswmdPicker({ parentPath, kind: 'container' });
    mountPicker();

    // No enabled rows — all at-max so all are disabled.
    expect(screen.getByTestId('bspd-row-CanIfBufferCfg').className).toMatch(/disabled/);
    expect(screen.getByTestId('bspd-row-CanIfRxPduCfg').className).toMatch(/disabled/);
    // Done button is disabled when no enabled row is selected.
    expect(screen.getByTestId('bspd-done')).toBeDisabled();
  });

  // -----------------------------------------------------------------------
  // 10. Title changes when locale is switched
  // -----------------------------------------------------------------------
  it('title changes when locale is switched (zh-CN / en)', () => {
    const parentPath = seedStore({
      moduleShortName: 'CanIf',
      parentContainerShortName: 'CanIfInitCfg',
      subContainerShortNames: ['CanIfBufferCfg'],
    });
    useArxmlStore.getState().setLocale('zh-CN');
    useArxmlStore.getState().openBswmdPicker({ parentPath, kind: 'container' });
    mountPicker();

    // zh-CN: 添加子容器
    const titleZh = screen.getByTestId('bspd-title');
    expect(titleZh.textContent).toMatch(/添加/);

    // Switch to en; the component subscribes to locale, so the title
    // re-renders.
    act(() => {
      useArxmlStore.getState().setLocale('en');
    });
    const titleEn = screen.getByTestId('bspd-title');
    expect(titleEn.textContent).toMatch(/Add/);
  });
});
