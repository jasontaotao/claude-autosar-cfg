// @vitest-environment jsdom
// P2 (spec §4.2) — centered empty-state guidance for the main area.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ParamEditorEmptyState } from '../ParamEditorEmptyState.js';

afterEach(() => cleanup());

describe('ParamEditorEmptyState (spec §4.2)', () => {
  it('renders centered guidance with both actions (en)', () => {
    const onOpen = vi.fn();
    const onNew = vi.fn();
    render(<ParamEditorEmptyState locale="en" onOpenProject={onOpen} onNewProject={onNew} />);
    expect(screen.getByTestId('param-editor-empty-state')).toHaveAttribute(
      'aria-label',
      'Parameter editor',
    );
    // 'app.project.open' en value per i18n.en/app.ts.
    expect(screen.getByRole('button', { name: 'Open Project' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New Project' }));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('hides actions that have no callback wired', () => {
    render(<ParamEditorEmptyState locale="en" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
