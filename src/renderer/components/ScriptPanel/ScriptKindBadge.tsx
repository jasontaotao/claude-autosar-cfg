// ScriptKindBadge — Sprint 14 #1 Phase C (T13) — colour-coded chip
// showing the script's kind (validator / transformer / report / free).
//
// Single-character label (V / T / R / F) with a kind-specific CSS
// class so the colour comes from the stylesheet. Pure presentational
// component — no state, no store access.

import type { ScriptKind } from '@main/script/types';
import { t } from '@shared/i18n';
import type { Locale } from '@shared/i18n';

export interface ScriptKindBadgeProps {
  readonly kind: ScriptKind;
  readonly locale: Locale;
}

const KIND_TO_KEY: Record<ScriptKind, string> = {
  validator: 'script.kind.validator',
  transformer: 'script.kind.transformer',
  report: 'script.kind.report',
  free: 'script.kind.free',
};

const KIND_TO_LETTER: Record<ScriptKind, string> = {
  validator: 'V',
  transformer: 'T',
  report: 'R',
  free: 'F',
};

export function ScriptKindBadge({ kind, locale }: ScriptKindBadgeProps): JSX.Element {
  const label = t(locale, KIND_TO_KEY[kind] as 'script.kind.validator');
  const letter = KIND_TO_LETTER[kind];
  return (
    <span
      className={`script-kind-badge script-kind-${kind}`}
      data-testid={`script-kind-${kind}`}
      title={label}
      aria-label={label}
    >
      {letter}
    </span>
  );
}