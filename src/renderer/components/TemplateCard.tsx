// TemplateCard — Sprint 13+ Stage 3.3 Task 2.
//
// A single presentational card for the New Project dialog's template
// picker. The card is *stateless* — it only renders a row from the
// IPC `templates:list` response plus a `selected` flag and an
// `onSelect(id)` callback. State management (fetching, selection
// lifting) lives in `TemplateCardRow`.
//
// Visual states (driven by CSS classes):
//   - default (available + unselected): subtle border, hoverable
//   - selected: accent border + tinted background
//   - disabled (coming soon): dimmed + not-allowed cursor; click
//     and Enter/Space are swallowed at the handler level
//
// Accessibility: a `role="button"` element with `aria-disabled` and
// `aria-pressed` so screen readers announce the selection / disabled
// state. The card is focusable (it's a real `<button>`) so keyboard
// users can Tab into it after the name input.

import type { Locale } from '@shared/i18n';
import { t } from '@shared/i18n';

import { useArxmlStore } from '../store/useArxmlStore.js';

import {
  getTemplateDescription,
  getTemplateDisplayName,
  isTemplateAvailable,
  type TemplateRow,
} from './templates.js';

import './TemplateCard.css';

interface TemplateCardProps {
  readonly template: TemplateRow;
  readonly selected: boolean;
  readonly onSelect: (templateId: string) => void;
}

export function TemplateCard({ template, selected, onSelect }: TemplateCardProps): JSX.Element {
  const locale: Locale = useArxmlStore((s) => s.locale);
  const available = isTemplateAvailable(template);
  const displayName = getTemplateDisplayName(locale, template);
  const description = getTemplateDescription(locale, template);

  const className = [
    'tpl-card',
    selected ? 'tpl-card--selected' : '',
    !available ? 'tpl-card--disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = (): void => {
    if (!available) return;
    onSelect(template.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (!available) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(template.id);
    }
  };

  return (
    <button
      type="button"
      className={className}
      data-testid={`tpl-card-${template.id}`}
      aria-disabled={!available}
      aria-pressed={selected}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {!available ? (
        <span className="tpl-card-soon" data-testid={`tpl-card-${template.id}-soon`}>
          {t(locale, 'template.comingSoon')}
        </span>
      ) : null}
      <span className="tpl-card-name" data-testid={`tpl-card-${template.id}-name`}>
        {displayName}
      </span>
      <span className="tpl-card-desc" data-testid={`tpl-card-${template.id}-desc`}>
        {description}
      </span>
      <span className="tpl-card-badge" data-testid={`tpl-card-${template.id}-badge`}>
        📁 {template.fileCount} {template.fileCount === 1 ? 'file' : 'files'}
      </span>
    </button>
  );
}
