// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewMenu } from '../ViewMenu';

describe('ViewMenu', () => {
  it('renders trigger button', () => {
    render(<ViewMenu onTogglePanel={vi.fn()} onResetLayout={vi.fn()} />);
    expect(screen.getByTestId('btn-view-menu')).toBeDefined();
  });

  it('opens dropdown and shows all 5 panels + reset', () => {
    render(<ViewMenu onTogglePanel={vi.fn()} onResetLayout={vi.fn()} />);
    fireEvent.click(screen.getByTestId('btn-view-menu'));
    expect(screen.getByTestId('menu-item-left-panel')).toBeDefined();
    expect(screen.getByTestId('menu-item-param-editor')).toBeDefined();
    expect(screen.getByTestId('menu-item-script-panel')).toBeDefined();
    expect(screen.getByTestId('menu-item-dbc-viewer')).toBeDefined();
    expect(screen.getByTestId('menu-item-odx-viewer')).toBeDefined();
    expect(screen.getByTestId('btn-reset-layout')).toBeDefined();
  });

  it('calls onTogglePanel with correct panel id', () => {
    const togglePanel = vi.fn();
    render(<ViewMenu onTogglePanel={togglePanel} onResetLayout={vi.fn()} />);
    fireEvent.click(screen.getByTestId('btn-view-menu'));
    fireEvent.click(screen.getByTestId('menu-item-left-panel'));
    expect(togglePanel).toHaveBeenCalledWith('left-panel');
  });

  it('calls onResetLayout on reset click', () => {
    const resetLayout = vi.fn();
    render(<ViewMenu onTogglePanel={vi.fn()} onResetLayout={resetLayout} />);
    fireEvent.click(screen.getByTestId('btn-view-menu'));
    fireEvent.click(screen.getByTestId('btn-reset-layout'));
    expect(resetLayout).toHaveBeenCalledOnce();
  });
});
