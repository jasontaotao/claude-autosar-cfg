// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import { ViewMenu } from '../ViewMenu';

describe('ViewMenu', () => {
  it('renders trigger button', () => {
    render(<ViewMenu onTogglePanel={vi.fn()} onResetLayout={vi.fn()} />);
    expect(screen.getByTestId('btn-view-menu')).toBeDefined();
  });

  it('opens dropdown and shows dock panels but excludes modal viewers', () => {
    render(<ViewMenu onTogglePanel={vi.fn()} onResetLayout={vi.fn()} />);
    fireEvent.click(screen.getByTestId('btn-view-menu'));
    for (const id of [
      'project',
      'files',
      'validation',
      'arxml-tree',
      'param-editor',
      'script-panel',
    ]) {
      expect(screen.getByTestId(`menu-item-${id}`)).toBeDefined();
    }
    // DBC/ODX viewers remain modal file viewers, so they must not be
    // offered as empty dock panels in the View menu.
    expect(screen.queryByTestId('menu-item-dbc-viewer')).toBeNull();
    expect(screen.queryByTestId('menu-item-odx-viewer')).toBeNull();
    expect(screen.getByTestId('btn-reset-layout')).toBeDefined();
  });

  it('calls onTogglePanel with correct panel id', () => {
    const togglePanel = vi.fn();
    render(<ViewMenu onTogglePanel={togglePanel} onResetLayout={vi.fn()} />);
    fireEvent.click(screen.getByTestId('btn-view-menu'));
    fireEvent.click(screen.getByTestId('menu-item-project'));
    expect(togglePanel).toHaveBeenCalledWith('project');
  });

  it('calls onResetLayout on reset click', () => {
    const resetLayout = vi.fn();
    render(<ViewMenu onTogglePanel={vi.fn()} onResetLayout={resetLayout} />);
    fireEvent.click(screen.getByTestId('btn-view-menu'));
    fireEvent.click(screen.getByTestId('btn-reset-layout'));
    expect(resetLayout).toHaveBeenCalledOnce();
  });
});
