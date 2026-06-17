// TemplateCardRow — Sprint 13+ Stage 3.3 Task 3 + Stage 3.4 lift-state.
//
// Container for the 3 template cards rendered below the project name
// input in `NewProjectDialog`. Stage 3.4 redesigns the data flow:
// the row no longer owns the IPC fetch — it receives a fully
// resolved `templates` array from its host (`NewProjectDialog`).
// The dialog needs the per-template metadata (specifically
// `bswmdPaths` for Stage 3.4 chips) and lifting the fetch to the
// host is the cleanest way to give the dialog access to it without
// threading getters/callbacks through the row.
//
// Why not keep the fetch here? Stage 3.3 put the fetch in the row
// to keep the dialog body small. With Stage 3.4 the dialog needs
// the same `TemplateRow[]` to render `BswmdChipRow` underneath,
// so duplicating the fetch would be a smell. We instead hoist the
// IPC call to the dialog and pass the resolved list down. The row
// becomes a pure controlled view.
//
// The row still owns:
//   - rendering one `TemplateCard` per row
//   - the i18n label
//   - the loading skeleton (it tracks `loading` directly so we
//     don't need a separate prop for that state)

import type { Locale } from '@shared/i18n';
import { t } from '@shared/i18n';

import { useArxmlStore } from '../store/useArxmlStore.js';

import { TemplateCard } from './TemplateCard.js';
import { type TemplateRow } from './templates.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TemplateCardRowProps {
  readonly templates: readonly TemplateRow[];
  readonly selectedId: string | null;
  readonly onSelect: (templateId: string) => void;
  /** True while the host's IPC fetch is still in flight. The row
   *  shows a skeleton instead of an empty grid. */
  readonly loading: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplateCardRow({
  templates,
  selectedId,
  onSelect,
  loading,
}: TemplateCardRowProps): JSX.Element {
  const locale: Locale = useArxmlStore((s) => s.locale);

  return (
    <div className="npd-template-row" data-testid="tpl-card-row">
      <div className="npd-template-row-label" data-testid="tpl-card-row-label">
        {t(locale, 'newProject.templateLabel')}
      </div>
      <div className="npd-template-row-grid">
        {templates.map((tmpl) => (
          <TemplateCard
            key={tmpl.id}
            template={tmpl}
            selected={selectedId === tmpl.id}
            onSelect={onSelect}
          />
        ))}
        {/*
         * The "loading" slot is rendered only while the host's IPC
         * promise has not yet resolved. Once `templates` is non-empty
         * the skeleton goes away and the cards take their place.
         */}
        {loading && templates.length === 0 ? (
          <div className="tpl-card-skeleton" data-testid="tpl-card-skeleton" aria-busy="true" />
        ) : null}
      </div>
    </div>
  );
}
