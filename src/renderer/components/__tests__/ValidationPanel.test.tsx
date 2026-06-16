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
    dirtyPaths: new Set<string>(),
    error: null,
    validationErrors: [],
    lastValidatedAt: null,
    // Sprint 11 Phase 1 (Option A) — pin locale to en so the
    // "Validation" / "All checks passed" / "N violations" assertions
    // keep matching after i18n landed.
    locale: 'en',
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

  // S5-T3: ValidationPanel must surface the new 'multiplicity' kind
  // alongside the existing 5 kinds, with the same group-by-kind logic.

  it("renders multiplicity group label when errors of kind='multiplicity' present", () => {
    const errors: ValidationError[] = [
      {
        kind: 'multiplicity',
        path: '/EcucDefs/EcuC/EcucPduCollection',
        message: 'Container instance count 0 below lower multiplicity 1',
        expected: '>= 1',
        actual: '0',
      },
    ];
    useArxmlStore.setState({
      doc: emptyDoc,
      filePath: 'x.arxml',
      lastValidatedAt: Date.now(),
      validationErrors: errors,
    });

    render(<ValidationPanel />);

    // The kind badge text comes from the dynamic group-by-kind map
    // (Object.entries(grouped).map(...)). The 'multiplicity' kind
    // should appear as a section label just like range/enum/etc.
    expect(screen.getByText(/^multiplicity$/i)).toBeInTheDocument();
    // And the count badge reads the same
    expect(screen.getByText(/1 violation$/i)).toBeInTheDocument();
  });

  it('does not render multiplicity group when no multiplicity errors', () => {
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

    // queryByText returns null when no match — ideal for asserting absence.
    expect(screen.queryByText(/^multiplicity$/i)).toBeNull();
    // Sanity: the other kind still rendered
    expect(screen.getByText(/^range$/i)).toBeInTheDocument();
  });

  // Sprint 10 #3 — element-level click bug fix.
  // Pre-Sprint 10 #3: extractContainerPath stripped the trailing segment
  // from EVERY error, including element-level kinds (multiplicity,
  // cross-ref, ref-dest, ref-cycle) where err.path IS the element path
  // (no paramKey). That mis-clicked the parent, never the element itself.
  // Fix: branch on err.paramKey !== undefined.
  it('clicking a multiplicity row selects the element path (paramKey is undefined)', () => {
    const errors: ValidationError[] = [
      {
        kind: 'multiplicity',
        path: '/EcucDefs/EcuC/EcucPduCollection',
        message: 'Container instance count 0 below lower multiplicity 1',
        expected: '>= 1',
        actual: '0',
      },
    ];
    useArxmlStore.setState({
      doc: emptyDoc,
      filePath: 'x.arxml',
      lastValidatedAt: Date.now(),
      validationErrors: errors,
    });

    render(<ValidationPanel />);
    fireEvent.click(screen.getByTestId('error-row-0'));
    // The element path itself — NOT a stripped parent.
    expect(useArxmlStore.getState().selectedPath).toBe('/EcucDefs/EcuC/EcucPduCollection');
  });

  it('clicking a ref-dest row selects the element path (paramKey is undefined)', () => {
    const errors: ValidationError[] = [
      {
        kind: 'ref-dest',
        path: '/Com/Com/ComConfig/PduGroup_0',
        message:
          'Reference DEST "ECUC-CONTAINER-VALUE" expects container|module, but target is a reference',
        expected: 'ECUC-CONTAINER-VALUE',
        actual: 'reference',
      },
    ];
    useArxmlStore.setState({
      doc: emptyDoc,
      filePath: 'x.arxml',
      lastValidatedAt: Date.now(),
      validationErrors: errors,
    });

    render(<ValidationPanel />);
    fireEvent.click(screen.getByTestId('error-row-0'));
    expect(useArxmlStore.getState().selectedPath).toBe('/Com/Com/ComConfig/PduGroup_0');
  });

  it('clicking a ref-cycle row selects the element path (paramKey is undefined)', () => {
    const errors: ValidationError[] = [
      {
        kind: 'ref-cycle',
        path: '/PduR/PduR/PduRRoutingPaths/PduRRoutingPath_0',
        message:
          'Cyclic reference: 3 edges /PduR/PduR/.../PduRRoutingPath_0 -> /PduR/.../DestPduRef -> /PduR/.../PduRRoutingPath_0',
      },
    ];
    useArxmlStore.setState({
      doc: emptyDoc,
      filePath: 'x.arxml',
      lastValidatedAt: Date.now(),
      validationErrors: errors,
    });

    render(<ValidationPanel />);
    fireEvent.click(screen.getByTestId('error-row-0'));
    expect(useArxmlStore.getState().selectedPath).toBe(
      '/PduR/PduR/PduRRoutingPaths/PduRRoutingPath_0',
    );
  });

  it('clicking a cross-ref row selects the element path (paramKey is undefined)', () => {
    const errors: ValidationError[] = [
      {
        kind: 'cross-ref',
        path: '/Com/Com/PduGroup/PduIdRef',
        message: 'Reference target /EcuC/EcuC/ComM/ComMPduGroup_0 not found',
        expected: 'exists in project',
        actual: 'missing',
      },
    ];
    useArxmlStore.setState({
      doc: emptyDoc,
      filePath: 'x.arxml',
      lastValidatedAt: Date.now(),
      validationErrors: errors,
    });

    render(<ValidationPanel />);
    fireEvent.click(screen.getByTestId('error-row-0'));
    expect(useArxmlStore.getState().selectedPath).toBe('/Com/Com/PduGroup/PduIdRef');
  });

  // S6-T2: ValidationPanel must surface the new 'cross-ref' kind
  // (cross-container reference target existence) alongside the existing
  // kinds, with the same group-by-kind logic and teal `.kind-cross-ref`
  // CSS class for visual distinction from per-doc `.kind-reference`.

  it('renders cross-ref kind with teal kind-cross-ref class', () => {
    const errors: ValidationError[] = [
      {
        kind: 'cross-ref',
        path: '/Com/Com/PduGroup/PduIdRef',
        message: 'Reference target /EcuC/EcuC/ComM/ComMPduGroup_0 not found',
        expected: 'exists in project',
        actual: 'missing',
      },
    ];
    useArxmlStore.setState({
      doc: emptyDoc,
      filePath: 'x.arxml',
      lastValidatedAt: Date.now(),
      validationErrors: errors,
    });

    const { container } = render(<ValidationPanel />);

    // The kind badge text comes from the dynamic group-by-kind map
    // (Object.entries(grouped).map(...)). The 'cross-ref' kind
    // should appear as a section label just like range/enum/etc.
    expect(screen.getByText(/^cross-ref$/i)).toBeInTheDocument();
    // And the kind badge carries the CSS class consumed by .kind-cross-ref
    // (background #14b8a6 teal, white text).
    expect(container.querySelector('.kind-cross-ref')).not.toBeNull();
    // And the count badge reads the same
    expect(screen.getByText(/1 violation$/i)).toBeInTheDocument();
  });
});
