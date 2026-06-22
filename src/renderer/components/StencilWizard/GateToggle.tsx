// StencilWizard > GateToggle (Task 6).
//
// Native checkbox bound to `checked` / `onChange`. The parent owns the
// state. The label comes from the i18n bundle
// (`stencil.gate.label`). The actual gate logic lives in the IPC
// handler — Task 8 wires `invokeSwsValidatorRun`; this component is
// purely presentational.

import type { Locale } from '@shared/i18n';
import { t } from '@shared/i18n';

interface GateToggleProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly locale: Locale;
}

export function GateToggle({ checked, onChange, locale }: GateToggleProps): JSX.Element {
  return (
    <label className="stencil-gate">
      <input
        type="checkbox"
        data-testid="stencil-gate"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{t(locale, 'stencil.gate.label')}</span>
    </label>
  );
}
