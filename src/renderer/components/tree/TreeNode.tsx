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
//
// Sprint 17 P3 T3.2 — module-kind right-click re-route. When the
// node's `kind === 'module'`, the right-click is forwarded to the
// module-level ContextMenu via `openContextMenu` with
// `kind: 'bswmd'` and the BSWMD path that owns this module (looked
// up from `useArxmlStore` via the document's `sourceBswmdPath`).
// The host's `onContextMenu` is bypassed for module-kind nodes —
// see App.tsx `handleContextMenuAction` for the host-side routing.

import { useCallback, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

import { basename } from '@shared/path';

import { useArxmlStore } from '../../store/useArxmlStore';
import { openContextMenu } from '../ContextMenu';

/** Discriminator for the visual kind indicator (replaces the previous
 *  text subtitle on element rows). Packages use the text "package" badge
 *  instead — they do not have a `kind` field. Sprint 17 P3 T3.2 adds
 *  `'bswmd'` so the Tree module-kind right-click can route through
 *  the same ContextMenu plumbing (the kind is recomputed in the host
 *  before forwarding to `openContextMenu`). */
type TreeKind = 'module' | 'container' | 'reference' | 'bswmd';

interface TreeNodeProps {
  label: string;
  /** Text badge shown after the label (used for packages: "package").
   *  Optional — element rows render a colored `kind` dot instead and omit
   *  the text badge. Sprint 9 #4.x dropped the literal kind text; this prop
   *  is now reserved for the package "package" badge. */
  subtitle?: string;
  /** Optional kind indicator — renders a colored dot before the label. */
  kind?: TreeKind;
  path: string;
  depth: number;
  isLeaf: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  // Sprint 15 / Phase 3.4 — right-click handler. The host (Tree, and
  // eventually App.tsx) wires this to the global ContextMenu.open() so
  // the user gets an Add/Delete menu on a node they right-click. The
  // handler receives the node's path and kind so the menu can pick
  // the right item set.
  // Sprint A X2 — added the 3rd `e: React.MouseEvent` arg so the
  // host can read clientX / clientY for menu positioning.
  readonly onContextMenu?: (path: string, kind: TreeKind, e: MouseEvent) => void;
  children?: ReactNode;
}

export function TreeNode({
  label,
  subtitle,
  kind,
  path,
  depth,
  isLeaf,
  isExpanded,
  isSelected,
  onToggle,
  onSelect,
  onContextMenu,
  children,
}: TreeNodeProps): JSX.Element {
  const handleToggle = useCallback((): void => {
    if (isLeaf) return;
    onToggle(path);
  }, [isLeaf, onToggle, path]);

  const handleClick = useCallback((): void => {
    // Label / row click selects but does NOT toggle. The chevron is
    // the sole click-driven way to expand / collapse — matches the
    // standard file-tree pattern (VSCode, Finder, Windows Explorer)
    // and avoids the trap where clicking a node to inspect it in
    // the right pane also collapses it. Keyboard Enter/Space still
    // toggles (see handleKeyDown) — that is the standard keyboard
    // pattern and is intentionally different from mouse click.
    onSelect(path);
  }, [onSelect, path]);

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
      onContextMenu={(e) => {
        // Sprint 15 / Phase 3.4 — right-click on a tree row opens the
        // mutation context menu. We always preventDefault so the
        // browser's native context menu does not also appear; the
        // host's onContextMenu decides whether to actually open a
        // menu (it may no-op if the kind/path is not supported).
        // Sprint A X2 — forward the React MouseEvent so the host
        // can read clientX / clientY for menu positioning.
        //
        // Sprint 17 P3 T3.2 — module-kind re-route. When the user
        // right-clicks a `kind: 'module'` node whose parent document
        // has `sourceBswmdPath` set (i.e. it was generated by the
        // BSWMD-to-ECUC skeleton flow), we open the ContextMenu with
        // `kind: 'bswmd'` and the BSWMD file path. This bypasses the
        // host's `onContextMenu` callback for module-kind nodes — the
        // host doesn't need to know about BSWMD-to-ECUC provenance.
        // Falls back to the legacy host forwarding when the
        // document has no `sourceBswmdPath` (legacy ECUC, or module
        // not generated from a BSWMD).
        e.preventDefault();
        e.stopPropagation();
        if (kind === 'module') {
          // Sprint 17 P3 T3.2 — module-kind re-route. We resolve the
          // BSWMD path via `findDependentsOfBswmd` in reverse: scan
          // every loaded doc, pick the one whose `sourceBswmdPath`
          // matches the module's owning path. In practice every
          // BSWMD-derived ECUC doc has a 1:1 sourceBswmdPath; the
          // path argument here is the module tree path (`/<pkg>/<module>`),
          // which we don't need for the lookup — the BSWMD path
          // comes from the document provenance, not the tree path.
          //
          // Sprint A+ — also carry the module path so the menu can
          // offer "Delete ECUC module" alongside "Remove BSWMD".
          // `path` is the canonical post-fold module path (e.g.
          // `/Adc/Adc` for the package shortName == module shortName
          // shape) — exactly the path `findByPath` resolves.
          const state = useArxmlStore.getState();
          const doc = state.doc ?? state.displayDoc;
          if (doc?.sourceBswmdPath !== undefined) {
            openContextMenu(
              {
                path: doc.sourceBswmdPath,
                kind: 'bswmd',
                shortName: basename(doc.sourceBswmdPath),
                modulePath: path,
              },
              e.clientX,
              e.clientY,
            );
            return;
          }
        }
        onContextMenu?.(path, kind ?? 'container', e);
      }}
      onClick={(e) => {
        // Stop the click from bubbling to ancestor treeitems — each
        // <div role="treeitem"> has its own handleClick, and without
        // this guard a click on a deep child would also fire
        // handleClick on every ancestor (toggling their expand state
        // and overwriting selectedPath with the outermost path).
        e.stopPropagation();
        handleClick();
      }}
      className="tree-item"
      style={{ cursor: 'context-menu' }}
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
          {kind !== undefined && (
            <span
              className={`kind-dot kind-${kind}`}
              data-testid={`kind-dot-${path}`}
              title={kind}
              aria-label={kind}
            />
          )}
          <span className="tree-label-text">{label}</span>
          {subtitle && <span className="tree-label-subtitle">{subtitle}</span>}
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
