// @vitest-environment jsdom
//
// ModuleFromBswmdPicker (Sprint 14 / Task 10):
//   - Multi-select picker for choosing 1+ modules across 1+ loaded BSWMD
//     files to instantiate as new ECUC ARXML skeletons.
//   - State source: `useArxmlStore.bswmdSchemas` (parallel to `bswmdPaths`)
//     — picker reads via selectors; the parent host owns the
//     `open` / `onConfirm` / `onClose` lifecycle.
//   - Key shape: `${bswmdPath}::${moduleShortName}` — the same shape
//     `resolveCollisionFilename` uses internally (T3).
//   - Per-row checks: select-all/clear, filter substring, collision
//     warning when 2 BSWMDs share a `moduleShortName`, disabled-module
//     filter via `disabledModules`.
//
// Tests pin (5):
//   1.  Renders a checkbox per module (one per (bswmdPath, moduleShortName))
//   2.  Confirms only the selected picks via onConfirm
//   3.  Shows collision warning when 2 BSWMDs have the same module
//   4.  preSelectedBswmdPath prop pre-checks every module from that BSWMD
//   5.  Filters out modules whose shortName is in `disabledModules`
//         (per `BswmdDocument.disabledModules` from T4)

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BswModuleDef, BswmdDocument } from '@core/project/bswmd.js';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { ModuleFromBswmdPicker } from '../ModuleFromBswmdPicker.js';

// ---------------------------------------------------------------------------
// Test fixture builders
// ---------------------------------------------------------------------------

/**
 * Build a minimal BswModuleDef. Test fixtures don't need a full ARXML
 * subtree — the picker only reads `shortName` and `path`. We `as unknown
 * as BswModuleDef` so we don't have to populate every container / param /
 * reference field. Mirrors the T7/T8 pattern.
 */
function makeModule(shortName: string, path: string): BswModuleDef {
  return {
    shortName,
    path,
    dialect: 'ecuc-module-def',
    moduleId: 0,
    containers: [],
    providedEntries: [],
    lowerMultiplicity: 0,
    upperMultiplicity: 1,
  } as unknown as BswModuleDef;
}

function makeBswmd(modules: readonly BswModuleDef[], disabled?: ReadonlySet<string>): BswmdDocument {
  return {
    version: '4.6',
    modules,
    warnings: [],
    ...(disabled !== undefined ? { disabledModules: disabled } : {}),
  };
}

// ---------------------------------------------------------------------------
// Store seeding
// ---------------------------------------------------------------------------

beforeEach(() => {
  useArxmlStore.setState({ locale: 'en' });
});

