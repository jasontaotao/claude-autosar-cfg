// @vitest-environment jsdom
//
// ScriptLibrary — Sprint 14 #1 Phase C (T13) — left-column script list.
//
// Behaviour pinned by tests:
//   1. Renders one row per script with its name + kind badge
//   2. Clicking a row fires `onSelect(id)`
//   3. Filter chips restrict the list to the chosen kind
//   4. Delete button fires `onDelete(id)`
//   5. Empty state renders the localised "empty" string

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ScriptSummary } from '@shared/script/types';

import { ScriptLibrary } from '../ScriptLibrary';

const SCRIPTS: readonly ScriptSummary[] = [
  {
    id: 's1',
    name: 'alpha',
    shortName: 'alpha',
    kind: 'validator',
    updatedAt: '2026-06-18T00:00:00Z',
  },
  {
    id: 's2',
    name: 'beta',
    shortName: 'beta',
    kind: 'transformer',
    updatedAt: '2026-06-18T00:00:00Z',
  },
  {
    id: 's3',
    name: 'gamma',
    shortName: 'gamma',
    kind: 'report',
    updatedAt: '2026-06-18T00:00:00Z',
  },
  {
    id: 's4',
    name: 'delta',
    shortName: 'delta',
    kind: 'free',
    updatedAt: '2026-06-18T00:00:00Z',
  },
];

describe('ScriptLibrary', () => {
  afterEach(() => cleanup());

  it('renders one row per script', () => {
    render(
      <ScriptLibrary
        scripts={SCRIPTS}
        selectedId={null}
        locale="en"
        busy={false}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByTestId('script-row-s1')).not.toBeNull();
    expect(screen.getByTestId('script-row-s2')).not.toBeNull();
    expect(screen.getByTestId('script-row-s3')).not.toBeNull();
    expect(screen.getByTestId('script-row-s4')).not.toBeNull();
  });

  it('clicking a row fires onSelect with the script id', () => {
    const onSelect = vi.fn();
    render(
      <ScriptLibrary
        scripts={SCRIPTS}
        selectedId={null}
        locale="en"
        busy={false}
        onSelect={onSelect}
        onNew={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('script-select-s2'));
    expect(onSelect).toHaveBeenCalledWith('s2');
  });

  it('clicking the delete button fires onDelete with the script id', () => {
    const onDelete = vi.fn();
    render(
      <ScriptLibrary
        scripts={SCRIPTS}
        selectedId={null}
        locale="en"
        busy={false}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByTestId('script-delete-s3'));
    expect(onDelete).toHaveBeenCalledWith('s3');
  });

  it('filter chip restricts the list to one kind', () => {
    render(
      <ScriptLibrary
        scripts={SCRIPTS}
        selectedId={null}
        locale="en"
        busy={false}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    // Initially all 4 rows visible.
    expect(screen.queryByTestId('script-row-s2')).not.toBeNull();
    expect(screen.queryByTestId('script-row-s3')).not.toBeNull();
    // Click the "validator" filter — only alpha should remain.
    fireEvent.click(screen.getByTestId('script-filter-validator'));
    expect(screen.queryByTestId('script-row-s1')).not.toBeNull();
    expect(screen.queryByTestId('script-row-s2')).toBeNull();
    expect(screen.queryByTestId('script-row-s3')).toBeNull();
    expect(screen.queryByTestId('script-row-s4')).toBeNull();
  });

  it('shows the empty state when no scripts match', () => {
    render(
      <ScriptLibrary
        scripts={[]}
        selectedId={null}
        locale="en"
        busy={false}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('script-library-list')).toBeNull();
  });

  it('selected row carries is-selected class', () => {
    const { container } = render(
      <ScriptLibrary
        scripts={SCRIPTS}
        selectedId="s2"
        locale="en"
        busy={false}
        onSelect={vi.fn()}
        onNew={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const selectedRow = screen.getByTestId('script-row-s2');
    expect(selectedRow.className).toContain('is-selected');
    // Non-selected row does not.
    const otherRow = screen.getByTestId('script-row-s1');
    expect(otherRow.className).not.toContain('is-selected');
    expect(container).toBeTruthy();
  });
});
