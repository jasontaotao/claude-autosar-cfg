// ScriptLibrary — Sprint 14 #1 Phase C (T13) — left column of the
// ScriptPanel.
//
// Renders the project's scripts as a sortable, kind-filterable list.
// Click a row to select; the parent (ScriptPanel) owns selection
// state through the store. The "+" / "×" buttons drive the parent's
// new-script + delete-script flows.

import { useMemo, useState } from 'react';

import type { ScriptKind, ScriptSummary } from '@main/script/types';

import { t } from '@shared/i18n';

import { ScriptKindBadge } from './ScriptKindBadge';

export interface ScriptLibraryProps {
  readonly scripts: readonly ScriptSummary[];
  readonly selectedId: string | null;
  readonly locale: 'zh-CN' | 'en';
  readonly busy: boolean;
  readonly onSelect: (id: string) => void;
  readonly onNew: () => void;
  readonly onDelete: (id: string) => void;
}

type KindFilter = ScriptKind | 'all';

const KIND_FILTERS: readonly KindFilter[] = [
  'all',
  'validator',
  'transformer',
  'report',
  'free',
] as const;

export function ScriptLibrary({
  scripts,
  selectedId,
  locale,
  busy,
  onSelect,
  onNew,
  onDelete,
}: ScriptLibraryProps): JSX.Element {
  const [filter, setFilter] = useState<KindFilter>('all');

  const filtered = useMemo(() => {
    const list = filter === 'all' ? scripts.slice() : scripts.filter((s) => s.kind === filter);
    list.sort((a, b) => a.name.localeCompare(b.name, locale === 'zh-CN' ? 'zh-Hans' : 'en'));
    return list;
  }, [filter, scripts, locale]);

  return (
    <section className="script-library" aria-label={t(locale, 'script.lib.title')}>
      <header className="script-library-header">
        <h3>{t(locale, 'script.lib.title')}</h3>
        <button
          type="button"
          className="script-btn-new"
          onClick={onNew}
          disabled={busy}
          data-testid="script-btn-new"
          aria-label={t(locale, 'script.lib.new')}
        >
          {t(locale, 'script.lib.new')}
        </button>
      </header>
      <div className="script-library-filter" role="tablist" aria-label="filter by kind">
        {KIND_FILTERS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={filter === k}
            className={`script-filter-chip ${filter === k ? 'is-active' : ''}`}
            onClick={() => setFilter(k)}
            data-testid={`script-filter-${k}`}
          >
            {k === 'all' ? 'all' : k}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="script-library-empty">{t(locale, 'script.lib.empty')}</p>
      ) : (
        <ul className="script-library-list" role="listbox" data-testid="script-library-list">
          {filtered.map((s) => (
            <li
              key={s.id}
              className={`script-library-row ${selectedId === s.id ? 'is-selected' : ''}`}
              data-testid={`script-row-${s.id}`}
            >
              <button
                type="button"
                className="script-library-row-main"
                onClick={() => onSelect(s.id)}
                data-testid={`script-select-${s.id}`}
                aria-pressed={selectedId === s.id}
              >
                <ScriptKindBadge kind={s.kind} locale={locale} />
                <span className="script-library-name">{s.name}</span>
              </button>
              <button
                type="button"
                className="script-library-row-delete"
                onClick={() => onDelete(s.id)}
                disabled={busy}
                title={t(locale, 'script.lib.delete')}
                aria-label={`${t(locale, 'script.lib.delete')} ${s.name}`}
                data-testid={`script-delete-${s.id}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}