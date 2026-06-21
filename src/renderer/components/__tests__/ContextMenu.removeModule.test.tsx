// @vitest-environment jsdom
//
// Sprint 17 P3 T3.3 — ContextMenu "Remove module" item + App router.
//
// Pin: when the context menu opens with `kind: 'bswmd'`, it shows
// a "Remove module" item. Clicking the item fires `onAction` with
// `{ type: 'remove-module', path: '<bswmd-path>' }`. The host
// (App.tsx) routes this action to
// `useProjectActions.removeBswmdWithFullFlow(path)`.
//
// We isolate this test to the ContextMenu component (no App shell):
// the host routing is pinned separately by App.contextMenu.test.tsx
// (which mounts the real App.tsx and dispatches the action).

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Locale } from '@shared/i18n.js';

import { closeContextMenu, ContextMenuRoot, openContextMenu } from '../ContextMenu.js';

// Mirrors the public action union in ContextMenu.tsx (kept local
// to avoid importing the union type which is intentionally not
// exported to keep the host decoupled).
type PublicAction =
  | { type: 'add-container'; path: string }
  | { type: 'add-parameter'; path: string }
  | { type: 'add-reference'; path: string }
  | { type: 'delete-container'; path: string; name: string }
  | { type: 'delete-reference'; path: string }
  | { type: 'remove-module'; path: string };

function Host({
  onAction,
  locale,
}: {
  readonly onAction: (action: PublicAction) => void;
  readonly locale?: Locale;
}): JSX.Element {
  return <ContextMenuRoot onAction={onAction as never} locale={locale} />;
}

async function mountHost(
  onAction: (action: PublicAction) => void,
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

describe('ContextMenu (Sprint 17 P3 T3.3 — Remove module item)', () => {
  beforeEach(async () => {
    await mountHost(() => undefined);
  });

  it('renders the "Remove module" item when opened with kind:bswmd', () => {
    act(() => {
      openContextMenu(
        { path: '/fake/Adc.arxml', kind: 'bswmd', shortName: 'Adc.arxml' },
        100,
        100,
      );
    });
    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();

    // zh-CN label from `mutation.action.removeModule` i18n key (set
    // in T3.3).
    expect(screen.getByText(/移除 BSWMD|Remove module/i)).toBeInTheDocument();
  });

  it('clicking "Remove module" fires onAction with type:remove-module and the BSWMD path', () => {
    const onAction = vi.fn();
    cleanup();
    return mountHost(onAction).then(() => {
      act(() => {
        openContextMenu(
          { path: '/fake/Adc.arxml', kind: 'bswmd', shortName: 'Adc.arxml' },
          100,
          100,
        );
      });
      const item = screen.getByTestId('context-menu-item-remove-module');
      fireEvent.click(item);
      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onAction).toHaveBeenCalledWith({
        type: 'remove-module',
        path: '/fake/Adc.arxml',
      });
    });
  });

  it('shows "Remove module" item for kind:bswmd in en locale', async () => {
    cleanup();
    const onAction = vi.fn();
    render(<Host onAction={onAction} locale="en" />);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      openContextMenu(
        { path: '/fake/Adc.arxml', kind: 'bswmd', shortName: 'Adc.arxml' },
        100,
        100,
      );
    });
    expect(screen.getByText(/Remove module/i)).toBeInTheDocument();
    await waitFor(() => screen.getByTestId('context-menu-item-remove-module'));
  });
});