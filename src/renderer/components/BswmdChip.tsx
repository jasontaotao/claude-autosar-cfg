// BswmdChip — Sprint 13+ Stage 3.4.
//
// A single toggleable chip for the BSWMD multi-select row inside
// `NewProjectDialog`. The chip is a real `<button type="button">`
// so it is keyboard-focusable out of the box; it announces the
// toggle state via `aria-pressed` so screen readers can hear the
// on/off transition.
//
// Presentational only — owns no state. The parent (`BswmdChipRow`)
// owns the selected-set and decides what to do when the user
// toggles a chip. This keeps the chip trivially testable (just
// feed it a `label` + `selected` + `onToggle` and assert behavior)
// and lets the parent batch updates if it ever needs to.
//
// Why a button and not a checkbox? The visual is closer to a
// "material chip" than a checkbox, and the chip sits inside a
// dialog body next to template cards (also buttons). Using a
// button keeps the keyboard tab order consistent.

interface BswmdChipProps {
  readonly label: string;
  readonly selected: boolean;
  readonly onToggle: () => void;
}

export function BswmdChip({ label, selected, onToggle }: BswmdChipProps): JSX.Element {
  const className = ['bswmd-chip', selected ? 'bswmd-chip--selected' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      aria-pressed={selected}
      data-testid={`bswmd-chip-${label}`}
      onClick={onToggle}
    >
      {label}
    </button>
  );
}
