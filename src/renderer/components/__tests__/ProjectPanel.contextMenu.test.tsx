// @vitest-environment jsdom
//
// Sprint 17 P3 T3.1 — ProjectPanel `<li>` onContextMenu wiring.
//
// Pin: when the user right-clicks a BSWMD row in the ProjectPanel
// `<FileList>`, the renderer must call `openContextMenu` with
// `{ path, kind: 'bswmd', shortName: basename(path) }` so the
// global ContextMenu opens with the "Remove module" item visible.
//
// We mock the `openContextMenu` module so the test pins the exact
// payload the FileList `<li>` produces, without mounting the full
// ContextMenuRoot host. The actual context-menu item rendering
// is covered separately in `ContextMenu.removeModule.test.tsx`.

import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectManifest } from '@shared/project';

import * as contextMenuModule from '../ContextMenu';
import { ProjectPanelInfo } from '../ProjectPanel';

// Mock the `openContextMenu` module-level API so the test can
// assert the exact payload the FileList `<li>` produces without
// mounting a real ContextMenuRoot host. The mock keeps the rest
// of the ContextMenu module intact (so any internal helpers the
// component pulls in still work).
vi.mock('../ContextMenu', async () => {
  const actual = await vi.importActual<typeof contextMenuModule>('../ContextMenu');
  return {
    ...actual,
    openContextMenu: vi.fn(),
  };
});

const MANIFEST_PATH = 'C:/projects/demo.autosarcfg.json';

function makeManifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    schemaVersion: '1',
    id: 'demo-id',
    name: 'Demo Project',
    valueArxmlPaths: [],
    bswmdPaths: [],
    ...overrides,
  };
}

const baseProps = {
  locale: 'zh-CN' as const,
  manifestPath: MANIFEST_PATH,
  onClose: vi.fn(),
  onRemoveArxml: vi.fn(),
  onAddBswmd: vi.fn(),
  onRemoveBswmd: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ProjectPanelInfo (Sprint 17 P3 T3.1 — BSWMD row onContextMenu)', () => {
  it('right-clicking a BSWMD row opens the context menu with kind:bswmd and basename shortName', () => {
    const manifest = makeManifest({
      bswmdPaths: ['/p/EcucDefs/EcuC.arxml'],
    });
    const { getByTestId } = render(
      <ProjectPanelInfo {...baseProps} manifest={manifest} />,
    );
    // The FileList renders each row with a data-testid like
    // `project-panel-bswmd-list-item-<path>` when no remove button
    // is wired — but with remove (default for our test), the test
    // id for the remove button is
    // `project-panel-bswmd-remove-<path>`. We right-click the
    // `<li>` (the parent of the remove button) using its rendered
    // role+name. The FileList puts a class `project-panel-list-item`
    // on each `<li>`; we pick the one whose remove button matches.
    const removeBtn = getByTestId('project-panel-bswmd-remove-/p/EcucDefs/EcuC.arxml');
    const li = removeBtn.parentElement as HTMLElement | null;
    expect(li).not.toBeNull();
    if (li === null) throw new Error('li not found');

    fireEvent.contextMenu(li, { clientX: 100, clientY: 200 });

    expect(contextMenuModule.openContextMenu).toHaveBeenCalledTimes(1);
    expect(contextMenuModule.openContextMenu).toHaveBeenCalledWith(
      {
        path: '/p/EcucDefs/EcuC.arxml',
        kind: 'bswmd',
        shortName: 'EcuC.arxml',
      },
      100,
      200,
    );
  });

  it('does NOT open the context menu for ARXML rows (P3 only wires BSWMD rows)', () => {
    const manifest = makeManifest({
      valueArxmlPaths: ['/p/EcuC.arxml'],
    });
    const { getByTestId } = render(
      <ProjectPanelInfo {...baseProps} manifest={manifest} />,
    );
    const removeBtn = getByTestId('project-panel-arxml-remove-/p/EcuC.arxml');
    const li = removeBtn.parentElement as HTMLElement | null;
    expect(li).not.toBeNull();
    if (li === null) throw new Error('li not found');

    fireEvent.contextMenu(li, { clientX: 50, clientY: 50 });

    // ARXML rows don't wire context menu — P3 only enables BSWMD
    // removal from the right-click. The BSWMD-spec mutation
    // (add/delete container/reference) is the existing Tree flow.
    expect(contextMenuModule.openContextMenu).not.toHaveBeenCalled();
  });
});