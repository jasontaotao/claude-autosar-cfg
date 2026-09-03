// @vitest-environment jsdom
//
// Phase P1 T2 — CollectionHeader presentational component (leaf).
//
// The component is intentionally side-effect-free: every callback
// (onToggle, onAdd) is a prop. T3 will wire the same callbacks to the
// store actions (toggle collection expand, addContainer). The
// "count" prop is pre-computed by T3 from
// `groupSiblingsByShortName(elements).get(shortName)?.length` so this
// component never imports the collections helper directly.
//
// i18n keys (`tree.expandCollection`, `tree.collapseCollection`,
// `tree.collectionAdd`, `tree.collectionAtMax`) are T4 work — the
// strings here are English placeholders wrapped in `aria-label` /
// `title`. T4 will swap them for `useTranslation()` calls.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CollectionHeader } from '../CollectionHeader.js';

describe('CollectionHeader', () => {
  it('renders shortName ×N badge', () => {
    render(
      <CollectionHeader
        shortName="AFECellValidSet"
        count={5}
        upperMultiplicity="infinite"
        isExpanded={false}
        onToggle={vi.fn()}
        onAdd={vi.fn()}
        onSelect={vi.fn()}
        isSelected={false}
        depth={2}
      />,
    );
    expect(screen.getByTestId('treeitem-collection-AFECellValidSet')).toBeInTheDocument();
    expect(screen.getByText(/AFECellValidSet/)).toBeInTheDocument();
    expect(screen.getByText(/×5/)).toBeInTheDocument();
  });

  it('disables + button when count >= upperMultiplicity', () => {
    render(
      <CollectionHeader
        shortName="AFETempValidSet"
        count={1}
        upperMultiplicity={1}
        isExpanded={false}
        onToggle={vi.fn()}
        onAdd={vi.fn()}
        onSelect={vi.fn()}
        isSelected={false}
        depth={2}
      />,
    );
    const addBtn = screen.getByTestId('add-collection-AFETempValidSet');
    expect(addBtn).toBeDisabled();
    expect(addBtn).toHaveAttribute('aria-label', expect.stringContaining('已达上限'));
  });

  it('fires onAdd when + button clicked (not at max)', () => {
    const onAdd = vi.fn();
    render(
      <CollectionHeader
        shortName="AFECellValidSet"
        count={3}
        upperMultiplicity="infinite"
        isExpanded={false}
        onToggle={vi.fn()}
        onAdd={onAdd}
        onSelect={vi.fn()}
        isSelected={false}
        depth={2}
      />,
    );
    fireEvent.click(screen.getByTestId('add-collection-AFECellValidSet'));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('fires onSelect when the label is clicked; chevron and +1 do not select', () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    render(
      <CollectionHeader
        shortName="AFECellValidSet"
        count={3}
        upperMultiplicity="infinite"
        isExpanded={true}
        onToggle={onToggle}
        onAdd={vi.fn()}
        onSelect={onSelect}
        isSelected={false}
        depth={2}
      />,
    );
    fireEvent.click(screen.getByTestId('collection-label-AFECellValidSet'));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onToggle).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('chevron-collection-AFECellValidSet'));
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledOnce(); // unchanged by the chevron click
  });

  it('reflects isSelected via aria-selected on the treeitem root', () => {
    render(
      <CollectionHeader
        shortName="AFECellValidSet"
        count={3}
        upperMultiplicity="infinite"
        isExpanded={true}
        onToggle={vi.fn()}
        onAdd={vi.fn()}
        onSelect={vi.fn()}
        isSelected={true}
        depth={2}
      />,
    );
    expect(screen.getByTestId('treeitem-collection-AFECellValidSet')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