afterEach(() => {
  cleanup();
  // Reset to defaults between tests.
  useArxmlStore.setState({
    bswmdSchemas: [],
    bswmdPaths: [],
    locale: 'en',
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModuleFromBswmdPicker', () => {
  it('renders a checkbox per module across all BSWMDs', () => {
    useArxmlStore.setState({
      bswmdSchemas: [
        makeBswmd([
          makeModule('Can', '/AUTOSAR/EcucDefs/Can'),
          makeModule('CanIf', '/AUTOSAR/EcucDefs/CanIf'),
        ]),
      ],
      bswmdPaths: ['D:/bswmd/Can.arxml'],
    });

    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ModuleFromBswmdPicker
        open
        projectDir="D:/proj"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('emits selected picks on confirm', () => {
    useArxmlStore.setState({
      bswmdSchemas: [
        makeBswmd([
          makeModule('Can', '/AUTOSAR/EcucDefs/Can'),
          makeModule('CanIf', '/AUTOSAR/EcucDefs/CanIf'),
        ]),
      ],
      bswmdPaths: ['D:/bswmd/Can.arxml'],
    });

    const onConfirm = vi.fn();
    render(
      <ModuleFromBswmdPicker
        open
        projectDir="D:/proj"
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText('Can'));
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith([
      { bswmdPath: 'D:/bswmd/Can.arxml', moduleShortName: 'Can' },
    ]);
  });

  it('shows collision warning when 2 BSWMDs have the same module', () => {
    useArxmlStore.setState({
      bswmdSchemas: [
        makeBswmd([makeModule('Can', '/AUTOSAR/EcucDefs/Can')]),
        makeBswmd([makeModule('Can', '/EAS/Can')]),
      ],
      bswmdPaths: ['D:/A.arxml', 'D:/B.arxml'],
    });

    render(
      <ModuleFromBswmdPicker
        open
        projectDir="D:/proj"
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );

    const canCheckboxes = screen.getAllByLabelText('Can');
    expect(canCheckboxes).toHaveLength(2);
    fireEvent.click(canCheckboxes[0]!);
    fireEvent.click(canCheckboxes[1]!);

    expect(screen.getByText(/collision/i)).toBeInTheDocument();
  });

  it('pre-checks all modules from preSelectedBswmdPath on mount', () => {
    useArxmlStore.setState({
      bswmdSchemas: [
        makeBswmd([
          makeModule('Can', '/AUTOSAR/EcucDefs/Can'),
          makeModule('CanIf', '/AUTOSAR/EcucDefs/CanIf'),
        ]),
        makeBswmd([makeModule('Adc', '/AUTOSAR/EcucDefs/Adc')]),
      ],
      bswmdPaths: ['D:/bswmd/Can.arxml', 'D:/bswmd/Adc.arxml'],
    });

    const onConfirm = vi.fn();
    render(
      <ModuleFromBswmdPicker
        open
        projectDir="D:/proj"
        preSelectedBswmdPath="D:/bswmd/Can.arxml"
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );

    // The 2 modules from Can.arxml should be pre-checked; Adc from the
    // other BSWMD should NOT be pre-checked.
    const canCheckbox = screen.getByLabelText('Can') as HTMLInputElement;
    const canIfCheckbox = screen.getByLabelText('CanIf') as HTMLInputElement;
    const adcCheckbox = screen.getByLabelText('Adc') as HTMLInputElement;
    expect(canCheckbox.checked).toBe(true);
    expect(canIfCheckbox.checked).toBe(true);
    expect(adcCheckbox.checked).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith([
      { bswmdPath: 'D:/bswmd/Can.arxml', moduleShortName: 'Can' },
      { bswmdPath: 'D:/bswmd/Can.arxml', moduleShortName: 'CanIf' },
    ]);
  });

  it('hides modules whose shortName is in BswmdDocument.disabledModules', () => {
    useArxmlStore.setState({
      bswmdSchemas: [
        makeBswmd(
          [
            makeModule('Can', '/AUTOSAR/EcucDefs/Can'),
            makeModule('CanIf', '/AUTOSAR/EcucDefs/CanIf'),
            makeModule('CanTp', '/EAS/CanTp'),
          ],
          new Set(['CanTp']),
        ),
      ],
      bswmdPaths: ['D:/bswmd/Can.arxml'],
    });

    render(
      <ModuleFromBswmdPicker
        open
        projectDir="D:/proj"
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );

    // Can + CanIf should be visible, CanTp should be hidden.
    expect(screen.getByLabelText('Can')).toBeInTheDocument();
    expect(screen.getByLabelText('CanIf')).toBeInTheDocument();
    expect(screen.queryByLabelText('CanTp')).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('shows ecuc/ subfolder hint above Will create list when something is selected', () => {
    useArxmlStore.setState({
      bswmdSchemas: [
        makeBswmd([makeModule('Can', '/AUTOSAR/EcucDefs/Can')]),
      ],
      bswmdPaths: ['D:/bswmd/Can.arxml'],
    });

    render(
      <ModuleFromBswmdPicker
        open
        projectDir="D:/proj"
        onConfirm={() => {}}
        onClose={() => {}}
      />,
    );

    // Select 1 module so the right pane renders the Will-create list,
    // which is where the hint lives.
    fireEvent.click(screen.getByLabelText('Can'));

    const hint = screen.getByTestId('ecuc-output-dir-hint');
    expect(hint).toHaveTextContent(/ecuc/);
  });
});