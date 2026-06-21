// @vitest-environment jsdom
//
// Sprint A X2 — P0-3 wiring: `<LeftPanel />` forwards the optional
// `onContextMenu` prop down to its inner `<Tree />`. The host
// (App.tsx) wires this to `openContextMenu()`, so a right-click on a
// Tree node opens the mutation menu.
//
// Pins (3):
//   1. When `onContextMenu` is NOT passed (back-compat path), the
//      Tree still renders — its onContextMenu is just undefined.
//   2. When `onContextMenu` IS passed, a right-click on a treeitem
//      invokes the handler with (path, kind).
//   3. When the prop is omitted, the existing LeftPanel test suite
//      keeps passing (asserted by the smoke render).

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArxmlDocument } from '@core/arxml/types.js';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { LeftPanel } from '../LeftPanel.js';

// Minimal ARXML fixture so the Tree actually renders treeitems we
// can right-click on. We can't import parseArxml directly without
// pulling a bunch of fixtures into this isolated test file.
// Instead, build the ArxmlDocument inline — same shape used in
// LeftPanel.test.tsx upstream of the actual parser.
function makeDoc(): ArxmlDocument {
  return {
    path: '/tmp/Adc.arxml',
    version: '4.6',
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
            children: [
              {
                kind: 'container',
                tagName: 'ECUC-CONTAINER-VALUE',
                shortName: 'AdcConfig',
                params: {},
                children: [],
              },
            ],
            references: [],
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  useArxmlStore.setState({
    leftTab: 'files',
    project: null,
    projectPath: null,
    validationErrors: [],
    lastValidatedAt: null,
    documentPaths: ['/tmp/Adc.arxml'],
    bswmdPaths: [],
    documents: [makeDoc()],
    activeDocumentPath: '/tmp/Adc.arxml',
    doc: makeDoc(),
    displayDoc: makeDoc(),
    filePath: '/tmp/Adc.arxml',
    selectedPath: null,
  });
});

afterEach(() => {
  cleanup();
  useArxmlStore.getState().clear();
});

describe('LeftPanel (Sprint A X2 — onContextMenu forwarding)', () => {
  it('renders without onContextMenu (back-compat path)', () => {
    // Renders without throwing — proves the prop is truly optional
    // and the existing call sites keep working.
    render(<LeftPanel />);
    expect(screen.getByTestId('left-tab-files')).toBeInTheDocument();
  });

  it('accepts onContextMenu as an optional prop without crashing', () => {
    const onCtx = vi.fn();
    render(<LeftPanel onContextMenu={onCtx} />);
    expect(screen.getByTestId('left-tab-files')).toBeInTheDocument();
  });

  it('forwards onContextMenu to the inner Tree — right-click on a treeitem invokes the handler', () => {
    const onCtx = vi.fn();
    render(<LeftPanel onContextMenu={onCtx} />);

    // The Tree starts with an empty expansion set so only the
    // top-level package renders. Right-click on the package
    // (`/EAS`) — that's a treeitem we can dispatch the event on
    // without first expanding the tree. The TreeNode's onContextMenu
    // fires its parent's onContextMenu prop with (path, kind).
    const pkg = screen.getByTestId('treeitem-/EAS');
    expect(pkg).toBeInTheDocument();

    fireEvent.contextMenu(pkg, { clientX: 100, clientY: 100 });

    // The package's `kind` is undefined → TreeNode falls back to
    // 'container' (see TreeNode.tsx onContextMenu handler). We're
    // pinning that LeftPanel forwards the prop and that the
    // identity is preserved end-to-end. The 3rd arg is the
    // React MouseEvent — passed through verbatim from TreeNode.
    expect(onCtx).toHaveBeenCalledTimes(1);
    expect(onCtx.mock.calls[0]?.[0]).toBe('/EAS');
    expect(onCtx.mock.calls[0]?.[1]).toBe('container');
    expect(onCtx.mock.calls[0]?.[2]).toBeDefined();
  });
});
