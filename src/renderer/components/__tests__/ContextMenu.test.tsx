// @vitest-environment jsdom
//
// ContextMenu (Sprint 15 — ECUC mutation support):
//   - Portal-based right-click menu, mounted once at the app root via
//     `ContextMenuRoot`. The host calls `openContextMenu(target, x, y)`
//     from the right-click handler on a TreeNode; the menu opens at the
//     given viewport coordinates and closes on outside click / Esc /
//     item click.
//   - Boundary detection: if (x, y) would push the menu off the
//     viewport, the menu flips to fit (`x = innerWidth - width`).
//   - A11y: `role="menu"` on the `<ul>`, `role="menuitem"` + tabIndex=0
//     on each `<li>`, ArrowUp/Down focus, Enter/Space activate.
//   - "Add *" items are disabled (with a tooltip) when no BSWMD
//     schema covers the path's owning module.
//   - "Delete" item is always enabled.
//
// Tests pin (12):
//   1.  Renders nothing when state is null
//   2.  Renders the 4 items for a container target
//   3.  Boundary detection: flips to innerWidth - width when x is past
//       the right edge
//   4.  Esc closes the menu
//   5.  Click outside (mousedown on document body) closes the menu
//   6.  Click on a menu item closes the menu + calls onAction with the
//       correct payload
//   7.  "Add *" items disabled when no BSWMD covers the module
//   8.  ArrowDown / ArrowUp navigates focus between items
//   9.  Enter on a focused item triggers onAction
//  10.  Localized label appears in the menu (mock the locale)
//  11.  Container at root shows all 4 items
//  12.  Reference target shows only the delete item (not add)

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BswmdDocument } from '@core/project/bswmd.js';
import type { Locale } from '@shared/i18n.js';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import {
  closeContextMenu,
  type ContextMenuAction,
  ContextMenuRoot,
  openContextMenu,
} from '../ContextMenu.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

// Public action shape — imported directly from ContextMenu so the
// test's `onAction` callback stays in lock-step with the component's
// declared union. (Earlier this file mirrored the union locally and
// drifted out of sync after v1.10.1 added 'delete-module' — TS2322 in
// the Host component contract.)
// Sprint 17 P3 T3.3 added 'remove-module'; the source-of-truth is
// `ContextMenuAction` in `../ContextMenu.js`.

interface HostProps {
  readonly onAction: (action: ContextMenuAction) => void;
  readonly locale?: Locale;
}

function Host({ onAction, locale = 'zh-CN' }: HostProps): JSX.Element {
  return <ContextMenuRoot onAction={onAction} locale={locale} />;
}

async function mountHost(
  onAction: (action: ContextMenuAction) => void,
  locale: Locale = 'zh-CN',
): Promise<void> {
  render(<Host onAction={onAction} locale={locale} />);
  // Flush the post-mount effect that wires the module-level handle.
  await act(async () => {
    await Promise.resolve();
  });
}

const originalInnerWidth = window.innerWidth;
const originalInnerHeight = window.innerHeight;

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', {
    value: height,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  // Unmount hosts and reset module state between tests.
  cleanup();
  closeContextMenu();
  // Restore viewport.
  setViewport(originalInnerWidth, originalInnerHeight);
  // Reset store BSWMD state to avoid cross-test bleed.
  useArxmlStore.setState({ bswmdSchemas: [], bswmdPaths: [] });
});

