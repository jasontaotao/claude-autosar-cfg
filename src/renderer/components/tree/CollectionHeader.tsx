// CollectionHeader.tsx — synthetic Tree row representing a group of
// same-shortName siblings.
//
// Renders above real <TreeNode> siblings when ≥2 share the same base
// shortName. See:
//   docs/superpowers/specs/2026-07-13-multi-instance-tree-ui-design.md

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
  /** Tree depth for indentation. */
  readonly depth: number;
}

export function CollectionHeader(props: CollectionHeaderProps): JSX.Element {
  const { shortName, count, upperMultiplicity, isExpanded, onToggle, onAdd, depth } = props;
  const atMax = upperMultiplicity !== 'infinite' && count >= upperMultiplicity;
  const testKey = shortName;
  // TODO(P1-T4): replace literal strings with useTranslation() calls once
  // the i18n catalog exposes tree.expandCollection / tree.collapseCollection
  // / tree.collectionAdd / tree.collectionAtMax keys.
  const expandLabel = 'Expand collection';
  const collapseLabel = 'Collapse collection';
  const addLabel = 'Add to collection';
  const atMaxLabel = '已达上限';

  return (
    <div
      role="treeitem"
      aria-expanded={isExpanded}
      data-kind="collection"
      data-testid={`treeitem-collection-${testKey}`}
      className="tree-item tree-item-collection"
      style={{ paddingLeft: `${depth * 1.25}rem` }}
    >
      <button
        type="button"
        className="tree-chevron"
        data-testid={`chevron-collection-${testKey}`}
        onClick={onToggle}
        aria-label={isExpanded ? collapseLabel : expandLabel}
      >
        {isExpanded ? '▼' : '▶'}
      </button>
      <span className="kind-dot kind-collection" />
      <span className="tree-label tree-label-collection">
        <span className="tree-label-text">{shortName}</span>
        <span className="tree-collection-count" data-testid={`count-collection-${testKey}`}>
          ×{count}
        </span>
      </span>
      <button
        type="button"
        className="tree-add-collection"
        data-testid={`add-collection-${testKey}`}
        onClick={onAdd}
        disabled={atMax}
        aria-label={atMax ? atMaxLabel : addLabel}
        title={atMax ? atMaxLabel : addLabel}
      >
        + 1
      </button>
    </div>
  );
}
