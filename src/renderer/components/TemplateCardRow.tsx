// TemplateCardRow — Sprint 13+ Stage 3.3 Task 3.
//
// Container for the 3 template cards rendered below the project name
// input in `NewProjectDialog`. Responsibilities:
//
//   1. Fetch the template list from the main process via
//      `window.autosarApi.listTemplates()` on mount.
//   2. Render one `TemplateCard` per returned template, plus an
//      `Empty`-only fallback when the IPC fails or returns an empty
//      list (so the dialog never breaks).
//   3. Forward the `selectedId` / `onSelect` pair to each card.
//
// The component is *not* aware of the form (project name, directory).
// It is purely a view-layer wrapper around the IPC. State lifting
// (selectedTemplateId) lives in `NewProjectDialog`.

import { useEffect, useState } from 'react';

import type { Locale } from '@shared/i18n';
import { t } from '@shared/i18n';
import type { TemplateListResponse } from '@shared/types';

import { useArxmlStore } from '../store/useArxmlStore.js';

import { TemplateCard } from './TemplateCard.js';
import { type TemplateRow } from './templates.js';

// ---------------------------------------------------------------------------
// AutosarApi subset we touch. Typed narrowly so tests can stub
// `window.autosarApi` without pulling in the whole preload bridge.
// ---------------------------------------------------------------------------

interface AutosarApiLike {
  readonly listTemplates: () => Promise<TemplateListResponse>;
}

// ---------------------------------------------------------------------------
// Hard-coded fallback for the "no templates on disk" case. The
// renderer's job is to keep the user productive even when the main
// process hasn't shipped the samples dir — so we always offer Empty.
// ---------------------------------------------------------------------------

const FALLBACK_TEMPLATES: readonly TemplateRow[] = [
  {
    id: 'empty',
    displayNameKey: 'template.empty.displayName',
    descriptionKey: 'template.empty.description',
    fileCount: 0,
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TemplateCardRowProps {
  readonly selectedId: string | null;
  readonly onSelect: (templateId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplateCardRow({ selectedId, onSelect }: TemplateCardRowProps): JSX.Element {
  const locale: Locale = useArxmlStore((s) => s.locale);
  const [templates, setTemplates] = useState<readonly TemplateRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const api = (globalThis as { window?: { autosarApi?: AutosarApiLike } }).window?.autosarApi;
    if (api === undefined || typeof api.listTemplates !== 'function') {
      // No preload bridge (jsdom without the stub), or the stub is
      // a partial that doesn't include listTemplates (e.g. an older
      // App test fixture). Still show Empty so the layout doesn't
      // collapse; a real renderer build always has the full bridge.
      setTemplates(FALLBACK_TEMPLATES);
      return (): void => {
        cancelled = true;
      };
    }
    void api
      .listTemplates()
      .then((res) => {
        if (cancelled) return;
        if (res.templates.length === 0) {
          setTemplates(FALLBACK_TEMPLATES);
        } else {
          setTemplates(res.templates);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Defensive: log the failure so a future regression is visible,
        // but degrade to the Empty-only fallback so the dialog still
        // works. The user can create an Empty project regardless.
        // eslint-disable-next-line no-console
        console.warn('[TemplateCardRow] listTemplates() failed; falling back to Empty', err);
        setTemplates(FALLBACK_TEMPLATES);
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

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
         * The "loading" slot below is rendered only when the IPC
         * promise has not yet resolved. After resolution the effect
         * always sets `templates` to a non-empty array (either the
         * IPC response or the Empty fallback) so the skeleton never
         * lingers beyond a paint.
         */}
        {templates.length === 0 ? (
          <div className="tpl-card-skeleton" data-testid="tpl-card-skeleton" aria-busy="true" />
        ) : null}
      </div>
    </div>
  );
}
