// StencilWizard > FamilyPicker (Task 6).
//
// Plain <select> bound to `value` / `onChange` so the parent owns the
// state. The 4 options are the AUTOSAR module families the wizard
// can generate: com / comm / pdur / ecuc. Labels come from the i18n
// bundle (`stencil.family.*`); default option order matches the
// builder dispatcher in `src/main/stencil/builder.ts`.

import type { Locale } from '@shared/i18n';
import { t } from '@shared/i18n';

import type { StencilFamily } from '../../../main/stencil/types.js';

interface FamilyPickerProps {
  readonly value: StencilFamily;
  readonly onChange: (value: StencilFamily) => void;
  readonly locale: Locale;
}

const FAMILIES: readonly StencilFamily[] = ['com', 'comm', 'pdur', 'ecuc'];

export function FamilyPicker({ value, onChange, locale }: FamilyPickerProps): JSX.Element {
  return (
    <select
      className="stencil-family"
      data-testid="stencil-family"
      aria-label={t(locale, 'stencil.title')}
      value={value}
      onChange={(e) => onChange(e.target.value as StencilFamily)}
    >
      {FAMILIES.map((family) => (
        <option key={family} value={family}>
          {t(locale, `stencil.family.${family}` as const)}
        </option>
      ))}
    </select>
  );
}
