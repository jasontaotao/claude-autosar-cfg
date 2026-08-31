// ErrorBoundary — renderer-side React ErrorBoundary for the v1.18.0
// MINOR T7 (PB-4) crash-resilience batch.
//
// What it catches:
//   - Errors thrown during render, in lifecycle methods, or in the
//     constructors of any descendant component.
//   - Errors thrown inside React's reconciler itself (rare; the
//     boundary is the recommended catch-all per React docs).
//
// What it does NOT catch (out of scope for this layer):
//   - Main-process crashes — those are caught by the webContents
//     event handlers wired in src/main/index.ts (commit 3393e8b, PB-1).
//   - Errors inside event handlers, async code, or setTimeout callbacks
//     unless they bubble up into render — for those, callers should
//     surface failures into the store-backed ErrorBanner instead.
//   - Server-side rendering — we are Electron renderer only.
//
// Why a class component:
//   React 18 has no functional ErrorBoundary equivalent. React 19's
//   `use()` hook can unwrap contexts/promises but does not replace
//   `getDerivedStateFromError` + `componentDidCatch`. The project is
//   pinned to React 18.3.1, so the class API is the only option.
//   `componentDidCatch` is also the recommended place for logging —
//   keep it here so production debugging signals land somewhere
//   observable.
//
// Reset semantics:
//   The captured error lives in component state. Resetting calls
//   `setState({ error: null })` which causes `render()` to return
//   `this.props.children` again. The children re-mount at that point,
//   so any local state they held (useState etc.) is fresh — this is
//   the desired "blank slate" UX after a render crash.
//
// Custom fallback:
//   Tests and callers can supply a `fallback` render-prop to swap the
//   default UI for a branded or context-aware one. The render-prop
//   receives `(error, reset)` so callers can compose their own
//   recovery UX without forking the boundary.

import { Component, type ErrorInfo, type ReactNode } from 'react';

import { t } from '../../shared/i18n/index.js';
import { useArxmlStore } from '../store/useArxmlStore.js';
import './ErrorBoundary.css';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /**
   * Optional render-prop for callers that need a custom fallback UI.
   * Receives the captured error and the `reset` callback. When
   * omitted, a friendly default fallback is rendered.
   */
  readonly fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Stash the captured error in state so render() can swap to the
    // fallback on the next pass.
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to the console — the project does not yet ship a
    // dedicated telemetry sink, and console.error keeps the signal
    // visible in the DevTools console without adding a runtime
    // dependency. When a real reporter is added later, swap this
    // body for the reporter call (do not also log to console).
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  reset = (): void => {
    // Clear the captured error. The next render returns
    // `this.props.children`, which remounts the subtree and gives
    // the user a fresh slate after a crash.
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error !== null) {
      const custom = this.props.fallback;
      if (custom !== undefined) {
        return custom(error, this.reset);
      }
      const locale = useArxmlStore.getState().locale;
      const copyStack = (): void => {
        const detail = `${error.message}\n${error.stack ?? ''}`;
        const clipboard = navigator.clipboard;
        if (clipboard !== undefined) clipboard.writeText(detail).catch(() => undefined);
      };
      return (
        <div className="app-error-page" role="alert" data-testid="app-error-page">
          <h1>{t(locale, 'app.errorPage.title')}</h1>
          <p className="app-error-page__message">{error.message}</p>
          <pre className="app-error-page__stack">{error.stack ?? ''}</pre>
          <div className="app-error-page__actions">
            <button
              type="button"
              className="app-btn"
              data-testid="app-error-copy"
              onClick={copyStack}
            >
              {t(locale, 'app.errorPage.copyStack')}
            </button>
            <button
              type="button"
              className="app-btn"
              data-testid="app-error-reset"
              onClick={this.reset}
            >
              {t(locale, 'app.errorPage.reset')}
            </button>
          </div>
          <p className="app-error-page__hint">{t(locale, 'app.errorPage.feedback')}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
