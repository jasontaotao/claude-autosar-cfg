// @vitest-environment jsdom
//
// Sprint A+ — ContextMenu "Delete ECUC module" item.
//
// Pins the contract for the new `delete-module` action added to the
// ContextMenu union. The item shows up only when the right-click
// target carries a `modulePath` (the TreeNode module-kind re-route
// populates this when a source-backed doc is right-clicked). Clicking
// the item fires `onAction` with `{ type: 'delete-module', path:
// '<modulePath>', name: '<shortName>' }`. The host (App.tsx) routes
// this action to `useArxmlStore.deleteEcucModule(path)`.
//
// Mirrors `ContextMenu.removeModule.test.tsx` shape.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Locale } from '@shared/i18n.js';

import type { ContextMenuAction, ContextMenuTarget } from '../ContextMenu.js';
import { closeContextMenu, ContextMenuRoot, openContextMenu } from '../ContextMenu.js';

function Host({
  onAction,
  locale,
}: {
  readonly onAction: (action: ContextMenuAction) => void;
  readonly locale?: Locale;
}): JSX.Element {
  return <ContextMenuRoot onAction={onAction} locale={locale} />;
}

async function mountHost(
  onAction: (action: ContextMenuAction) => void,
  locale: Locale = 'zh-CN',
): Promise<void> {
  render(<Host onAction={onAction} locale={locale} />);
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
  closeContextMenu();
});

describe('ContextMenu (Sprint A+ — Delete ECUC module item)', () => {
  it('renders the "Delete ECUC module" item when modulePath is set (zh-CN)', async () => {
    const onAction = vi.fn();
    await mountHost(onAction);

    const target: ContextMenuTarget = {
      path: '/fake/Adc_bswmd.arxml',
      kind: 'bswmd',
      shortName: 'Adc_bswmd.arxml',
      modulePath: '/Adc/Adc',
    };
    act(() => {
      openContextMenu(target, 100, 100);
    });

    const item = screen.getByTestId('context-menu-item-delete-module');
    expect(item).toBeInTheDocument();
    // i18n key: mutation.action.deleteModule = "删除 ECUC 模块 '{name}'"
    expect(item.textContent).toMatch(/删除 ECUC 模块/);
  });

  it('emits onAction with type:delete-module, modulePath, and shortName when clicked', async () => {
    const onAction = vi.fn();
    await mountHost(onAction);

    const target: ContextMenuTarget = {
      path: '/fake/Adc_bswmd.arxml',
      kind: 'bswmd',
      shortName: 'Adc_bswmd.arxml',
      modulePath: '/Adc/Adc',
    };
    act(() => {
      openContextMenu(target, 100, 100);
    });

    const item = screen.getByTestId('context-menu-item-delete-module');
    fireEvent.click(item);

    expect(onAction).toHaveBeenCalledTimes(1);
    // The action payload discriminates on `type` — the App.tsx router
    // uses `action.path` as the post-fold module path and `action.name`
    // for the toast label.
    expect(onAction).toHaveBeenCalledWith({
      type: 'delete-module',
      path: '/Adc/Adc',
      name: 'Adc_bswmd.arxml',
    });
  });

  it('is enabled (no aria-disabled) for the bswmd kind with modulePath — the primary user-facing path', async () => {
    const onAction = vi.fn();
    await mountHost(onAction);

    const target: ContextMenuTarget = {
      path: '/fake/Adc_bswmd.arxml',
      kind: 'bswmd',
      shortName: 'Adc_bswmd.arxml',
      modulePath: '/Adc/Adc',
    };
    act(() => {
      openContextMenu(target, 100, 100);
    });

    const item = screen.getByTestId('context-menu-item-delete-module');
    // The source-backed module-root right-click (Sprint 17 P3 T3.2
    // re-route) is the primary trigger for this action — the item
    // MUST be enabled so the user can fire it without an extra
    // "load BSWMD" step.
    expect(item).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('is absent for container kind with no modulePath (invariant I4)', async () => {
    const onAction = vi.fn();
    await mountHost(onAction);

    const target: ContextMenuTarget = {
      path: '/Adc/AdcConfig',
      kind: 'container',
      shortName: 'AdcConfig',
      // intentionally NO modulePath — invariant I4: the item only
      // appears for module-kind targets. Container/parameter/reference
      // menus must be unchanged.
    };
    act(() => {
      openContextMenu(target, 100, 100);
    });

    // Use queryByTestId (returns null if absent) instead of getByTestId
    // (throws). The item should NOT be in the DOM at all.
    const item = screen.queryByTestId('context-menu-item-delete-module');
    expect(item).toBeNull();
  });
});
