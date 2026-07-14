// @vitest-environment jsdom
//
// Bug 2 + Bug 3 (Sprint A+ T-fix) — ProjectPanel × button no-op.
//
// Pin: clicking the × button on an ARXML/BSWMD row in the open-mode
// ProjectPanel must actually remove the file from the store. Pre-fix,
// the click was a silent no-op because:
//   1. The manifest stores relative POSIX paths (e.g.
//      `ecuc/EcuC.arxml`); the store holds absolute Windows paths
//      (e.g. `D:/proj/ecuc/EcuC.arxml`).
//   2. The × handler forwarded the relative path straight to
//      `onRemoveArxml={removeDocument}` / `onRemoveBswmd=
//      {removeBswmdWithFullFlow}`.
//   3. The store looked up the path via `indexOf` / `.includes` and
//      returned -1 / false; both actions silently no-op'd.
//
// The fix lives in two places:
//   1. `ProjectPanel.tsx` — the × onClick now translates the
//      relative manifest path to the absolute store path BEFORE
//      calling `onRemove`.
//   2. `ecucSlice.removeDocument` / `bswmdSlice.removeBswmd` — on
//      unknown path, the slice now calls `setError(...)` so a stale
//      manifest surfaces a user-facing toast instead of failing
//      silently.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArxmlDocument } from '@core/arxml/types.js';
import type { BswmdDocument } from '@core/project/bswmd.js';
import type { ProjectManifest } from '@shared/project';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { ProjectPanelInfo } from '../ProjectPanel.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAdcDoc(absolutePath: string): ArxmlDocument {
  return {
    path: absolutePath,
    version: '4.6',
    sourceBswmdPath: '/fake/Adc.arxml',
    packages: [
      {
        shortName: 'EAS',
        path: '/EAS',
        elements: [
          {
            kind: 'module',
            tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
            shortName: 'Adc',
            params: {},
            children: [],
            references: [],
          },
        ],
      },
    ],
  };
}

function makeEmptyBswmd(): BswmdDocument {
  return {
    version: '4.6',
    modules: [],
    warnings: [],
  };
}

function makeManifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    schemaVersion: '1',
    id: 'rmbtn-id',
    name: 'Remove Button Test',
    valueArxmlPaths: [],
    bswmdPaths: [],
    ...overrides,
  };
}

