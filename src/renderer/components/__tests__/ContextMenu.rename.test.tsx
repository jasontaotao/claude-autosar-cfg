// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Locale } from '@shared/i18n/index.js';

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
  locale: Locale = 'en',
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

describe('ContextMenu — rename ECUC container instance', () => {
  it('shows and emits Rename for an ECUC container', async () => {
    const onAction = vi.fn();
    await mountHost(onAction);

    const target: ContextMenuTarget = {
      path: '/Can/ValidSet',
      kind: 'container',
      shortName: 'ValidSet',
    };
    act(() => {
      openContextMenu(target, 100, 100);
    });

    const item = screen.getByTestId('context-menu-item-rename-container');
    expect(item).toBeInTheDocument();
    expect(item).toHaveTextContent('Rename');

    fireEvent.click(item);
    expect(onAction).toHaveBeenCalledWith({
      type: 'rename-container',
      path: '/Can/ValidSet',
      name: 'ValidSet',
    });
  });

  it('does not offer Rename for BSWMD definitions', async () => {
    const onAction = vi.fn();
    await mountHost(onAction);

    const target: ContextMenuTarget = {
      path: '/Can.arxml',
      kind: 'bswmd',
      shortName: 'Can.arxml',
    };
    act(() => {
      openContextMenu(target, 100, 100);
    });

    expect(screen.queryByTestId('context-menu-item-rename-container')).toBeNull();
  });
});
