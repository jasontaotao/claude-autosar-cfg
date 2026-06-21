// StencilWizard > ModeToggle (Task 6).
//
// Native radio group — 2 options (free / with-bswmd). The parent owns
// the state. Mirrors the inline `<input type="radio">` pattern used in
// `DiffTable.tsx` so we don't pull in a radio-group library.

import type { Locale } from '@shared/i18n';
import { t } from '@shared/i18n';

import type { StencilMode } from '../../../main/stencil/types.js';

interface ModeToggleProps {
  readonly value: StencilMode;
  readonly onChange: (value: StencilMode) => void;
  readonly locale: Locale;
}

export function ModeToggle({ value, onChange, locale }: ModeToggleProps): JSX.Element {
  return (
    <div className="stencil-mode" role="radiogroup" aria-label={t(locale, 'stencil.mode.free')}>
      <label className="stencil-mode-option">
        <input
          type="radio"
          name="stencil-mode"
          value="free"
          data-testid="stencil-mode-free"
          checked={value === 'free'}
          onChange={() => onChange('free')}
        />
        <span>{t(locale, 'stencil.mode.free')}</span>
      </label>
      <label className="stencil-mode-option">
        <input
          type="radio"
          name="stencil-mode"
          value="with-bswmd"
          data-testid="stencil-mode-withBswmd"
          checked={value === 'with-bswmd'}
          onChange={() => onChange('with-bswmd')}
        />
        <span>{t(locale, 'stencil.mode.withBswmd')}</span>
      </label>
    </div>
  );
}