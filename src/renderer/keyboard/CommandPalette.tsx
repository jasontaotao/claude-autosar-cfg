// src/renderer/keyboard/CommandPalette.tsx
// v1.6.0 Cluster U — VS Code-style command palette (Cmd-K / Ctrl-K).
//
// Pure presentational component: takes `commands` + handlers from the
// host, renders a dialog with a filterable list. State (query,
// selectedIndex) is internal; the host only learns of `onExecute(id)`
// when the user picks a row.
//
// A11y (WCAG 2.2 AA — U spec §6.5):
//   - `<div role="dialog" aria-modal="true">` announces the modal
//   - `<input>` auto-focuses on open; Escape closes
//   - Empty state uses `role="status" aria-live="polite"`
//   - Selected row carries `aria-selected="true"`
//
// Reuses `t()` from `@shared/i18n` for the empty-state copy.

import { useEffect, useMemo, useRef, useState, type JSX } from 'react';

import { t } from '@shared/i18n';

import { trapFocus } from './a11y/focusTrap.js';
import { bindingToAriaKeyshortcuts } from './a11y/ariaKeyshortcuts.js';
import type { CommandCategory } from './ShortcutRegistry.js';

export interface PaletteCommand {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly bindings: readonly string[];
  readonly category: CommandCategory;
}

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly commands: readonly PaletteCommand[];
  readonly locale: 'zh-CN' | 'en';
  readonly onExecute: (id: string) => void;
  readonly onClose: () => void;
}

export function CommandPalette({
  open,
  commands,
  locale,
  onExecute,
  onClose,
}: CommandPaletteProps): JSX.Element | null {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  // Remember the element that opened the palette so we can restore
  // focus on close (WCAG 2.4.3 Focus Order).
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Filter commands by case-insensitive substring match on label +
  // description + id. Computed via useMemo so typing stays cheap.
  const filtered = useMemo<readonly PaletteCommand[]>(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return commands;
    return commands.filter((c) => {
      const hay = `${c.label} ${c.description} ${c.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [commands, query]);

  // Reset selection when the filtered list shrinks past the cursor.
  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(filtered.length > 0 ? 0 : 0);
    }
  }, [filtered.length, selectedIndex]);

  // Focus management: capture opener, install focus trap on open,
  // release on close (per U spec §6.5 + WCAG 2.2 AA).
  useEffect(() => {
    if (!open) return;
    const dialog = document.querySelector('.command-palette-panel');
    if (dialog instanceof HTMLElement) {
      const handle = trapFocus(dialog);
      return () => {
        handle.release();
        previouslyFocused.current?.focus();
      };
    }
    return undefined;
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length === 0) return;
      setSelectedIndex((i) => (i + 1) % filtered.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length === 0) return;
      setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[selectedIndex];
      if (cmd === undefined) return;
      onExecute(cmd.id);
      onClose();
      return;
    }
  };

  const onItemClick = (idx: number, cmd: PaletteCommand): void => {
    setSelectedIndex(idx);
    onExecute(cmd.id);
    onClose();
  };

  const noResultsId = 'command-palette-empty';

  return (
    <div
      className="command-palette-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t(locale, 'commandPalette.title')}
      data-testid="command-palette"
    >
      <div className="command-palette-panel">
        <input
          ref={inputRef}
          type="text"
          className="command-palette-input"
          placeholder={t(locale, 'commandPalette.placeholder')}
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setSelectedIndex(0);
          }}
          onKeyDown={onKeyDown}
          aria-controls="command-palette-list"
          aria-autocomplete="list"
          data-testid="command-palette-input"
        />
        {filtered.length === 0 ? (
          <div
            id={noResultsId}
            className="command-palette-empty"
            role="status"
            aria-live="polite"
          >
            {t(locale, 'commandPalette.noResults')}
          </div>
        ) : (
          <ul
            id="command-palette-list"
            ref={listRef}
            className="command-palette-list"
            role="listbox"
          >
            {filtered.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <li
                  key={cmd.id}
                  role="option"
                  aria-selected={isSelected}
                  className={`command-palette-item ${isSelected ? 'is-selected' : ''}`}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={() => onItemClick(idx, cmd)}
                  data-testid={`command-palette-item-${cmd.id}`}
                >
                  <span className="command-palette-item-label">{cmd.label}</span>
                  <span className="command-palette-item-desc">{cmd.description}</span>
                  <span className="command-palette-item-bindings">
                    {cmd.bindings.join(' · ')}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}