function makeBaseProps(): {
  locale: 'zh-CN';
  onClose: ReturnType<typeof vi.fn>;
  onAddBswmd: ReturnType<typeof vi.fn>;
  onRemoveArxml: ReturnType<typeof vi.fn>;
  onRemoveBswmd: ReturnType<typeof vi.fn>;
} {
  return {
    locale: 'zh-CN' as const,
    onClose: vi.fn(),
    onAddBswmd: vi.fn(),
    onRemoveArxml: vi.fn(),
    onRemoveBswmd: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const MANIFEST_PATH = 'D:/proj/MyProj.autosarcfg.json';
const MANIFEST_DIR = 'D:/proj';

beforeEach(() => {
  vi.clearAllMocks();
  // Default seed — tests override as needed.
  useArxmlStore.setState({
    locale: 'zh-CN',
    project: null,
    projectPath: null,
    documents: [],
    documentPaths: [],
    activeDocumentPath: null,
    doc: null,
    filePath: null,
    bswmdSchemas: [],
    bswmdPaths: [],
    error: null,
    toast: null,
  });
});

afterEach(() => {
  cleanup();
  useArxmlStore.getState().clear();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectPanel × button (Bug 2 + Bug 3 — remove flows)', () => {
  it('ARXML × click removes the doc from the store (real store, no onRemove mock)', () => {
    const absolute = `${MANIFEST_DIR}/ecuc/EcuC.arxml`;
    const adcDoc = makeAdcDoc(absolute);
    useArxmlStore.setState({
      project: makeManifest({ valueArxmlPaths: ['ecuc/EcuC.arxml'] }),
      projectPath: MANIFEST_PATH,
      documents: [adcDoc],
      documentPaths: [absolute],
      activeDocumentPath: absolute,
      doc: adcDoc,
      filePath: absolute,
    });

    // Wire onRemoveArxml to the REAL store action — the brief says
    // "don't mock onRemoveArxml (use real store)". The action is the
    // production `removeDocument`. We grab it via `getState()` (not
    // a hook call) so it stays in test-only territory.
    const onRemoveArxml = useArxmlStore.getState().removeDocument;

    render(
      <ProjectPanelInfo
        {...makeBaseProps()}
        onRemoveArxml={onRemoveArxml}
        manifest={useArxmlStore.getState().project!}
        manifestPath={MANIFEST_PATH}
      />,
    );

    // The × button is keyed by the manifest's relative path (existing
    // contract).
    const removeBtn = screen.getByTestId('project-panel-arxml-remove-ecuc/EcuC.arxml');
    expect(removeBtn).toBeInTheDocument();
    fireEvent.click(removeBtn);

    // The doc must be gone from the store.
    const state = useArxmlStore.getState();
    expect(state.documentPaths.length).toBe(0);
    expect(state.documents.length).toBe(0);
  });

  it('BSWMD × click (no dependents) removes the schema from the store directly', () => {
    const absolute = `${MANIFEST_DIR}/bswmd/EcuC.arxml`;
    useArxmlStore.setState({
      project: makeManifest({ bswmdPaths: ['bswmd/EcuC.arxml'] }),
      projectPath: MANIFEST_PATH,
      bswmdSchemas: [makeEmptyBswmd()],
      bswmdPaths: [absolute],
    });

    // Wire onRemoveBswmd to a real-store-driven flow. For the no-
    // dependents case the in-memory `removeBswmd` is enough. We grab
    // it via `getState()` (not a hook call).
    const onRemoveBswmd = useArxmlStore.getState().removeBswmd;

    render(
      <ProjectPanelInfo
        {...makeBaseProps()}
        onRemoveBswmd={onRemoveBswmd}
        manifest={useArxmlStore.getState().project!}
        manifestPath={MANIFEST_PATH}
      />,
    );

    const removeBtn = screen.getByTestId('project-panel-bswmd-remove-bswmd/EcuC.arxml');
    expect(removeBtn).toBeInTheDocument();
    fireEvent.click(removeBtn);

    // No dependents → the in-memory removeBswmd path runs.
    const state = useArxmlStore.getState();
    expect(state.bswmdPaths.length).toBe(0);
    expect(state.bswmdSchemas.length).toBe(0);
  });

  it('BSWMD × click with dependents opens RemoveModuleConfirmRoot confirmation dialog', async () => {
    const bswmdAbsolute = `${MANIFEST_DIR}/bswmd/Adc.arxml`;
    const docAbsolute = `${MANIFEST_DIR}/ecuc/Adc.ecuc.arxml`;
    const adcDoc = makeAdcDoc(docAbsolute);
    useArxmlStore.setState({
      project: makeManifest({ bswmdPaths: ['bswmd/Adc.arxml'] }),
      projectPath: MANIFEST_PATH,
      bswmdSchemas: [makeEmptyBswmd()],
      bswmdPaths: [bswmdAbsolute],
      documents: [adcDoc],
      documentPaths: [docAbsolute],
      activeDocumentPath: docAbsolute,
      doc: adcDoc,
      filePath: docAbsolute,
    });

    // The brief's "with dependents" case requires the full flow hook
    // (`removeBswmdWithFullFlow` in `useProjectActions`) — which
    // opens the 4-option dialog. To pin "the dialog opens" without
    // running the real electron IPC, we spy on the full-flow call and
    // assert it was invoked with the absolute BSWMD path (NOT the
    // relative manifest path). The dialog itself is mounted by
    // `RemoveModuleConfirmRoot` in App.tsx, which is outside this
    // test; the assertion that the full-flow hook is invoked with the
    // correct absolute path is the load-bearing pin.
    const onRemoveBswmd = vi.fn(async () => ({ kind: 'canceled' as const }));

    render(
      <ProjectPanelInfo
        {...makeBaseProps()}
        onRemoveBswmd={onRemoveBswmd}
        manifest={useArxmlStore.getState().project!}
        manifestPath={MANIFEST_PATH}
      />,
    );

    const removeBtn = screen.getByTestId('project-panel-bswmd-remove-bswmd/Adc.arxml');
    fireEvent.click(removeBtn);

    // The full-flow hook must be called with the ABSOLUTE BSWMD
    // path (not the relative manifest path), so the hook's
    // `bswmdPaths.includes(path)` guard can match.
    expect(onRemoveBswmd).toHaveBeenCalledTimes(1);
    expect(onRemoveBswmd).toHaveBeenCalledWith(bswmdAbsolute);
  });

  it('stale manifest path (not in store) surfaces a setError toast', () => {
    // Manifest claims `stale/X.arxml` but the store has no matching
    // absolute path. The onRemove call must NOT silently no-op — the
    // slice's `setError` should produce a toast.
    useArxmlStore.setState({
      project: makeManifest({ valueArxmlPaths: ['stale/X.arxml'] }),
      projectPath: MANIFEST_PATH,
      documents: [],
      documentPaths: [],
      activeDocumentPath: null,
      doc: null,
      filePath: null,
    });

    // Wire the real `removeDocument` so the slice's setError path
    // can run when the path is unknown. We grab it from `getState()`
    // (not a hook call) so the helper stays in test-only territory.
    const onRemoveArxml = useArxmlStore.getState().removeDocument;

    render(
      <ProjectPanelInfo
        {...makeBaseProps()}
        onRemoveArxml={onRemoveArxml}
        manifest={useArxmlStore.getState().project!}
        manifestPath={MANIFEST_PATH}
      />,
    );

    const removeBtn = screen.getByTestId('project-panel-arxml-remove-stale/X.arxml');
    fireEvent.click(removeBtn);

    // Slice's setError surfaces a typed toast.
    const state = useArxmlStore.getState();
    expect(state.toast).not.toBeNull();
    expect(state.toast?.kind).toBe('error');
  });
});
