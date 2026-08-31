// P2 (spec §4.2) — centered empty-state guidance for the main editing
// area. Reuses the header's existing project actions via callbacks
// passed down from App (props-down; no new store slice).
import { type JSX } from 'react';

import { t, type Locale } from '../../../shared/i18n/index.js';
import './ParamEditorEmptyState.css';

export interface ParamEditorEmptyStateProps {
  readonly locale: Locale;
  readonly onOpenProject?: () => void;
  readonly onNewProject?: () => void;
}

export function ParamEditorEmptyState({
  locale,
  onOpenProject,
  onNewProject,
}: ParamEditorEmptyStateProps): JSX.Element {
  return (
    <section
      className="param-editor-empty"
      aria-label="Parameter editor"
      data-testid="param-editor-empty-state"
    >
      <span className="param-editor-empty__icon" aria-hidden="true">
        🗂
      </span>
      <h2 className="param-editor-empty__title">{t(locale, 'editor.empty.title')}</h2>
      <p className="param-editor-empty__hint">{t(locale, 'editor.empty.hint')}</p>
      <div className="param-editor-empty__actions">
        {onOpenProject !== undefined && (
          <button type="button" className="app-btn" onClick={onOpenProject}>
            {t(locale, 'app.project.open')}
          </button>
        )}
        {onNewProject !== undefined && (
          <button type="button" className="app-btn" onClick={onNewProject}>
            {t(locale, 'editor.empty.newProject')}
          </button>
        )}
      </div>
    </section>
  );
}
