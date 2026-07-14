// @vitest-environment jsdom
//
// Bug 1 (Sprint A+ T-fix) — Tree module-kind right-click + multi-doc.
//
// Pin: when the user right-clicks a `kind:'module'` treeitem whose
// owning document's `sourceBswmdPath` differs from the active
// document's `sourceBswmdPath`, the ContextMenu must be opened with
// the row's owning document's BSWMD path — NOT the active document's.
//
// Pre-fix bug: TreeNode read `useArxmlStore.getState().doc ??
// state.displayDoc` (active doc) instead of resolving the row's
// owning doc from the combined tree path via `findByPathMultiDoc`.
// In a multi-doc session with active=JWQ3399, right-clicking the Adc
// row would open the ContextMenu against JWQ3399's sourceBswmdPath.
//
// Three scenarios covered:
//   1. active=JWQ3399, right-click Adc row → Adc's sourceBswmdPath
//   2. active=Adc, right-click JWQ3399 row → JWQ3399's sourceBswmdPath
//   3. row's owning doc has no sourceBswmdPath → host forwarding only
//      (no `openContextMenu` call)

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArxmlDocument, ArxmlPackage } from '@core/arxml/types.js';

import { useArxmlStore } from '../../../store/useArxmlStore.js';
import * as contextMenuModule from '../../ContextMenu.js';
import { Tree } from '../Tree.js';
import type { ArxmlStoreApi } from '../Tree.js';

