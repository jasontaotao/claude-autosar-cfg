// S4 (v1.7.2) — OptionalAddPlaceholder.
//
// Renders a muted treeitem row for a BSWMD `ContainerDef` whose
// `lowerMultiplicity === 0` is missing from the value tree. The
// placeholder has a `+` button that calls the parent's `onAdd` to
// invoke the existing `addContainer` mutation in the store.
//
// Why a sibling of `TreeNode` and not a child rendered through it:
//   - The placeholder is not a real ARXML element; it has no
//     `onSelect` / `onToggle` semantics.
//   - We need a `+` button (not a chevron) and a different visual
//     treatment (muted label, no kind-dot).
//   - The brief specifies the same `role="treeitem"` outer shape so
//     the keyboard nav (ArrowUp/ArrowDown) still works uniformly
//     across the whole tree.

import { type MouseEvent } from 'react';

interface OptionalAddPlaceholderProps {
  /** Visible muted label (e.g. BSWMD shortName of the missing child). */
  readonly label: string;
  /** Optional human description surfaced as a tooltip. */
  readonly description?: string;
  /** Indent depth (matches TreeNode's `depth` for the parent row). */
  readonly depth: number;
  /** Click handler for the `+` button. */
  readonly onAdd: () => void;
  /** Localised "Add {name}" string from `tree.addOptionalContainer`. */
  readonly addLabel: string;
  /** Localised tooltip text from `tree.optionalContainerHint`. */
  readonly hintLabel: string;
  /** Stable test key — usually the BSWMD shortName. */
  readonly testKey: string;
}

export function OptionalAddPlaceholder({
  label,
  description,
  depth,
  onAdd,
  addLabel,
  hintLabel,
  testKey,
}: OptionalAddPlaceholderProps): JSX.Element {
  const handleAdd = (e: MouseEvent<HTMLButtonElement>): void => {
    // Stop the click from bubbling to the ancestor treeitem (the
    // outer role=treeitem on this row) which would call select() on
    // a phantom path. Same pattern TreeNode uses.
    e.stopPropagation();
    onAdd();
  };

  // Match TreeNode's accessible name pattern: a single aria-label on
  // the treeitem that combines the add affordance + the label. Screen
  // readers read `${addLabel} ${label}` (e.g. "Add OptionalSubOne").
  const ariaLabel = `${addLabel} ${label}`;

  return (
    <div
      role="treeitem"
      aria-label={ariaLabel}
      aria-disabled="true"
      tabIndex={-1}
      data-depth={depth}
      data-kind="optional-add"
      data-testid={`treeitem-optional-${testKey}`}
      className="tree-item tree-item-optional"
    >
      <div
        className="tree-item-row"
        style={{ paddingLeft: `${depth * 16}px` }}
        data-row-for={`optional-${testKey}`}
        title={description ?? hintLabel}
      >
        {/* No chevron — placeholders are always leaves. The leading
            spacer matches the chevron column width so the label
            lines up with real TreeNode rows. */}
        <span className="tree-chevron-placeholder" aria-hidden="true" />
        <span className="tree-label tree-label-optional" data-testid={`label-optional-${testKey}`}>
          <span className="kind-dot kind-optional" aria-hidden="true" />
          <span className="tree-label-text">{label}</span>
        </span>
        <button
          type="button"
          aria-label={ariaLabel}
          onClick={handleAdd}
          className="tree-add-optional"
          data-testid={`add-optional-${testKey}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
