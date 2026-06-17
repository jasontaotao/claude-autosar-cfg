// @vitest-environment jsdom
//
// TemplateCardRow tests — Sprint 13+ Stage 3.3 Task 3 (revised for
// Stage 3.4 lift-state).
//
// Stage 3.3 put the IPC fetch inside this row. Stage 3.4 hoists
// the fetch to the host (`NewProjectDialog`) because the dialog
// needs the per-template `bswmdPaths` metadata to render the chip
// row. The row is now a pure controlled component that receives
// `templates`, `selectedId`, `onSelect`, and `loading`.
//
// These tests still validate the row's rendering contract:
//   - loading=true with templates=[] → renders skeleton
//   - templates with 3 entries → renders 3 cards
//   - selectedId matching a card → applies the --selected modifier
//   - re-render with selectedId=null → deselects the card

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { TemplateCardRow } from '../TemplateCardRow.js';
import type { TemplateRow } from '../templates.js';

const THREE_TEMPLATES: readonly TemplateRow[] = [
  {
    id: 'empty',
    displayNameKey: 'template.empty.displayName',
    descriptionKey: 'template.empty.description',
    fileCount: 0,
    bswmdPaths: [],
  },
  {
    id: 'classic',
    displayNameKey: 'template.classic.displayName',
    descriptionKey: 'template.classic.description',
    fileCount: 3,
    bswmdPaths: ['/samples/classic/bswmd/Can.arxml'],
  },
  {
    id: 'clone',
    displayNameKey: 'template.clone.displayName',
    descriptionKey: 'template.clone.description',
    fileCount: 0,
    bswmdPaths: [],
  },
];

const EMPTY_LIST: readonly TemplateRow[] = [];

beforeEach(() => {
  useArxmlStore.getState().clear();
  useArxmlStore.getState().setLocale('en');
});

afterEach(() => {
  cleanup();
});

describe('TemplateCardRow (Sprint 13+ Stage 3.4 — controlled view)', () => {
  it('renders the skeleton when loading=true and templates is empty', () => {
    render(
      <TemplateCardRow
        templates={EMPTY_LIST}
        selectedId={null}
        onSelect={() => undefined}
        loading
      />,
    );
    expect(screen.getByTestId('tpl-card-row')).toBeInTheDocument();
    expect(screen.getByTestId('tpl-card-skeleton')).toBeInTheDocument();
  });

  it('renders 3 cards when the host passes 3 templates', () => {
    render(
      <TemplateCardRow
        templates={THREE_TEMPLATES}
        selectedId={null}
        onSelect={() => undefined}
        loading={false}
      />,
    );
    expect(screen.getByTestId('tpl-card-empty')).toBeInTheDocument();
    expect(screen.getByTestId('tpl-card-classic')).toBeInTheDocument();
    expect(screen.getByTestId('tpl-card-clone')).toBeInTheDocument();
  });

  it('hides the skeleton once templates are non-empty (even with loading=true)', () => {
    render(
      <TemplateCardRow
        templates={THREE_TEMPLATES}
        selectedId={null}
        onSelect={() => undefined}
        loading
      />,
    );
    expect(screen.queryByTestId('tpl-card-skeleton')).toBeNull();
  });

  it('applies the --selected modifier to the card whose id matches selectedId', () => {
    render(
      <TemplateCardRow
        templates={THREE_TEMPLATES}
        selectedId="empty"
        onSelect={() => undefined}
        loading={false}
      />,
    );
    expect(screen.getByTestId('tpl-card-empty').className).toMatch(/tpl-card--selected/);
    expect(screen.getByTestId('tpl-card-classic').className).not.toMatch(/tpl-card--selected/);
  });

  it('re-renders correctly when selectedId switches from empty to null (deselect)', () => {
    const { rerender } = render(
      <TemplateCardRow
        templates={THREE_TEMPLATES}
        selectedId="empty"
        onSelect={() => undefined}
        loading={false}
      />,
    );
    expect(screen.getByTestId('tpl-card-empty').className).toMatch(/tpl-card--selected/);
    rerender(
      <TemplateCardRow
        templates={THREE_TEMPLATES}
        selectedId={null}
        onSelect={() => undefined}
        loading={false}
      />,
    );
    expect(screen.getByTestId('tpl-card-empty').className).not.toMatch(/tpl-card--selected/);
  });

  it('forwards click events to onSelect (parent decides what to do)', () => {
    const onSelect = vi.fn();
    render(
      <TemplateCardRow
        templates={THREE_TEMPLATES}
        selectedId={null}
        onSelect={onSelect}
        loading={false}
      />,
    );
    // TemplateCard swallows clicks on disabled cards; only the
    // Empty card is available, so the test clicks that one.
    screen.getByTestId('tpl-card-empty').click();
    // Clicking through the DOM node directly is the same as
    // fireEvent.click; we use the sync DOM API to avoid the
    // async waitFor dance for a no-state-change assertion.
    return waitFor(() => expect(onSelect).toHaveBeenCalledWith('empty'));
  });
});
