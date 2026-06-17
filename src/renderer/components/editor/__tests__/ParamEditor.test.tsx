// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlPackage } from '@core/arxml/types';

import { useArxmlStore } from '../../../store/useArxmlStore';
import { ParamEditor } from '../ParamEditor';

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

  // Sprint 13+ Stage 4 M6 — column header i18n.
  it('renders column headers in English when locale is en', () => {
    const doc = makeDoc();
    useArxmlStore.getState().setDoc(doc, '/EAS');
    useArxmlStore.getState().select('/EAS/EcuCGeneral');
    useArxmlStore.setState({ locale: 'en' });

    render(<ParamEditor />);

    expect(screen.getByRole('columnheader', { name: 'Param' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Type' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Value' })).toBeInTheDocument();
  });

  it('renders column headers in Chinese when locale is zh-CN', () => {
    const doc = makeDoc();
    useArxmlStore.getState().setDoc(doc, '/EAS');
    useArxmlStore.getState().select('/EAS/EcuCGeneral');
    useArxmlStore.setState({ locale: 'zh-CN' });

    render(<ParamEditor />);

    expect(screen.getByRole('columnheader', { name: '参数' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '类型' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '取值' })).toBeInTheDocument();
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
});
