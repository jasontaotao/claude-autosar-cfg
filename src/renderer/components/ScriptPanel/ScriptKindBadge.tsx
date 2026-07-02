// ScriptKindBadge — Sprint 14 #1 Phase C (T13) — colour-coded chip
// showing the script's kind (validator / transformer / report / free).
//
// v1.21.0 Bug #2 (CRITICAL: 脚本界面丑 + 不知道干啥) — the chip used
// to render a single-letter label (V/T/R/F) with a `title` that
// duplicated the kind name. User feedback was "不知道干啥" — the
// letters were too cryptic and the tooltip added zero information.
//
// The chip now renders the LOCALIZED full kind name (the same string
// we already keyed in i18n) and carries a `title` showing the kind's
// PURPOSE (e.g. "Reads ARXML and flags rule violations"). The colour
// still comes from the per-kind CSS class so scan-ability is
// preserved — at a glance the user reads "Validator" or "校验" plus
// the colour, and a hover reveals what that kind actually does.
//
// a11y note (post-v1.21.0 code-review HIGH-1): the badge is a
// non-interactive `<span>`. Setting `aria-label={desc}` would REPLACE
// the visible text for screen readers (they'd hear only "Reads the
// loaded ARXML…" and never "Validator"). Instead the description is
// attached via `aria-describedby` + a visually-hidden span, so the
// assistive-tech announcement is "Validator, reads the loaded ARXML
// and flags rule violations" — both pieces, in order.
//
// Pure presentational — no state, no store access.

import { t } from '@shared/i18n';
import type { Locale } from '@shared/i18n';
import type { ScriptKind } from '@shared/script/types';

export interface ScriptKindBadgeProps {
  readonly kind: ScriptKind;
  readonly locale: Locale;
}

const KIND_TO_NAME_KEY: Record<ScriptKind, string> = {
  validator: 'script.kind.validator',
  transformer: 'script.kind.transformer',
  report: 'script.kind.report',
  free: 'script.kind.free',
};

const KIND_TO_DESC_KEY: Record<ScriptKind, string> = {
  validator: 'script.kind.validator.desc',
  transformer: 'script.kind.transformer.desc',
  report: 'script.kind.report.desc',
  free: 'script.kind.free.desc',
};

export function ScriptKindBadge({ kind, locale }: ScriptKindBadgeProps): JSX.Element {
  const name = t(locale, KIND_TO_NAME_KEY[kind] as 'script.kind.validator');
  const desc = t(locale, KIND_TO_DESC_KEY[kind] as 'script.kind.validator.desc');
  const descId = `script-kind-desc-${kind}`;
  return (
    <span
      className={`script-kind-badge script-kind-${kind}`}
      data-testid={`script-kind-${kind}`}
      title={desc}
      aria-describedby={descId}
    >
      {name}
      <span id={descId} className="sr-only">
        {desc}
      </span>
    </span>
  );
}
