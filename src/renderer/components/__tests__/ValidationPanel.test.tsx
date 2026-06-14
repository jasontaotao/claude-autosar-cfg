// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ArxmlDocument } from '@core/arxml/types';
import type { ValidationError } from '@core/validation';

import { useArxmlStore } from '../../store/useArxmlStore';
import { ValidationPanel } from '../ValidationPanel';

afterEach(cleanup);

const emptyDoc: ArxmlDocument = {
  path: 'x',
  version: '4.6',
  packages: [],
};

function resetStore(): void {
  useArxmlStore.setState({
    doc: null,
    filePath: null,
    selectedPath: null,
    dirty: false,
    error: null,
    validationErrors: [],
    lastValidatedAt: null,
  });
}

describe('ValidationPanel', () => {
  beforeEach(() => {
    resetStore();
  });

  it('renders empty state when no document is loaded', () => {
    render(<ValidationPanel />);
    expect(screen.getByText(/no document loaded/i)).toBeInTheDocument();
  });

  it('renders valid state with "All checks passed" badge when no errors', () => {
    useArxmlStore.setState({
      doc: emptyDoc,
      filePath: 'x.arxml',
      lastValidatedAt: Date.now(),
    });

    render(<ValidationPanel />);
    expect(screen.getByText(/all checks passed/i)).toBeInTheDocument();
  });

  it('renders grouped errors and shows the total count badge', () => {
    const errors: ValidationError[] = [
      {
        kind: 'range',
        path: '/P/Pdu/PduLength',
        paramKey: 'PduLength',
        message: 'above max',
        expected: '<=8',
        actual: '9',
      },
      {
        kind: 'enum',
        path: '/P/Pdu/PduType',
        paramKey: 'PduType',
        message: 'not in literals',
        expected: 'A|B',
        actual: 'X',
      },
      {
        kind: 'reference',
        path: '/P/Pdu/PduRef',
        message: 'DEST mismatch',
      },
    ];
    useArxmlStore.setState({
      doc: emptyDoc,
      filePath: 'x.arxml',
      lastValidatedAt: Date.now(),
      validationErrors: errors,
    });

    render(<ValidationPanel />);

    // 3 violations total
    expect(screen.getByText(/3 violations/i)).toBeInTheDocument();
    // Kind sections all rendered
    expect(screen.getByText(/^range$/i)).toBeInTheDocument();
    expect(screen.getByText(/^enum$/i)).toBeInTheDocument();
    expect(screen.getByText(/^reference$/i)).toBeInTheDocument();
  });

  it('clicking an error row calls select() with the container path (paramKey stripped)', () => {
    const errors: ValidationError[] = [
      {
        kind: 'range',
        path: '/P/Pdu/PduLength',
        paramKey: 'PduLength',
        message: 'above max',
        expected: '<=8',
        actual: '9',
      },
    ];
    useArxmlStore.setState({
      doc: emptyDoc,
      filePath: 'x.arxml',
      lastValidatedAt: Date.now(),
      validationErrors: errors,
    });

    render(<ValidationPanel />);
    const row = screen.getByTestId('error-row-0');
    fireEvent.click(row);

    expect(useArxmlStore.getState().selectedPath).toBe('/P/Pdu');
  });
});
