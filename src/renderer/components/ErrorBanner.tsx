// ErrorBanner — full-width strip mounted below AppHeader.
//
// Sprint 13+ — the previous inline `<span className="app-header-error">`
// lived in the AppHeader right-corner with `max-width: 30vw` and
// `text-overflow: ellipsis`, so any error with multi-segment content
// (a parsr message, a translated i18n wrap, an IPC read-failed message
// that already includes file paths + bytes) was clipped at one line.
// The user-visible UX was "the error is too small to read".
//
// The new banner sits between AppHeader and `<main>` so it gets the
// full viewport width. It preserves whitespace (so multi-line parser
// errors stay readable), caps its own height with overflow scroll
// (so a 12-paragraph error doesn't push the rest of the UI off the
// screen), exposes Copy (so users can paste the full text into a bug
// report) and Dismiss (matches the existing dismiss-button contract).
//
// Clicking the message body opens <ErrorViewerModal /> — a dedicated
// modal that shows the same text in a larger monospace view for the
// case where even the banner's capped height isn't enough. The banner
// already covers the common case; the modal is the "view 窗口" the
// user explicitly asked for in the Sprint 13+ follow-up.

import type { JSX } from 'react';
import { useEffect, useState } from 'react';

import { t } from '@shared/i18n';

import { useArxmlStore } from '../store/useArxmlStore';

import { ErrorViewerModal } from './ErrorViewerModal';

import './ErrorBanner.css';

// Internal cap on how tall the inline banner can grow before it
// scrolls. The exact pixel value is set in CSS — keep this in sync
// with the value in styles.css under `.error-banner-message`.
const MAX_BANNER_LINES = 6;

interface ErrorBannerProps {
  /** When true, render only when store.error is non-null. */
  readonly testIdPrefix?: string;
}

export function ErrorBanner(_props: ErrorBannerProps = {}): JSX.Element | null {
  const locale = useArxmlStore((s) => s.locale);
  // Sprint 17b T6 — read the typed `toast` field. The four kinds
  // (error/warning/info/success) map 1:1 to CSS modifier classes
  // (red/amber/blue/green) and drive the auto-dismiss timer. The
  // legacy `error: string | null` field is kept in sync by every
  // setter, but the banner only needs the typed view.
  const toast = useArxmlStore((s) => s.toast);
  const dismissToast = useArxmlStore((s) => s.dismissToast);
  const [viewerOpen, setViewerOpen] = useState(false);

  // Sprint 17b T6 — auto-dismiss. `error` is manual only (no
  // autoDismissMs); the other three kinds stamp a default timeout
  // (3s info/success, 5s warning) on the setter side. We re-schedule
  // whenever the toast changes (deps: `toast`) so a user-triggered
  // update to the same kind re-arms the timer from scratch.
  useEffect(() => {
    if (toast === null) return;
    const ms = toast.autoDismissMs;
    if (ms === undefined || ms <= 0) return;
    const id = setTimeout(dismissToast, ms);
    return () => clearTimeout(id);
  }, [toast, dismissToast]);

  if (toast === null) return null;

  const { kind, message, autoDismissMs, action } = toast;
  // Local rename keeps the existing JSX readable; `message` and
  // `error` are semantically the same string.
  const error = message;
  // ARIA: errors are assertive (interrupt the user) because they
  // demand acknowledgment; the other three kinds are polite (wait
  // for an idle moment) so a flurry of success toasts doesn't
  // derail the user's typing.
  const ariaLive = kind === 'error' ? 'assertive' : 'polite';
  // ARIA label: kind-specific notification announcement. The button
  // title stays generic ("click to view full message") so the
  // affordance text doesn't duplicate the kind hint.
  const kindAriaKey =
    kind === 'warning'
      ? 'app.error.warningAria'
      : kind === 'info'
        ? 'app.error.infoAria'
        : kind === 'success'
          ? 'app.error.successAria'
          : null;
  // `aria-label` is only set for the non-error kinds (errors already
  // carry the implicit "alert" semantics via `role="alert"`).
  // `data-auto-dismiss-ms` exposes the timer to E2E / debug tooling
  // without leaking it into the visible UI.
  const autoDismissAttr = autoDismissMs !== undefined && autoDismissMs > 0 ? autoDismissMs : null;

  // Line-count heuristic for "show 'view' affordance": once the message
  // exceeds the banner's visible cap, the "view" button lets the user
  // open the modal without having to scroll inside the banner. Below
  // the cap we hide the button so a short error doesn't carry noise.
  const lineCount = error.split('\n').length;
  const showViewButton = lineCount > MAX_BANNER_LINES || error.length > 280;

  const onCopy = (): void => {
    // Clipboard API. Wrapped in try/catch because some jsdom / older
    // Electron configs reject `navigator.clipboard.writeText`; the
    // banner still works without copy (just no clipboard affordance).
    try {
      void navigator.clipboard.writeText(error);
    } catch {
      // Silent — the user can still read + manually copy from the
      // banner / modal. Logged at debug level via store.error if the
      // hook layer adds telemetry later.
    }
  };

  return (
    <>
      <div
        className={`error-banner error-banner--${kind}`}
        role="alert"
        aria-live={ariaLive}
        data-testid="error-banner"
        data-auto-dismiss-ms={autoDismissAttr}
        aria-label={kindAriaKey === null ? undefined : t(locale, kindAriaKey)}
      >
        <button
          type="button"
          className="error-banner-message"
          onClick={() => setViewerOpen(true)}
          data-testid="error-banner-message"
          aria-label={t(locale, 'app.error.viewAria')}
          title={t(locale, 'app.error.viewHint')}
        >
          {error}
        </button>
        <div className="error-banner-actions">
          {showViewButton && (
            <button
              type="button"
              className="error-banner-btn"
              onClick={() => setViewerOpen(true)}
              data-testid="error-banner-view"
            >
              {t(locale, 'app.error.view')}
            </button>
          )}
          <button
            type="button"
            className="error-banner-btn"
            onClick={onCopy}
            data-testid="error-banner-copy"
            aria-label={t(locale, 'app.error.copyAria')}
          >
            {t(locale, 'app.error.copy')}
          </button>
          {/* Sprint 17 PATCH — optional action button (Undo etc). Renders
              only when toast.action is set. Click invokes the caller's
              onActivate; the caller is responsible for dismissToast. */}
          {action !== undefined && (
            <button
              type="button"
              className="error-banner-btn error-banner-action"
              onClick={action.onActivate}
              data-testid="error-banner-action"
            >
              {action.label}
            </button>
          )}
          <button
            type="button"
            className="error-banner-btn error-banner-dismiss"
            onClick={() => dismissToast()}
            data-testid="error-banner-dismiss"
            aria-label={t(locale, 'app.error.dismissAria')}
          >
            ×
          </button>
        </div>
      </div>
      {viewerOpen && <ErrorViewerModal message={error} onClose={() => setViewerOpen(false)} />}
    </>
  );
}
