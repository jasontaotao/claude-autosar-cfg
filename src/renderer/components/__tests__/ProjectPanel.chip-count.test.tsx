// @vitest-environment jsdom
//
// v1.8.4 Bug 3 — `📋 N/M` chip count must reflect ECUC-instantiated
// docs, not BSWMD-side enabled modules.
//
// Previously ProjectPanel.tsx:339-340 derived `activeCount` from
// `getActiveModules(schema).length`, which counts BSWMD modules with
// `disabledModules` filter — a BSWMD-side toggle, unrelated to whether
// any ECUC doc was generated from the BSWMD. The chip is rendered next
// to the "+" button the user clicks to CREATE ECUC docs, so the visual
// adjacency strongly implied "N ECUC docs already exist from M
// modules". The old behaviour was misleading: loading a 5-module BSWMD
// rendered `📋 5/5` immediately, even with zero ECUC docs.
//
// Fix: derive the chip count from `documents.filter(d => d.sourceBswmdPath
// === bswmdPath).length`. Keep i18n key name (`modulesActive`) for
// minimal churn; only the string wording changes from "active" to
// "instantiated" so the user knows what the number means.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ArxmlDocument } from '@core/arxml/types.js';
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
    multiplicityConfigClasses: [],
  };
}

function makeBswmd(modules: readonly BswModuleDef[]): BswmdDocument {
  return { version: '4.6', modules, warnings: [] };
}

function makeEcucDoc(bswmdPath: string, moduleShortName: string): ArxmlDocument {
  return {
    path: `D:/proj/ecuc/${moduleShortName}_${bswmdPath.split(/[\\/]/).pop()}.arxml`,
    version: '4.6',
    sourceBswmdPath: bswmdPath,
    packages: [
      {
        shortName: 'EAS',
        path: '/EAS',
        elements: [
          {
            kind: 'module' as const,
            tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
            shortName: moduleShortName,
            params: {},
            children: [],
            references: [],
          },
        ],
      },
    ],
  };
}

const baseProps = {
  locale: 'zh-CN' as const,
  projectName: 'MyProj',
  manifestPath: 'D:/proj/MyProj.autosarcfg.json',
  onClose: () => undefined,
  onRemoveArxml: () => undefined,
  onAddBswmd: () => undefined,
  onRemoveBswmd: () => undefined,
};

function makeManifest(opts: { bswmdPaths: readonly string[] }): ProjectManifest {
  return {
    schemaVersion: '1',
    id: 'a1b2c3d4-0000-0000-0000-000000000000',
    name: 'MyProj',
    valueArxmlPaths: [],
    bswmdPaths: [...opts.bswmdPaths],
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  useArxmlStore.setState({ locale: 'en' });
});

afterEach(() => {
  cleanup();
  useArxmlStore.getState().clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectPanelInfo chip count reflects ECUC-instantiated docs (v1.8.4 Bug 3)', () => {
  it('renders 0/3 when a 3-module BSWMD is loaded but no ECUC doc exists', () => {
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

    render(<ProjectPanelInfo {...baseProps} manifest={manifest} />);

    expect(screen.getByTestId('project-panel-bswmd-chip-0')).toHaveTextContent('0/3');
  });

  it('renders 1/3 after the user generates one ECUC from this BSWMD', () => {
    const bswmdPath = 'D:\\proj\\bswmd\\EcuC.arxml';
    useArxmlStore.setState({
      bswmdSchemas: [
        makeBswmd([
          makeModule('Can', '/EcucDefs/Can'),
          makeModule('CanIf', '/EcucDefs/CanIf'),
          makeModule('CanTp', '/EcucDefs/CanTp'),
        ]),
      ],
      bswmdPaths: [bswmdPath],
      documents: [makeEcucDoc(bswmdPath, 'Can')],
    });
    const manifest = makeManifest({ bswmdPaths: ['bswmd/EcuC.arxml'] });

    render(<ProjectPanelInfo {...baseProps} manifest={manifest} />);

    expect(screen.getByTestId('project-panel-bswmd-chip-0')).toHaveTextContent('1/3');
  });

  it('renders 2/3 after the user generates a 2nd ECUC from the same BSWMD', () => {
    const bswmdPath = 'D:\\proj\\bswmd\\EcuC.arxml';
    useArxmlStore.setState({
      bswmdSchemas: [
        makeBswmd([
          makeModule('Can', '/EcucDefs/Can'),
          makeModule('CanIf', '/EcucDefs/CanIf'),
          makeModule('CanTp', '/EcucDefs/CanTp'),
        ]),
      ],
      bswmdPaths: [bswmdPath],
      documents: [makeEcucDoc(bswmdPath, 'Can'), makeEcucDoc(bswmdPath, 'CanIf')],
    });
    const manifest = makeManifest({ bswmdPaths: ['bswmd/EcuC.arxml'] });

    render(<ProjectPanelInfo {...baseProps} manifest={manifest} />);

    expect(screen.getByTestId('project-panel-bswmd-chip-0')).toHaveTextContent('2/3');
  });

  it('does NOT count ECUC docs that originated from a different BSWMD', () => {
    // BSWMD-A generates 2 ECUC docs; BSWMD-B's chip must show 0/1.
    const bswmdAPath = 'D:\\proj\\bswmd\\EcuC_A.arxml';
    const bswmdBPath = 'D:\\proj\\bswmd\\EcuC_B.arxml';
    useArxmlStore.setState({
      bswmdSchemas: [
        makeBswmd([makeModule('Can', '/EcucDefs/Can'), makeModule('CanIf', '/EcucDefs/CanIf')]),
        makeBswmd([makeModule('Adc', '/EcucDefs/Adc')]),
      ],
      bswmdPaths: [bswmdAPath, bswmdBPath],
      documents: [makeEcucDoc(bswmdAPath, 'Can'), makeEcucDoc(bswmdAPath, 'CanIf')],
    });
    const manifest = makeManifest({
      bswmdPaths: ['bswmd/EcuC_A.arxml', 'bswmd/EcuC_B.arxml'],
    });

    render(<ProjectPanelInfo {...baseProps} manifest={manifest} />);

    expect(screen.getByTestId('project-panel-bswmd-chip-0')).toHaveTextContent('2/2');
    expect(screen.getByTestId('project-panel-bswmd-chip-1')).toHaveTextContent('0/1');
  });

  it('+ button is enabled when totalCount > 0 even if instantiatedCount === 0', () => {
    // The + button must let the user CREATE the first ECUC doc; the
    // old disabled condition (`activeCount === 0`) only made sense
    // when activeCount was tied to BSWMD-disabled state. After the fix
    // it should be tied to totalCount (i.e. the BSWMD has any modules).
    useArxmlStore.setState({
      bswmdSchemas: [
        makeBswmd([makeModule('Can', '/EcucDefs/Can'), makeModule('CanIf', '/EcucDefs/CanIf')]),
      ],
      bswmdPaths: ['D:\\proj\\bswmd\\EcuC.arxml'],
      documents: [],
    });
    const manifest = makeManifest({ bswmdPaths: ['bswmd/EcuC.arxml'] });

    render(<ProjectPanelInfo {...baseProps} manifest={manifest} />);

    const addBtn = screen.getByTestId('project-panel-bswmd-add-ecuc-0');
    expect(addBtn).not.toBeDisabled();
  });
});
