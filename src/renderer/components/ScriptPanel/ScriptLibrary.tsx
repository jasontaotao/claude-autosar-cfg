// ScriptLibrary — Sprint 14 #1 Phase C (T13) — left column of the
// ScriptPanel.
//
// Renders the project's scripts as a sortable, kind-filterable list.
// Click a row to select; the parent (ScriptPanel) owns selection
// state through the store. The "+" / "×" buttons drive the parent's
// new-script + delete-script flows.

import { useMemo, useState } from 'react';

import { t } from '@shared/i18n/index.js';
import type { ScriptKind, ScriptSummary } from '@shared/script/types';

import { ScriptKindBadge } from './ScriptKindBadge';

export interface ScriptLibraryProps {
  readonly scripts: readonly ScriptSummary[];
  readonly selectedId: string | null;
  readonly locale: 'zh-CN' | 'en';
  readonly busy: boolean;
  /**
   * Bug #2 code-review MEDIUM — onboarding flicker. The store starts
   * with `scripts: []` and `initialized: false`. Before the first
   * `loadScripts()` IPC reply, an existing-script user would see
   * the onboarding banner for 1-2 frames. The parent (ScriptPanel)
   * passes `initialized` here so the library can distinguish
   * "loading" from "no scripts at all".
   */
  readonly initialized: boolean;
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
  initialized,
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
        // 3-state matrix (Bug #2 code-review MEDIUM fix):
        //   1. `!initialized` — first load still in flight. Show a
        //      neutral "—" placeholder so existing-script users do
        //      NOT see "Create your first script" for 1-2 frames.
        //   2. `initialized && scripts.length === 0` — first-run
        //      onboarding banner.
        //   3. `initialized && scripts.length > 0 && filtered empty`
        //      — the kind filter is hiding everything. Old hint.
        !initialized ? (
          <p className="script-library-empty muted">—</p>
        ) : scripts.length === 0 ? (
          <ScriptOnboarding locale={locale} onCta={onNew} disabled={busy} />
        ) : (
          <p className="script-library-empty">{t(locale, 'script.lib.empty')}</p>
        )
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

// ScriptOnboarding — v1.21.0 Bug #2 first-run onboarding.
//
// Sub-component, NOT exported (internal-only). Shown by ScriptLibrary
// when scripts.length === 0 so a brand-new user sees what scripts
// are for, what the four kinds do, and how to start. Co-located in
// this file because:
//   1. The only caller is the empty-state branch two screens up.
//   2. The 4-kind cheat sheet reuses <ScriptKindBadge /> for visual
//      consistency with the regular row badges, so the colour cue
//      ("ah, the validator I want is the blue one") survives the
//      first-run → ongoing transition.
//
// Co-located, not a separate file, because it's a few dozen lines of
// presentational JSX with no logic worth isolating. Extracting it
// would add a directory hop without changing any boundary.

interface ScriptOnboardingProps {
  readonly locale: 'zh-CN' | 'en';
  readonly onCta: () => void;
  readonly disabled: boolean;
}

interface OnboardingKindRow {
  readonly kind: ScriptKind;
  readonly hintKey: `script.onboarding.kind${Capitalize<ScriptKind>}Hint`;
}

const ONBOARDING_KINDS: readonly OnboardingKindRow[] = [
  { kind: 'validator', hintKey: 'script.onboarding.kindValidatorHint' },
  { kind: 'transformer', hintKey: 'script.onboarding.kindTransformerHint' },
  { kind: 'report', hintKey: 'script.onboarding.kindReportHint' },
  { kind: 'free', hintKey: 'script.onboarding.kindFreeHint' },
];

function ScriptOnboarding({ locale, onCta, disabled }: ScriptOnboardingProps): JSX.Element {
  return (
    <div className="script-onboarding" data-testid="script-onboarding">
      <h4 className="script-onboarding-title">{t(locale, 'script.onboarding.title')}</h4>
      <p className="script-onboarding-desc">{t(locale, 'script.onboarding.description')}</p>
      <ul className="script-onboarding-kinds">
        {ONBOARDING_KINDS.map(({ kind, hintKey }) => (
          <li
            key={kind}
            className="script-onboarding-kind"
            data-testid={`script-onboarding-kind-${kind}`}
          >
            <ScriptKindBadge kind={kind} locale={locale} />
            <span className="script-onboarding-kind-hint">{t(locale, hintKey)}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="script-onboarding-cta"
        onClick={onCta}
        disabled={disabled}
        data-testid="script-onboarding-cta"
      >
        {t(locale, 'script.onboarding.cta')}
      </button>
    </div>
  );
}
