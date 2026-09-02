// OdxImportWizard — focused interaction tests for preview decisions.
// The preview object is injected so these tests do not need the real
// ODX parser/IPC pipeline.

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OdxImportWizard } from '../OdxImportWizard';
import type { OdxImportPreview } from '../../../../shared/types';

const basePreview: OdxImportPreview = {
  variants: [{ kind: 'BASE-VARIANT', odxId: 'base', shortName: 'Demo' }],
  selectedVariant: { kind: 'BASE-VARIANT', odxId: 'base', shortName: 'Demo' },
  rows: [
    {
      path: '/Dcm/DcmConfigSet',
      module: 'Dcm',
      shortName: 'DcmConfigSet',
      category: 'added',
      defaultDecision: 'import',
    },
    {
      path: '/Dem/DemConfigSet',
      module: 'Dem',
      shortName: 'DemConfigSet',
      category: 'conflict',
      defaultDecision: 'keep-local',
      conflictDetail: { localHash: 'local', incomingHash: 'incoming' },
    },
  ],
  warnings: [],
  previewHash: 'a'.repeat(64),
  stats: { services: 0, dids: 0, dtcs: 0, sessions: 0, securityLevels: 0 },
  targetModules: {
    dcm: { exists: false, dirty: false },
    dem: { exists: false, dirty: false },
  },
};

describe('OdxImportWizard', () => {
  beforeEach(() => {
    (window as unknown as { autosarApi?: unknown }).autosarApi = {
      importOdxPreview: vi.fn(),
      importOdxCommit: vi.fn().mockResolvedValue({
        ok: true,
        value: { applied: 1, kept: 0, deleted: 0, manifestPath: '/tmp/manifest.json' },
      }),
      projectReload: vi.fn().mockResolvedValue({ kind: 'read-failed', message: 'not used' }),
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows multiple variants before selecting one', () => {
    render(
      <OdxImportWizard
        onClose={vi.fn()}
        locale="zh-CN"
        projectManifestPath="/tmp/project.json"
        dirtyDocPaths={[]}
        initialPreview={{ ...basePreview, selectedVariant: undefined }}
      />,
    );
    expect(screen.getByTestId('odx-import-step-variant')).toBeInTheDocument();
    expect(screen.getByTestId('odx-import-step-variant').textContent).toContain('变体');
  });

  it('requires explicit confirmation before importing a conflict', () => {
    render(
      <OdxImportWizard
        onClose={vi.fn()}
        locale="zh-CN"
        projectManifestPath="/tmp/project.json"
        dirtyDocPaths={[]}
        initialOdxPath="/tmp/input.odx-d"
        initialPreview={basePreview}
      />,
    );
    expect(screen.getByTestId('odx-import-row-conflict')).toBeInTheDocument();
    expect(screen.getByTestId('odx-import-step-preview').textContent).toContain('保留本地');

    const conflictRow = screen.getByTestId('odx-import-row-conflict');
    fireEvent.change(conflictRow.querySelector('select') as HTMLSelectElement, {
      target: { value: 'import' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认采用 ODX' }));
    expect(screen.getByRole('button', { name: '导入' })).toBeEnabled();
  });
});

it('displays variant short names instead of raw ODX IDs', () => {
  render(
    <OdxImportWizard
      onClose={vi.fn()}
      locale="zh-CN"
      projectManifestPath="/tmp/project.json"
      dirtyDocPaths={[]}
      initialPreview={{ ...basePreview, selectedVariant: undefined }}
    />,
  );
  expect(screen.getByRole('option', { name: 'BASE-VARIANT Demo' })).toBeInTheDocument();
});

it('blocks close actions while commit is in flight', async () => {
  const onClose = vi.fn();
  (window as unknown as { autosarApi?: unknown }).autosarApi = {
    importOdxPreview: vi.fn(),
    importOdxCommit: vi.fn().mockImplementation(() => new Promise(() => {})),
    projectReload: vi.fn(),
  };
  render(
    <OdxImportWizard
      onClose={onClose}
      locale="zh-CN"
      projectManifestPath="/tmp/project.json"
      dirtyDocPaths={[]}
      initialOdxPath="/tmp/input.odx-d"
      initialPreview={basePreview}
    />,
  );
  const conflictRow = screen.getByTestId('odx-import-row-conflict');
  fireEvent.change(conflictRow.querySelector('select') as HTMLSelectElement, {
    target: { value: 'import' },
  });
  fireEvent.click(screen.getByRole('button', { name: '确认采用 ODX' }));
  fireEvent.click(screen.getByRole('button', { name: '导入' }));

  fireEvent.keyDown(window, { key: 'Escape' });
  fireEvent.click(screen.getByTestId('odx-import-close'));

  expect(screen.getByTestId('odx-import-wizard')).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
});

it('groups warnings by localized warning code', () => {
  render(
    <OdxImportWizard
      onClose={vi.fn()}
      locale="zh-CN"
      projectManifestPath="/tmp/project.json"
      dirtyDocPaths={[]}
      initialOdxPath="/tmp/input.odx-d"
      initialPreview={{
        ...basePreview,
        warnings: [
          { code: 'odx-unsupported-compu', elementRef: '/a', message: 'A' },
          { code: 'odx-unsupported-compu', elementRef: '/b', message: 'B' },
          { code: 'odx-unsupported-datatype', elementRef: '/c', message: 'C' },
        ],
      }}
    />,
  );

  const compu = screen.getByTestId('odx-import-warning-group-odx-unsupported-compu');
  const datatype = screen.getByTestId('odx-import-warning-group-odx-unsupported-datatype');
  expect(compu.textContent).toContain('不支持的 CompuMethod');
  expect(compu.textContent).toContain('2');
  expect(datatype.textContent).toContain('不支持的数据类型');
  expect(datatype.textContent).toContain('1');
  expect(screen.getByText('A')).toBeInTheDocument();
  expect(screen.getByText('B')).toBeInTheDocument();
  expect(screen.getByText('C')).toBeInTheDocument();
});

it('reports wizard busy state to the host', async () => {
  (window as unknown as { autosarApi?: unknown }).autosarApi = {
    importOdxPreview: vi.fn(),
    importOdxCommit: vi.fn().mockImplementation(() => new Promise(() => {})),
    projectReload: vi.fn(),
  };
  const onBusyChange = vi.fn();
  render(
    <OdxImportWizard
      onClose={vi.fn()}
      locale="zh-CN"
      projectManifestPath="/tmp/project.json"
      dirtyDocPaths={[]}
      initialOdxPath="/tmp/input.odx-d"
      initialPreview={basePreview}
      onBusyChange={onBusyChange}
    />,
  );

  const conflictRow = screen.getByTestId('odx-import-row-conflict');
  fireEvent.change(conflictRow.querySelector('select') as HTMLSelectElement, {
    target: { value: 'import' },
  });
  fireEvent.click(screen.getByRole('button', { name: '确认采用 ODX' }));
  onBusyChange.mockClear();
  fireEvent.click(screen.getByRole('button', { name: '导入' }));

  await waitFor(() => expect(onBusyChange).toHaveBeenCalledWith(true));
});
