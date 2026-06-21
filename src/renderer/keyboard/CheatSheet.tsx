// src/renderer/keyboard/CheatSheet.tsx
// v1.6.0 Cluster U — "Press ?" keyboard shortcuts reference dialog.
//
// Renders the full shortcut catalog grouped by category. Pure
// presentational: takes the categorized data + handlers from the host.
// The host builds the data via `registry.byCategory()` + i18n lookup.
//
// A11y (WCAG 2.2 AA — U spec §6.5):
//   - `role="dialog" aria-modal="true"` announces the modal
//   - Search input + Esc close + click-outside close
//   - Each section uses `<section aria-labelledby>` for SR navigation
//
// Per `react/coding-style.md` the file uses `type Props = {}` (closed
// component shape) and destructure props in the parameter list.

import { useEffect, useMemo, useRef, useState, type JSX } from 'react';

import { t, type MessageKey } from '@shared/i18n';

import type { CommandCategory } from './ShortcutRegistry.js';

export interface CheatSheetEntry {
  readonly commandId: string;
  readonly label: string;
  readonly bindingsDisplay: readonly string[];
}

export interface CheatSheetSection {
  readonly category: CommandCategory;
  readonly categoryLabelKey: MessageKey;
  readonly items: readonly CheatSheetEntry[];
}

export interface CheatSheetProps {
  readonly open: boolean;
  readonly sections: readonly CheatSheetSection[];
  readonly locale: 'zh-CN' | 'en';
  readonly onClose: () => void;
}

export function CheatSheet({
  open,
  sections,
  locale,
  onClose,
}: CheatSheetProps): JSX.Element | null {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Filter sections by search query (label + binding).
  const filtered = useMemo<readonly CheatSheetSection[]>(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return sections;
    return sections
      .map((s) => {
        const items = s.items.filter((it) => {
          const hay = `${it.label} ${it.bindingsDisplay.join(' ')}`.toLowerCase();
          return hay.includes(q);
        });
        return { ...s, items };
      })
      .filter((s) => s.items.length > 0);
  }, [sections, query]);

  // Focus management: capture opener, focus input on open, restore on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('keydown', onKey);
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="cheat-sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t(locale, 'cheatSheet.title')}
      data-testid="cheat-sheet"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cheat-sheet-panel">
        <header className="cheat-sheet-header">
          <h2 className="cheat-sheet-title">{t(locale, 'cheatSheet.title')}</h2>
          <button
            type="button"
            className="cheat-sheet-close"
            onClick={onClose}
            aria-label={t(locale, 'cheatSheet.closeAria')}
            data-testid="cheat-sheet-close"
          >
            ×
          </button>
        </header>
        <input
          ref={inputRef}
          type="text"
          className="cheat-sheet-search"
          placeholder={t(locale, 'cheatSheet.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          data-testid="cheat-sheet-search"
        />
        <div className="cheat-sheet-body">
          {filtered.length === 0 ? (
            <p className="cheat-sheet-empty">{t(locale, 'commandPalette.noResults')}</p>
          ) : (
            filtered.map((section) => (
              <section
                key={section.category}
                className="cheat-sheet-section"
                aria-labelledby={`cheat-sheet-${section.category}`}
              >
                <h3 id={`cheat-sheet-${section.category}`} className="cheat-sheet-section-title">
                  {t(locale, section.categoryLabelKey)}
                </h3>
                <ul className="cheat-sheet-list">
                  {section.items.map((item) => (
                    <li
                      key={item.commandId}
                      className="cheat-sheet-item"
                      data-testid={`cheat-sheet-item-${item.commandId}`}
                    >
                      <span className="cheat-sheet-item-label">{item.label}</span>
                      <span className="cheat-sheet-item-bindings">
                        {item.bindingsDisplay.join(' / ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
