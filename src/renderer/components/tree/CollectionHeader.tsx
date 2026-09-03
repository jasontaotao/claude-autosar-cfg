// CollectionHeader.tsx — synthetic Tree row representing a group of
// same-shortName siblings.
//
// Renders above real <TreeNode> siblings when ≥2 share the same base
// shortName. See:
//   docs/superpowers/specs/2026-07-13-multi-instance-tree-ui-design.md

import { t } from '@shared/i18n/index.js';

import { useArxmlStore } from '../../store/useArxmlStore.js';

import { KindIndicator } from './KindIndicator.js';

export interface CollectionHeaderProps {
  /** Base shortName (without trailing `_<digits>`). */
  readonly shortName: string;
  /** Number of real siblings in this collection. */
  readonly count: number;
  /** BSWMD upper bound. `'infinite'` for `0..*`. */
  readonly upperMultiplicity: number | 'infinite';
  /** Whether the collection is currently expanded. */
  readonly isExpanded: boolean;
  /** Toggle expanded/collapsed. */
  readonly onToggle: () => void;
  /** Add a new sibling to this collection (calls store.addContainer). */
  readonly onAdd: () => void;
  /**
   * Select the collection itself (drives the right-pane collection table
   * view). Wired by Tree to `store.select(collectionKey)`; the chevron and
   * `+1` buttons stop propagation so they never trigger this.
   */
  readonly onSelect: () => void;
  /** Whether the collection's own key is the store's selectedPath. */
  readonly isSelected: boolean;
  /** Tree depth for indentation. */
  readonly depth: number;
}

export function CollectionHeader(props: CollectionHeaderProps): JSX.Element {
  const {
    shortName,
    count,
    upperMultiplicity,
    isExpanded,
    onToggle,
    onAdd,
    onSelect,
    isSelected,
    depth,
  } = props;
  const atMax = upperMultiplicity !== 'infinite' && count >= upperMultiplicity;
  const testKey = shortName;
  // Phase P1 T4 — locale-aware affordance strings. The 4 keys are
  // declared in `EditorMessages` (src/shared/i18n/editor.ts) and
  // localised in src/shared/i18n.{en,zh-CN}/editor.ts.
  const locale = useArxmlStore((s) => s.locale);
  const expandLabel = t(locale, 'tree.expandCollection');
  const collapseLabel = t(locale, 'tree.collapseCollection');
  const addLabel = t(locale, 'tree.collectionAdd');
  const atMaxLabel = t(locale, 'tree.collectionAtMax');

  return (
    <div
      role="treeitem"
      aria-expanded={isExpanded}
      aria-selected={isSelected}
      data-kind="collection"
      data-testid={`treeitem-collection-${testKey}`}
      className="tree-item tree-item-collection"
      /* Padding-left must use the same `depth * 16px` formula as TreeNode
         (TreeNode.tsx:239) so a collection header at depth=1 visually
         aligns with sibling TreeNodes at the same depth. The previous
         `depth * 1.25rem` (= 20px at depth=1) caused a 4px right-shift
         that the user noticed in screenshot #9. */
      style={{ paddingLeft: `${depth * 16}px` }}
    >
      <button
        type="button"
        className="tree-chevron"
        data-testid={`chevron-collection-${testKey}`}
        /* stopPropagation: without it the click bubbles to the ancestor
           TreeNode's row onClick and selects the PARENT container —
           pre-existing leak that also affected the +1 button. */
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={isExpanded ? collapseLabel : expandLabel}
      >
        {isExpanded ? '▼' : '▶'}
      </button>
      <span className="kind-indicator">
        <KindIndicator kind="collection" label={t(locale, 'tree.kind.collection')} />
      </span>
      {/* Label = select affordance (opens the collection table view in the
          right pane). A real <button> so it's keyboard-focusable; the
          chevron / +1 buttons stop propagation and never fire onSelect. */}
      <button
        type="button"
        className="tree-label tree-label-collection tree-label-selectable"
        data-testid={`collection-label-${testKey}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <span className="tree-label-text">{shortName}</span>
        <span className="tree-collection-count" data-testid={`count-collection-${testKey}`}>
          ×{count}
        </span>
      </button>
      <button
        type="button"
        className="tree-add-collection"
        data-testid={`add-collection-${testKey}`}
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
        disabled={atMax}
        aria-label={atMax ? atMaxLabel : addLabel}
        title={atMax ? atMaxLabel : addLabel}
      >
        + 1
      </button>
    </div>
  );
}