// Mock the `openContextMenu` module-level API so the test can
// assert the exact payload without mounting ContextMenuRoot.
vi.mock('../../ContextMenu', async () => {
  const actual = await vi.importActual<typeof contextMenuModule>('../../ContextMenu');
  return {
    ...actual,
    openContextMenu: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeAdcDoc(): ArxmlDocument {
  return {
    path: '/fake/Adc.ecuc.arxml',
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

function makeJwqDoc(): ArxmlDocument {
  return {
    path: '/fake/JWQ3399.ecuc.arxml',
    version: '4.6',
    sourceBswmdPath: '/fake/JWQ3399.arxml',
    packages: [
      {
        shortName: 'Base',
        path: '/Base',
        elements: [
          {
            kind: 'module',
            tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
            shortName: 'JWQ3399',
            params: {},
            children: [],
            references: [],
          },
        ],
      },
    ],
  };
}

/**
 * Legacy ECUC doc without a BSWMD provenance — used for the fallback
 * branch (host forwarding, no `openContextMenu` call).
 */
function makeLegacyDoc(): ArxmlDocument {
  return {
    path: '/fake/Legacy.ecuc.arxml',
    version: '4.6',
    // No sourceBswmdPath → host should be invoked instead.
    packages: [
      {
        shortName: 'Pkg',
        path: '/Pkg',
        elements: [
          {
            kind: 'module',
            tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
            shortName: 'Legacy',
            params: {},
            children: [],
            references: [],
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Store fixtures
// ---------------------------------------------------------------------------

/**
 * Build a Tree-renderable store snapshot for a multi-doc session.
 * The `documents` and `documentPaths` arrays are paired by index;
 * the active document is whichever entry sits at `activeIndex`.
 *
 * The Tree component is fed via its `store` prop (ArxmlStoreApi),
 * not by reading `useArxmlStore` directly — so the caller also
 * passes a `displayDoc` value (the synthesised combined view) into
 * the mock store. We pin `viewMode` to `'combined'` on the real
 * store so TreeNode's `useArxmlStore.getState()` reads see the
 * multi-doc state.
 */
function buildMultiDocFixtures(
  docs: readonly ArxmlDocument[],
  activeIndex: number,
): {
  mockStore: ArxmlStoreApi;
  displayDoc: ArxmlDocument;
} {
  const documentPaths = docs.map((d) => d.path);
  const active = docs[activeIndex];
  if (active === undefined) throw new Error('buildMultiDocFixtures: activeIndex out of range');

  // Compute the combined displayDoc ourselves (a flat concat because
  // the docs in this test never collide on basenames or module
  // shortNames — see `detectCombinedCollision`).
  const displayDoc: ArxmlDocument = {
    path: '/combined',
    version: '4.6',
    packages: docs.flatMap<ArxmlPackage>((d) => d.packages),
  };

  // Seed the real store (TreeNode reads from this on right-click).
  useArxmlStore.setState({
    documents: docs,
    documentPaths,
    activeDocumentPath: active.path,
    doc: active,
    filePath: active.path,
    viewMode: 'combined',
    displayDoc,
  });

  // Build the Tree's mock store (the Tree component reads via this).
  const mockStore: ArxmlStoreApi = {
    getState: () => ({
      doc: active,
      displayDoc,
      filePath: active.path,
      selectedPath: null,
      dirtyPaths: new Set<string>(),
      activeDocumentPath: active.path,
      setDoc: vi.fn(),
      select: vi.fn(),
      updateParam: vi.fn(),
      expand: vi.fn(),
      collapse: vi.fn(),
      isExpanded: () => false,
      toggle: vi.fn(),
      locale: 'zh-CN' as const,
      isDirty: () => false,
      bswmdSchemas: [],
    }),
    subscribe: () => () => undefined,
  };
  return { mockStore, displayDoc };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  useArxmlStore.getState().clear();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Tree module-kind right-click (Bug 1 — multi-doc)', () => {
  it('right-clicking Adc row while active=JWQ3399 opens menu with Adc sourceBswmdPath', () => {
    const { mockStore } = buildMultiDocFixtures(
      [makeAdcDoc(), makeJwqDoc()],
      1 /* active = JWQ3399 */,
    );
    const onCtx = vi.fn();
    render(<Tree store={mockStore} onContextMenu={onCtx} />);

    // Expand Adc's `/EAS` package so the Adc module treeitem mounts.
    // (No basename collision between Adc.ecuc.arxml and JWQ3399.ecuc.arxml,
    // and no module shortName overlap → `buildCombinedDocument` runs in
    // flat-mode, no per-doc basename wrapper.)
    fireEvent.click(screen.getByTestId('chevron-/EAS'));
    const moduleItem = screen.getByTestId('treeitem-/EAS/Adc');
    expect(moduleItem).toBeInTheDocument();

    fireEvent.contextMenu(moduleItem, { clientX: 30, clientY: 40 });

    // The ContextMenu payload must carry Adc's sourceBswmdPath,
    // NOT the active doc's (JWQ3399). TreeNode uses
    // `findByPathMultiDoc` to resolve the row's owning document via
    // the combined tree path.
    expect(contextMenuModule.openContextMenu).toHaveBeenCalledTimes(1);
    expect(contextMenuModule.openContextMenu).toHaveBeenCalledWith(
      {
        path: '/fake/Adc.arxml',
        kind: 'bswmd',
        shortName: 'Adc.arxml',
        modulePath: '/EAS/Adc',
      },
      30,
      40,
    );
    expect(onCtx).not.toHaveBeenCalled();
  });

  it('right-clicking JWQ3399 row while active=Adc opens menu with JWQ3399 sourceBswmdPath', () => {
    const { mockStore } = buildMultiDocFixtures([makeAdcDoc(), makeJwqDoc()], 0 /* active = Adc */);
    const onCtx = vi.fn();
    render(<Tree store={mockStore} onContextMenu={onCtx} />);

    // Expand JWQ3399's `/Base` package so the JWQ3399 module mounts.
    fireEvent.click(screen.getByTestId('chevron-/Base'));
    const moduleItem = screen.getByTestId('treeitem-/Base/JWQ3399');
    expect(moduleItem).toBeInTheDocument();

    fireEvent.contextMenu(moduleItem, { clientX: 60, clientY: 70 });

    expect(contextMenuModule.openContextMenu).toHaveBeenCalledTimes(1);
    expect(contextMenuModule.openContextMenu).toHaveBeenCalledWith(
      {
        path: '/fake/JWQ3399.arxml',
        kind: 'bswmd',
        shortName: 'JWQ3399.arxml',
        modulePath: '/Base/JWQ3399',
      },
      60,
      70,
    );
    expect(onCtx).not.toHaveBeenCalled();
  });

  it('right-clicking module in doc WITHOUT sourceBswmdPath forwards to host onContextMenu only', () => {
    const { mockStore } = buildMultiDocFixtures([makeLegacyDoc()], 0);
    const onCtx = vi.fn();
    render(<Tree store={mockStore} onContextMenu={onCtx} />);

    fireEvent.click(screen.getByTestId('chevron-/Pkg'));
    const moduleItem = screen.getByTestId('treeitem-/Pkg/Legacy');
    expect(moduleItem).toBeInTheDocument();

    fireEvent.contextMenu(moduleItem, { clientX: 100, clientY: 200 });

    // Fallback: no BSWMD provenance → host receives the right-click,
    // openContextMenu is NOT called.
    expect(contextMenuModule.openContextMenu).not.toHaveBeenCalled();
    expect(onCtx).toHaveBeenCalledTimes(1);
    expect(onCtx).toHaveBeenCalledWith('/Pkg/Legacy', 'module', expect.anything());
  });
});
