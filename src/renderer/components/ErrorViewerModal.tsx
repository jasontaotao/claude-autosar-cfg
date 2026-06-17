// ErrorViewerModal — dedicated "view 窗口" for the current store.error.
//
// Sprint 13+ follow-up to ErrorBanner. The banner is the always-visible
// quick read; this modal is the explicit "view window" the user asked
// for when long errors overflow even the banner's capped scroll area.
//
// Why a modal (not a side-panel / popover): the user described the
// desired affordance as "view 窗口" and modal semantics match — a
// dedicated window that pauses the workspace, focuses the message,
// and offers copy + close. Side panels would steal horizontal real
// estate from the already-narrow left column; a popover anchored to
// the banner would clip when the message is long.
//
// Portal target: `document.body` so the overlay sits above every
// workspace layer regardless of how the banner is mounted (sibling
// of AppHeader today; could move into LeftPanel later). z-index
// matches NewProjectDialog (9999) so this modal sits on the same
// top stack.

import type { JSX, MouseEvent } from 'react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { t } from '@shared/i18n';

import { useArxmlStore } from '../store/useArxmlStore';

const MODAL_Z_INDEX = 9999;

interface ErrorViewerModalProps {
  readonly message: string;
  readonly onClose: () => void;
}

export function ErrorViewerModal({ message, onClose }: ErrorViewerModalProps): JSX.Element | null {
  const locale = useArxmlStore((s) => s.locale);
  const setError = useArxmlStore((s) => s.setError);
  const copyBtnRef = useRef<HTMLButtonElement | null>(null);

  // Escape closes the modal (keyboard parity with NewProjectDialog /
  // ConfirmDialog).
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Backdrop click closes (but not clicks inside the panel).
  const onBackdropClick = (e: MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) onClose();
  };

  const onCopy = (): void => {
    try {
      void navigator.clipboard.writeText(message);
    } catch {
      // Same rationale as ErrorBanner — silently degrade.
    }
  };

  const onDismissAll = (): void => {
    setError(null);
    onClose();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="error-viewer-overlay"
      onClick={onBackdropClick}
      style={{ zIndex: MODAL_Z_INDEX }}
      data-testid="error-viewer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t(locale, 'app.error.viewerTitle')}
    >
      <div className="error-viewer-panel">
        <header className="error-viewer-header">
          <span className="error-viewer-title">{t(locale, 'app.error.viewerTitle')}</span>
          <button
            type="button"
            className="error-viewer-close"
            onClick={onClose}
            data-testid="error-viewer-close"
            aria-label={t(locale, 'app.error.viewerCloseAria')}
          >
            ×
          </button>
        </header>
        <pre className="error-viewer-body" data-testid="error-viewer-body">
          {message}
        </pre>
        <footer className="error-viewer-footer">
          <button
            ref={copyBtnRef}
            type="button"
            className="error-viewer-btn"
            onClick={onCopy}
            data-testid="error-viewer-copy"
          >
            {t(locale, 'app.error.copy')}
          </button>
          <button
            type="button"
            className="error-viewer-btn error-viewer-btn-danger"
            onClick={onDismissAll}
            data-testid="error-viewer-dismiss"
          >
            {t(locale, 'app.error.dismissAll')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
