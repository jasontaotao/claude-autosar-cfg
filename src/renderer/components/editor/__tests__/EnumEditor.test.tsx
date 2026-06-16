// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ArxmlDocument } from '@core/arxml/types';

import { useArxmlStore } from '../../../store/useArxmlStore';
import { EnumEditor } from '../modes/EnumEditor';

afterEach(cleanup);

const schemaHitContainerPath = '/EcucDefs/EcuC/EcucGeneral';
const schemaHitParamKey = 'BitOrder'; // enumLiterals: ['LSB']
const schemaMissParamKey = 'CustomEnum'; // not in ECUC_SUBSET_SCHEMA

const doc: ArxmlDocument = {
  path: 'x',
  version: '4.6',
  packages: [
    {
      shortName: 'EcucDefs',
      path: '/EcucDefs',
      elements: [
        {
          kind: 'container',
          tagName: 'ECUC-CONTAINER-VALUE',
          shortName: 'EcucGeneral',
          params: {},
          children: [],
        },
      ],
    },
  ],
};

describe('EnumEditor', () => {
  beforeEach(() => {
    useArxmlStore.setState({
      doc: null,
      filePath: null,
      selectedPath: null,
      dirtyPaths: new Set<string>(),
      error: null,
      validationErrors: [],
      lastValidatedAt: null,
    });
  });

  it('renders a <select> with options when the schema has enumLiterals for this path', () => {
    useArxmlStore.setState({ doc });

    render(
      <EnumEditor
        paramKey={schemaHitParamKey}
        value={{ type: 'enum', value: 'LSB' }}
        containerPath={schemaHitContainerPath}
      />,
    );

    const select = screen.getByTestId(`enum-editor-${schemaHitParamKey}`);
    expect(select.tagName).toBe('SELECT');
    // The schema entry for BitOrder has exactly one literal: 'LSB'
    expect(screen.getByRole('option', { name: 'LSB' })).toBeInTheDocument();
  });

  it('falls back to <input type="text"> when the schema has no entry for this path', () => {
    useArxmlStore.setState({ doc });

    render(
      <EnumEditor
        paramKey={schemaMissParamKey}
        value={{ type: 'enum', value: 'freeform' }}
        containerPath={schemaHitContainerPath}
      />,
    );

    const input = screen.getByTestId(`enum-editor-text-${schemaMissParamKey}`);
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('type', 'text');
  });
});
