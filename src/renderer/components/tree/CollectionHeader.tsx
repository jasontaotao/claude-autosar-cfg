// CollectionHeader.tsx — synthetic Tree row representing a group of
// same-shortName siblings.
//
// Renders above real <TreeNode> siblings when ≥2 share the same base
// shortName. See:
//   docs/superpowers/specs/2026-07-13-multi-instance-tree-ui-design.md

import { t } from '@shared/i18n/index.js';

import { useArxmlStore } from '../../store/useArxmlStore.js';

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
