// TemplateCard tests — Sprint 13+ Stage 3.3 Task 2.
//
// The card is a presentational component. It owns nothing — it
// receives a `template` row, the `selected` flag, and a single
// `onSelect(id)` callback. Disabled cards never emit onSelect. The
// "coming soon" badge is a child rendered when
// `!isTemplateAvailable(template.id)`.

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { TemplateCard } from '../TemplateCard.js';
import type { TemplateRow } from '../templates.js';

const EMPTY: TemplateRow = {
  id: 'empty',
  displayNameKey: 'template.empty.displayName',
  descriptionKey: 'template.empty.description',
  fileCount: 0,
  bswmdPaths: [],
};

const CLASSIC: TemplateRow = {
  id: 'classic',
  displayNameKey: 'template.classic.displayName',
  descriptionKey: 'template.classic.description',
  fileCount: 3,
  bswmdPaths: [],
};

const CLONE: TemplateRow = {
  id: 'clone',
  displayNameKey: 'template.clone.displayName',
  descriptionKey: 'template.clone.description',
  fileCount: 0,
  bswmdPaths: [],
};

afterEach(() => {
  cleanup();
  useArxmlStore.getState().clear();
  useArxmlStore.getState().setLocale('en');
});

describe('TemplateCard', () => {
  it('renders the localized display name and description', () => {
    useArxmlStore.getState().setLocale('en');
    render(<TemplateCard template={EMPTY} selected={false} onSelect={() => undefined} />);
    expect(screen.getByTestId('tpl-card-empty-name')).toHaveTextContent('Empty Project');
    expect(screen.getByTestId('tpl-card-empty-desc')).toHaveTextContent(
      'Start a new project from scratch',
    );
  });

  it('renders the file count badge for templates with files', () => {
    render(<TemplateCard template={CLASSIC} selected={false} onSelect={() => undefined} />);
    const badge = screen.getByTestId('tpl-card-classic-badge');
    expect(badge).toHaveTextContent('3');
  });

  it('calls onSelect with the template id when an available card is clicked', () => {
    const onSelect = vi.fn();
    render(<TemplateCard template={EMPTY} selected={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('tpl-card-empty'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('empty');
  });

  it('does NOT call onSelect when a disabled (coming soon) card is clicked', () => {
    // Sprint 13+ Stage 3.4 — classic is now available (the BSWMD
    // chip row wires on top of it). Clone is the remaining
    // disabled "coming soon" card.
    const onSelect = vi.fn();
    render(<TemplateCard template={CLONE} selected={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('tpl-card-clone'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows the "coming soon" badge for disabled templates and hides it for available ones', () => {
    // Stage 3.4 — classic is now actionable. Clone is the
    // "coming soon" placeholder.
    const { rerender } = render(
      <TemplateCard template={CLONE} selected={false} onSelect={() => undefined} />,
    );
    expect(screen.getByTestId('tpl-card-clone-soon')).toBeInTheDocument();
    expect(screen.getByTestId('tpl-card-clone-soon')).toHaveTextContent('Coming Soon');

    rerender(<TemplateCard template={EMPTY} selected={false} onSelect={() => undefined} />);
    expect(screen.queryByTestId('tpl-card-empty-soon')).toBeNull();
  });

  it('applies the --selected modifier when selected=true', () => {
    render(<TemplateCard template={EMPTY} selected={true} onSelect={() => undefined} />);
    expect(screen.getByTestId('tpl-card-empty').className).toMatch(/tpl-card--selected/);
  });

  it('does NOT apply the --selected modifier when selected=false', () => {
    render(<TemplateCard template={EMPTY} selected={false} onSelect={() => undefined} />);
    expect(screen.getByTestId('tpl-card-empty').className).not.toMatch(/tpl-card--selected/);
  });

  it('applies the --disabled modifier for unavailable templates and sets aria-disabled', () => {
    render(<TemplateCard template={CLONE} selected={false} onSelect={() => undefined} />);
    const card = screen.getByTestId('tpl-card-clone');
    expect(card.className).toMatch(/tpl-card--disabled/);
    expect(card.getAttribute('aria-disabled')).toBe('true');
  });

  it('does NOT set aria-disabled for available templates', () => {
    render(<TemplateCard template={EMPTY} selected={false} onSelect={() => undefined} />);
    expect(screen.getByTestId('tpl-card-empty').getAttribute('aria-disabled')).toBe('false');
  });

  it('sets aria-pressed reflecting the selected prop', () => {
    const { rerender } = render(
      <TemplateCard template={EMPTY} selected={false} onSelect={() => undefined} />,
    );
    expect(screen.getByTestId('tpl-card-empty').getAttribute('aria-pressed')).toBe('false');
    rerender(<TemplateCard template={EMPTY} selected={true} onSelect={() => undefined} />);
    expect(screen.getByTestId('tpl-card-empty').getAttribute('aria-pressed')).toBe('true');
  });

  it('triggers onSelect on Enter key press for available cards', () => {
    const onSelect = vi.fn();
    render(<TemplateCard template={EMPTY} selected={false} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByTestId('tpl-card-empty'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('empty');
  });

  it('triggers onSelect on Space key press for available cards', () => {
    const onSelect = vi.fn();
    render(<TemplateCard template={EMPTY} selected={false} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByTestId('tpl-card-empty'), { key: ' ' });
    expect(onSelect).toHaveBeenCalledWith('empty');
  });

  it('does NOT trigger onSelect on Enter for disabled cards', () => {
    // Stage 3.4 — classic is now available; clone is the disabled
    // "coming soon" placeholder.
    const onSelect = vi.fn();
    render(<TemplateCard template={CLONE} selected={false} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByTestId('tpl-card-clone'), { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