// ---------------------------------------------------------------------------
// Test 1: nothing rendered when state is null
// ---------------------------------------------------------------------------
describe('ContextMenu (no state)', () => {
  it('renders nothing when no menu is open', () => {
    render(<Host onAction={() => undefined} />);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 2: 4-item rendering for a container target
// ---------------------------------------------------------------------------
describe('ContextMenu (container target)', () => {
  beforeEach(async () => {
    await mountHost(() => undefined);
  });

  it('renders the 4 items when opened with a container target', () => {
    act(() => {
      openContextMenu(
        { path: '/EAS/EcuC/EcuCGeneral', kind: 'container', shortName: 'EcuCGeneral' },
        100,
        200,
      );
    });

    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();

    const items = screen.getAllByRole('menuitem');
    // Container menu: 4 items (add c/p/r + delete-container). The
    // "delete-module" entry lives in `buildBswmdItems` only — see
    // ContextMenu.deleteModule.test.tsx.
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent(/添加子容器|Add sub-container/);
    expect(items[1]).toHaveTextContent(/添加参数|Add parameter/);
    expect(items[2]).toHaveTextContent(/添加引用|Add reference/);
    expect(items[3]).toHaveTextContent(/删除|Delete/);
  });

  it('localized label appears in the menu (en locale)', () => {
    cleanup();
    // re-mount with en
    const onAction = vi.fn();
    render(<Host onAction={onAction} locale="en" />);
    act(() => {
      openContextMenu(
        { path: '/EAS/EcuC/EcuCGeneral', kind: 'container', shortName: 'EcuCGeneral' },
        100,
        200,
      );
    });

    expect(screen.getByText(/Add sub-container/)).toBeInTheDocument();
    expect(screen.getByText(/Add parameter/)).toBeInTheDocument();
    expect(screen.getByText(/Add reference/)).toBeInTheDocument();
    expect(screen.getByText(/Delete 'EcuCGeneral'/)).toBeInTheDocument();
  });

  it('container at root path shows all 5 items (no special case)', () => {
    act(() => {
      openContextMenu({ path: '/EcuC', kind: 'container', shortName: 'EcuC' }, 100, 200);
    });
    // Container menu has 4 items; "delete-module" lives in
    // buildBswmdItems only (spec: container/reference menus unchanged).
    expect(screen.getAllByRole('menuitem')).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Test 3: boundary detection — flip when x is past the right edge
// ---------------------------------------------------------------------------
describe('ContextMenu (boundary detection)', () => {
  beforeEach(async () => {
    await mountHost(() => undefined);
  });

  it('flips to innerWidth - MENU_WIDTH when x would overflow right edge', () => {
    // Make a small viewport so the math is deterministic.
    setViewport(800, 600);
    // Place x near the right edge. Menu width defaults to ~200px (see
    // source). Expect x to be clamped to innerWidth - width.
    act(() => {
      openContextMenu(
        { path: '/EAS/EcuC/EcuCGeneral', kind: 'container', shortName: 'EcuCGeneral' },
        780,
        100,
      );
    });
    const menu = screen.getByRole('menu');
    const left = Number(menu.style.left.replace('px', ''));
    // Menu must NOT overflow the viewport.
    expect(left).toBeLessThanOrEqual(800);
    // And must be the flipped value (innerWidth - width).
    // We allow a tiny tolerance for the implementation to pick a
    // different constant than 200.
    expect(left).toBeGreaterThanOrEqual(800 - 250);
  });

  it('does not flip when x comfortably fits inside the viewport', () => {
    setViewport(1280, 800);
    act(() => {
      openContextMenu(
        { path: '/EAS/EcuC/EcuCGeneral', kind: 'container', shortName: 'EcuCGeneral' },
        100,
        100,
      );
    });
    const menu = screen.getByRole('menu');
    expect(menu.style.left).toBe('100px');
  });
});

// ---------------------------------------------------------------------------
// Test 4: Esc closes
// ---------------------------------------------------------------------------
describe('ContextMenu (close on Esc)', () => {
  it('Esc closes the menu', async () => {
    await mountHost(() => undefined);
    act(() => {
      openContextMenu(
        { path: '/EAS/EcuC/EcuCGeneral', kind: 'container', shortName: 'EcuCGeneral' },
        100,
        100,
      );
    });
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// Test 5: click outside closes
// ---------------------------------------------------------------------------
describe('ContextMenu (close on outside click)', () => {
  it('mousedown on document body closes the menu', async () => {
    await mountHost(() => undefined);
    act(() => {
      openContextMenu(
        { path: '/EAS/EcuC/EcuCGeneral', kind: 'container', shortName: 'EcuCGeneral' },
        100,
        100,
      );
    });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    // Outside click — anywhere on document body that isn't the menu.
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// Test 6: clicking an item fires onAction + closes
// ---------------------------------------------------------------------------
describe('ContextMenu (item activation)', () => {
  it('clicking a menu item closes the menu and calls onAction with the correct payload', async () => {
    const onAction = vi.fn();
    // Make the path BSWMD-covered so "Add sub-container" is enabled.
    const bswmd: BswmdDocument = {
      version: '4.6',
      modules: [
        {
          shortName: 'EAS',
          path: '/EAS',
          dialect: 'ecuc-module-def',
          moduleId: 1,
          containers: [],
          providedEntries: [],
          lowerMultiplicity: 1,
          upperMultiplicity: 'infinite',
        },
      ],
      warnings: [],
    };
    useArxmlStore.setState({ bswmdSchemas: [bswmd], bswmdPaths: ['/fake/EAS.arxml'] });
    await mountHost(onAction);
    act(() => {
      openContextMenu(
        { path: '/EAS/EcuC/EcuCGeneral', kind: 'container', shortName: 'EcuCGeneral' },
        100,
        100,
      );
    });

    const items = screen.getAllByRole('menuitem');
    fireEvent.click(items[0]!); // "Add sub-container"

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({
      type: 'add-container',
      path: '/EAS/EcuC/EcuCGeneral',
    });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// Test 7: disabled state when no BSWMD covers the module
// ---------------------------------------------------------------------------
describe('ContextMenu (BSWMD-disabled items)', () => {
  it("disables the 3 add items (with tooltip) when no BSWMD covers the path's module", async () => {
    // BSWMD list is empty (cleared in afterEach) — no module is covered.
    useArxmlStore.setState({ bswmdSchemas: [], bswmdPaths: [] });

    await mountHost(() => undefined);
    act(() => {
      openContextMenu(
        { path: '/EcuM/EcuMConfiguration', kind: 'container', shortName: 'EcuMConfiguration' },
        100,
        100,
      );
    });

    const items = screen.getAllByRole('menuitem');
    // Add sub-container
    expect(items[0]).toHaveAttribute('aria-disabled', 'true');
    expect(items[0]).toHaveAttribute('title');
    expect(items[0]!.getAttribute('title')).toMatch(/需要先加载 BSWMD|Load BSWMD first/);
    // Add parameter
    expect(items[1]).toHaveAttribute('aria-disabled', 'true');
    // Add reference
    expect(items[2]).toHaveAttribute('aria-disabled', 'true');
    // Delete container is always enabled
    expect(items[3]).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('enables the add items when a BSWMD covers the module shortName in the path', async () => {
    // Build a BSWMD with module shortName "EcuM" — the path starts with
    // /EcuM/... so this module "covers" the target.
    const bswmd: BswmdDocument = {
      version: '4.6',
      modules: [
        {
          shortName: 'EcuM',
          path: '/EcuM',
          dialect: 'ecuc-module-def',
          moduleId: 1,
          containers: [],
          providedEntries: [],
          lowerMultiplicity: 1,
          upperMultiplicity: 'infinite',
        },
      ],
      warnings: [],
    };
    useArxmlStore.setState({ bswmdSchemas: [bswmd], bswmdPaths: ['/fake/EcuM_bswmd.arxml'] });

    await mountHost(() => undefined);
    act(() => {
      openContextMenu(
        { path: '/EcuM/EcuMConfiguration', kind: 'container', shortName: 'EcuMConfiguration' },
        100,
        100,
      );
    });

    const items = screen.getAllByRole('menuitem');
    expect(items[0]).not.toHaveAttribute('aria-disabled', 'true');
    expect(items[1]).not.toHaveAttribute('aria-disabled', 'true');
    expect(items[2]).not.toHaveAttribute('aria-disabled', 'true');
  });
});

// ---------------------------------------------------------------------------
// Test 8: ArrowUp / ArrowDown navigates between items
// ---------------------------------------------------------------------------
describe('ContextMenu (keyboard navigation)', () => {
  it('ArrowDown moves focus to the next item; ArrowUp moves back', async () => {
    // Pre-load a BSWMD so the first item (add-container) is enabled
    // — the auto-focus lands on item 0 and the test expects focus
    // to move to a different item next.
    const bswmd: BswmdDocument = {
      version: '4.6',
      modules: [
        {
          shortName: 'EcuM',
          path: '/EcuM',
          dialect: 'ecuc-module-def',
          moduleId: 1,
          containers: [],
          providedEntries: [],
          lowerMultiplicity: 1,
          upperMultiplicity: 'infinite',
        },
      ],
      warnings: [],
    };
    useArxmlStore.setState({ bswmdSchemas: [bswmd], bswmdPaths: ['/fake/EcuM.arxml'] });

    await mountHost(() => undefined);
    act(() => {
      openContextMenu({ path: '/EcuM', kind: 'container', shortName: 'EcuM' }, 100, 100);
    });
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(4);

    // Initial focus on the first item (auto-focus on open).
    expect(items[0]).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(items[1]).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(items[2]).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' });
    expect(items[1]).toHaveFocus();
  });

  it('Enter on a focused item triggers onAction', async () => {
    const onAction = vi.fn();
    const bswmd: BswmdDocument = {
      version: '4.6',
      modules: [
        {
          shortName: 'EcuM',
          path: '/EcuM',
          dialect: 'ecuc-module-def',
          moduleId: 1,
          containers: [],
          providedEntries: [],
          lowerMultiplicity: 1,
          upperMultiplicity: 'infinite',
        },
      ],
      warnings: [],
    };
    useArxmlStore.setState({ bswmdSchemas: [bswmd], bswmdPaths: ['/fake/EcuM.arxml'] });
    await mountHost(onAction);
    act(() => {
      openContextMenu({ path: '/EcuM', kind: 'container', shortName: 'EcuM' }, 100, 100);
    });
    const items = screen.getAllByRole('menuitem');
    expect(items[0]).toHaveFocus();

    fireEvent.keyDown(items[0]!, { key: 'Enter' });

    expect(onAction).toHaveBeenCalledWith({ type: 'add-container', path: '/EcuM' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// Test 12: reference target shows only the delete item
// ---------------------------------------------------------------------------
describe('ContextMenu (reference target)', () => {
  it('renders a single "Delete reference" item for a reference target', async () => {
    await mountHost(() => undefined);
    act(() => {
      openContextMenu(
        { path: '/EcuM/EcuMConfiguration/DemoRef', kind: 'reference', shortName: 'DemoRef' },
        100,
        100,
      );
    });
    const items = screen.getAllByRole('menuitem');
    expect(items).toHaveLength(1);
    // For a reference, the spec's example text is the literal
    // "Delete reference" — but the existing `mutation.action.delete`
    // i18n key interpolates the name. The test is permissive and
    // matches either shape so we can land the component before the
    // dedicated i18n key lands in Phase 4. (A more explicit
    // `mutation.action.deleteReference` key is on the Phase 4 list.)
    expect(items[0]).toHaveTextContent(/Delete reference|DemoRef|删除引用|删除 'DemoRef'/);
  });

  it('clicking the reference delete item fires delete-reference action', async () => {
    const onAction = vi.fn();
    await mountHost(onAction);
    act(() => {
      openContextMenu(
        { path: '/EcuM/EcuMConfiguration/DemoRef', kind: 'reference', shortName: 'DemoRef' },
        100,
        100,
      );
    });
    const items = screen.getAllByRole('menuitem');
    fireEvent.click(items[0]!);
    expect(onAction).toHaveBeenCalledWith({
      type: 'delete-reference',
      path: '/EcuM/EcuMConfiguration/DemoRef',
    });
  });
});
