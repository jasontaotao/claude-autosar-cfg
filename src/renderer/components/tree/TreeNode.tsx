// TreeNode: recursive ARIA treeitem with chevron + label + keyboard nav.
// Implements T9 keyboard accessibility:
//   ArrowRight → expand (or move to first child if already expanded)
//   ArrowLeft  → collapse (or move to parent if already collapsed)
//   ArrowDown  → focus next visible treeitem
//   ArrowUp    → focus previous visible treeitem
//   Enter / Space → select + toggle expand
// Visible nodes = the set of treeitems currently in the DOM (collapsed
// subtrees are not rendered, so a simple `querySelectorAll('[role=treeitem]')`
// at the tree root gives us the visible list — no separate bookkeeping).

import { useCallback, type KeyboardEvent, type ReactNode } from 'react';

interface TreeNodeProps {
  label: string;
  subtitle: string;
  path: string;
  depth: number;
  isLeaf: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  children?: ReactNode;
}

export function TreeNode({
  label,
  subtitle,
  path,
  depth,
  isLeaf,
  isExpanded,
  isSelected,
  onToggle,
  onSelect,
  children,
}: TreeNodeProps): JSX.Element {
  const handleToggle = useCallback((): void => {
    if (isLeaf) return;
    onToggle(path);
  }, [isLeaf, onToggle, path]);

  const handleClick = useCallback((): void => {
    onSelect(path);
    if (!isLeaf) onToggle(path);
  }, [isLeaf, onSelect, onToggle, path]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): void => {
      const tree = e.currentTarget.closest('[role="tree"]') as HTMLElement | null;
      if (tree === null) return;
      const allItems = Array.from(tree.querySelectorAll<HTMLElement>('[role="treeitem"]'));
      const myIdx = allItems.indexOf(e.currentTarget);

      switch (e.key) {
        case 'ArrowRight': {
          e.preventDefault();
          if (isLeaf) return;
          if (!isExpanded) {
            onToggle(path);
            return;
          }
          // Already expanded: move to first child if present.
          const child = allItems[myIdx + 1];
          if (child !== undefined) child.focus();
          return;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          if (isExpanded && !isLeaf) {
            onToggle(path);
            return;
          }
          // Collapsed (or leaf): move focus to parent treeitem, if any.
          // Parent is the previous treeitem whose depth < ours; we walk back
          // until we find one. Since depth is rendered as inline padding, we
          // also carry it on the data-depth attribute on the row.
          const myDepth = Number(e.currentTarget.dataset.depth ?? '0');
          for (let i = myIdx - 1; i >= 0; i--) {
            const item = allItems[i];
            if (item === undefined) break;
            const d = Number(item.dataset.depth ?? '0');
            if (d < myDepth) {
              item.focus();
              return;
            }
          }
          return;
        }
        case 'ArrowDown': {
          e.preventDefault();
          const next = allItems[myIdx + 1];
          if (next !== undefined) next.focus();
          return;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prev = allItems[myIdx - 1];
          if (prev !== undefined) prev.focus();
          return;
        }
        case 'Enter':
        case ' ': {
          e.preventDefault();
          onSelect(path);
          if (!isLeaf) onToggle(path);
          return;
        }
        default:
          return;
      }
    },
    [isExpanded, isLeaf, onSelect, onToggle, path],
  );

  const chevronLabel = isLeaf ? label : `Toggle ${label}`;

  return (
    <div
      role="treeitem"
      aria-expanded={isLeaf ? undefined : isExpanded}
      aria-selected={isSelected}
      aria-label={label}
      tabIndex={0}
      data-depth={depth}
      data-path={path}
      data-testid={`treeitem-${path}`}
      onKeyDown={handleKeyDown}
      onClick={handleClick}
      className="tree-item"
    >
      <div className="tree-item-row" style={{ paddingLeft: `${depth * 16}px` }} data-row-for={path}>
        {!isLeaf && (
          <button
            type="button"
            aria-label={chevronLabel}
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
            className="tree-chevron"
            data-testid={`chevron-${path}`}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
          className="tree-label"
          data-testid={`label-${path}`}
        >
          <span className="tree-label-text">{label}</span>
          <span className="tree-label-subtitle">{subtitle}</span>
        </button>
      </div>
      {isExpanded && (
        // role="group" holds the child treeitems as a vertical stack
        // *below* the current row (column flex parent). Without this
        // wrapper the children sit beside the label as flex items.
        <div role="group" className="tree-children">
          {children}
        </div>
      )}
    </div>
  );
}
