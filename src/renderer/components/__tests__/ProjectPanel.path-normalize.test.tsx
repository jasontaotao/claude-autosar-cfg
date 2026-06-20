// @vitest-environment jsdom
//
// Sprint A (P0-A1) — ProjectPanel chip lookup across path-shape mismatch.
//
// `ProjectPanelInfo` renders a trailing `📋 N/M` chip + `+` button for
// each BSWMD listed in the manifest. The chip's `N/M` count is the
// parsed schema's active/total module count, sourced from
// `useArxmlStore.bswmdSchemas`. The lookup pairs `manifest.bswmdPaths`
// (relative POSIX) against `state.bswmdPaths` (absolute Windows).
//
// Pre-Sprint-A: the lookup used `bswmdPathsInStore.indexOf(bswmdPath)`
// — a strict string compare that never matched (different shapes), so
// the chip always rendered `📋 0/0` and the `+` button stayed disabled
// even after the store had loaded real schemas.
//
// The fix replaces the strict indexOf with a `bswmdKeyFor` lookup, so
// the two shapes collapse to the same key. These tests pin the
// behaviour:
//
//   1. Manifest path = relative POSIX, store path = absolute Windows:
//      chip renders the real active/total count.
//   2. Mixed separators (D:/proj\\X) → still resolves.
//   3. Two BSWMDs in different sub-dirs: each row maps to its OWN
//      schema (collision-safety — Sprint 16 contract).
//   4. Manifest path with no matching schema (stale manifest entry):
//      chip still shows 0/0 and the `+` button is disabled, no crash.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { BswModuleDef, BswmdDocument } from '@core/project/bswmd.js';
import type { ProjectManifest } from '@shared/project';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { ProjectPanelInfo } from '../ProjectPanel.js';

// ---------------------------------------------------------------------------
// Test fixture builders
// ---------------------------------------------------------------------------

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

function makeBswmd(modules: readonly BswModuleDef[]): BswmdDocument {
  return {
    version: '4.6',
    modules,
    warnings: [],
  };
}

function makeManifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    schemaVersion: '1',
    id: 'a1b2c3d4-0000-0000-0000-000000000000',
    name: 'Path-Normalize Test Project',
    valueArxmlPaths: [],
    bswmdPaths: [],
    ...overrides,
  };
}

const baseProps = {
  locale: 'zh-CN' as const,
  manifestPath: 'D:/proj/MyProj.autosarcfg.json',
  onClose: () => undefined,
  onRemoveArxml: () => undefined,
  onAddBswmd: () => undefined,
  onRemoveBswmd: () => undefined,
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // The store must be in 'en' so the chip's tooltip text matches our
  // regex below. ProjectPanel reads locale via useArxmlStore.getState()
  // inside FileList; we still set the store locale so any future
  // selector-based reads stay deterministic.
  useArxmlStore.setState({ locale: 'en' });
});

afterEach(() => {
  cleanup();
  useArxmlStore.getState().clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectPanelInfo — BSWMD chip path-normalize (Sprint A / P0-A1)', () => {
  it('resolves chip count when manifest path is relative POSIX and store path is absolute Windows', () => {
    // Arrange — manifest stores relative POSIX; store holds absolute
    // Windows. The two paths describe the same file but never compare
    // equal under a strict indexOf — `bswmdKeyFor` collapses them.
    useArxmlStore.setState({
      bswmdSchemas: [
        makeBswmd([
          makeModule('Can', '/EcucDefs/Can'),
          makeModule('CanIf', '/EcucDefs/CanIf'),
          makeModule('CanTp', '/EcucDefs/CanTp'),
        ]),
      ],
      bswmdPaths: ['D:\\proj\\bswmd\\EcuC.arxml'],
    });

    const manifest = makeManifest({ bswmdPaths: ['bswmd/EcuC.arxml'] });

    // Act
    render(<ProjectPanelInfo {...baseProps} manifest={manifest} />);

    // Assert — chip shows the real active count, not 0/0.
    const chip = screen.getByTestId('project-panel-bswmd-chip-0');
    expect(chip).toHaveTextContent('3/3');
    // The + button is enabled now (activeCount > 0).
    const addBtn = screen.getByTestId('project-panel-bswmd-add-ecuc-0');
    expect(addBtn).not.toBeDisabled();
  });

  it('resolves chip count across mixed-separator absolute Windows paths', () => {
    useArxmlStore.setState({
      bswmdSchemas: [makeBswmd([makeModule('Adc', '/EcucDefs/Adc')])],
      bswmdPaths: ['D:/proj/bswmd\\Adc.arxml'],
    });

    const manifest = makeManifest({ bswmdPaths: ['bswmd/Adc.arxml'] });
    render(<ProjectPanelInfo {...baseProps} manifest={manifest} />);

    const chip = screen.getByTestId('project-panel-bswmd-chip-0');
    expect(chip).toHaveTextContent('1/1');
  });

  it('pairs each manifest row to its OWN schema when two BSWMDs live in different sub-folders', () => {
    // Sprint 16 collision-safety: the same key scheme must distinguish
    // `subdir1/EcuC.arxml` from `subdir2/EcuC.arxml` so the chip on
    // row 0 surfaces Can's count and row 1 surfaces Adc's count.
    useArxmlStore.setState({
      bswmdSchemas: [
        makeBswmd([
          makeModule('Can', '/EcucDefs/Can'),
          makeModule('CanIf', '/EcucDefs/CanIf'),
        ]),
        makeBswmd([makeModule('Adc', '/EcucDefs/Adc')]),
      ],
      bswmdPaths: ['D:\\proj\\subdir1\\EcuC.arxml', 'D:\\proj\\subdir2\\EcuC.arxml'],
    });

    const manifest = makeManifest({
      bswmdPaths: ['subdir1/EcuC.arxml', 'subdir2/EcuC.arxml'],
    });
    render(<ProjectPanelInfo {...baseProps} manifest={manifest} />);

    expect(screen.getByTestId('project-panel-bswmd-chip-0')).toHaveTextContent('2/2');
    expect(screen.getByTestId('project-panel-bswmd-chip-1')).toHaveTextContent('1/1');
  });

  it('renders 0/0 chip + disabled + button when manifest lists a BSWMD the store has no schema for', () => {
    // Stale manifest entry: user added `bswmd/Missing.arxml` to the
    // manifest but the file no longer exists on disk. The store has
    // no schema for it. The chip must still render (no crash), just
    // stuck at 0/0 and the + button disabled.
    useArxmlStore.setState({
      bswmdSchemas: [],
      bswmdPaths: [],
    });

    const manifest = makeManifest({ bswmdPaths: ['bswmd/Missing.arxml'] });
    render(<ProjectPanelInfo {...baseProps} manifest={manifest} />);

    const chip = screen.getByTestId('project-panel-bswmd-chip-0');
    expect(chip).toHaveTextContent('0/0');
    const addBtn = screen.getByTestId('project-panel-bswmd-add-ecuc-0');
    expect(addBtn).toBeDisabled();
  });
});