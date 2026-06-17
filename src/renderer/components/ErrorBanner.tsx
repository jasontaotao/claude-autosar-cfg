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
import { useState } from 'react';

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
  const error = useArxmlStore((s) => s.error);
  const setError = useArxmlStore((s) => s.setError);
  const [viewerOpen, setViewerOpen] = useState(false);

  if (error === null) return null;

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
      <div className="error-banner" role="alert" aria-live="assertive" data-testid="error-banner">
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
          <button
            type="button"
            className="error-banner-btn error-banner-dismiss"
            onClick={() => setError(null)}
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
