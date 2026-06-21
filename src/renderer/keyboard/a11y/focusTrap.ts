// src/renderer/keyboard/a11y/focusTrap.ts
// v1.6.0 Cluster U — WCAG 2.2 AA focus trap for the CommandPalette
// and CheatSheet dialogs.
//
// Behavior:
//   - On mount, capture `document.activeElement` and focus the first
//     focusable element inside the container (or the container itself).
//   - On Tab from the last focusable element, wrap focus to the first.
//   - On Shift+Tab from the first focusable element, wrap to the last.
//   - On unmount, restore focus to the captured opener element.
//
// This module is intentionally framework-agnostic — it returns an
// imperative `trap` / `release` pair that the React component owns.

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'audio[controls]',
  'video[controls]',
].join(',');

export interface FocusTrapHandle {
  release(): void;
}

export function trapFocus(container: HTMLElement): FocusTrapHandle {
  const previouslyFocused = document.activeElement as HTMLElement | null;
  const focusable = getFocusable(container);
  if (focusable.length > 0 && focusable[0] !== undefined) {
    focusable[0].focus();
  } else {
    container.setAttribute('tabindex', '-1');
    container.focus();
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') return;
    const list = getFocusable(container);
    if (list.length === 0) {
      e.preventDefault();
      container.focus();
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    if (first === undefined || last === undefined) return;
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === first || active === container) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  document.addEventListener('keydown', onKeyDown);

  return {
    release(): void {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    },
  };
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
  return nodes.filter((el) => {
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    return true;
  });
}
