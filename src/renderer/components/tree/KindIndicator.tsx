// KindIndicator.tsx — accessible type indicator for ARXML tree rows.
//
// Product note: the old 7px colored dot encoded node type by color only.
// This component keeps the stable `kind-dot-*` testids/classes for tests and
// layout persistence, but renders a shape-based SVG icon and a localized
// tooltip/aria-label so the meaning is discoverable without a legend.

export type IndicatorKind = 'module' | 'container' | 'reference' | 'collection' | 'bswmd';

function IconFor({ kind }: { readonly kind: IndicatorKind }): JSX.Element {
  const common = {
    className: 'kind-icon-svg',
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (kind === 'module') {
    return (
      <svg {...common}>
        <path d="M8 2.2l5.2 2.6v5.4L8 12.8l-5.2-2.6V4.8z" />
        <path d="M2.8 4.8L8 7.4l5.2-2.6" />
        <path d="M8 7.4v5.4" />
      </svg>
    );
  }
  if (kind === 'container') {
    return (
      <svg {...common}>
        <path d="M2.5 4.5A1.5 1.5 0 0 1 4 3h2.4l1.4 1.6h4.7A1.5 1.5 0 0 1 14 6.1v5.4a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 3 11.5z" />
      </svg>
    );
  }
  if (kind === 'reference') {
    return (
      <svg {...common}>
        <path d="M9.5 6.5l-3 3" />
        <path d="M7.2 4.8l1.4-1.4a2.3 2.3 0 0 1 3.2 3.2l-1.4 1.4" />
        <path d="M8.8 11.2l-1.4 1.4a2.3 2.3 0 0 1-3.2-3.2l1.4-1.4" />
      </svg>
    );
  }
  if (kind === 'collection') {
    return (
      <svg {...common}>
        <path d="M8 2.7l5.5 2.8L8 8.3 2.5 5.5z" />
        <path d="M2.5 8.7L8 11.5l5.5-2.8" />
        <path d="M2.5 11.4L8 14.2l5.5-2.8" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <ellipse cx="8" cy="4.2" rx="5" ry="1.8" />
      <path d="M3 4.2v7.6c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V4.2" />
      <path d="M3 8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8" />
    </svg>
  );
}

export function KindIndicator({
  kind,
  label,
}: {
  readonly kind: IndicatorKind;
  readonly label: string;
}): JSX.Element {
  return (
    <span
      className={`kind-dot kind-${kind}`}
      data-testid={`kind-dot-${kind}`}
      role="img"
      aria-label={label}
      title={label}
    >
      <IconFor kind={kind} />
    </span>
  );
}
