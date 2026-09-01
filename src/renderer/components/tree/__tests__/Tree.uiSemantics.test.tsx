// @vitest-environment jsdom
//
// P1 tree UX pins:
//   1. Empty containers do not advertise a false "expand me" affordance.
//   2. Containers that can still receive missing optional BSWMD children
//      remain expandable so the existing add placeholder is discoverable.
//   3. Container rows expose schema definition/multiplicity in a tooltip.
//   4. Kind icons have a compact legend for discoverability.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { ArxmlDocument } from '@core/arxml/types.js';
import type { BswModuleDef, BswmdDocument, ContainerDef } from '@core/project/bswmd.js';
import type { Locale } from '@shared/i18n/index.js';

import { Tree } from '../Tree.js';
import type { ArxmlStoreApi } from '../Tree.js';

const makeEmptyContainer = (shortName: string): ArxmlDocument => ({
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
              shortName,
              params: {},
              definitionRef: '/AUTOSAR/EcuCDefs/EcuC/EcuCGeneral',
              children: [],
            },
          ],
          references: [],
        },
      ],
    },
  ],
});

const makeSubContainer = (shortName: string, lowerMultiplicity: number): ContainerDef => ({
  shortName,
  path: `/AUTOSAR/EcuCDefs/EcuC/EcuCGeneral/${shortName}`,
  lowerMultiplicity,
  upperMultiplicity: 'infinite',
  subContainers: [],
  parameters: [],
  references: [],
  choices: [],
});

const makeBswmd = (
  children: readonly ContainerDef[],
  containerShortName = 'EcuCGeneral',
): BswmdDocument => {
  const container: ContainerDef = {
    shortName: containerShortName,
    path: `/AUTOSAR/EcuCDefs/EcuC/${containerShortName}`,
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
    subContainers: [...children],
    parameters: [],
    references: [],
    choices: [],
  };
  const module: BswModuleDef = {
    shortName: 'EcuC',
    path: '/AUTOSAR/EcuCDefs/EcuC',
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [container],
    providedEntries: [],
    lowerMultiplicity: 1,
    upperMultiplicity: 1,
  };
  return { version: '4.6', modules: [module], warnings: [] };
};

function makeStore(opts: {
  readonly doc: ArxmlDocument;
  readonly bswmdSchemas?: readonly BswmdDocument[];
}): ArxmlStoreApi {
  const state = {
    doc: opts.doc,
    displayDoc: opts.doc,
    selectedPath: null,
    locale: 'en' as Locale,
    bswmdSchemas: opts.bswmdSchemas ?? [],
    select: (): void => undefined,
  };
  return {
    getState: () => state,
    subscribe: () => () => undefined,
  };
}

function expandRoot(): void {
  fireEvent.click(screen.getByTestId('chevron-/EAS'));
  fireEvent.click(screen.getByTestId('chevron-/EAS/EcuC'));
}

afterEach(() => cleanup());

describe('Tree chevron/schema UX', () => {
  it('hides the chevron on a truly empty container', () => {
    const doc = makeEmptyContainer('LeafContainer');
    render(<Tree store={makeStore({ doc })} />);
    expandRoot();
    expect(screen.queryByTestId('chevron-/EAS/EcuC/LeafContainer')).toBeNull();
    expect(screen.getByTestId('treeitem-/EAS/EcuC/LeafContainer')).not.toHaveAttribute(
      'aria-expanded',
    );
  });

  it('keeps an empty container expandable when optional BSWMD children can be added', () => {
    const doc = makeEmptyContainer('ParentContainer');
    render(
      <Tree
        store={makeStore({
          doc,
          bswmdSchemas: [makeBswmd([makeSubContainer('OptionalChild', 0)], 'ParentContainer')],
        })}
      />,
    );
    expandRoot();
    expect(screen.getByTestId('chevron-/EAS/EcuC/ParentContainer')).toBeInTheDocument();
  });

  it('shows definition and multiplicity details in the container tooltip', () => {
    const doc = makeEmptyContainer('EcuCGeneral');
    render(<Tree store={makeStore({ doc, bswmdSchemas: [makeBswmd([])] })} />);
    expandRoot();
    const label = screen.getByTestId('label-/EAS/EcuC/EcuCGeneral');
    expect(label).toHaveAttribute(
      'title',
      [
        'Container',
        'Definition: /AUTOSAR/EcuCDefs/EcuC/EcuCGeneral',
        'Multiplicity: 1..1',
        'Children: 0',
      ].join('\n'),
    );
  });

  it('renders a compact kind legend', () => {
    const doc = makeEmptyContainer('LeafContainer');
    render(<Tree store={makeStore({ doc })} />);
    expect(
      screen.getByLabelText('Module · Container · Reference · Collection'),
    ).toBeInTheDocument();
  });
});
